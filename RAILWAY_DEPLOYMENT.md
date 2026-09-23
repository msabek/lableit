# Lableit - Railway Deployment Guide

This guide walks you through deploying Lableit to [Railway.com](https://railway.com).

> ## ⚠️ Lableit has NO authentication
>
> There is no login, no accounts, no admin approval, and no API tokens. **Every
> API route is open to anyone who can reach it**, and all projects, media and
> annotations belong to one implicit local user.
>
> **A Railway deployment gets a public URL, so following this guide as written
> publishes your data and every route to the entire internet.** Anyone who finds
> the URL can read, download, modify and delete everything in it.
>
> Lableit is built to be downloaded and run locally for academic work. If you
> deploy it to Railway anyway, put an authenticating layer in front of **both**
> the web and API services (for example an identity-aware proxy or a
> Cloudflare Access style gateway) before you put any real data in it.
> Protecting only the web service is not enough: the API is a separate service
> with its own public URL and answers direct requests.

## Table of Contents
- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Step-by-Step Deployment](#step-by-step-deployment)
- [Environment Variables](#environment-variables)
- [Service Configuration](#service-configuration)
- [Database Setup](#database-setup)
- [Storage Configuration](#storage-configuration)
- [Custom Domains](#custom-domains)
- [Monitoring & Logs](#monitoring--logs)
- [Troubleshooting](#troubleshooting)
- [Cost Considerations](#cost-considerations)

## Architecture Overview

Lableit consists of 4 main services on Railway:

```
┌─────────────────────────────────────────────────────────────────┐
│                          Railway Project                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │   Web    │  │   API    │  │Inference │  │  Worker  │       │
│  │ (Nginx)  │  │(Fastify) │  │(FastAPI) │  │ (BullMQ) │       │
│  │  :PORT   │  │  :PORT   │  │  :PORT   │  │  :PORT   │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       │             │             │             │               │
│       └─────────────┼─────────────┼─────────────┘               │
│                     │             │                             │
│  ┌──────────────────┴─────────────┴──────────────────┐         │
│  │              Private Network                       │         │
│  │     (service.railway.internal:PORT)               │         │
│  └──────────────────┬─────────────┬──────────────────┘         │
│                     │             │                             │
│       ┌─────────────┴─┐   ┌───────┴───────┐                    │
│       │   PostgreSQL  │   │     Redis     │                    │
│       │   (Plugin)    │   │   (Plugin)    │                    │
│       └───────────────┘   └───────────────┘                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            │
                   ┌────────┴────────┐
                   │  External S3    │
                   │ (AWS/R2/B2)     │
                   └─────────────────┘
```

## Prerequisites

Before deploying, ensure you have:

1. **Railway Account**: Sign up at [railway.com](https://railway.com)
2. **GitHub Repository**: Push your code to a GitHub repository
3. **S3-Compatible Storage**: One of:
   - AWS S3
   - Cloudflare R2 (recommended - cheaper egress)
   - Backblaze B2
   - Any S3-compatible service

## Step-by-Step Deployment

### 1. Create Railway Project

```bash
# Option A: Using Railway CLI
npm install -g @railway/cli
railway login
railway init

# Option B: Via Dashboard
# Go to railway.com > New Project > Deploy from GitHub repo
```

### 2. Connect GitHub Repository

1. In Railway dashboard, click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Authorize Railway to access your repository
4. Select your Lableit repository

Railway will automatically detect the monorepo structure and suggest services.

### 3. Add PostgreSQL Database

1. In your project, click **"+ New"**
2. Select **"Database"** > **"PostgreSQL"**
3. Railway automatically creates the database and injects `DATABASE_URL`

### 4. Add Redis

1. Click **"+ New"**
2. Select **"Database"** > **"Redis"**
3. Railway automatically injects `REDIS_URL`

### 5. Configure Services

For each service (api, web, inference, worker), configure in Railway dashboard.

> **Build context:** the API, web and worker Dockerfiles copy `package.json`,
> `bun.lock` and `packages/shared` from the repo root, so those services must
> build from the **repo root**. Leave Root Directory empty and point Railway at
> the Dockerfile with **Dockerfile Path** (or set the service variable
> `RAILWAY_DOCKERFILE_PATH`, e.g. `RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile`).
> The Railway Config File does not follow Root Directory, so set its full path
> (for example `/apps/api/railway.toml`) in the service settings.

#### API Service
- **Root Directory**: (leave empty, repo root)
- **Dockerfile Path**: `apps/api/Dockerfile`
- **Railway Config File**: `/apps/api/railway.toml`
- **Start Command**: (leave empty) so the Dockerfile's `/start.sh` runs. It applies pending Prisma migrations (`prisma migrate deploy`) and then starts the API. Do not set `bun run start` here, or migrations are skipped.

**Environment Variables:**
```
# PORT is provided by Railway at runtime; on Railway services listen on :8080.
# Do not hardcode PORT — let Railway inject it. API_HOST must be 0.0.0.0.
API_HOST=0.0.0.0
LOG_LEVEL=info
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
S3_ENDPOINT=<your-s3-endpoint>
S3_REGION=<your-s3-region>
S3_ACCESS_KEY=<your-access-key>
S3_SECRET_KEY=<your-secret-key>
S3_BUCKET=lableit
# Optional: API CORS allow-list, comma-separated, no spaces. Only needed if the
# browser calls the API from another origin (the web /api proxy is same-origin).
# ALLOWED_ORIGINS=https://app.your-domain.com
# Point at the inference service on the private network. Use the port the
# inference service actually listens on in Railway (its injected $PORT / :8080).
INFERENCE_URL=http://inference.railway.internal:8080
FFMPEG_PATH=ffmpeg
```

> **Ports on Railway:** Railway injects a dynamic `$PORT` and routes the
> service's internal address on `:8080`. Each service binds to `$PORT` (the
> API uses `PORT`, the inference service uses `--port $PORT`). When one service
> calls another over `service.railway.internal`, use the **target service's
> listening port** (`:8080`). The local dev ports (api 3001, inference 8001)
> do **not** apply on Railway.

#### Web Service
- **Root Directory**: (leave empty, repo root)
- **Dockerfile Path**: `apps/web/Dockerfile`
- **Railway Config File**: `/apps/web/railway.toml`

**Environment Variables:**
```
# Use the API service's internal listening port on Railway (:8080).
API_URL=http://api.railway.internal:8080
VITE_API_URL=/api
```

#### Inference Service
- **Root Directory**: `apps/inference` (its Dockerfile only copies files from this folder)
- **Railway Config File**: `/apps/inference/railway.toml`
- **Python**: 3.11 (canonical)
- **Build Command**: (auto-detected from Dockerfile)
- **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT` (Railway sets `$PORT`; the service is reached internally on `:8080`)

**Environment Variables:**
```
MODEL_CACHE_DIR=/app/models
PYTHONUNBUFFERED=1
# facebook/sam3 is a gated Hugging Face model: request access on its model
# page, then use a token from the approved account.
HF_TOKEN=<your-huggingface-token>
```

> **Note (GPU):** **SAM3 runs best on an NVIDIA CUDA GPU**
> and **Railway has no GPUs**, so on Railway the inference service starts in
> **limited / unavailable mode**: automatic SAM3 detection will not run, while
> manual annotation, project management, video slicing, and export still work.
> For automatic detection in production, run inference on an external CUDA GPU
> service and point the API's `INFERENCE_URL` at it (see "GPU Considerations").

#### Worker Service (Required)
Background jobs (detection batches, exports, video processing) only run in the
worker. In production the API does not start an embedded worker, so without
this service those jobs are queued but never processed.

- **Root Directory**: (leave empty, repo root)
- **Dockerfile Path**: `apps/api/Dockerfile` (same image as the API)
- **Railway Config File**: (leave empty; do not reuse `apps/api/railway.toml`, its `/health` check would fail because the worker has no HTTP listener)
- **Start Command**: `bun --cwd apps/api run start` (does not run migrations; the API service does that)
- **Healthcheck Path**: (leave empty)

**Environment Variables:** (same as API, plus)
```
WORKER_MODE=true
RUN_HTTP_SERVER=false
```

The API service should leave `WORKER_MODE` unset or set to `false`. In production the API process does not start an embedded BullMQ worker by default, so background jobs run only in the worker service unless `RUN_WORKER=true` is explicitly configured.

### 6. Configure Private Networking

Railway provides private networking between services. On Railway, each service
listens on its injected `$PORT` and is reachable internally on `:8080`. Use
these internal URLs:

- API to Inference: `http://inference.railway.internal:8080`
- Web to API: `http://api.railway.internal:8080`

### 7. Add Volumes (for Model Storage)

For the inference service to persist downloaded models:

1. Go to Inference service settings
2. Click **"+ Mount"**
3. Add volume at `/app/models`

### 8. Deploy

Railway automatically deploys when you push to your connected branch. To manually deploy:

```bash
railway up
```

Or click **"Deploy"** in the Railway dashboard.

## Environment Variables

### Required Variables

| Service | Variable | Description |
|---------|----------|-------------|
| All | `PORT` | Auto-set by Railway |
| API | `DATABASE_URL` | Use `${{Postgres.DATABASE_URL}}` |
| API | `REDIS_URL` | Use `${{Redis.REDIS_URL}}` |
| API | `S3_*` | S3 storage credentials |
| API | `ALLOWED_ORIGINS` | Optional. CORS allow-list, comma-separated, no spaces. Only needed for cross-origin API calls |
| Worker | `WORKER_MODE=true`, `RUN_HTTP_SERVER=false` | Runs the background job worker |
| Inference | `HF_TOKEN` | Hugging Face token with approved access to the gated `facebook/sam3` model |
| Web | `API_URL` | Internal API URL |

### Variable References

Railway supports referencing variables from other services:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
```

## Service Configuration

### railway.toml Files

Each service includes a `railway.toml` configuration file:

**apps/api/railway.toml:**
```toml
[build]
builder = "dockerfile"
dockerfilePath = "apps/api/Dockerfile"

[deploy]
# No startCommand: the Dockerfile CMD (/start.sh) migrates, then starts the API.
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

### Health Checks

All services have health check endpoints:

- **API**: `GET /health`
- **Web**: `GET /`
- **Inference**: `GET /health`

Railway monitors these endpoints and restarts unhealthy services.

## Database Setup

### Running Migrations

The API service runs `prisma migrate deploy` automatically on every start
(the Dockerfile's `/start.sh`). To run them by hand:

```bash
# Using Railway CLI
railway run -s api -- bunx prisma migrate deploy

# Or via Railway shell
railway shell -s api
bunx prisma migrate deploy
```

### Database Backup

Railway PostgreSQL includes automatic backups. For manual backups:

```bash
railway run -s api -- bunx prisma db pull
```

## Storage Configuration

### Cloudflare R2 (Recommended)

1. Create R2 bucket in Cloudflare dashboard
2. Generate R2 API tokens
3. Configure environment variables:

```
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY=<r2-access-key-id>
S3_SECRET_KEY=<r2-secret-access-key>
S3_BUCKET=lableit
```

### AWS S3

```
S3_ENDPOINT=https://s3.amazonaws.com
S3_REGION=us-east-1
S3_ACCESS_KEY=<aws-access-key>
S3_SECRET_KEY=<aws-secret-key>
S3_BUCKET=lableit-assets
```

The API uses AWS SDK v3 and works with S3-compatible providers through `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, and `S3_BUCKET`.

### CORS Configuration

For your S3 bucket, configure CORS to allow your Railway domain:

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://your-app.railway.app"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3600
    }
  ]
}
```

## Custom Domains

### Configure in Railway

1. Go to service settings
2. Click **"+ Custom Domain"**
3. Add your domain (e.g., `app.lableit.com`)
4. Configure DNS records as instructed

### SSL Certificates

Railway automatically provisions SSL certificates for custom domains.

### A custom domain does not add access control

Adding a domain and a certificate encrypts the traffic; it does not restrict who
may send it. Lableit has no authentication, so the domain you add is a public
front door to every route and every project. Put an authenticating proxy in
front of the web **and** API services if the domain is reachable from the
internet (see the warning at the top of this guide).

## Monitoring & Logs

### Viewing Logs

```bash
# Using Railway CLI
railway logs -s api
railway logs -s web
railway logs -s inference

# Or in dashboard: Service > Logs
```

### Metrics

Railway provides built-in metrics:
- CPU usage
- Memory usage
- Network I/O
- Request counts

View in: Service > Metrics

### Alerting

Set up alerts in Railway for:
- High memory usage
- Service restarts
- Deploy failures

## Troubleshooting

### Common Issues

#### 1. Service won't start

Check logs for errors:
```bash
railway logs -s <service-name>
```

Common causes:
- Missing environment variables
- Database connection issues
- Port configuration problems

#### 2. Database connection errors

Ensure `DATABASE_URL` uses the correct reference:
```
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

#### 3. Services can't communicate

Use Railway's internal networking (services listen on the injected `$PORT`,
reachable internally on `:8080`):
- API URL: `http://api.railway.internal:8080`
- Inference URL: `http://inference.railway.internal:8080`

#### 4. Build failures

The API, web and worker Dockerfiles need the repo root as build context. If the
build fails on `COPY package.json bun.lock` or `packages/shared`, clear Root
Directory and set Dockerfile Path (or `RAILWAY_DOCKERFILE_PATH`) instead.

#### 5. Memory issues

Railway has memory limits. Monitor usage and upgrade if needed.

### Getting Help

- [Railway Documentation](https://docs.railway.app)
- [Railway Discord](https://discord.gg/railway)
- [Lableit Issues](https://github.com/your-repo/lableit/issues)

## Cost Considerations

### Railway Pricing

Railway uses usage-based pricing:
- **Hobby Plan**: $5/month credit
- **Pro Plan**: $20/month + usage

### Resource Usage

Estimated monthly costs (varies by usage):
- PostgreSQL: ~$5-10/month
- Redis: ~$3-5/month
- API Service: ~$5-15/month
- Web Service: ~$3-5/month
- Inference Service: ~$10-30/month (CPU only on Railway — SAM3 detection is unavailable without a GPU)

### Cost Optimization

1. **Scale inference separately**: Use Railway for API/Web, dedicated GPU service for inference
2. **Use Cloudflare R2**: Free egress saves on bandwidth costs
3. **Set resource limits**: Prevent unexpected charges
4. **Use sleep mode**: For development environments

## GPU Considerations

Railway does not currently support GPU instances. For production inference with SAM3:

### Option 1: External GPU Service

Use services like:
- [RunPod](https://runpod.io)
- [Modal](https://modal.com)
- [Replicate](https://replicate.com)

Configure the API to point to external inference:
```
INFERENCE_URL=https://your-gpu-service.com
```

### Option 2: Limited mode (no GPU) on Railway

Railway has no GPUs, and **SAM3 requires CUDA** (the `sam3` library has
hardcoded `device="cuda"` paths). On Railway the inference service therefore
starts but runs in **limited / unavailable mode** — automatic SAM3 detection
does **not** run. The rest of the platform still works:
- Manual annotation (drawing boxes/masks)
- Video slicing and export functionality
- Project, class, and tag management

For automatic detection, use Option 1 (an external CUDA GPU service).

## Summary

Railway deployment checklist:

- [ ] Create Railway project
- [ ] Connect GitHub repository
- [ ] Add PostgreSQL plugin
- [ ] Add Redis plugin
- [ ] Configure API service with environment variables
- [ ] Configure Web service with environment variables
- [ ] Configure Inference service with volume mount
- [ ] Configure Worker service (required for background jobs)
- [ ] Put an authenticating proxy in front of the web and API services (Lableit has no authentication of its own)
- [ ] Run database migrations
- [ ] Set up S3 storage (external)
- [ ] Configure custom domain (optional)
- [ ] Set up monitoring and alerts
- [ ] Test all endpoints

For questions or issues, refer to the troubleshooting section or open an issue on GitHub.
