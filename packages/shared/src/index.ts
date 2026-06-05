/**
 * Lableit Shared Types
 * Shared between frontend and backend
 */

// ================================
// Core Entities
// ================================

export interface User {
  id: string;
  email: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  datasets?: Dataset[];
  classes?: ClassDef[];
}

export interface Dataset {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  assets?: Asset[];
}

export type AssetSourceType = 'image' | 'video_frame';

export interface Asset {
  id: string;
  datasetId: string;
  uri: string;
  width: number;
  height: number;
  frameTimeMs?: number;
  sourceType: AssetSourceType;
  createdAt: string;
  annotations?: Annotation[];
}

export interface ClassDef {
  id: string;
  projectId: string;
  name: string;
  color: string;
  threshold: number;
}

// ================================
// Annotations
// ================================

export type AnnotationType = 'mask' | 'box';
export type AnnotationSource = 'auto' | 'manual';

export interface AnnotationGeometry {
  type: AnnotationType;
  // For masks, store RLE or base64-encoded bitmap
  // For boxes, store [x1, y1, x2, y2]
  data: string | [number, number, number, number];
}

export interface Annotation {
  id: string;
  assetId: string;
  classId: string;
  confidence: number;
  geometryRle?: string;
  box?: [number, number, number, number] | number[];
  type: AnnotationType;
  source: AnnotationSource;
  createdAt: string;
  class?: ClassDef;
}

// ================================
// Jobs
// ================================

export type JobKind = 'slice_video' | 'infer_preview' | 'infer_batch' | 'export';
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface Job {
  id: string;
  kind: JobKind;
  status: JobStatus;
  params: Record<string, unknown>;
  result?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ================================
// Export
// ================================

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

export interface ExportOptions {
  format: ExportFormat;
  datasetId: string;
  includeClasses?: string[];
  splitRatio?: {
    train: number;
    val: number;
    test: number;
  };
}

export interface ExportResult {
  success: boolean;
  format: ExportFormat;
  outputPath: string;
  filesGenerated: number;
  annotationsExported: number;
  downloadPath?: string;
}

// ================================
// Inference
// ================================

export interface InferenceClassRequest {
  id: string;
  name: string;
  threshold: number;
}

export interface InferenceRequest {
  assetIds: string[];
  model: 'sam' | 'sam2' | 'sam3' | string;
  classes: InferenceClassRequest[];
}

export interface Detection {
  className: string;
  classId: string;
  confidence: number;
  box?: [number, number, number, number];
  maskRle?: string;
  area?: number;
}

export interface InferenceResult {
  detections: Detection[];
  modelUsed: string;
  processingTimeMs: number;
}

export interface InferenceModel {
  id: string;
  name: string;
  loaded: boolean;
  device: string;
}

export interface InferenceHealth {
  status: string;
  device: string;
  cudaAvailable: boolean;
  cudaDevice?: string;
  modelsLoaded: string[];
  modelsAvailable: string[];
}

// ================================
// API Responses
// ================================

export interface AuthResponse {
  user: User;
  token: string;
}

export interface UploadResponse {
  asset: Asset;
  filename: string;
  bucket: string;
}

export interface JobResponse {
  jobId: string;
}

export interface SignedUrlResponse {
  url: string;
}

export interface ErrorResponse {
  error: string;
}

// ================================
// API Request Bodies
// ================================

export interface CreateProjectRequest {
  name: string;
}

export interface CreateDatasetRequest {
  name: string;
}

export interface CreateClassRequest {
  name: string;
  color: string;
  threshold?: number;
}

export interface UpdateClassRequest {
  name?: string;
  color?: string;
  threshold?: number;
}

export interface CreateAnnotationRequest {
  classId: string;
  box?: number[];
  geometryRle?: string;
  type: AnnotationType;
  confidence?: number;
}

export interface SliceVideoRequest {
  assetId: string;
  intervalSec: number;
}

export interface ExportRequest {
  format: ExportFormat;
  includeClasses?: string[];
}
