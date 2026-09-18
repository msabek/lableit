import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import jwt from '@fastify/jwt';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { Queue, Worker, Job } from 'bullmq';
import pino from 'pino';
import bcrypt from 'bcrypt';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { exportDataset, createExportArchive, ExportFormat, setS3Client, setPrismaClient } from './exportService.js';
import sharp from 'sharp';
import { createClerkClient, verifyToken } from '@clerk/backend';

// Load environment variables from monorepo root first (for Clerk keys, etc.)
// Then load from local .env to allow overrides
const rootEnvPath = path.resolve(process.cwd(), '../../.env');
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}
// Also load from local .env (can override root values)
dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
const workerMode = process.env.WORKER_MODE === 'true';
const runHttpServer = process.env.RUN_HTTP_SERVER !== 'false' && !workerMode;
const runWorker =
  workerMode ||
  process.env.RUN_WORKER === 'true' ||
  (!isProduction && process.env.RUN_WORKER !== 'false');

// In production we fail fast for required secrets. In development we generate
// an ephemeral secret so there is no weak hardcoded fallback to leak.
if (!process.env.JWT_SECRET) {
  if (isProduction) {
    throw new Error('JWT_SECRET must be set in production');
  }
  // Generate a strong, random per-process secret for local development only.
  // Tokens won't survive a restart in dev, which is acceptable and far safer
  // than shipping a guessable hardcoded fallback.
  process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
  console.warn('JWT_SECRET not set. Generated an ephemeral development secret (tokens reset on restart).');
}

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.API_HOST || '0.0.0.0';
const DATABASE_URL = process.env.DATABASE_URL || (!isProduction ? 'postgresql://lableit:lableit@localhost:5433/lableit' : '');
const REDIS_URL = process.env.REDIS_URL || (!isProduction ? 'redis://localhost:6380' : '');
const INFERENCE_URL = process.env.INFERENCE_URL || (!isProduction ? 'http://localhost:8001' : '');
const S3_ENDPOINT = process.env.S3_ENDPOINT || (!isProduction ? 'http://localhost:9000' : '');
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || (!isProduction ? 'minioadmin' : '');
const S3_SECRET_KEY = process.env.S3_SECRET_KEY || (!isProduction ? 'minioadmin' : '');
const S3_BUCKET = process.env.S3_BUCKET || 'lableit';

const missingRequiredEnv = [
  ['DATABASE_URL', DATABASE_URL],
  ['REDIS_URL', REDIS_URL],
  ['INFERENCE_URL', INFERENCE_URL],
  ['S3_ENDPOINT', S3_ENDPOINT],
  ['S3_ACCESS_KEY', S3_ACCESS_KEY],
  ['S3_SECRET_KEY', S3_SECRET_KEY],
].filter(([, value]) => !value);

if (isProduction && missingRequiredEnv.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingRequiredEnv.map(([name]) => name).join(', ')}`
  );
}

// Clerk configuration
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
const CLERK_PUBLISHABLE_KEY = process.env.CLERK_PUBLISHABLE_KEY;

// Log Clerk configuration status
if (CLERK_SECRET_KEY) {
  console.log('[Clerk] Secret key configured (length: ' + CLERK_SECRET_KEY.length + ')');
} else {
  console.warn('[Clerk] WARNING: CLERK_SECRET_KEY not set - Clerk authentication will not work!');
}

// Initialize Clerk client if keys are available
const clerkClient = CLERK_SECRET_KEY ? createClerkClient({ secretKey: CLERK_SECRET_KEY }) : null;

// ================================
// Access control / admin configuration
// ================================
// The admin receives access requests and can approve/deny accounts. This email
// is always treated as admin + approved at runtime (never locked out).
// No default: a fork deployed without ADMIN_EMAIL has no admin rather than
// silently making someone else's address the admin.
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
if (!ADMIN_EMAIL) {
  console.warn('[Access] WARNING: ADMIN_EMAIL not set - nobody can approve new accounts!');
}
const isAdminEmail = (email?: string | null): boolean =>
  !!ADMIN_EMAIL && (email || '').toLowerCase() === ADMIN_EMAIL;
// Resend (https://resend.com) transactional email. If unset, requests are still
// stored and visible on the admin page; only the email notification is skipped.
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM = process.env.RESEND_FROM || 'Lableit <onboarding@resend.dev>';

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

// Email the admin about a new access request. Returns whether the email was sent
// so the caller can surface "saved, email skipped" honestly.
async function sendAccessRequestEmail(req: {
  name: string; email: string; institution: string; phone: string; useCase: string;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!ADMIN_EMAIL) return { sent: false, reason: 'no_admin_email' };
  if (!RESEND_API_KEY) {
    logger.warn('RESEND_API_KEY not set — access request stored but email notification skipped');
    return { sent: false, reason: 'no_api_key' };
  }
  const html = `
    <h2>New Lableit access request</h2>
    <table cellpadding="6" style="font-family:sans-serif;font-size:14px">
      <tr><td><b>Name</b></td><td>${escapeHtml(req.name)}</td></tr>
      <tr><td><b>Email</b></td><td>${escapeHtml(req.email)}</td></tr>
      <tr><td><b>Institution</b></td><td>${escapeHtml(req.institution)}</td></tr>
      <tr><td><b>Phone</b></td><td>${escapeHtml(req.phone)}</td></tr>
      <tr><td><b>Intended use</b></td><td>${escapeHtml(req.useCase)}</td></tr>
    </table>
    <p style="font-family:sans-serif;font-size:13px;color:#555">Approve or deny from the Lableit admin page.</p>`;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [ADMIN_EMAIL],
        reply_to: req.email,
        subject: `Lableit access request: ${req.name || req.email}`,
        html,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      logger.error({ status: res.status, body }, 'Resend email failed');
      return { sent: false, reason: 'send_failed' };
    }
    return { sent: true };
  } catch (err) {
    logger.error({ err }, 'Resend email threw');
    return { sent: false, reason: 'exception' };
  }
}

const execFileAsync = promisify(execFile);

// Create a cleaner, more readable logger configuration
const loggerConfig = {
  level: process.env.LOG_LEVEL || 'info',
  // Use pino-pretty style formatting for development
  transport: isProduction ? undefined : {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname,reqId',
      messageFormat: '{msg}',
      singleLine: true,
    }
  }
};

// Fallback logger if pino-pretty not available  
let logger: pino.Logger;
try {
  logger = pino(loggerConfig);
} catch {
  // Fallback to simple console-like format
  logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: () => `,"time":"${new Date().toLocaleTimeString()}"`,
  });
}

// Custom request logging - cleaner format
const app = Fastify({
  // Trust the reverse proxy (Railway/load balancer) so request.ip reflects the
  // real client IP from a trusted X-Forwarded-For chain instead of the proxy IP.
  // The rate limiter keys on request.ip, so this also stops clients from spoofing
  // their identity via a raw X-Forwarded-For header.
  trustProxy: true,
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    // Cleaner request logging
    serializers: {
      req: (req) => ({
        method: req.method,
        url: req.url,
      }),
      res: (res) => ({
        status: res.statusCode,
      }),
    },
    // Reduce noise - don't log every request detail
    redact: ['req.headers.authorization', 'req.headers.cookie'],
  },
  disableRequestLogging: !isProduction, // Disable built-in request logging in dev
});

// Log startup information with cleaner format
console.log('\n========================================');
console.log('  LABLEIT API SERVER');
console.log('========================================');
console.log(`  Port:      ${PORT}`);
console.log(`  Database:  ${(DATABASE_URL || 'not configured').replace(/:[^:]+@/, ':***@').split('/').pop()}`);
console.log(`  Redis:     ${REDIS_URL.replace('redis://', '')}`);
console.log(`  S3:        ${S3_ENDPOINT.replace('http://', '')}`);
console.log(`  Inference: ${INFERENCE_URL.replace('http://', '')}`);
console.log('========================================\n');

// Ensure temp/exports directories exist
const TEMP_DIR = path.join(process.cwd(), 'temp');
const EXPORTS_DIR = path.join(process.cwd(), 'exports');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}
if (!fs.existsSync(EXPORTS_DIR)) {
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
}

// Initialize S3 with defaults for local MinIO in development.
const s3 = new S3Client({
  endpoint: S3_ENDPOINT,
  region: process.env.S3_REGION || 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: S3_ACCESS_KEY,
    secretAccessKey: S3_SECRET_KEY,
  },
});

// Share the S3 client with exportService to avoid duplicate instantiation
setS3Client(s3);

async function uploadToS3(params: {
  Bucket: string;
  Key: string;
  Body: Buffer | Uint8Array | string;
  ContentType?: string;
}) {
  await new Upload({
    client: s3,
    params,
  }).done();
}

async function getS3ObjectBuffer(Bucket: string, Key: string): Promise<Buffer> {
  const response = await s3.send(new GetObjectCommand({ Bucket, Key }));
  if (!response.Body) {
    return Buffer.alloc(0);
  }
  return Buffer.from(await response.Body.transformToByteArray());
}

async function deleteS3Object(Bucket: string, Key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket, Key }));
}

async function getS3SignedUrl(Bucket: string, Key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket, Key }), { expiresIn });
}

const prisma = new PrismaClient();
// Share the single PrismaClient instance with exportService (one connection pool).
setPrismaClient(prisma);
const connection = new Redis(REDIS_URL, {
  // BullMQ requires this to be null for blocking commands
  maxRetriesPerRequest: null,
}) as any;
const jobQueue = new Queue('jobs', {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 1000, age: 86400 },
    removeOnFail: { count: 5000 },
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  },
});

// Test database connection
try {
  await prisma.$connect();
  console.log('\x1b[32m✓\x1b[0m Database connected');
} catch (error) {
  console.error('\x1b[31m✗\x1b[0m Database connection failed:', error);
  process.exit(1);
}

// ================================
// Utility Functions
// ================================
async function getImageDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
  try {
    const metadata = await sharp(buffer).metadata();
    return {
      width: metadata.width || 0,
      height: metadata.height || 0
    };
  } catch (error) {
    logger.warn({ error }, 'Failed to get image dimensions, using defaults');
    return { width: 0, height: 0 };
  }
}

// ================================
// Inference Proxy with Timeout & Retry
// ================================
const INFERENCE_TIMEOUT = Number(process.env.INFERENCE_TIMEOUT_MS || 60000); // 60s default
const INFERENCE_BATCH_TIMEOUT = Number(
  process.env.INFERENCE_BATCH_TIMEOUT_MS || Math.max(INFERENCE_TIMEOUT, 300000)
);
const INFERENCE_MAX_RETRIES = Number(process.env.INFERENCE_MAX_RETRIES || 3);

interface FetchWithRetryOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

async function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const { timeout = INFERENCE_TIMEOUT, ...fetchOptions } = options;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchInferenceWithRetry(
  endpoint: string,
  options: FetchWithRetryOptions = {}
): Promise<{ ok: boolean; status: number; data: any }> {
  const {
    method = 'GET',
    body,
    timeout = INFERENCE_TIMEOUT,
    retries = INFERENCE_MAX_RETRIES,
    retryDelay = 1000
  } = options;
  
  const url = `${INFERENCE_URL}${endpoint}`;
  const fetchOptions: RequestInit & { timeout: number } = {
    method,
    timeout,
    headers: { 'Content-Type': 'application/json' }
  };
  
  if (body && method !== 'GET') {
    fetchOptions.body = JSON.stringify(body);
  }
  
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      logger.debug({ url, attempt, retries }, 'Inference request attempt');
      
      const response = await fetchWithTimeout(url, fetchOptions);
      const data = await response.json().catch(() => null);
      
      // Success or non-retryable error
      if (response.ok || response.status < 500) {
        return { ok: response.ok, status: response.status, data };
      }
      
      // Server error, might be retryable
      lastError = new Error(`Server error: ${response.status}`);
      logger.warn({ url, attempt, status: response.status }, 'Inference request failed, will retry');
      
    } catch (error: any) {
      lastError = error;
      
      // Abort means timeout
      if (error.name === 'AbortError') {
        logger.warn({ url, attempt, timeout }, 'Inference request timed out');
      } else {
        logger.warn({ url, attempt, error: error.message }, 'Inference request error');
      }
    }
    
    // Wait before retry (exponential backoff)
    if (attempt < retries) {
      const delay = retryDelay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // All retries exhausted
  logger.error({ url, retries, error: lastError?.message }, 'Inference request failed after all retries');
  throw lastError || new Error('Inference request failed');
}

// ================================
// Worker with job handlers
// ================================
let worker: Worker | null = null;

if (runWorker) {
  worker = new Worker(
    'jobs',
    async (job: Job) => {
    const jobType = job.name.toUpperCase().replace(/_/g, ' ');
    console.log(`\n\x1b[34m▶ JOB\x1b[0m ${jobType} #${job.id?.slice(-8) || '?'}`);

    // Update job status to running
    await prisma.job.update({
      where: { id: job.data.dbJobId },
      data: { status: 'running' },
    });

    const startTime = Date.now();
    try {
      let result;
      switch (job.name) {
        case 'slice_video':
          result = await handleVideoSlicing(job);
          break;
        case 'infer_preview':
          result = await handlePreviewInference(job);
          break;
        case 'infer_batch':
          result = await handleBatchInference(job);
          break;
        case 'export':
          result = await handleExport(job);
          break;
        default:
          throw new Error(`Unknown job type: ${job.name}`);
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\x1b[32m✓ JOB\x1b[0m ${jobType} completed (${duration}s)`);

      // Update job status to succeeded
      await prisma.job.update({
        where: { id: job.data.dbJobId },
        data: { status: 'succeeded', result },
      });

      return result;
    } catch (error) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.error(`\x1b[31m✗ JOB\x1b[0m ${jobType} failed (${duration}s):`, String(error).slice(0, 100));
      
      // Update job status to failed
      await prisma.job.update({
        where: { id: job.data.dbJobId },
        data: { status: 'failed', result: { error: String(error) } },
      });
      throw error;
    }
    },
    { connection },
  );
  worker.on('failed', (job, err) => {
    console.error(`\x1b[31m✗\x1b[0m Job ${job?.name || 'unknown'} failed permanently:`, err.message.slice(0, 100));
  });
  console.log(`\x1b[32m✓\x1b[0m Job worker started (${workerMode ? 'worker mode' : 'embedded dev mode'})`);
}

// ================================
// Job Handlers
// ================================
async function handleVideoSlicing(job: Job) {
  const { videoUri, intervalSec, projectId, dbJobId, tagIds } = job.data;

  if (!videoUri || !projectId) {
    throw new Error('videoUri and projectId are required for video slicing');
  }

  // Generate unique ID for temp paths using the job ID
  const jobUniqueId = dbJobId || job.id || Date.now().toString();
  const videoPath = path.join(TEMP_DIR, `video_${jobUniqueId}.mp4`);
  const outputDir = path.join(TEMP_DIR, `frames_${jobUniqueId}`);

  try {
    console.log(`  → Downloading video from S3: ${videoUri}`);

    // Download video directly from S3 using the videoUri
    const videoObject = await getS3ObjectBuffer(S3_BUCKET, videoUri);
    fs.writeFileSync(videoPath, videoObject);
    await job.updateProgress(10); // 10% after downloading video

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Extract frames using ffmpeg
    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    console.log('  → Extracting frames with ffmpeg...');
    await execFileAsync(ffmpegPath, [
      '-i',
      videoPath,
      '-vf',
      `fps=1/${intervalSec}`,
      path.join(outputDir, 'frame_%04d.jpg'),
    ]);
    await job.updateProgress(50); // 50% after frame extraction

    // Get list of extracted frames (sorted so frame ordering is deterministic)
    const frameFiles = fs.readdirSync(outputDir).filter(file => file.endsWith('.jpg')).sort();
    const totalFrames = frameFiles.length;

    console.log(`  → Uploading ${totalFrames} frames to S3...`);

    // Process frames in bounded-concurrency chunks so S3 uploads + Sharp encodes
    // overlap (mirrors the S3 delete concurrency convention). frameTimeMs is derived
    // purely from the filename, so chunked/parallel processing preserves ordering.
    const FRAME_CONCURRENCY = 10;
    const uploadedFrameIds: string[] = [];
    let processedFrames = 0;

    for (let i = 0; i < frameFiles.length; i += FRAME_CONCURRENCY) {
      const chunk = frameFiles.slice(i, i + FRAME_CONCURRENCY);

      // Upload original + thumbnail and read dimensions concurrently within the chunk.
      const chunkData = await Promise.all(
        chunk.map(async (frameFile) => {
          const framePath = path.join(outputDir, frameFile);
          const frameBuffer = fs.readFileSync(framePath);

          // Calculate frame time from filename (order-independent)
          const frameNumber = parseInt(frameFile.match(/frame_(\d+)/)?.[1] || '1');
          const frameTimeMs = (frameNumber - 1) * intervalSec * 1000;

          // Upload frame to S3 (use project path for organization)
          const frameKey = `projects/${projectId}/frames/${jobUniqueId}/${frameFile}`;

          const dimensionsPromise = getImageDimensions(frameBuffer);
          const uploadPromise = uploadToS3({
            Bucket: S3_BUCKET,
            Key: frameKey,
            Body: frameBuffer,
            ContentType: 'image/jpeg'
          });

          // Generate and upload thumbnail (best-effort, same as before)
          const thumbPromise = (async () => {
            try {
              const thumbnailBuffer = await sharp(frameBuffer)
                .resize(300, 300, { fit: 'cover', position: 'center' })
                .jpeg({ quality: 80 })
                .toBuffer();

              const thumbKey = frameKey.replace(/(\.[^.]+)$/, '_thumb$1');
              await uploadToS3({
                Bucket: S3_BUCKET,
                Key: thumbKey,
                Body: thumbnailBuffer,
                ContentType: 'image/jpeg'
              });
            } catch (thumbErr) {
              logger.warn({ error: thumbErr }, `Failed to generate thumbnail for ${frameFile}`);
            }
          })();

          const [dimensions] = await Promise.all([dimensionsPromise, uploadPromise, thumbPromise]);

          return { frameKey, dimensions, frameTimeMs };
        })
      );

      // Batch-insert asset records for this chunk. createMany does not return rows,
      // so we look them up by their unique uri to collect ids and apply tags.
      await prisma.asset.createMany({
        data: chunkData.map((f) => ({
          projectId,
          uri: f.frameKey,
          width: f.dimensions.width,
          height: f.dimensions.height,
          frameTimeMs: f.frameTimeMs,
          sourceType: 'video_frame' as const
        }))
      });

      const createdAssets = await prisma.asset.findMany({
        where: { uri: { in: chunkData.map((f) => f.frameKey) } },
        select: { id: true }
      });
      const createdIds = createdAssets.map((a) => a.id);
      uploadedFrameIds.push(...createdIds);

      // Apply tags if provided (batched across the whole chunk)
      if (tagIds && tagIds.length > 0 && createdIds.length > 0) {
        await prisma.assetTag.createMany({
          data: createdIds.flatMap((assetId) =>
            tagIds.map((tagId: string) => ({ assetId, tagId }))
          ),
          skipDuplicates: true
        });
      }

      // Update progress after each chunk (50% to 99%)
      processedFrames += chunk.length;
      const progress = 50 + Math.round(processedFrames / totalFrames * 49);
      await job.updateProgress(progress);
    }

    // Cleanup temporary files
    fs.rmSync(videoPath, { force: true });
    fs.rmSync(outputDir, { recursive: true, force: true });

    // Delete the original video from S3 (no database entry to delete)
    console.log(`  → Deleting original video from S3: ${videoUri}`);
    try {
      await deleteS3Object(S3_BUCKET, videoUri);
      console.log(`  ✓ Deleted original video from S3`);
    } catch (s3DeleteError) {
      // S3 deletion failure is not critical
      logger.warn({ error: s3DeleteError, videoUri }, 'Failed to delete original video from S3');
    }

    await job.updateProgress(100); // 100% when done

    console.log(`  ✓ Video slicing complete: ${uploadedFrameIds.length} frames extracted`);

    return {
      success: true,
      framesExtracted: uploadedFrameIds.length,
      frameAssets: uploadedFrameIds
    };

  } catch (error) {
    logger.error({ error, videoUri, projectId }, 'Video slicing failed');

    // Cleanup temporary files on error
    try {
      if (fs.existsSync(videoPath)) fs.rmSync(videoPath, { force: true });
      if (fs.existsSync(outputDir)) fs.rmSync(outputDir, { recursive: true, force: true });
    } catch (cleanupError) {
      logger.warn({ cleanupError }, 'Failed to cleanup temporary files');
    }

    throw error;
  }
}

async function handlePreviewInference(job: Job) {
  const { assetIds, model, classes, thresholds, inferenceMode, ownerId } = job.data;

  // Determine what to return based on inference mode
  // Default is boxes_and_masks for backward compatibility
  const mode = inferenceMode || 'boxes_and_masks';
  const returnBoxes = mode === 'boxes_only' || mode === 'boxes_and_masks';
  const returnMasks = mode === 'masks_only' || mode === 'boxes_and_masks';

  // Scope the asset query to the job owner's projects so a job can never process
  // assets outside the owner's projects, even if assetIds were tampered with.
  const assets = await prisma.asset.findMany({
    where: {
      id: { in: assetIds },
      ...(ownerId ? { project: { ownerId } } : {})
    }
  });

  // Build prompts from class names
  const prompts = classes.map((c: any) => c.name);

  // Build threshold map for filtering
  const thresholdMap: Record<string, number> = {};
  if (thresholds && Array.isArray(thresholds)) {
    thresholds.forEach((t: any) => {
      thresholdMap[t.name] = t.threshold ?? 0.5;
    });
  }
  classes.forEach((c: any) => {
    if (!thresholdMap[c.name]) {
      thresholdMap[c.name] = c.threshold ?? 0.5;
    }
  });

  // Use the minimum threshold for initial inference, then filter per-class
  const thresholdValues = Object.values(thresholdMap);
  const minThreshold = thresholdValues.length > 0 ? Math.min(...thresholdValues) : 0.5;

  let annotationsCreated = 0;
  let processedCount = 0;
  const totalAssets = assets.length;
  let fatalInferenceError: string | null = null;

  // Initial progress
  await job.updateProgress(5);
  const modeLabel = mode === 'boxes_only' ? 'boxes' : mode === 'masks_only' ? 'masks' : 'boxes+masks';
  console.log(`  → Processing ${totalAssets} assets with ${prompts.length} classes (${modeLabel})...`);

  // Process each asset individually (SAM3 works on single images)
  for (const asset of assets) {
    // Skip video files - they can't be processed by SAM3 directly
    const isVideo = /\.(mp4|webm|mov|avi|mkv|m4v|flv|wmv)$/i.test(asset.uri);
    if (isVideo) {
      logger.info({ assetId: asset.id }, 'Skipping video file for inference');
      processedCount++;
      continue;
    }

    // Generate signed URL for the asset - MinIO requires signed URLs for access
    const imageUrl = await getS3SignedUrl(S3_BUCKET, asset.uri, 3600);

    logger.info({ assetId: asset.id, imageUrl: imageUrl.substring(0, 100) + '...', prompts }, 'Running SAM3 inference');

    try {
      // Call SAM3 inference endpoint
      const response = await fetchInferenceWithRetry('/infer/text', {
        method: 'POST',
        timeout: INFERENCE_BATCH_TIMEOUT,
        body: {
          image_url: imageUrl,
          prompts,
          confidence_threshold: minThreshold,
          return_masks: returnMasks,
          return_boxes: returnBoxes
        }
      });

      const result = response.data;

      if (!response.ok) {
        const errorPayload = typeof result === 'object' && result ? JSON.stringify(result) : String(result);
        logger.error({ assetId: asset.id, error: errorPayload }, 'Inference failed for asset');
        const detail = typeof result?.detail === 'string' ? result.detail : '';
        if (response.status === 503 && detail.includes('SAM3 model not available')) {
          fatalInferenceError = detail;
          logger.error({ assetId: asset.id, detail }, 'Aborting batch: inference model unavailable');
          break;
        }
        continue;
      }

      if (!result?.detections || !Array.isArray(result.detections)) {
        logger.warn({ assetId: asset.id }, 'No detections in inference response');
        continue;
      }

      // Collect annotations for batch creation
      const annotationsToCreate = [];
      for (const detection of result.detections as any[]) {
        const classMatch = classes.find((c: any) => c.name === detection.class_name);
        if (!classMatch) continue;

        // Apply per-class threshold filtering
        const classThreshold = thresholdMap[detection.class_name] ?? 0.5;
        if (detection.confidence < classThreshold) continue;

        // Determine annotation type based on what's available and requested
        let annotationType: 'box' | 'mask' = 'box';
        if (returnMasks && detection.mask_rle) {
          annotationType = 'mask';
        } else if (!returnBoxes && detection.mask_rle) {
          annotationType = 'mask';
        }

        annotationsToCreate.push({
          assetId: asset.id,
          classId: classMatch.id,
          confidence: detection.confidence,
          geometryRle: returnMasks ? detection.mask_rle : null,
          geometryPolygon: returnMasks && detection.mask_polygon ? detection.mask_polygon : null,
          box: returnBoxes ? detection.box : null,
          type: annotationType,
          source: 'auto' as const
        });
      }

      if (annotationsToCreate.length > 0) {
        await prisma.annotation.createMany({ data: annotationsToCreate });
        annotationsCreated += annotationsToCreate.length;
      }

      // Update asset dimensions if we got them from inference
      if (result.image_width && result.image_height && (asset.width === 0 || asset.height === 0)) {
        await prisma.asset.update({
          where: { id: asset.id },
          data: { width: result.image_width, height: result.image_height }
        });
      }

    } catch (error) {
      logger.error({ assetId: asset.id, error }, 'Error during inference for asset');
      // Continue with other assets
    }

    // Update progress after each asset
    processedCount++;
    const progress = Math.round(5 + (processedCount / totalAssets) * 90); // 5% to 95%
    await job.updateProgress(progress);
  }

  if (fatalInferenceError) {
    throw new Error(`Batch aborted: ${fatalInferenceError}`);
  }

  // Final progress
  await job.updateProgress(100);
  console.log(`  → Inference complete: ${annotationsCreated} annotations created`);

  return { success: true, annotationsCreated, assetsProcessed: assets.length };
}

// Batch and preview use identical logic - both process assets sequentially
// through the SAM3 inference service with per-class threshold filtering
const handleBatchInference = handlePreviewInference;

async function handleExport(job: Job) {
  const { projectId, format, includeClasses, userId } = job.data;
  const jobId = job.data.dbJobId;

  // Update progress: Starting
  await job.updateProgress(5);
  console.log('  → Starting export...');

  const outputDir = path.join(EXPORTS_DIR, jobId);

  // Update progress: Fetching data
  await job.updateProgress(10);
  console.log('  → Fetching project data...');

  const result = await exportDataset({
    format,
    projectId,
    includeClasses,
    outputDir,
  });

  // Update progress: Downloaded images
  await job.updateProgress(70);
  console.log(`  → Exported ${result.annotationsExported} annotations`);

  // Generate descriptive filename: date_time_format_imagecount.zip
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const timeStr = now.toTimeString().slice(0, 5).replace(':', ''); // HHMM
  const imageCount = result.filesGenerated || 0;
  const archiveName = `${dateStr}_${timeStr}_${format}_${imageCount}images.zip`;
  const archivePath = path.join(EXPORTS_DIR, archiveName);

  // Update progress: Creating archive
  await job.updateProgress(85);
  console.log(`  → Creating archive: ${archiveName}`);

  await createExportArchive(outputDir, archivePath);

  // Generate secure, unguessable download token (valid for 1 hour).
  // Use crypto.randomBytes instead of Math.random so tokens cannot be predicted.
  const downloadToken = `exp_${Date.now()}_${crypto.randomBytes(24).toString('hex')}`;
  await storeExportToken(downloadToken, {
    userId: userId || 'system',
    archiveName
  });

  // Update progress: Complete
  await job.updateProgress(100);

  const exportResult = {
    ...result,
    downloadPath: `/exports/${archiveName}?token=${downloadToken}`,
    archiveName,
    downloadToken,
  };

  console.log(`  → Export complete! Archive: ${archiveName}`);

  return exportResult;
}

// ================================
// Fastify Plugins
// ================================
// Security headers. Registered early so it applies to all routes. CSP and the
// cross-origin isolation policies are disabled to avoid interfering with CORS,
// Clerk, and signed-URL/image responses served from other origins.
await app.register(helmet, {
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
});
await app.register(multipart, { limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB max
await app.register(jwt, { secret: process.env.JWT_SECRET as string });
await app.register(cors, {
  origin: process.env.NODE_ENV === 'production'
    ? process.env.ALLOWED_ORIGINS?.split(',') || false
    : true, // Allow all in development
  credentials: true,
  // Explicitly allow the mutating verbs. Without this the preflight advertises
  // only GET,HEAD,POST, so browsers block DELETE/PUT/PATCH (e.g. delete project,
  // delete class/tag/asset, rename project) and the request never reaches the
  // server, surfacing as a generic "Network Error" in the UI.
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
});
await app.register(fastifyStatic, {
  root: EXPORTS_DIR,
  prefix: '/exports/',
  decorateReply: false,
});

// ================================
// Rate Limiting (Simple in-memory implementation)
// ================================
// NOTE: This is an in-memory limiter keyed on request.ip. With trustProxy enabled
// (see the Fastify constructor) request.ip resolves the real client IP from a
// trusted X-Forwarded-For chain rather than a raw, client-spoofable header, so a
// client can no longer trivially evade limits by forging X-Forwarded-For.
// Limitation: the store is per-process and not shared across instances. For a
// horizontally-scaled deployment, swap this for @fastify/rate-limit backed by the
// existing ioredis connection so counts are shared across instances.
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 100; // requests per window

app.addHook('preHandler', async (request, reply) => {
  const clientIP = request.ip || 'unknown';
  const now = Date.now();
  const routePath = request.routeOptions?.url || request.url.split('?')[0];
  const key = `${clientIP}:${routePath}`;

  const current = rateLimitStore.get(key);
  if (current && now < current.resetTime) {
    if (current.count >= RATE_LIMIT_MAX) {
      return reply.status(429).send({ error: 'Too many requests' });
    }
    current.count++;
  } else {
    rateLimitStore.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
  }

  // Clean up old entries periodically
  if (Math.random() < 0.01) { // 1% chance to cleanup
    for (const [k, v] of rateLimitStore.entries()) {
      if (now > v.resetTime) {
        rateLimitStore.delete(k);
      }
    }
  }
});

// ================================
// Authentication Middleware
// ================================
// Helper to verify Clerk JWT
async function verifyClerkToken(token: string): Promise<{ userId: string; email?: string } | null> {
  if (!CLERK_SECRET_KEY) return null;
  
  try {
    const payload = await verifyToken(token, {
      secretKey: CLERK_SECRET_KEY,
    });
    
    return {
      userId: payload.sub,
      email: payload.email as string | undefined,
    };
  } catch (err) {
    logger.debug({ err }, 'Clerk token verification failed');
    return null;
  }
}

// Helper to get or create user from Clerk ID
async function getOrCreateUserFromClerk(
  clerkUserId: string,
  tokenEmail?: string
): Promise<{ id: string; email: string; accessStatus: string }> {
  // Try to find existing user by clerk ID (stored in externalId) FIRST, so the
  // common case (returning user, real email already stored) makes zero calls to
  // the Clerk API.
  let user = await prisma.user.findFirst({ where: { externalId: clerkUserId } });

  // Clerk session JWTs usually omit the email claim. Resolve the verified primary
  // email from the Clerk API ONLY when we actually need it — a brand-new account,
  // or a stored `@lableit.local` fallback that hasn't been replaced yet. This is
  // what the admin check + request notifications rely on (a stale fallback would
  // otherwise lock the admin out of their own approval screen). Avoiding the call
  // on every request keeps the hot path off Clerk's backend rate limits.
  let email = tokenEmail;
  const needsEmailLookup = !email && !!clerkClient && (!user || user.email.includes('@lableit.local'));
  if (needsEmailLookup && clerkClient) {
    try {
      const cu = await clerkClient.users.getUser(clerkUserId);
      email = cu.primaryEmailAddress?.emailAddress
        || cu.emailAddresses?.[0]?.emailAddress
        || undefined;
    } catch (err) {
      logger.debug({ err }, 'Could not fetch Clerk user email');
    }
  }

  if (!user && email) {
    // Try to find by email and link to Clerk
    user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await prisma.user.update({ where: { id: user.id }, data: { externalId: clerkUserId } });
    }
  }

  if (!user) {
    const isAdmin = isAdminEmail(email);
    user = await prisma.user.create({
      data: {
        email: email || `clerk_${clerkUserId}@lableit.local`,
        password: '', // No password for Clerk users
        externalId: clerkUserId,
        // Admin is auto-approved; everyone else must be approved by the admin.
        accessStatus: isAdmin ? 'approved' : 'pending',
      },
    });
    logger.info({ userId: user.id, clerkUserId }, 'Created new user from Clerk');
  }

  // Refresh a stale fallback email once the real one is known, and ensure the
  // admin account is always approved (runtime rule, not just migrated data).
  const updates: { email?: string; accessStatus?: string } = {};
  if (email && email !== user.email) updates.email = email;
  if (isAdminEmail(email) && user.accessStatus !== 'approved') {
    updates.accessStatus = 'approved';
  }
  if (Object.keys(updates).length > 0) {
    try {
      user = await prisma.user.update({ where: { id: user.id }, data: updates });
    } catch (err) {
      logger.warn({ err, userId: user.id }, 'User email/status refresh failed');
    }
  }

  return { id: user.id, email: user.email, accessStatus: user.accessStatus };
}

// Export token helpers using Redis (auto-expires via TTL, persists across restarts)
const EXPORT_TOKEN_PREFIX = 'export_token:';
const EXPORT_TOKEN_TTL = 3600; // 1 hour in seconds

async function storeExportToken(token: string, data: { userId: string; archiveName: string }) {
  await connection.set(
    `${EXPORT_TOKEN_PREFIX}${token}`,
    JSON.stringify(data),
    'EX',
    EXPORT_TOKEN_TTL
  );
}

async function getExportToken(token: string): Promise<{ userId: string; archiveName: string } | null> {
  const data = await connection.get(`${EXPORT_TOKEN_PREFIX}${token}`);
  if (!data) return null;
  return JSON.parse(data);
}

async function deleteExportToken(token: string) {
  await connection.del(`${EXPORT_TOKEN_PREFIX}${token}`);
}

app.addHook('preHandler', async (request, reply) => {
  const publicRoutes = [
    '/health',
    '/auth/register',
    '/auth/login',
    '/inference/models/status',
    '/inference/gpu',
    '/inference/config'
  ];
  const routePath = request.routeOptions?.url || request.url.split('?')[0];
  const actualUrl = request.url.split('?')[0];
  if (publicRoutes.includes(routePath)) return;

  // Export file downloads require a valid export token (not status checks)
  // Status endpoint uses normal authentication
  // Check both route pattern and actual URL to handle parameterized routes
  const isStatusEndpoint = actualUrl.includes('/status') || routePath?.includes('/status');
  if ((routePath?.startsWith('/exports/') || actualUrl.startsWith('/exports/')) && !isStatusEndpoint) {
    const token = (request.query as any).token;
    if (!token) {
      return reply.status(401).send({ error: 'Export token required' });
    }
    const tokenData = await getExportToken(token);
    if (!tokenData) {
      return reply.status(401).send({ error: 'Invalid or expired export token' });
    }
    // Scope the token to its own archive: a valid token must not be usable to
    // download a different file under /exports/ (prevents IDOR / path traversal).
    let requestedName: string;
    try {
      requestedName = decodeURIComponent(actualUrl.replace(/^\/exports\//, ''));
    } catch {
      return reply.status(400).send({ error: 'Invalid export path' });
    }
    if (requestedName !== tokenData.archiveName) {
      return reply.status(403).send({ error: 'Export token does not match the requested file' });
    }
    // Consume the token (single-use) only after the file matches
    await deleteExportToken(token);
    // Token is valid and scoped to this archive, allow the request
    return;
  }

  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
  
  const token = authHeader.substring(7);

  // Resolve the authenticated user id (Clerk first, then legacy JWT).
  let userId: string | null = null;
  const clerkPayload = await verifyClerkToken(token);
  if (clerkPayload) {
    const u = await getOrCreateUserFromClerk(clerkPayload.userId, clerkPayload.email);
    userId = u.id;
  } else {
    try {
      await request.jwtVerify();
      userId = (request as any).user?.userId || null;
    } catch (err) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  }
  if (!userId) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  // Load access status and resolve admin (runtime rule keyed on ADMIN_EMAIL so a
  // fresh/re-created admin row is never locked out of its own approval screen).
  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, accessStatus: true },
  });
  const email = (account?.email || '').toLowerCase();
  const isAdmin = isAdminEmail(email);
  const approved = isAdmin || account?.accessStatus === 'approved';
  (request as any).user = {
    userId,
    email: account?.email,
    isAdmin,
    accessStatus: account?.accessStatus || 'pending',
  };

  // Admin-only routes.
  if (routePath?.startsWith('/admin')) {
    if (!isAdmin) return reply.status(403).send({ error: 'Forbidden' });
    return;
  }

  // Access gate: an unapproved account may only reach the access endpoints
  // (check its own status, submit a request). Everything else is 403 until the
  // admin approves it. This is an allowlist so new routes are gated by default.
  const accessAllowlist = ['/auth/access-status', '/access-requests'];
  if (!approved && !accessAllowlist.includes(routePath || '')) {
    return reply
      .status(403)
      .send({ error: 'pending_approval', accessStatus: account?.accessStatus || 'pending' });
  }
});

// ================================
// Access control routes
// ================================
// Current account's access status — the web app calls this to gate the UI.
app.get('/auth/access-status', async (request) => {
  const u = (request as any).user;
  const row = await prisma.user.findUnique({
    where: { id: u.userId },
    select: { requestedAt: true },
  });
  return { status: u.accessStatus, isAdmin: !!u.isAdmin, email: u.email, requested: !!row?.requestedAt };
});

// Submit / update an access request: stores the details on the account, marks it
// pending, and emails the admin via Resend. Reachable while unapproved.
app.post('/access-requests', async (request, reply) => {
  const userId = (request as any).user.userId;
  const body = (request.body || {}) as { name?: string; institution?: string; phone?: string; useCase?: string };
  const institution = (body.institution || '').trim();
  const phone = (body.phone || '').trim();
  const useCase = (body.useCase || '').trim();
  if (!institution || !useCase) {
    return reply.status(400).send({ error: 'institution and useCase are required' });
  }
  const current = await prisma.user.findUnique({ where: { id: userId }, select: { accessStatus: true } });
  if (current?.accessStatus === 'approved') {
    return { status: 'approved' };
  }
  const name = (body.name || '').trim();
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { institution, phone, useCase, accessStatus: 'pending', requestedAt: new Date() },
    select: { email: true },
  });
  const emailResult = await sendAccessRequestEmail({
    name: name || updated.email,
    email: updated.email,
    institution,
    phone,
    useCase,
  });
  return { status: 'pending', emailSent: emailResult.sent, emailReason: emailResult.reason };
});

// Admin: list access requests (pending first, then most recently requested).
app.get('/admin/access-requests', async (request) => {
  const requests = await prisma.user.findMany({
    where: { OR: [{ requestedAt: { not: null } }, { accessStatus: { not: 'approved' } }] },
    select: {
      id: true, email: true, institution: true, phone: true, useCase: true,
      accessStatus: true, requestedAt: true, decidedAt: true, createdAt: true,
    },
    orderBy: [{ accessStatus: 'asc' }, { requestedAt: 'desc' }],
  });
  return { requests };
});

// Admin: approve or deny an account.
app.post('/admin/access-requests/:userId/decision', async (request, reply) => {
  const { userId: targetId } = request.params as { userId: string };
  const { decision } = (request.body || {}) as { decision?: string };
  if (decision !== 'approve' && decision !== 'deny') {
    return reply.status(400).send({ error: "decision must be 'approve' or 'deny'" });
  }
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { email: true } });
  if (!target) return reply.status(404).send({ error: 'User not found' });
  if (isAdminEmail(target.email) && decision === 'deny') {
    return reply.status(400).send({ error: 'Cannot deny the admin account' });
  }
  const updated = await prisma.user.update({
    where: { id: targetId },
    data: { accessStatus: decision === 'approve' ? 'approved' : 'denied', decidedAt: new Date() },
    select: { id: true, accessStatus: true },
  });
  return { id: updated.id, status: updated.accessStatus };
});

// ================================
// Health Check
// ================================
app.get('/health', async (request, reply) => {
  try {
    // Quick database connectivity check
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected'
    };
  } catch (error: any) {
    console.error('[Health] Database check failed:', error.message);
    return reply.status(503).send({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error.message
    });
  }
});

// ================================
// Authentication Routes
// ================================
app.post('/auth/register', async (request, reply) => {
  const { email, password } = request.body as { email: string; password: string };

  // Input validation
  if (!email || !password) {
    return reply.status(400).send({ error: 'Email and password are required' });
  }

  if (typeof email !== 'string' || typeof password !== 'string') {
    return reply.status(400).send({ error: 'Email and password must be strings' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return reply.status(400).send({ error: 'Invalid email format' });
  }

  if (password.length < 6) {
    return reply.status(400).send({ error: 'Password must be at least 6 characters long' });
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return reply.status(400).send({ error: 'User already exists' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, password: hashedPassword },
    select: { id: true, email: true, createdAt: true }
  });

  const token = app.jwt.sign({ userId: user.id });
  return { user, token };
});

app.post('/auth/login', async (request, reply) => {
  const { email, password } = request.body as { email: string; password: string };

  // Input validation
  if (!email || !password) {
    return reply.status(400).send({ error: 'Email and password are required' });
  }

  if (typeof email !== 'string' || typeof password !== 'string') {
    return reply.status(400).send({ error: 'Email and password must be strings' });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return reply.status(401).send({ error: 'Invalid credentials' });
  }

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    return reply.status(401).send({ error: 'Invalid credentials' });
  }

  const token = app.jwt.sign({ userId: user.id });
  return { user: { id: user.id, email: user.email, createdAt: user.createdAt }, token };
});

app.get('/auth/me', async (request, reply) => {
  const userId = (request as any).user.userId;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, createdAt: true }
  });
  if (!user) {
    return reply.status(404).send({ error: 'User not found' });
  }
  return user;
});

// ================================
// Project Routes
// ================================
app.get('/projects', async (request) => {
  const userId = (request as any).user.userId;
  return await prisma.project.findMany({
    where: { ownerId: userId },
    include: {
      classes: true,
      _count: { select: { assets: true } }
    },
    orderBy: { createdAt: 'desc' }
  });
});

app.get('/projects/:id', async (request, reply) => {
  const userId = (request as any).user.userId;
  const { id } = request.params as { id: string };

  // Project the asset/annotation fields the grid actually needs (box + class
  // name/color, plus counts) and OMIT the heavy geometryRle/geometryPolygon blobs.
  // Full geometry still loads on demand via GET /assets/:id annotations when an
  // asset is opened in the canvas, so this is a pure payload/perf optimization.
  const project = await prisma.project.findFirst({
    where: { id, ownerId: userId },
    select: {
      id: true,
      name: true,
      createdAt: true,
      ownerId: true,
      assets: {
        select: {
          id: true,
          projectId: true,
          uri: true,
          width: true,
          height: true,
          frameTimeMs: true,
          sourceType: true,
          createdAt: true,
          annotations: {
            select: {
              id: true,
              assetId: true,
              classId: true,
              confidence: true,
              box: true,
              type: true,
              source: true,
              createdAt: true,
              class: true,
            },
          },
        },
      },
      classes: true,
    },
  });

  if (!project) {
    return reply.status(404).send({ error: 'Project not found' });
  }
  return project;
});

// Shared by create and rename so both reject blank / oversized names.
function projectNameError(name: unknown): string | null {
  if (!name || typeof name !== 'string') return 'Project name is required and must be a string';
  if (name.trim().length === 0) return 'Project name cannot be empty';
  if (name.length > 100) return 'Project name must be less than 100 characters';
  return null;
}

app.post('/projects', async (request, reply) => {
  const userId = (request as any).user.userId;
  const { name } = request.body as { name: string };

  const nameError = projectNameError(name);
  if (nameError) return reply.status(400).send({ error: nameError });

  const project = await prisma.project.create({
    data: { name: name.trim(), ownerId: userId },
    include: { assets: true, classes: true }
  });

  return project;
});

app.put('/projects/:id', async (request, reply) => {
  const userId = (request as any).user.userId;
  const { id } = request.params as { id: string };
  const { name } = request.body as { name: string };
  const nameError = projectNameError(name);
  if (nameError) return reply.status(400).send({ error: nameError });

  const project = await prisma.project.findFirst({ where: { id, ownerId: userId } });
  if (!project) {
    return reply.status(404).send({ error: 'Project not found' });
  }

  return await prisma.project.update({
    where: { id },
    data: { name: name.trim() },
    include: { assets: true, classes: true }
  });
});

app.delete('/projects/:id', async (request, reply) => {
  const userId = (request as any).user.userId;
  const { id } = request.params as { id: string };

  const project = await prisma.project.findFirst({ where: { id, ownerId: userId } });
  if (!project) {
    return reply.status(404).send({ error: 'Project not found' });
  }

  // Cascade delete: annotations -> assets -> classes -> project
  await prisma.$transaction(async (tx) => {
    // Delete annotations for all assets in project
    await tx.annotation.deleteMany({
      where: { asset: { projectId: id } }
    });
    await tx.asset.deleteMany({ where: { projectId: id } });
    await tx.classDef.deleteMany({ where: { projectId: id } });
    await tx.project.delete({ where: { id } });
  });

  return { success: true };
});

// ================================
// Project Assets Routes (replaces Dataset routes)
// ================================
app.get('/projects/:projectId/assets', async (request, reply) => {
  const userId = (request as any).user.userId;
  const { projectId } = request.params as { projectId: string };

  const project = await prisma.project.findFirst({ where: { id: projectId, ownerId: userId } });
  if (!project) {
    return reply.status(404).send({ error: 'Project not found' });
  }

  // Project only what the grid needs (box + class name/color, tags) and OMIT the
  // heavy geometryRle/geometryPolygon blobs. Full geometry still loads on demand
  // via the per-asset annotations endpoint when an asset opens in the canvas.
  return await prisma.asset.findMany({
    where: { projectId },
    select: {
      id: true,
      projectId: true,
      uri: true,
      width: true,
      height: true,
      frameTimeMs: true,
      sourceType: true,
      createdAt: true,
      annotations: {
        select: {
          id: true,
          assetId: true,
          classId: true,
          confidence: true,
          box: true,
          type: true,
          source: true,
          createdAt: true,
          class: true,
        },
      },
      tags: { include: { tag: true } },
    },
    orderBy: { createdAt: 'desc' }
  });
});

// ================================
// Class Routes
// ================================
app.get('/projects/:projectId/classes', async (request, reply) => {
  const userId = (request as any).user.userId;
  const { projectId } = request.params as { projectId: string };

  const project = await prisma.project.findFirst({ where: { id: projectId, ownerId: userId } });
  if (!project) {
    return reply.status(404).send({ error: 'Project not found' });
  }

  return await prisma.classDef.findMany({
    where: { projectId },
    orderBy: { name: 'asc' }
  });
});

app.get('/classes/:id', async (request, reply) => {
  const userId = (request as any).user.userId;
  const { id } = request.params as { id: string };

  const classDef = await prisma.classDef.findFirst({
    where: { id, project: { ownerId: userId } }
  });

  if (!classDef) {
    return reply.status(404).send({ error: 'Class not found' });
  }
  return classDef;
});

app.post('/projects/:projectId/classes', async (request, reply) => {
  const userId = (request as any).user.userId;
  const { projectId } = request.params as { projectId: string };
  const { name, color, threshold } = request.body as { name: string; color: string; threshold: number };

  // Input validation
  if (!name || typeof name !== 'string') {
    return reply.status(400).send({ error: 'Class name is required and must be a string' });
  }
  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    return reply.status(400).send({ error: 'Class name cannot be empty' });
  }
  if (trimmedName.length > 50) {
    return reply.status(400).send({ error: 'Class name must be 50 characters or less' });
  }

  // Validate color format (hex color)
  if (color) {
    const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (!hexColorRegex.test(color)) {
      return reply.status(400).send({ error: 'Color must be a valid hex color (e.g., #FF0000)' });
    }
  }

  // Validate threshold range
  const validThreshold = threshold ?? 0.5;
  if (typeof validThreshold !== 'number' || validThreshold < 0 || validThreshold > 1) {
    return reply.status(400).send({ error: 'Threshold must be a number between 0 and 1' });
  }

  const project = await prisma.project.findFirst({ where: { id: projectId, ownerId: userId } });
  if (!project) {
    return reply.status(404).send({ error: 'Project not found' });
  }

  // Check for duplicate class name
  const existing = await prisma.classDef.findFirst({
    where: { projectId, name: trimmedName }
  });
  if (existing) {
    return reply.status(400).send({ error: `Class "${trimmedName}" already exists in this project` });
  }

  const classDef = await prisma.classDef.create({
    data: {
      name: trimmedName,
      color: color || '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
      threshold: validThreshold,
      projectId
    }
  });

  return classDef;
});

app.put('/classes/:id', async (request, reply) => {
  const userId = (request as any).user.userId;
  const { id } = request.params as { id: string };
  const { name, color, threshold } = request.body as { name?: string; color?: string; threshold?: number };

  const classDef = await prisma.classDef.findFirst({
    where: { id, project: { ownerId: userId } }
  });
  if (!classDef) {
    return reply.status(404).send({ error: 'Class not found' });
  }

  return await prisma.classDef.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(color && { color }),
      ...(threshold !== undefined && { threshold })
    }
  });
});

app.delete('/classes/:id', async (request, reply) => {
  const userId = (request as any).user.userId;
  const { id } = request.params as { id: string };

  const classDef = await prisma.classDef.findFirst({
    where: { id, project: { ownerId: userId } }
  });
  if (!classDef) {
    return reply.status(404).send({ error: 'Class not found' });
  }

  await prisma.$transaction(async (tx) => {
    await tx.annotation.deleteMany({ where: { classId: id } });
    await tx.classDef.delete({ where: { id } });
  });

  return { success: true };
});

// Export classes to CSV
app.get('/projects/:projectId/classes/export', async (request, reply) => {
  const userId = (request as any).user.userId;
  const { projectId } = request.params as { projectId: string };

  const project = await prisma.project.findFirst({ where: { id: projectId, ownerId: userId } });
  if (!project) {
    return reply.status(404).send({ error: 'Project not found' });
  }

  const classes = await prisma.classDef.findMany({
    where: { projectId },
    orderBy: { name: 'asc' }
  });

  // Generate CSV content
  const csvHeader = 'name,color,threshold\n';
  const csvRows = classes.map(c => `${c.name},${c.color},${c.threshold}`).join('\n');
  const csvContent = csvHeader + csvRows;

  reply
    .header('Content-Type', 'text/csv')
    .header('Content-Disposition', `attachment; filename="${project.name.replace(/[^a-z0-9]/gi, '_')}_classes.csv"`)
    .send(csvContent);
});

// Import classes from CSV
app.post('/projects/:projectId/classes/import', async (request, reply) => {
  const userId = (request as any).user.userId;
  const { projectId } = request.params as { projectId: string };

  const project = await prisma.project.findFirst({ where: { id: projectId, ownerId: userId } });
  if (!project) {
    return reply.status(404).send({ error: 'Project not found' });
  }

  const data = await request.file();
  if (!data) {
    return reply.status(400).send({ error: 'CSV file required' });
  }

  const chunks: Buffer[] = [];
  for await (const chunk of data.file) {
    chunks.push(chunk);
  }
  const csvContent = Buffer.concat(chunks).toString('utf-8');

  // Parse CSV
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) {
    return reply.status(400).send({ error: 'CSV must have header and at least one data row' });
  }

  const header = lines[0].toLowerCase().split(',').map(h => h.trim());
  const nameIdx = header.indexOf('name');
  const colorIdx = header.indexOf('color');
  const thresholdIdx = header.indexOf('threshold');

  if (nameIdx === -1) {
    return reply.status(400).send({ error: 'CSV must have a "name" column' });
  }

  // Fix N+1: Fetch all existing class names in ONE query
  const existingClasses = await prisma.classDef.findMany({
    where: { projectId },
    select: { name: true }
  });
  const existingNames = new Set(existingClasses.map(c => c.name.toLowerCase()));

  const errors: string[] = [];
  const classesToCreate: { name: string; color: string; threshold: number }[] = [];
  const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

  // Validate all rows first
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const name = values[nameIdx];

    if (!name) {
      errors.push(`Row ${i + 1}: Missing name`);
      continue;
    }

    if (name.length > 50) {
      errors.push(`Row ${i + 1}: Class name too long (max 50 chars)`);
      continue;
    }

    // Check if class already exists (case-insensitive)
    if (existingNames.has(name.toLowerCase())) {
      errors.push(`Row ${i + 1}: Class "${name}" already exists`);
      continue;
    }

    // Check for duplicates within the CSV itself
    if (classesToCreate.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      errors.push(`Row ${i + 1}: Duplicate class "${name}" in CSV`);
      continue;
    }

    let color = colorIdx !== -1 && values[colorIdx] ? values[colorIdx] : '';
    if (color && !hexColorRegex.test(color)) {
      errors.push(`Row ${i + 1}: Invalid color format "${color}"`);
      continue;
    }
    if (!color) {
      color = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    }

    const threshold = thresholdIdx !== -1 && values[thresholdIdx] ? parseFloat(values[thresholdIdx]) : 0.5;
    const validThreshold = isNaN(threshold) ? 0.5 : Math.max(0, Math.min(1, threshold));

    classesToCreate.push({ name, color, threshold: validThreshold });
  }

  // Use transaction to create all classes atomically
  let createdClasses: any[] = [];
  if (classesToCreate.length > 0) {
    try {
      createdClasses = await prisma.$transaction(
        classesToCreate.map(c =>
          prisma.classDef.create({
            data: { projectId, name: c.name, color: c.color, threshold: c.threshold }
          })
        )
      );
    } catch (err: any) {
      logger.error({ err, projectId }, 'Failed to import classes');
      return reply.status(500).send({ error: 'Failed to import classes. Transaction rolled back.' });
    }
  }

  return {
    success: true,
    imported: createdClasses.length,
    errors: errors.length > 0 ? errors : undefined,
    classes: createdClasses
  };
});

// ================================
// Tag Routes
// ================================
app.get('/projects/:projectId/tags', async (request, reply) => {
  const userId = (request as any).user.userId;
  const { projectId } = request.params as { projectId: string };

  const project = await prisma.project.findFirst({ where: { id: projectId, ownerId: userId } });
  if (!project) {
    return reply.status(404).send({ error: 'Project not found' });
  }

  return await prisma.tag.findMany({
    where: { projectId },
    include: { _count: { select: { assets: true } } },
    orderBy: { name: 'asc' }
  });
});

app.post('/projects/:projectId/tags', async (request, reply) => {
  const userId = (request as any).user.userId;
  const { projectId } = request.params as { projectId: string };
  const { name, color } = request.body as { name: string; color?: string };

  // Validation
  if (!name || typeof name !== 'string') {
    return reply.status(400).send({ error: 'Tag name is required and must be a string' });
  }
  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    return reply.status(400).send({ error: 'Tag name cannot be empty' });
  }
  if (trimmedName.length > 50) {
    return reply.status(400).send({ error: 'Tag name must be 50 characters or less' });
  }

  // Validate color format
  if (color) {
    const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (!hexColorRegex.test(color)) {
      return reply.status(400).send({ error: 'Color must be a valid hex color (e.g., #FF0000)' });
    }
  }

  const project = await prisma.project.findFirst({ where: { id: projectId, ownerId: userId } });
  if (!project) {
    return reply.status(404).send({ error: 'Project not found' });
  }

  // Check for duplicate tag name
  const existing = await prisma.tag.findFirst({
    where: { projectId, name: trimmedName }
  });
  if (existing) {
    return reply.status(400).send({ error: `Tag "${trimmedName}" already exists in this project` });
  }

  const tag = await prisma.tag.create({
    data: {
      name: trimmedName,
      color: color || '#6366f1',
      projectId
    }
  });

  return tag;
});

app.put('/tags/:id', async (request, reply) => {
  const userId = (request as any).user.userId;
  const { id } = request.params as { id: string };
  const { name, color } = request.body as { name?: string; color?: string };

  const tag = await prisma.tag.findFirst({
    where: { id, project: { ownerId: userId } }
  });
  if (!tag) {
    return reply.status(404).send({ error: 'Tag not found' });
  }

  return await prisma.tag.update({
    where: { id },
    data: {
      ...(name && { name: name.trim() }),
      ...(color && { color })
    }
  });
});

app.delete('/tags/:id', async (request, reply) => {
  const userId = (request as any).user.userId;
  const { id } = request.params as { id: string };

  const tag = await prisma.tag.findFirst({
    where: { id, project: { ownerId: userId } }
  });
  if (!tag) {
    return reply.status(404).send({ error: 'Tag not found' });
  }

  // Cascade delete: remove all asset-tag associations, then delete tag
  await prisma.$transaction(async (tx) => {
    await tx.assetTag.deleteMany({ where: { tagId: id } });
    await tx.tag.delete({ where: { id } });
  });

  return { success: true };
});

// Add tag to asset
app.post('/assets/:assetId/tags', async (request, reply) => {
  const userId = (request as any).user.userId;
  const { assetId } = request.params as { assetId: string };
  const { tagId } = request.body as { tagId: string };

  if (!tagId) {
    return reply.status(400).send({ error: 'tagId is required' });
  }

  const asset = await prisma.asset.findFirst({
    where: { id: assetId, project: { ownerId: userId } }
  });
  if (!asset) {
    return reply.status(404).send({ error: 'Asset not found' });
  }

  const tag = await prisma.tag.findFirst({
    where: { id: tagId, projectId: asset.projectId }
  });
  if (!tag) {
    return reply.status(404).send({ error: 'Tag not found in this project' });
  }

  // Check if already tagged
  const existing = await prisma.assetTag.findFirst({
    where: { assetId, tagId }
  });
  if (existing) {
    return { success: true, message: 'Asset already has this tag' };
  }

  await prisma.assetTag.create({
    data: { assetId, tagId }
  });

  return { success: true };
});

// Remove tag from asset
app.delete('/assets/:assetId/tags/:tagId', async (request, reply) => {
  const userId = (request as any).user.userId;
  const { assetId, tagId } = request.params as { assetId: string; tagId: string };

  const asset = await prisma.asset.findFirst({
    where: { id: assetId, project: { ownerId: userId } }
  });
  if (!asset) {
    return reply.status(404).send({ error: 'Asset not found' });
  }

  await prisma.assetTag.deleteMany({
    where: { assetId, tagId }
  });

  return { success: true };
});

// Bulk add tags to multiple assets
app.post('/assets/bulk/tags', async (request, reply) => {
  const userId = (request as any).user.userId;
  const { assetIds, tagIds } = request.body as { assetIds: string[]; tagIds: string[] };

  if (!assetIds || !Array.isArray(assetIds) || assetIds.length === 0) {
    return reply.status(400).send({ error: 'assetIds array is required' });
  }
  if (!tagIds || !Array.isArray(tagIds) || tagIds.length === 0) {
    return reply.status(400).send({ error: 'tagIds array is required' });
  }

  // Verify all assets belong to user
  const assets = await prisma.asset.findMany({
    where: { id: { in: assetIds }, project: { ownerId: userId } },
    select: { id: true, projectId: true }
  });
  if (assets.length === 0) {
    return reply.status(404).send({ error: 'No assets found' });
  }

  const projectId = assets[0].projectId;

  // Verify all tags belong to the same project
  const tags = await prisma.tag.findMany({
    where: { id: { in: tagIds }, projectId }
  });
  if (tags.length === 0) {
    return reply.status(404).send({ error: 'No valid tags found for this project' });
  }

  const validAssetIds = assets.map(a => a.id);
  const validTagIds = tags.map(t => t.id);

  // Create all asset-tag associations (skip duplicates)
  const associations: { assetId: string; tagId: string }[] = [];
  for (const assetId of validAssetIds) {
    for (const tagId of validTagIds) {
      associations.push({ assetId, tagId });
    }
  }

  // Use createMany with skipDuplicates
  const result = await prisma.assetTag.createMany({
    data: associations,
    skipDuplicates: true
  });

  return {
    success: true,
    tagsAdded: result.count,
    assetsAffected: validAssetIds.length,
    tagsApplied: validTagIds.length
  };
});

// Remove tags from multiple assets
app.delete('/assets/bulk/tags', async (request, reply) => {
  const userId = (request as any).user.userId;
  const { assetIds, tagIds } = request.body as { assetIds: string[]; tagIds: string[] };

  if (!assetIds || !Array.isArray(assetIds) || assetIds.length === 0) {
    return reply.status(400).send({ error: 'assetIds array is required' });
  }
  if (!tagIds || !Array.isArray(tagIds) || tagIds.length === 0) {
    return reply.status(400).send({ error: 'tagIds array is required' });
  }

  // Verify assets belong to user
  const assets = await prisma.asset.findMany({
    where: { id: { in: assetIds }, project: { ownerId: userId } },
    select: { id: true }
  });
  const validAssetIds = assets.map(a => a.id);

  const result = await prisma.assetTag.deleteMany({
    where: {
      assetId: { in: validAssetIds },
      tagId: { in: tagIds }
    }
  });

  return {
    success: true,
    tagsRemoved: result.count
  };
});

// ================================
// Asset Routes
// ================================
app.get('/assets/:id', async (request, reply) => {
  const userId = (request as any).user.userId;
  const { id } = request.params as { id: string };

  const asset = await prisma.asset.findFirst({
    where: { id, project: { ownerId: userId } },
    include: {
      annotations: { include: { class: true } },
      project: { include: { classes: true } }
    }
  });

  if (!asset) {
    return reply.status(404).send({ error: 'Asset not found' });
  }
  return asset;
});

app.delete('/assets/:id', async (request, reply) => {
  const userId = (request as any).user.userId;
  const { id } = request.params as { id: string };

  const asset = await prisma.asset.findFirst({
    where: { id, project: { ownerId: userId } }
  });
  if (!asset) {
    return reply.status(404).send({ error: 'Asset not found' });
  }

  // Delete from S3
  try {
    await deleteS3Object(S3_BUCKET, asset.uri);
    logger.info({ assetId: id }, 'Asset deleted from S3');
  } catch (error) {
    logger.error({ error, assetId: id }, 'Failed to delete asset from S3');
    // Don't throw here - we still want to delete from database
  }

  await prisma.$transaction(async (tx) => {
    await tx.annotation.deleteMany({ where: { assetId: id } });
    await tx.asset.delete({ where: { id } });
  });

  return { success: true };
});

// Delete multiple assets (bulk delete)
app.delete('/assets/bulk', async (request, reply) => {
  const userId = (request as any).user.userId;
  const { assetIds } = request.body as { assetIds: string[] };

  if (!assetIds || !Array.isArray(assetIds) || assetIds.length === 0) {
    return reply.status(400).send({ error: 'assetIds array is required' });
  }

  // Verify all assets belong to the user
  const assets = await prisma.asset.findMany({
    where: { 
      id: { in: assetIds },
      project: { ownerId: userId }
    }
  });

  if (assets.length === 0) {
    return reply.status(404).send({ error: 'No assets found' });
  }

  const validAssetIds = assets.map(a => a.id);

  // Delete from S3 in parallel (best effort, with concurrency limit)
  const S3_DELETE_CONCURRENCY = 10;
  const s3DeletePromises: Promise<void>[] = [];
  for (let i = 0; i < assets.length; i += S3_DELETE_CONCURRENCY) {
    const batch = assets.slice(i, i + S3_DELETE_CONCURRENCY);
    const batchPromises = batch.map(async (asset) => {
      try {
        await deleteS3Object(S3_BUCKET, asset.uri);
        // Also try to delete thumbnail
        const thumbKey = asset.uri.replace(/(\.[^.]+)$/, '_thumb$1');
        await deleteS3Object(S3_BUCKET, thumbKey).catch(() => {});
      } catch (error) {
        logger.warn({ error, assetId: asset.id }, 'Failed to delete asset from S3');
      }
    });
    // Wait for each batch to complete before starting the next
    await Promise.allSettled(batchPromises);
  }

  // Delete from database
  await prisma.$transaction(async (tx) => {
    await tx.annotation.deleteMany({ where: { assetId: { in: validAssetIds } } });
    await tx.asset.deleteMany({ where: { id: { in: validAssetIds } } });
  });

  logger.info({ count: validAssetIds.length }, 'Bulk deleted assets');

  return {
    success: true,
    deletedCount: validAssetIds.length,
    message: `Deleted ${validAssetIds.length} assets`
  };
});

// Delete all assets from a project
app.delete('/projects/:projectId/assets', async (request, reply) => {
  const userId = (request as any).user.userId;
  const { projectId } = request.params as { projectId: string };

  // Verify project ownership and get all assets
  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: userId },
    include: { assets: true }
  });

  if (!project) {
    return reply.status(404).send({ error: 'Project not found' });
  }

  if (project.assets.length === 0) {
    return { success: true, deletedCount: 0, message: 'No assets to delete' };
  }

  const assetIds = project.assets.map(a => a.id);

  // Delete from S3 in parallel (best effort, with concurrency limit)
  const S3_DELETE_CONCURRENCY = 10;
  for (let i = 0; i < project.assets.length; i += S3_DELETE_CONCURRENCY) {
    const batch = project.assets.slice(i, i + S3_DELETE_CONCURRENCY);
    const batchPromises = batch.map(async (asset) => {
      try {
        await deleteS3Object(S3_BUCKET, asset.uri);
        // Also try to delete thumbnail
        const thumbKey = asset.uri.replace(/(\.[^.]+)$/, '_thumb$1');
        await deleteS3Object(S3_BUCKET, thumbKey).catch(() => {});
      } catch (error) {
        logger.warn({ error, assetId: asset.id }, 'Failed to delete asset from S3');
      }
    });
    await Promise.allSettled(batchPromises);
  }

  // Delete from database (annotations cascade with assets)
  await prisma.$transaction(async (tx) => {
    await tx.annotation.deleteMany({ where: { assetId: { in: assetIds } } });
    await tx.asset.deleteMany({ where: { projectId } });
  });

  logger.info({ projectId, count: assetIds.length }, 'Deleted all assets from project');

  return {
    success: true,
    deletedCount: assetIds.length,
    message: `Deleted ${assetIds.length} assets from project`
  };
});

// Get signed URL for asset
app.get('/assets/:id/url', async (request, reply) => {
  const userId = (request as any).user.userId;
  const { id } = request.params as { id: string };

  const asset = await prisma.asset.findFirst({
    where: { id, project: { ownerId: userId } }
  });
  if (!asset) {
    return reply.status(404).send({ error: 'Asset not found' });
  }

  // Presigning is local crypto with no network probe. We presign the deterministic
  // _thumb key unconditionally instead of doing a HeadObject existence check; the
  // frontend already falls back to the full image when a thumbnail 404s.
  const thumbKey = asset.uri.replace(/(\.[^.]+)$/, '_thumb$1');
  const [url, thumbnailUrl] = await Promise.all([
    getS3SignedUrl(S3_BUCKET, asset.uri, 3600),
    getS3SignedUrl(S3_BUCKET, thumbKey, 3600),
  ]);

  return { url, thumbnailUrl };
});

// Batch get signed URLs for multiple assets (optimized for grid loading)
app.post('/assets/urls', async (request, reply) => {
  const userId = (request as any).user.userId;
  const { assetIds } = request.body as { assetIds: string[] };

  if (!assetIds || !Array.isArray(assetIds) || assetIds.length === 0) {
    return reply.status(400).send({ error: 'assetIds array is required' });
  }

  // Limit batch size to prevent abuse
  if (assetIds.length > 100) {
    return reply.status(400).send({ error: 'Maximum 100 assets per batch request' });
  }

  // Fetch all assets in a single query
  const assets = await prisma.asset.findMany({
    where: {
      id: { in: assetIds },
      project: { ownerId: userId }
    },
    select: { id: true, uri: true }
  });

  // Generate signed URLs for all assets. Presigning is local crypto (no network),
  // so we presign the deterministic _thumb key unconditionally rather than probing
  // S3 with HeadObject per asset; the frontend falls back to the full image on 404.
  // Work runs in bounded-concurrency chunks so the presign calls overlap.
  const urls: Record<string, { url: string; thumbnailUrl: string | null }> = {};
  const URL_SIGN_CONCURRENCY = 20;

  for (let i = 0; i < assets.length; i += URL_SIGN_CONCURRENCY) {
    const chunk = assets.slice(i, i + URL_SIGN_CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (asset) => {
        const thumbKey = asset.uri.replace(/(\.[^.]+)$/, '_thumb$1');
        const [url, thumbnailUrl] = await Promise.all([
          getS3SignedUrl(S3_BUCKET, asset.uri, 3600),
          getS3SignedUrl(S3_BUCKET, thumbKey, 3600),
        ]);
        return { id: asset.id, url, thumbnailUrl };
      })
    );
    for (const r of results) {
      urls[r.id] = { url: r.url, thumbnailUrl: r.thumbnailUrl };
    }
  }

  return { urls };
});

// ================================
// Upload Route
// ================================
app.post('/upload', async (request, reply) => {
  try {
    const userId = (request as any).user.userId;
    const { projectId, tagIds } = request.query as { projectId: string; tagIds?: string };

    const project = await prisma.project.findFirst({
      where: { id: projectId, ownerId: userId }
    });
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'File required' });
    }

    const filename = data.filename;

    // Validate filename
    if (!filename || typeof filename !== 'string') {
      return reply.status(400).send({ error: 'Invalid filename' });
    }

    // Check file extension
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.mp4', '.avi', '.mov', '.mkv', '.webm'];
    const fileExt = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    if (!allowedExtensions.includes(fileExt)) {
      return reply.status(400).send({ error: 'Unsupported file type. Allowed: JPG, PNG, MP4, AVI, MOV, MKV, WebM' });
    }

    const key = `projects/${projectId}/${Date.now()}_${filename}`;
    const isVideo = /\.(mp4|avi|mov|mkv|webm)$/i.test(filename);
    const isImage = /\.(jpg|jpeg|png)$/i.test(filename);

    app.log.info(`Uploading ${isVideo ? 'video' : 'image'}: ${filename}`);

    // Buffer the file for processing
    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(chunk);
    }
    const fileBuffer = Buffer.concat(chunks);

    app.log.info(`File buffered: ${fileBuffer.length} bytes`);

    // Upload original to S3
    await uploadToS3({
      Bucket: S3_BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: data.mimetype
    });

    app.log.info(`Uploaded to S3: ${key}`);

    let width = 0;
    let height = 0;

    // For videos: upload to S3 but don't create asset - video needs to be sliced first
    if (isVideo) {
      app.log.info(`Video uploaded to S3, awaiting slicing: ${key}`);
      
      // Return video info for slicing - no asset created yet
      return {
        asset: null,
        filename,
        bucket: S3_BUCKET,
        isVideo: true,
        videoUri: key,
        message: 'Video uploaded successfully. Please configure and start slicing to extract frames.'
      };
    }

    // For images: generate thumbnail and create asset
    try {
      // Get image dimensions and generate thumbnail
      const metadata = await sharp(fileBuffer).metadata();
      width = metadata.width || 0;
      height = metadata.height || 0;

      // Generate 300x300 thumbnail
      const thumbnailBuffer = await sharp(fileBuffer)
        .resize(300, 300, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 80 })
        .toBuffer();

      // Upload thumbnail to S3
      const thumbKey = key.replace(/(\.[^.]+)$/, '_thumb$1');
      await uploadToS3({
        Bucket: S3_BUCKET,
        Key: thumbKey,
        Body: thumbnailBuffer,
        ContentType: 'image/jpeg'
      });

      app.log.info(`Generated thumbnail for ${filename}`);
    } catch (err) {
      app.log.warn({ err, filename }, `Failed to generate thumbnail`);
      // Continue without thumbnail - not a critical error
    }

    // Create asset record for images
    const asset = await prisma.asset.create({
      data: {
        projectId,
        uri: key,
        width,
        height,
        sourceType: 'image'
      }
    });

    app.log.info(`Created asset: ${asset.id} (${asset.sourceType})`);

    // Apply tags if provided
    if (tagIds) {
      const tagIdArray = tagIds.split(',').filter(id => id.trim());
      if (tagIdArray.length > 0) {
        await prisma.assetTag.createMany({
          data: tagIdArray.map(tagId => ({
            assetId: asset.id,
            tagId: tagId.trim()
          })),
          skipDuplicates: true
        });
        app.log.info(`Applied ${tagIdArray.length} tags to asset ${asset.id}`);
      }
    }

    return { asset, filename, bucket: S3_BUCKET };
  } catch (err: any) {
    app.log.error({ err, stack: err.stack }, 'Upload failed');
    return reply.status(500).send({ error: 'Upload failed: ' + (err.message || 'Unknown error') });
  }
});

// ================================
// Annotation Routes
// ================================
app.get('/assets/:assetId/annotations', async (request, reply) => {
  const userId = (request as any).user.userId;
  const { assetId } = request.params as { assetId: string };

  const asset = await prisma.asset.findFirst({
    where: { id: assetId, project: { ownerId: userId } }
  });
  if (!asset) {
    return reply.status(404).send({ error: 'Asset not found' });
  }

  return await prisma.annotation.findMany({
    where: { assetId },
    include: { class: true },
    orderBy: { createdAt: 'desc' }
  });
});

app.post('/assets/:assetId/annotations', async (request, reply) => {
  const userId = (request as any).user.userId;
  const { assetId } = request.params as { assetId: string };
  const { classId, box, geometryRle, type, confidence } = request.body as {
    classId: string;
    box?: number[];
    geometryRle?: string;
    type: 'mask' | 'box';
    confidence?: number;
  };

  const asset = await prisma.asset.findFirst({
    where: { id: assetId, project: { ownerId: userId } }
  });
  if (!asset) {
    return reply.status(404).send({ error: 'Asset not found' });
  }

  const annotation = await prisma.annotation.create({
    data: {
      assetId,
      classId,
      box,
      geometryRle,
      type,
      confidence: confidence ?? 1.0,
      source: 'manual'
    },
    include: { class: true }
  });

  return annotation;
});

app.put('/annotations/:id', async (request, reply) => {
  const userId = (request as any).user.userId;
  const { id } = request.params as { id: string };
  const { classId, box, geometryRle, type, confidence } = request.body as {
    classId?: string;
    box?: number[];
    geometryRle?: string;
    type?: 'mask' | 'box';
    confidence?: number;
  };

  const annotation = await prisma.annotation.findFirst({
    where: { id, asset: { project: { ownerId: userId } } }
  });
  if (!annotation) {
    return reply.status(404).send({ error: 'Annotation not found' });
  }

  return await prisma.annotation.update({
    where: { id },
    data: {
      ...(classId && { classId }),
      ...(box && { box }),
      ...(geometryRle && { geometryRle }),
      ...(type && { type }),
      ...(confidence !== undefined && { confidence })
    },
    include: { class: true }
  });
});

app.delete('/annotations/:id', async (request, reply) => {
  const userId = (request as any).user.userId;
  const { id } = request.params as { id: string };

  const annotation = await prisma.annotation.findFirst({
    where: { id, asset: { project: { ownerId: userId } } }
  });
  if (!annotation) {
    return reply.status(404).send({ error: 'Annotation not found' });
  }

  await prisma.annotation.delete({ where: { id } });
  return { success: true };
});

// Clear all annotations from a project
app.delete('/projects/:projectId/annotations', async (request, reply) => {
  const userId = (request as any).user.userId;
  const { projectId } = request.params as { projectId: string };

  // Verify project ownership
  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: userId },
    include: { assets: { select: { id: true } } }
  });
  
  if (!project) {
    return reply.status(404).send({ error: 'Project not found' });
  }

  const assetIds = project.assets.map(a => a.id);
  
  // Delete all annotations for all assets in this project
  const result = await prisma.annotation.deleteMany({
    where: { assetId: { in: assetIds } }
  });

  logger.info({ projectId, deletedCount: result.count }, 'Cleared all annotations from project');

  return { 
    success: true, 
    deletedCount: result.count,
    message: `Deleted ${result.count} annotations from ${assetIds.length} assets`
  };
});

// ================================
// Job Routes
// ================================
// Resolve job ownership without a schema change. Jobs have no owner column, so we
// prove the requester owns the job's related data via params: an explicit userId
// (export jobs), a projectId (slice_video / export), and/or assetIds (preview /
// batch). Returns true only when ownership is positively established.
async function requesterOwnsJob(userId: string | undefined, params: unknown): Promise<boolean> {
  if (!userId) return false;
  if (!params || typeof params !== 'object') return false;
  const p = params as { userId?: string; projectId?: string; assetIds?: unknown };

  // Explicit owner recorded on the job (export jobs).
  if (typeof p.userId === 'string') {
    return p.userId === userId;
  }

  // Project-scoped jobs: verify the project is owned by the requester.
  if (typeof p.projectId === 'string') {
    const project = await prisma.project.findFirst({
      where: { id: p.projectId, ownerId: userId },
      select: { id: true }
    });
    return !!project;
  }

  // Asset-scoped jobs (preview/batch): every referenced asset must belong to a
  // project owned by the requester.
  if (Array.isArray(p.assetIds) && p.assetIds.length > 0) {
    const assetIds = p.assetIds.filter((a): a is string => typeof a === 'string');
    if (assetIds.length === 0) return false;
    const ownedCount = await prisma.asset.count({
      where: { id: { in: assetIds }, project: { ownerId: userId } }
    });
    return ownedCount === assetIds.length;
  }

  return false;
}

app.get('/jobs/:id', async (request, reply) => {
  const userId = (request as any).user?.userId;
  const { id } = request.params as { id: string };

  const dbJob = await prisma.job.findUnique({ where: { id } });
  if (!dbJob) {
    return reply.status(404).send({ error: 'Job not found' });
  }

  // Ownership check (the Job model has no owner column, so we resolve ownership
  // through the related data carried in job.params: projectId and/or assetIds,
  // mirroring the userId check in /exports/:jobId/status). If we cannot prove the
  // requester owns the job's data, return 404 to avoid leaking job existence.
  if (!(await requesterOwnsJob(userId, dbJob.params))) {
    return reply.status(404).send({ error: 'Job not found' });
  }

  // Try to get progress from BullMQ job
  let progress = 0;
  let progressMessage = 'Waiting to start...';

  if (dbJob.status === 'running') {
    // O(1) lookup: BullMQ job id is set equal to the Prisma Job id at enqueue.
    const bullJob = await jobQueue.getJob(id);
    if (bullJob) {
      const jobProgress = await bullJob.progress;
      progress = typeof jobProgress === 'number' ? jobProgress : (jobProgress as any)?.progress || 0;
    }
    
    // Provide descriptive message based on job type and progress
    if (dbJob.kind === 'infer_preview' || dbJob.kind === 'infer_batch') {
      if (progress < 10) progressMessage = 'Preparing inference...';
      else if (progress < 95) progressMessage = `Processing images... (${progress}%)`;
      else progressMessage = 'Finishing up...';
    } else if (dbJob.kind === 'export') {
      if (progress < 10) progressMessage = 'Starting export...';
      else if (progress < 20) progressMessage = 'Fetching project data...';
      else if (progress < 70) progressMessage = 'Downloading images...';
      else if (progress < 90) progressMessage = 'Creating archive...';
      else progressMessage = 'Finalizing...';
    } else if (dbJob.kind === 'slice_video') {
      if (progress < 10) progressMessage = 'Downloading video...';
      else if (progress < 50) progressMessage = 'Extracting frames...';
      else progressMessage = 'Uploading frames...';
    }
  } else if (dbJob.status === 'succeeded') {
    progress = 100;
    progressMessage = 'Complete!';
  } else if (dbJob.status === 'failed') {
    progressMessage = 'Failed';
  } else if (dbJob.status === 'queued') {
    progress = 0;
    progressMessage = 'Waiting in queue...';
  }

  return {
    ...dbJob,
    progress,
    progressMessage,
  };
});

// Validate that every supplied assetId belongs to a project owned by the caller.
// Returns null when valid, or an error message when validation should reject.
async function validateAssetOwnership(userId: string, assetIds: unknown): Promise<string | null> {
  if (!Array.isArray(assetIds) || assetIds.length === 0) {
    return 'assetIds array is required';
  }
  const ids = assetIds.filter((a): a is string => typeof a === 'string');
  if (ids.length !== assetIds.length || ids.length === 0) {
    return 'assetIds must be a non-empty array of strings';
  }
  const ownedCount = await prisma.asset.count({
    where: { id: { in: ids }, project: { ownerId: userId } }
  });
  if (ownedCount !== ids.length) {
    return 'One or more assets do not belong to you';
  }
  return null;
}

app.post('/jobs/preview', async (request, reply) => {
  const userId = (request as any).user.userId;
  const body = request.body as { assetIds?: unknown };

  // IDOR guard: only enqueue inference for assets the caller owns.
  const ownershipError = await validateAssetOwnership(userId, body.assetIds);
  if (ownershipError) {
    return reply.status(403).send({ error: ownershipError });
  }

  // Create job record (record the owner so progress/ownership can be re-verified).
  const dbJob = await prisma.job.create({
    data: {
      kind: 'infer_preview',
      status: 'queued',
      params: { ...body, userId } as any
    }
  });

  // Queue the job (jobId mirrors the Prisma Job id for O(1) progress lookups).
  await jobQueue.add('infer_preview', { ...body, dbJobId: dbJob.id, ownerId: userId }, { jobId: dbJob.id });

  return { jobId: dbJob.id };
});

app.post('/jobs/batch', async (request, reply) => {
  const userId = (request as any).user.userId;
  const body = request.body as { assetIds?: unknown };

  // IDOR guard: only enqueue inference for assets the caller owns.
  const ownershipError = await validateAssetOwnership(userId, body.assetIds);
  if (ownershipError) {
    return reply.status(403).send({ error: ownershipError });
  }

  const dbJob = await prisma.job.create({
    data: {
      kind: 'infer_batch',
      status: 'queued',
      params: { ...body, userId } as any
    }
  });

  await jobQueue.add('infer_batch', { ...body, dbJobId: dbJob.id, ownerId: userId }, { jobId: dbJob.id });

  return { jobId: dbJob.id };
});

app.post('/projects/:projectId/slice-video', async (request, reply) => {
  const userId = (request as any).user.userId;
  const { projectId } = request.params as { projectId: string };
  const { videoUri, intervalSec, tagIds } = request.body as { videoUri: string; intervalSec: number; tagIds?: string[] };

  if (!videoUri) {
    return reply.status(400).send({ error: 'Video URI is required' });
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: userId }
  });
  if (!project) {
    return reply.status(404).send({ error: 'Project not found' });
  }

  const dbJob = await prisma.job.create({
    data: {
      kind: 'slice_video',
      status: 'queued',
      params: { videoUri, intervalSec, projectId, tagIds: tagIds || [] }
    }
  });

  await jobQueue.add(
    'slice_video',
    { videoUri, intervalSec, projectId, dbJobId: dbJob.id, tagIds: tagIds || [] },
    { jobId: dbJob.id }
  );

  return { jobId: dbJob.id };
});

// ================================
// Export Routes
// ================================
const SUPPORTED_FORMATS: ExportFormat[] = [
  'coco', 'yolo_detect', 'yolo_segment', 'voc',
  'png_masks', 'createml', 'tfrecord_meta', 'labelme'
];

app.get('/export/formats', async () => {
  return {
    formats: SUPPORTED_FORMATS.map(format => ({
      id: format,
      name: format.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
      description: getFormatDescription(format)
    }))
  };
});

function getFormatDescription(format: ExportFormat): string {
  const descriptions: Record<ExportFormat, string> = {
    'coco': 'COCO JSON format with annotations, commonly used for object detection and segmentation',
    'yolo_detect': 'YOLO format for object detection with normalized bounding boxes',
    'yolo_segment': 'YOLO format for instance segmentation with polygon points',
    'voc': 'Pascal VOC XML format for object detection',
    'png_masks': 'PNG mask images with class-specific coloring',
    'createml': 'Apple CreateML JSON format for training on iOS/macOS',
    'tfrecord_meta': 'TensorFlow TFRecord metadata with Python conversion script',
    'labelme': 'LabelMe JSON format for polygon annotations'
  };
  return descriptions[format];
}

app.post('/projects/:projectId/export', async (request, reply) => {
  const userId = (request as any).user.userId;
  const { projectId } = request.params as { projectId: string };
  const { format, includeClasses } = request.body as {
    format: ExportFormat;
    includeClasses?: string[];
  };

  // Validate format is provided
  if (!format) {
    return reply.status(400).send({
      error: 'Format is required. Please specify a format.',
      supported: SUPPORTED_FORMATS
    });
  }

  // Validate format is supported
  if (!SUPPORTED_FORMATS.includes(format)) {
    return reply.status(400).send({
      error: `Unsupported format: "${format}". Supported formats: ${SUPPORTED_FORMATS.join(', ')}`,
      received: format,
      supported: SUPPORTED_FORMATS
    });
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: userId }
  });
  if (!project) {
    return reply.status(404).send({ error: 'Project not found' });
  }

  const dbJob = await prisma.job.create({
    data: {
      kind: 'export' as const,
      status: 'queued',
      params: { projectId, format, includeClasses, userId }
    }
  });

  await jobQueue.add(
    'export',
    { projectId, format, includeClasses, userId, dbJobId: dbJob.id },
    { jobId: dbJob.id }
  );

  return { jobId: dbJob.id };
});

app.get('/exports/:jobId/status', async (request, reply) => {
  const userId = (request as any).user?.userId;
  const { jobId } = request.params as { jobId: string };

  const dbJob = await prisma.job.findUnique({ where: { id: jobId } });
  if (!dbJob || dbJob.kind !== 'export') {
    return reply.status(404).send({ error: 'Export job not found' });
  }

  // Verify user owns this job (check via job params)
  if (userId && dbJob.params && typeof dbJob.params === 'object') {
    const jobParams = dbJob.params as any;
    if (jobParams.userId && jobParams.userId !== userId) {
      return reply.status(403).send({ error: 'Access denied' });
    }
  }

  // Try to get progress from BullMQ job
  let progress = 0;
  let progressMessage = 'Waiting to start...';
  
  if (dbJob.status === 'running') {
    // O(1) lookup: BullMQ job id is set equal to the Prisma Job id at enqueue.
    const bullJob = await jobQueue.getJob(jobId);
    if (bullJob) {
      const jobProgress = await bullJob.progress;
      progress = typeof jobProgress === 'number' ? jobProgress : (jobProgress as any)?.progress || 0;
    }

    // Provide descriptive message based on progress
    if (progress < 10) progressMessage = 'Starting export...';
    else if (progress < 20) progressMessage = 'Fetching project data...';
    else if (progress < 70) progressMessage = 'Downloading images...';
    else if (progress < 90) progressMessage = 'Creating archive...';
    else progressMessage = 'Finalizing...';
  } else if (dbJob.status === 'succeeded') {
    progress = 100;
    progressMessage = 'Export complete!';
  } else if (dbJob.status === 'failed') {
    progressMessage = 'Export failed';
  }

  return {
    status: dbJob.status,
    progress,
    progressMessage,
    result: dbJob.result
  };
});

// ================================
// Inference Service Info
// ================================
app.get('/inference/models', async (request, reply) => {
  try {
    const response = await fetchWithTimeout(`${INFERENCE_URL}/models`);
    return await response.json();
  } catch (error) {
    return reply.status(503).send({ error: 'Inference service unavailable' });
  }
});

app.post('/inference/models/:modelId/load', async (request, reply) => {
  const { modelId } = request.params as { modelId: string };
  try {
    const response = await fetchWithTimeout(`${INFERENCE_URL}/models/${modelId}/load`, { method: 'POST' });
    const payload = await response.json().catch(() => null);
    if (response.ok && !payload) {
      return reply.status(502).send({ error: 'Inference service returned empty response' });
    }
    if (!response.ok) {
      return reply.status(response.status).send(payload || { error: 'Failed to load model' });
    }
    return payload;
  } catch (error) {
    return reply.status(503).send({ error: 'Inference service unavailable' });
  }
});

app.post('/inference/models/:modelId/unload', async (request, reply) => {
  const { modelId } = request.params as { modelId: string };
  try {
    const response = await fetchWithTimeout(`${INFERENCE_URL}/models/${modelId}/unload`, { method: 'POST' });
    const payload = await response.json().catch(() => null);
    if (response.ok && !payload) {
      return reply.status(502).send({ error: 'Inference service returned empty response' });
    }
    if (!response.ok) {
      return reply.status(response.status).send(payload || { error: 'Failed to unload model' });
    }
    return payload;
  } catch (error) {
    return reply.status(503).send({ error: 'Inference service unavailable' });
  }
});

app.get('/inference/health', async (request, reply) => {
  try {
    const response = await fetchWithTimeout(`${INFERENCE_URL}/health`);
    return await response.json();
  } catch (error) {
    return reply.status(503).send({ error: 'Inference service unavailable' });
  }
});

// Get detailed model status including download state
app.get('/inference/models/status', async (request, reply) => {
  try {
    const response = await fetchWithTimeout(`${INFERENCE_URL}/models/status`);
    if (!response.ok) {
      return reply.status(response.status).send({ error: 'Failed to get model status' });
    }
    return await response.json();
  } catch (error) {
    return reply.status(503).send({ error: 'Inference service unavailable' });
  }
});

// Start model download
app.post('/inference/models/:modelId/download', async (request, reply) => {
  const { modelId } = request.params as { modelId: string };
  try {
    const response = await fetchWithTimeout(`${INFERENCE_URL}/models/${modelId}/download`, { method: 'POST' });
    const payload = await response.json().catch(() => null);
    if (!response.ok && !payload) {
      return reply.status(502).send({ error: 'Inference service returned empty response' });
    }
    return payload;
  } catch (error) {
    return reply.status(503).send({ error: 'Inference service unavailable' });
  }
});

// Get download progress
app.get('/inference/models/:modelId/download/status', async (request, reply) => {
  const { modelId } = request.params as { modelId: string };
  try {
    const response = await fetchWithTimeout(`${INFERENCE_URL}/models/${modelId}/download/status`);
    return await response.json();
  } catch (error) {
    return reply.status(503).send({ error: 'Inference service unavailable' });
  }
});

// ================================
// SAM3 Text Prompt Inference (with retry logic)
// ================================
app.post('/inference/text', async (request, reply) => {
  // Verify user is authenticated (inference endpoints require auth)
  const userId = (request as any).user?.userId;
  if (!userId) {
    return reply.status(401).send({ error: 'Authentication required for inference' });
  }

  try {
    const result = await fetchInferenceWithRetry('/infer/text', {
      method: 'POST',
      body: request.body,
      timeout: INFERENCE_TIMEOUT,
      retries: INFERENCE_MAX_RETRIES
    });

    if (!result.ok) {
      return reply.status(result.status).send(result.data || { error: 'Inference failed' });
    }
    return result.data;
  } catch (error: any) {
    logger.error({ error: error.message }, 'Text prompt inference failed after retries');
    if (error.name === 'AbortError') {
      return reply.status(408).send({ error: 'Inference request timed out' });
    }
    return reply.status(503).send({ error: 'Inference service unavailable' });
  }
});

app.post('/inference/points', async (request, reply) => {
  // Verify user is authenticated (inference endpoints require auth)
  const userId = (request as any).user?.userId;
  if (!userId) {
    return reply.status(401).send({ error: 'Authentication required for inference' });
  }

  try {
    const result = await fetchInferenceWithRetry('/infer/points', {
      method: 'POST',
      body: request.body,
      timeout: INFERENCE_TIMEOUT,
      retries: INFERENCE_MAX_RETRIES
    });

    if (!result.ok) {
      return reply.status(result.status).send(result.data || { error: 'Inference failed' });
    }
    return result.data;
  } catch (error: any) {
    logger.error({ error: error.message }, 'Point prompt inference failed after retries');
    if (error.name === 'AbortError') {
      return reply.status(408).send({ error: 'Inference request timed out' });
    }
    return reply.status(503).send({ error: 'Inference service unavailable' });
  }
});

app.get('/inference/gpu', async (request, reply) => {
  try {
    const response = await fetchWithTimeout(`${INFERENCE_URL}/gpu/info`);
    return await response.json();
  } catch (error) {
    return reply.status(503).send({ error: 'Inference service unavailable' });
  }
});

app.get('/inference/config', async (request, reply) => {
  try {
    const response = await fetchWithTimeout(`${INFERENCE_URL}/config`);
    return await response.json();
  } catch (error) {
    return reply.status(503).send({ error: 'Inference service unavailable' });
  }
});

app.post('/inference/config', async (request, reply) => {
  try {
    const response = await fetchWithTimeout(`${INFERENCE_URL}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request.body)
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return reply.status(response.status).send(payload || { error: 'Failed to update config' });
    }
    return payload;
  } catch (error) {
    return reply.status(503).send({ error: 'Inference service unavailable' });
  }
});

// ================================
// Development Request Logger (cleaner output)
// ================================
if (!isProduction) {
  app.addHook('onResponse', async (request, reply) => {
    const url = request.url;
    const status = reply.statusCode;

    // Skip noisy health/status checks in logs, BUT log if they fail (status >= 400)
    const isHealthCheck = url.includes('/health') || url.includes('/models/status') || url.includes('/url');
    if (isHealthCheck && status < 400) {
      return;
    }

    const duration = reply.elapsedTime?.toFixed(0) || '?';
    const method = request.method.padEnd(6);
    const statusColor = status >= 400 ? '\x1b[31m' : status >= 300 ? '\x1b[33m' : '\x1b[32m';
    console.log(`${statusColor}${status}\x1b[0m ${method} ${url} (${duration}ms)`);
  });
}

// ================================
// Graceful Shutdown
// ================================
let shuttingDown = false;
async function gracefulShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n\x1b[33m⏻\x1b[0m Received ${signal}, shutting down gracefully...`);

  // Stop accepting new work first, then drain dependencies. Each step is isolated
  // so a failure in one does not prevent the others from closing.
  try { await worker?.close(); } catch (err) { logger.warn({ err }, 'Error closing worker'); }
  try { await app.close(); } catch (err) { logger.warn({ err }, 'Error closing HTTP server'); }
  try { await jobQueue?.close(); } catch (err) { logger.warn({ err }, 'Error closing job queue'); }
  try { await connection?.quit(); } catch (err) { logger.warn({ err }, 'Error closing Redis connection'); }
  try { await prisma.$disconnect(); } catch (err) { logger.warn({ err }, 'Error disconnecting Prisma'); }

  console.log('\x1b[32m✓\x1b[0m Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => { void gracefulShutdown('SIGTERM'); });
process.on('SIGINT', () => { void gracefulShutdown('SIGINT'); });

// ================================
// Start Server
// ================================
if (runHttpServer) {
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`\n\x1b[32m✓\x1b[0m Server ready at http://${HOST}:${PORT}\n`);
  } catch (err) {
    console.error('\x1b[31m✗\x1b[0m Server failed to start:', err);
    process.exit(1);
  }
} else {
  console.log('\x1b[32m✓\x1b[0m HTTP server disabled for worker mode');
}
