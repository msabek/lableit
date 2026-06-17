import axios, { AxiosError } from 'axios';

declare global {
  interface Window {
    __LABLEIT_CONFIG__?: {
      VITE_CLERK_PUBLISHABLE_KEY?: string;
      VITE_API_URL?: string;
    };
  }
}

// The API base comes from the runtime-config injection (window.__LABLEIT_CONFIG__)
// or the VITE_API_URL build-time env var. Behind a reverse proxy this resolves to
// the same-origin '/api' path. The localhost default applies ONLY in local dev.
const API_BASE_URL =
  window.__LABLEIT_CONFIG__?.VITE_API_URL ||
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? 'http://localhost:3001' : '/api');

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 second timeout
});

// Token getter function - will be set by ClerkTokenProvider
let getClerkToken: (() => Promise<string | null>) | null = null;
let tokenGetterReady = false;

export function setClerkTokenGetter(getter: () => Promise<string | null>) {
  getClerkToken = getter;
  tokenGetterReady = true;
}

// Check if the token getter has been set up
export function isAuthReady(): boolean {
  return tokenGetterReady;
}

// Service status tracking
export interface ServiceStatus {
  api: 'connected' | 'disconnected' | 'checking';
  inference: 'connected' | 'disconnected' | 'checking';
  lastChecked: Date | null;
  error?: string;
}

let serviceStatus: ServiceStatus = {
  api: 'checking',
  inference: 'checking',
  lastChecked: null,
};

let serviceStatusListeners: ((status: ServiceStatus) => void)[] = [];

export function subscribeToServiceStatus(listener: (status: ServiceStatus) => void) {
  serviceStatusListeners.push(listener);
  listener(serviceStatus); // Immediately call with current status
  return () => {
    serviceStatusListeners = serviceStatusListeners.filter(l => l !== listener);
  };
}

function updateServiceStatus(updates: Partial<ServiceStatus>) {
  serviceStatus = { ...serviceStatus, ...updates, lastChecked: new Date() };
  serviceStatusListeners.forEach(l => l(serviceStatus));
}

// Health check function
export async function checkServiceHealth(): Promise<ServiceStatus> {
  updateServiceStatus({ api: 'checking', inference: 'checking' });

  try {
    const response = await api.get('/health', { timeout: 5000 });
    updateServiceStatus({ api: 'connected' });
  } catch (err: any) {
    const errorMsg = getErrorMessage(err);
    console.error('[Health] API check failed:', errorMsg, err);
    updateServiceStatus({ api: 'disconnected', error: errorMsg });
  }

  try {
    await api.get('/inference/models/status', { timeout: 5000 });
    updateServiceStatus({ inference: 'connected' });
  } catch (err: any) {
    console.error('[Health] Inference check failed:', getErrorMessage(err));
    updateServiceStatus({ inference: 'disconnected' });
  }

  return serviceStatus;
}

// Retry logic with exponential backoff
async function retryRequest(fn: () => Promise<any>, maxRetries: number = 3, baseDelay: number = 1000): Promise<any> {
  let lastError: any;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Don't retry for client errors (4xx) except 429 (rate limit)
      if (error.response?.status >= 400 && error.response?.status < 500 && error.response?.status !== 429) {
        throw error;
      }
      
      // Don't retry for auth errors
      if (error.response?.status === 401 || error.response?.status === 403) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`Request failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

// Enhanced error message helper
export function getErrorMessage(error: any): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    
    if (axiosError.code === 'ERR_NETWORK') {
      return 'Network error: Cannot connect to the server. Please check if the API server is running.';
    }
    
    if (axiosError.code === 'ECONNABORTED') {
      return 'Request timed out. The server may be overloaded or unreachable.';
    }
    
    if (axiosError.response) {
      const data = axiosError.response.data as any;
      return data?.error || data?.message || `Server error (${axiosError.response.status})`;
    }
    
    return axiosError.message;
  }
  
  return error.message || 'An unexpected error occurred';
}

// Add auth token to requests
api.interceptors.request.use(async (config: any) => {
  // Try to get Clerk token first
  if (getClerkToken) {
    try {
      const token = await getClerkToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
        return config;
      }
    } catch (e) {
      console.warn('Failed to get Clerk token:', e);
    }
  }
  
  // Fallback to localStorage token (for backwards compatibility)
  const storedToken = localStorage.getItem('token');
  if (storedToken) {
    config.headers.Authorization = `Bearer ${storedToken}`;
  }
  return config;
});

// Handle responses with retry for network errors
api.interceptors.response.use(
  (response: any) => {
    // Mark API as connected on successful response
    if (serviceStatus.api !== 'connected') {
      updateServiceStatus({ api: 'connected', error: undefined });
    }
    return response;
  },
  async (error: any) => {
    // Handle 401 responses - but don't redirect if:
    // 1. Already on auth page
    // 2. Auth hasn't been initialized yet (to avoid redirect loops during startup)
    // 3. It's an export-related error (let the component handle it)
    if (error.response?.status === 401) {
      const currentPath = window.location.pathname;
      const isAuthPage = currentPath.startsWith('/auth/');
      const requestUrl = error.config?.url || '';
      const isExportRequest = requestUrl.includes('/export') || requestUrl.includes('/exports/');

      // Don't redirect for export requests - let the component handle the error
      if (isExportRequest) {
        return Promise.reject(error);
      }

      // Only redirect if:
      // - Not already on an auth page
      // - Auth has been initialized (token getter is ready)
      // If auth isn't ready, the ClerkTokenProvider will handle showing loading state
      if (!isAuthPage && tokenGetterReady) {
        // Use replace to avoid polluting browser history
        window.location.replace('/auth/sign-in');
      }
      return Promise.reject(error);
    }

    // Update service status on network errors
    if (error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED') {
      updateServiceStatus({ api: 'disconnected', error: getErrorMessage(error) });
    }

    return Promise.reject(error);
  }
);

// ================================
// Types
// ================================
export interface User {
  id: string;
  email: string;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  assets: Asset[];
  assetCount?: number;
  classes: ClassDef[];
  _count?: { assets: number };
  // Legacy support for datasets (being removed)
  datasets?: Dataset[];
}

export function getProjectAssetCount(project: Pick<Project, 'assets' | 'assetCount' | '_count'>): number {
  if (typeof project.assetCount === 'number') return project.assetCount;
  if (project._count && typeof project._count.assets === 'number') return project._count.assets;
  if (Array.isArray(project.assets)) return project.assets.length;
  return 0;
}

export interface Dataset {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  assets: Asset[];
}

export interface Asset {
  id: string;
  projectId: string;
  uri: string;
  width: number;
  height: number;
  frameTimeMs?: number;
  sourceType: 'image' | 'video_frame';
  createdAt: string;
  annotations?: Annotation[];
  tags?: AssetTag[];
  // Legacy support
  datasetId?: string;
}

export interface ClassDef {
  id: string;
  projectId: string;
  name: string;
  color: string;
  threshold: number;
}

export interface Tag {
  id: string;
  projectId: string;
  name: string;
  color: string;
  createdAt: string;
  _count?: { assets: number };
}

export interface AssetTag {
  id: string;
  assetId: string;
  tagId: string;
  createdAt: string;
  tag?: Tag;
}

export interface Annotation {
  id: string;
  assetId: string;
  classId: string;
  confidence: number;
  geometryRle?: string;
  geometryPolygon?: number[][];
  box?: number[];
  type: 'mask' | 'box';
  source: 'auto' | 'manual';
  createdAt: string;
  class?: ClassDef;
}

export interface Job {
  id: string;
  kind: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  params: Record<string, any>;
  result?: Record<string, any>;
  progress?: number;
  progressMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export type ExportFormat =
  | 'coco'
  | 'yolo_detect'
  | 'yolo_segment'
  | 'voc'
  | 'png_masks'
  | 'createml'
  | 'tfrecord_meta'
  | 'labelme';

export interface ExportFormatInfo {
  id: ExportFormat;
  name: string;
  description: string;
}

export interface InferenceModel {
  id: string;
  name: string;
  loaded: boolean;
  device: string;
}

// ================================
// Auth API
// ================================
export const auth = {
  login: async (email: string, password: string): Promise<AuthResponse> => {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
  },
  register: async (email: string, password: string): Promise<AuthResponse> => {
    const response = await api.post('/auth/register', { email, password });
    return response.data;
  },
  me: async (): Promise<User> => {
    const response = await api.get('/auth/me');
    return response.data;
  },
};

// ================================
// Projects API
// ================================
export const projects = {
  getAll: async (): Promise<Project[]> => {
    const response = await api.get('/projects');
    return (response.data as Project[]).map((project) => ({
      ...project,
      assetCount: getProjectAssetCount(project),
      // Keep a consistent shape for consumers that expect arrays.
      assets: Array.isArray(project.assets) ? project.assets : [],
      classes: Array.isArray(project.classes) ? project.classes : [],
    }));
  },
  get: async (id: string): Promise<Project> => {
    const response = await api.get(`/projects/${id}`);
    const project = response.data as Project;
    return {
      ...project,
      assetCount: getProjectAssetCount(project),
      assets: Array.isArray(project.assets) ? project.assets : [],
      classes: Array.isArray(project.classes) ? project.classes : [],
    };
  },
  create: async (name: string): Promise<Project> => {
    const response = await api.post('/projects', { name });
    return response.data;
  },
  update: async (id: string, name: string): Promise<Project> => {
    const response = await api.put(`/projects/${id}`, { name });
    return response.data;
  },
  delete: async (id: string): Promise<void> => {
    await api.delete(`/projects/${id}`);
  },
  // Clear all annotations from a project
  clearAnnotations: async (id: string): Promise<{ success: boolean; deletedCount: number; message: string }> => {
    const response = await api.delete(`/projects/${id}/annotations`);
    return response.data;
  },
};

// ================================
// Project Assets API (replaces Datasets API)
// ================================
export const projectAssets = {
  getAll: async (projectId: string): Promise<Asset[]> => {
    const response = await api.get(`/projects/${projectId}/assets`);
    return response.data;
  },
};

// ================================
// Classes API
// ================================
export const classes = {
  getAll: async (projectId: string): Promise<ClassDef[]> => {
    const response = await api.get(`/projects/${projectId}/classes`);
    return response.data;
  },
  get: async (id: string): Promise<ClassDef> => {
    const response = await api.get(`/classes/${id}`);
    return response.data;
  },
  create: async (projectId: string, name: string, color: string, threshold: number): Promise<ClassDef> => {
    const response = await api.post(`/projects/${projectId}/classes`, { name, color, threshold });
    return response.data;
  },
  update: async (id: string, data: Partial<{ name: string; color: string; threshold: number }>): Promise<ClassDef> => {
    const response = await api.put(`/classes/${id}`, data);
    return response.data;
  },
  delete: async (id: string): Promise<void> => {
    await api.delete(`/classes/${id}`);
  },
  exportCsv: async (projectId: string): Promise<void> => {
    const response = await api.get(`/projects/${projectId}/classes/export`, {
      responseType: 'blob'
    });
    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `classes_${projectId}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
  importCsv: async (projectId: string, file: File): Promise<{ imported: number; errors?: string[]; classes: ClassDef[] }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(`/projects/${projectId}/classes/import`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },
};

// ================================
// Tags API
// ================================
export const tags = {
  getAll: async (projectId: string): Promise<Tag[]> => {
    const response = await api.get(`/projects/${projectId}/tags`);
    return response.data;
  },
  create: async (projectId: string, name: string, color?: string): Promise<Tag> => {
    const response = await api.post(`/projects/${projectId}/tags`, { name, color });
    return response.data;
  },
  update: async (id: string, data: Partial<{ name: string; color: string }>): Promise<Tag> => {
    const response = await api.put(`/tags/${id}`, data);
    return response.data;
  },
  delete: async (id: string): Promise<void> => {
    await api.delete(`/tags/${id}`);
  },
  // Add tag to a single asset
  addToAsset: async (assetId: string, tagId: string): Promise<{ success: boolean }> => {
    const response = await api.post(`/assets/${assetId}/tags`, { tagId });
    return response.data;
  },
  // Remove tag from a single asset
  removeFromAsset: async (assetId: string, tagId: string): Promise<{ success: boolean }> => {
    const response = await api.delete(`/assets/${assetId}/tags/${tagId}`);
    return response.data;
  },
  // Bulk add tags to multiple assets
  addToAssets: async (assetIds: string[], tagIds: string[]): Promise<{ success: boolean; tagsAdded: number; assetsAffected: number }> => {
    const response = await api.post('/assets/bulk/tags', { assetIds, tagIds });
    return response.data;
  },
  // Bulk remove tags from multiple assets
  removeFromAssets: async (assetIds: string[], tagIds: string[]): Promise<{ success: boolean; tagsRemoved: number }> => {
    const response = await api.delete('/assets/bulk/tags', { data: { assetIds, tagIds } });
    return response.data;
  },
};

// ================================
// Assets API
// ================================
// URL cache to avoid refetching signed URLs (they're valid for 1 hour)
const urlCache = new Map<string, { url: string; thumbnailUrl: string | null; expires: number }>();
const URL_CACHE_DURATION = 50 * 60 * 1000; // 50 minutes (URLs valid for 1 hour)

// Cleanup expired cache entries every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of urlCache.entries()) {
    if (value.expires <= now) {
      urlCache.delete(key);
    }
  }
}, 5 * 60 * 1000);

export const assets = {
  getAll: async (projectId: string): Promise<Asset[]> => {
    const response = await api.get(`/projects/${projectId}/assets`);
    return response.data;
  },
  get: async (id: string): Promise<Asset> => {
    const response = await api.get(`/assets/${id}`);
    return response.data;
  },
  getUrl: async (id: string): Promise<{ url: string; thumbnailUrl?: string | null }> => {
    // Check cache first
    const cached = urlCache.get(id);
    if (cached && cached.expires > Date.now()) {
      return { url: cached.url, thumbnailUrl: cached.thumbnailUrl };
    }
    
    const response = await api.get(`/assets/${id}/url`);
    const { url, thumbnailUrl } = response.data;
    
    // Cache the URL
    urlCache.set(id, { url, thumbnailUrl, expires: Date.now() + URL_CACHE_DURATION });
    
    return { url, thumbnailUrl };
  },
  // Batch fetch URLs for multiple assets (much more efficient for grids)
  getBatchUrls: async (assetIds: string[]): Promise<Record<string, { url: string; thumbnailUrl: string | null }>> => {
    const now = Date.now();
    const result: Record<string, { url: string; thumbnailUrl: string | null }> = {};
    const uncachedIds: string[] = [];
    
    // Check cache first
    for (const id of assetIds) {
      const cached = urlCache.get(id);
      if (cached && cached.expires > now) {
        result[id] = { url: cached.url, thumbnailUrl: cached.thumbnailUrl };
      } else {
        uncachedIds.push(id);
      }
    }
    
    // Fetch uncached URLs in batch
    if (uncachedIds.length > 0) {
      try {
        const response = await api.post('/assets/urls', { assetIds: uncachedIds });
        const { urls } = response.data as { urls: Record<string, { url: string; thumbnailUrl: string | null }> };
        
        // Cache and add to result
        for (const [id, data] of Object.entries(urls)) {
          urlCache.set(id, { ...data, expires: now + URL_CACHE_DURATION });
          result[id] = data;
        }
      } catch (err) {
        console.error('Failed to batch fetch URLs:', err);
        // Fall back to individual requests for failed batch
        for (const id of uncachedIds) {
          try {
            const { url, thumbnailUrl } = await assets.getUrl(id);
            result[id] = { url, thumbnailUrl: thumbnailUrl || null };
          } catch {
            // Skip failed individual requests
          }
        }
      }
    }
    
    return result;
  },
  // Clear URL cache (useful when assets are updated)
  clearUrlCache: (assetId?: string) => {
    if (assetId) {
      urlCache.delete(assetId);
    } else {
      urlCache.clear();
    }
  },
  delete: async (id: string): Promise<void> => {
    urlCache.delete(id); // Clear cache on delete
    await api.delete(`/assets/${id}`);
  },
  // Delete multiple assets at once
  deleteBulk: async (assetIds: string[]): Promise<{ success: boolean; deletedCount: number; message: string }> => {
    assetIds.forEach(id => urlCache.delete(id)); // Clear cache
    const response = await api.delete('/assets/bulk', { data: { assetIds } });
    return response.data;
  },
  // Delete all assets in a project
  deleteAll: async (projectId: string): Promise<{ success: boolean; deletedCount: number; message: string }> => {
    urlCache.clear(); // Clear entire cache
    const response = await api.delete(`/projects/${projectId}/assets`);
    return response.data;
  },
};

// ================================
// Upload API
// ================================
export const upload = {
  file: async (
    projectId: string,
    file: File,
    onProgress?: (progress: number) => void,
    tagIds?: string[]
  ): Promise<{ asset: Asset; filename: string; bucket: string; videoUri?: string; isVideo?: boolean }> => {
    const formData = new FormData();
    formData.append('file', file);

    // Build query string with optional tagIds
    let queryString = `projectId=${projectId}`;
    if (tagIds && tagIds.length > 0) {
      queryString += `&tagIds=${tagIds.join(',')}`;
    }

    const response = await api.post(`/upload?${queryString}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent: any) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      },
    });
    return response.data;
  },
};

// ================================
// Annotations API
// ================================
export const annotations = {
  getAll: async (assetId: string): Promise<Annotation[]> => {
    const response = await api.get(`/assets/${assetId}/annotations`);
    return response.data;
  },
  create: async (assetId: string, data: {
    classId: string;
    box?: number[];
    geometryRle?: string;
    type: 'mask' | 'box';
    confidence?: number;
  }): Promise<Annotation> => {
    const response = await api.post(`/assets/${assetId}/annotations`, data);
    return response.data;
  },
  update: async (id: string, data: Partial<{
    classId: string;
    box: number[];
    geometryRle: string;
    type: 'mask' | 'box';
    confidence: number;
  }>): Promise<Annotation> => {
    const response = await api.put(`/annotations/${id}`, data);
    return response.data;
  },
  delete: async (id: string): Promise<void> => {
    await api.delete(`/annotations/${id}`);
  },
};

// ================================
// Jobs API
// ================================
export type InferenceModeType = 'boxes_only' | 'boxes_and_masks' | 'masks_only';

export const jobs = {
  get: async (id: string): Promise<Job> => {
    const response = await api.get(`/jobs/${id}`);
    return response.data;
  },
  createPreview: async (params: {
    assetIds: string[];
    model: string;
    classes: { id: string; name: string; threshold: number }[];
    inferenceMode?: InferenceModeType;
  }): Promise<{ jobId: string }> => {
    const response = await api.post('/jobs/preview', params);
    return response.data;
  },
  createBatch: async (params: {
    assetIds: string[];
    model: string;
    classes: { id: string; name: string; threshold: number }[];
    inferenceMode?: InferenceModeType;
  }): Promise<{ jobId: string }> => {
    const response = await api.post('/jobs/batch', params);
    return response.data;
  },
  sliceVideo: async (projectId: string, videoUri: string, intervalSec: number, tagIds?: string[]): Promise<{ jobId: string }> => {
    const response = await api.post(`/projects/${projectId}/slice-video`, { videoUri, intervalSec, tagIds });
    return response.data;
  },
  // Poll for job completion
  waitForCompletion: async (jobId: string, pollInterval: number = 1000, timeout: number = 300000): Promise<Job> => {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const job = await jobs.get(jobId);
      if (job.status === 'succeeded' || job.status === 'failed') {
        return job;
      }
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    throw new Error('Job timed out');
  },
};

// ================================
// Export API
// ================================
export const exportApi = {
  getFormats: async (): Promise<{ formats: ExportFormatInfo[] }> => {
    const response = await api.get('/export/formats');
    return response.data;
  },
  create: async (projectId: string, format: ExportFormat, includeClasses?: string[]): Promise<{ jobId: string }> => {
    const response = await api.post(`/projects/${projectId}/export`, { format, includeClasses });
    return response.data;
  },
  getStatus: async (jobId: string): Promise<{ status: string; progress?: number; progressMessage?: string; result?: any }> => {
    const response = await api.get(`/exports/${jobId}/status`);
    return response.data;
  },
  getDownloadUrl: (jobId: string): string => {
    return `${API_BASE_URL}/exports/${jobId}.zip`;
  },
  // Download export - creates job, waits for completion, and returns blob
  download: async (projectId: string, format: string, onProgress?: (progress: number, message: string) => void): Promise<Blob> => {
    // Create export job
    const { jobId } = await exportApi.create(projectId, format as ExportFormat);

    // Poll for completion
    const maxAttempts = 120; // 2 minutes max
    const pollInterval = 1000; // 1 second

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const status = await exportApi.getStatus(jobId);

      if (onProgress) {
        onProgress(status.progress || 0, status.progressMessage || 'Processing...');
      }

      if (status.status === 'succeeded' || status.status === 'completed') {
        // Use the downloadPath from the result if available, otherwise construct URL
        const downloadPath = status.result?.downloadPath || `/exports/${jobId}.zip`;
        // Normalize URL: avoid double slashes between base and path
        const base = API_BASE_URL.replace(/\/+$/, '');
        const pathPart = downloadPath.startsWith('/') ? downloadPath : `/${downloadPath}`;
        const downloadUrl = downloadPath.startsWith('http')
          ? downloadPath
          : `${base}${pathPart}`;
        
        const response = await api.get(downloadUrl, { responseType: 'blob' });
        return response.data;
      }

      if (status.status === 'failed') {
        throw new Error(status.result?.error || 'Export failed');
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Export timed out');
  },
};

// ================================
// Inference API
// ================================
export interface Detection {
  class_name: string;
  confidence: number;
  box: number[];  // [x1, y1, x2, y2]
  mask_rle?: string;
  mask_polygon?: number[][];
  area?: number;
}

export interface TextInferenceRequest {
  image_url?: string;
  image_base64?: string;
  prompts: string[];
  confidence_threshold?: number;
  return_masks?: boolean;
  return_boxes?: boolean;
}

export interface PointInferenceRequest {
  image_url?: string;
  image_base64?: string;
  points?: number[][];
  point_labels?: boolean[];
  boxes?: number[][];
  confidence_threshold?: number;
}

export interface InferenceResponse {
  detections: Detection[];
  image_width: number;
  image_height: number;
  processing_time_ms: number;
}

export interface ModelStatus {
  downloaded: boolean;
  model_path: string | null;
  model_size_mb: number | null;
  source: string | null;
  model_loaded: boolean;
  load_error: string | null;
  load_time: string | null;
  last_inference: string | null;
  inference_count: number;
  device: string;
  cuda_available: boolean;
  cuda_device: string | null;
  models_dir: string | null;
  download: {
    in_progress: boolean;
    progress: number;
    status: string;
    error: string | null;
    started_at: string | null;
    completed_at: string | null;
  }
}

export const inference = {
  getModels: async (): Promise<{ models: InferenceModel[] }> => {
    const response = await api.get('/inference/models');
    return response.data;
  },
  getHealth: async (): Promise<any> => {
    const response = await api.get('/inference/health');
    return response.data;
  },
  // Get detailed model status including download state
  getModelStatus: async (): Promise<ModelStatus> => {
    const response = await api.get('/inference/models/status');
    return response.data;
  },
  loadModel: async (modelId: string): Promise<{ status: string; model: string }> => {
    const response = await api.post(`/inference/models/${modelId}/load`);
    return response.data;
  },
  unloadModel: async (modelId: string): Promise<{ status: string; model: string }> => {
    const response = await api.post(`/inference/models/${modelId}/unload`);
    return response.data;
  },
  // Download model
  downloadModel: async (modelId: string): Promise<{ status: string; message?: string }> => {
    const response = await api.post(`/inference/models/${modelId}/download`);
    return response.data;
  },
  // Get download progress
  getDownloadProgress: async (modelId: string): Promise<{ in_progress: boolean; progress: number; status: string; error: string | null }> => {
    const response = await api.get(`/inference/models/${modelId}/download/status`);
    return response.data;
  },
  // Text-prompt based inference (SAM3)
  inferWithText: async (request: TextInferenceRequest): Promise<InferenceResponse> => {
    const response = await api.post('/inference/text', request);
    return response.data;
  },
  // Point/box prompt inference
  inferWithPoints: async (request: PointInferenceRequest): Promise<InferenceResponse> => {
    const response = await api.post('/inference/points', request);
    return response.data;
  },
  // GPU info
  getGpuInfo: async (): Promise<any> => {
    const response = await api.get('/inference/gpu');
    return response.data;
  },
  getConfig: async (): Promise<{ model_path: string | null }> => {
    const response = await api.get('/inference/config');
    return response.data;
  },
  updateConfig: async (config: { model_path?: string; device?: string }): Promise<any> => {
    const response = await api.post('/inference/config', config);
    return response.data;
  },
};

// ================================
// Access control
// ================================
export type AccessStatus = 'pending' | 'approved' | 'denied';

export interface AccessStatusResponse {
  status: AccessStatus;
  isAdmin: boolean;
  email?: string;
  requested?: boolean;
}

export interface AccessRequestItem {
  id: string;
  email: string;
  institution: string | null;
  phone: string | null;
  useCase: string | null;
  accessStatus: AccessStatus;
  requestedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export const access = {
  // Current account's access status (used to gate the UI after sign-in).
  getStatus: async (): Promise<AccessStatusResponse> => {
    const response = await api.get('/auth/access-status');
    return response.data;
  },
  // Submit an access request (institution + intended use required).
  submitRequest: async (data: {
    name?: string; institution: string; phone?: string; useCase: string;
  }): Promise<{ status: AccessStatus; emailSent?: boolean; emailReason?: string }> => {
    const response = await api.post('/access-requests', data);
    return response.data;
  },
  // Admin: list all access requests.
  adminList: async (): Promise<{ requests: AccessRequestItem[] }> => {
    const response = await api.get('/admin/access-requests');
    return response.data;
  },
  // Admin: approve or deny an account.
  adminDecide: async (userId: string, decision: 'approve' | 'deny'): Promise<{ id: string; status: AccessStatus }> => {
    const response = await api.post(`/admin/access-requests/${userId}/decision`, { decision });
    return response.data;
  },
};
