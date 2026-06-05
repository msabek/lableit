/**
 * Export Service - Handles exporting annotations in various formats
 * Supports: COCO, YOLO (detection & segmentation), Pascal VOC, PNG masks, CreateML, TFRecord metadata, LabelMe
 * Now includes images in exports!
 */

import { PrismaClient, Asset, Annotation, ClassDef } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import yazl from 'yazl';

const S3_BUCKET = process.env.S3_BUCKET || 'lableit';

// Module-level Prisma client - injected via setPrismaClient() from index.ts so the
// whole API uses a single PrismaClient instance (one connection pool).
let prisma: PrismaClient;

export function setPrismaClient(client: PrismaClient) {
  prisma = client;
}

// Module-level S3 client - set via setS3Client() from index.ts to avoid duplicate instantiation
let s3: S3Client;

export function setS3Client(client: S3Client) {
  s3 = client;
}

// Download an image from S3 and save to local path
async function downloadImage(uri: string, outputPath: string): Promise<boolean> {
  try {
    const data = await s3.send(new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: uri,
    }));
    if (data.Body) {
      const bytes = await data.Body.transformToByteArray();
      fs.writeFileSync(outputPath, Buffer.from(bytes));
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Failed to download image ${uri}:`, error);
    return false;
  }
}

// Minimal shape the export filename helpers need from an asset.
type ExportableAsset = { id: string; uri: string; sourceType?: string | null };

// Compute the exported file name for an asset. Video frames live in per-slice-job
// folders but share flat names like "frame_0001.jpg"; in a flat export directory
// those collide across slice jobs and silently overwrite each other. We prefix the
// asset id for video frames to make them unique, while regular image uploads keep
// their original basename so the common case output is unchanged.
function exportFileName(asset: ExportableAsset): string {
  const base = path.basename(asset.uri);
  if (asset.sourceType === 'video_frame') {
    return `${asset.id}_${base}`;
  }
  return base;
}

// Same disambiguation, but without the extension (for label/xml/txt side files).
function exportBaseName(asset: ExportableAsset): string {
  return path.basename(exportFileName(asset), path.extname(asset.uri));
}

// Download all images for export (parallel with concurrency limit)
const DOWNLOAD_CONCURRENCY = 10;

async function downloadImagesForExport(
  assets: ExportableAsset[],
  imagesDir: string
): Promise<Map<string, string>> {
  fs.mkdirSync(imagesDir, { recursive: true });

  const uriToLocalPath = new Map<string, string>();

  // Process in chunks for parallel downloads with concurrency limit
  for (let i = 0; i < assets.length; i += DOWNLOAD_CONCURRENCY) {
    const chunk = assets.slice(i, i + DOWNLOAD_CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (asset) => {
        // Use the disambiguated export name so the on-disk image matches the
        // file_name/imagePath references written into the annotation files.
        const fileName = exportFileName(asset);
        const localPath = path.join(imagesDir, fileName);
        const success = await downloadImage(asset.uri, localPath);
        return { uri: asset.uri, localPath, success };
      })
    );
    for (const r of results) {
      if (r.success) uriToLocalPath.set(r.uri, r.localPath);
    }
  }

  return uriToLocalPath;
}

// Types for export
export type ExportFormat = 
  | 'coco' 
  | 'yolo_detect' 
  | 'yolo_segment' 
  | 'voc' 
  | 'png_masks' 
  | 'createml' 
  | 'tfrecord_meta' 
  | 'labelme';

export interface ExportOptions {
  format: ExportFormat;
  projectId: string;
  includeClasses?: string[];
  splitRatio?: { train: number; val: number; test: number };
  outputDir: string;
}

export interface ExportResult {
  success: boolean;
  format: ExportFormat;
  outputPath: string;
  filesGenerated: number;
  annotationsExported: number;
  imagesIncluded?: number;
}

// Asset with annotations for export
interface AssetWithAnnotations extends Asset {
  annotations: (Annotation & { class: ClassDef })[];
}

// ================================
// COCO Format Export
// ================================
interface COCOAnnotation {
  id: number;
  image_id: number;
  category_id: number;
  bbox: [number, number, number, number]; // [x, y, width, height]
  area: number;
  segmentation: number[][] | { counts: string; size: [number, number] };
  iscrowd: 0 | 1;
}

interface COCOImage {
  id: number;
  file_name: string;
  width: number;
  height: number;
  date_captured?: string;
}

interface COCOCategory {
  id: number;
  name: string;
  supercategory: string;
}

interface COCODataset {
  info: {
    description: string;
    version: string;
    year: number;
    contributor: string;
    date_created: string;
  };
  licenses: Array<{ id: number; name: string; url: string }>;
  images: COCOImage[];
  annotations: COCOAnnotation[];
  categories: COCOCategory[];
}

export async function exportToCOCO(
  assets: AssetWithAnnotations[],
  classes: ClassDef[],
  outputPath: string
): Promise<number> {
  const dataset: COCODataset = {
    info: {
      description: 'Lableit Export',
      version: '1.0',
      year: new Date().getFullYear(),
      contributor: 'Lableit Platform',
      date_created: new Date().toISOString(),
    },
    licenses: [{ id: 1, name: 'Unknown', url: '' }],
    images: [],
    annotations: [],
    categories: [],
  };

  // Build category mapping
  const categoryMap = new Map<string, number>();
  classes.forEach((cls, index) => {
    const catId = index + 1;
    categoryMap.set(cls.id, catId);
    dataset.categories.push({
      id: catId,
      name: cls.name,
      supercategory: '',
    });
  });

  let annotationId = 1;
  
  // Process each asset
  assets.forEach((asset, imageIndex) => {
    const imageId = imageIndex + 1;
    
    // Add image entry
    dataset.images.push({
      id: imageId,
      file_name: exportFileName(asset),
      width: asset.width || 0,
      height: asset.height || 0,
      date_captured: asset.createdAt.toISOString(),
    });

    // Add annotations for this image
    asset.annotations.forEach((annotation) => {
      const categoryId = categoryMap.get(annotation.classId);
      if (!categoryId) return;

      const box = annotation.box as number[] | null;
      let bbox: [number, number, number, number] = [0, 0, 0, 0];
      let area = 0;

      if (box && box.length >= 4) {
        // box is [x1, y1, x2, y2], convert to [x, y, width, height]
        bbox = [box[0], box[1], box[2] - box[0], box[3] - box[1]];
        area = bbox[2] * bbox[3];
      }

      // Parse segmentation from polygon or RLE if available
      let segmentation: number[][] | { counts: string; size: [number, number] } = [];
      
      // First check for geometryPolygon (actual polygon points from SAM3)
      const geometryPolygon = (annotation as any).geometryPolygon;
      if (geometryPolygon && Array.isArray(geometryPolygon) && geometryPolygon.length > 0) {
        // Flatten polygon points [[x1,y1], [x2,y2], ...] to [x1,y1,x2,y2,...]
        segmentation = [geometryPolygon.flat()];
      } else if (annotation.geometryRle) {
        // Fallback to RLE
        const parts = annotation.geometryRle.split(',').map(Number);
        if (parts.length === 4) {
          const [x, y, w, h] = parts;
          segmentation = [[x, y, x + w, y, x + w, y + h, x, y + h]];
        } else {
          // Assume it's already RLE format
          segmentation = {
            counts: annotation.geometryRle,
            size: [asset.height || 0, asset.width || 0],
          };
        }
      }

      dataset.annotations.push({
        id: annotationId++,
        image_id: imageId,
        category_id: categoryId,
        bbox,
        area,
        segmentation,
        iscrowd: 0,
      });
    });
  });

  // Write COCO JSON file (compact: machine-consumed by training pipelines)
  fs.writeFileSync(outputPath, JSON.stringify(dataset));
  return dataset.annotations.length;
}

// ================================
// YOLO Detection Format Export
// ================================
export async function exportToYOLODetect(
  assets: AssetWithAnnotations[],
  classes: ClassDef[],
  outputDir: string
): Promise<number> {
  // Create directory structure
  const labelsDir = path.join(outputDir, 'labels');
  const imagesDir = path.join(outputDir, 'images');
  fs.mkdirSync(labelsDir, { recursive: true });
  fs.mkdirSync(imagesDir, { recursive: true });

  // Build class index mapping
  const classIndexMap = new Map<string, number>();
  classes.forEach((cls, index) => {
    classIndexMap.set(cls.id, index);
  });

  // Write classes.txt
  const classNames = classes.map((cls) => cls.name);
  fs.writeFileSync(path.join(outputDir, 'classes.txt'), classNames.join('\n'));

  // Write data.yaml with relative paths for portability
  const dataYaml = `# Lableit YOLO Detection Export
# Dataset generated by Lableit on ${new Date().toISOString()}

# Use relative path (.) for portability across systems
path: .
train: images
val: images
test: images

# Number of classes
nc: ${classes.length}

# Class names
names: [${classNames.map((n) => `'${n}'`).join(', ')}]
`;
  fs.writeFileSync(path.join(outputDir, 'data.yaml'), dataYaml);

  let totalAnnotations = 0;

  // Process each asset
  assets.forEach((asset) => {
    const labelLines: string[] = [];

    asset.annotations.forEach((annotation) => {
      const classIndex = classIndexMap.get(annotation.classId);
      if (classIndex === undefined) return;

      const box = annotation.box as number[] | null;
      if (!box || box.length < 4) return;

      const imgWidth = asset.width || 1;
      const imgHeight = asset.height || 1;

      // Convert [x1, y1, x2, y2] to normalized [x_center, y_center, width, height]
      const [x1, y1, x2, y2] = box;
      const xCenter = ((x1 + x2) / 2) / imgWidth;
      const yCenter = ((y1 + y2) / 2) / imgHeight;
      const width = (x2 - x1) / imgWidth;
      const height = (y2 - y1) / imgHeight;

      labelLines.push(`${classIndex} ${xCenter.toFixed(6)} ${yCenter.toFixed(6)} ${width.toFixed(6)} ${height.toFixed(6)}`);
      totalAnnotations++;
    });

    // Write label file (disambiguated name matches the downloaded image name)
    const baseName = exportBaseName(asset);
    const labelPath = path.join(labelsDir, `${baseName}.txt`);
    fs.writeFileSync(labelPath, labelLines.join('\n'));
  });

  return totalAnnotations;
}

// ================================
// YOLO Segmentation Format Export
// ================================
export async function exportToYOLOSegment(
  assets: AssetWithAnnotations[],
  classes: ClassDef[],
  outputDir: string
): Promise<number> {
  // Create directory structure
  const labelsDir = path.join(outputDir, 'labels');
  const imagesDir = path.join(outputDir, 'images');
  fs.mkdirSync(labelsDir, { recursive: true });
  fs.mkdirSync(imagesDir, { recursive: true });

  // Build class index mapping
  const classIndexMap = new Map<string, number>();
  classes.forEach((cls, index) => {
    classIndexMap.set(cls.id, index);
  });

  // Write classes.txt
  const classNames = classes.map((cls) => cls.name);
  fs.writeFileSync(path.join(outputDir, 'classes.txt'), classNames.join('\n'));

  // Write data.yaml for segmentation with relative paths for portability
  const dataYaml = `# Lableit YOLO Segmentation Export
# Dataset generated by Lableit on ${new Date().toISOString()}

# Use relative path (.) for portability across systems
path: .
train: images
val: images
test: images

# Number of classes
nc: ${classes.length}

# Class names
names: [${classNames.map((n) => `'${n}'`).join(', ')}]
`;
  fs.writeFileSync(path.join(outputDir, 'data.yaml'), dataYaml);

  let totalAnnotations = 0;

  // Process each asset
  assets.forEach((asset) => {
    const labelLines: string[] = [];

    asset.annotations.forEach((annotation) => {
      const classIndex = classIndexMap.get(annotation.classId);
      if (classIndex === undefined) return;

      const imgWidth = asset.width || 1;
      const imgHeight = asset.height || 1;

      // For segmentation, we need polygon points
      // First check for geometryPolygon (actual polygon points from SAM3)
      const geometryPolygon = (annotation as any).geometryPolygon;
      
      if (geometryPolygon && Array.isArray(geometryPolygon) && geometryPolygon.length > 0) {
        // Use the actual polygon data from SAM3
        const normalizedPoints = geometryPolygon.map(([px, py]: [number, number]) => 
          `${(px / imgWidth).toFixed(6)} ${(py / imgHeight).toFixed(6)}`
        );
        
        if (normalizedPoints.length > 0) {
          labelLines.push(`${classIndex} ${normalizedPoints.join(' ')}`);
          totalAnnotations++;
        }
      } else if (annotation.geometryRle) {
        // Fallback to parsing RLE
        const parts = annotation.geometryRle.split(',').map(Number);
        
        let normalizedPoints: string[] = [];
        
        if (parts.length === 4) {
          // Simple rectangle: x, y, w, h -> convert to polygon
          const [x, y, w, h] = parts;
          const polygon = [
            [x, y],
            [x + w, y],
            [x + w, y + h],
            [x, y + h],
          ];
          normalizedPoints = polygon.map(([px, py]) => 
            `${(px / imgWidth).toFixed(6)} ${(py / imgHeight).toFixed(6)}`
          );
        } else {
          // Assume pairs of x,y coordinates
          for (let i = 0; i < parts.length - 1; i += 2) {
            const px = parts[i] / imgWidth;
            const py = parts[i + 1] / imgHeight;
            normalizedPoints.push(`${px.toFixed(6)} ${py.toFixed(6)}`);
          }
        }

        if (normalizedPoints.length > 0) {
          labelLines.push(`${classIndex} ${normalizedPoints.join(' ')}`);
          totalAnnotations++;
        }
      } else if (annotation.box) {
        // Fallback: Create polygon from bounding box
        const box = annotation.box as number[];
        if (box.length >= 4) {
          const [x1, y1, x2, y2] = box;
          const polygon = [
            [x1 / imgWidth, y1 / imgHeight],
            [x2 / imgWidth, y1 / imgHeight],
            [x2 / imgWidth, y2 / imgHeight],
            [x1 / imgWidth, y2 / imgHeight],
          ];
          const points = polygon.map(([px, py]) => `${px.toFixed(6)} ${py.toFixed(6)}`).join(' ');
          labelLines.push(`${classIndex} ${points}`);
          totalAnnotations++;
        }
      }
    });

    // Write label file (disambiguated name matches the downloaded image name)
    const baseName = exportBaseName(asset);
    const labelPath = path.join(labelsDir, `${baseName}.txt`);
    fs.writeFileSync(labelPath, labelLines.join('\n'));
  });

  return totalAnnotations;
}

// ================================
// Pascal VOC Format Export
// ================================
export async function exportToVOC(
  assets: AssetWithAnnotations[],
  classes: ClassDef[],
  outputDir: string
): Promise<number> {
  const annotationsDir = path.join(outputDir, 'Annotations');
  fs.mkdirSync(annotationsDir, { recursive: true });

  // Build class name mapping
  const classNameMap = new Map<string, string>();
  classes.forEach((cls) => {
    classNameMap.set(cls.id, cls.name);
  });

  let totalAnnotations = 0;

  // Process each asset
  assets.forEach((asset) => {
    const objects: string[] = [];

    asset.annotations.forEach((annotation) => {
      const className = classNameMap.get(annotation.classId);
      if (!className) return;

      const box = annotation.box as number[] | null;
      if (!box || box.length < 4) return;

      const [xmin, ymin, xmax, ymax] = box.map(Math.round);

      objects.push(`
    <object>
        <name>${className}</name>
        <pose>Unspecified</pose>
        <truncated>0</truncated>
        <difficult>0</difficult>
        <bndbox>
            <xmin>${xmin}</xmin>
            <ymin>${ymin}</ymin>
            <xmax>${xmax}</xmax>
            <ymax>${ymax}</ymax>
        </bndbox>
    </object>`);
      totalAnnotations++;
    });

    const fileName = exportFileName(asset);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<annotation>
    <folder>images</folder>
    <filename>${fileName}</filename>
    <path>${asset.uri}</path>
    <source>
        <database>Lableit</database>
    </source>
    <size>
        <width>${asset.width || 0}</width>
        <height>${asset.height || 0}</height>
        <depth>3</depth>
    </size>
    <segmented>0</segmented>${objects.join('')}
</annotation>`;

    // Write XML file (disambiguated name matches the downloaded image name)
    const baseName = exportBaseName(asset);
    const xmlPath = path.join(annotationsDir, `${baseName}.xml`);
    fs.writeFileSync(xmlPath, xml);
  });

  return totalAnnotations;
}

// ================================
// PNG Masks Export
// ================================
export async function exportToPNGMasks(
  assets: AssetWithAnnotations[],
  classes: ClassDef[],
  outputDir: string
): Promise<number> {
  const masksDir = path.join(outputDir, 'masks');
  fs.mkdirSync(masksDir, { recursive: true });

  // Build class color mapping (assign unique colors)
  const classColorMap = new Map<string, { r: number; g: number; b: number }>();
  classes.forEach((cls, index) => {
    // Parse hex color or assign default
    let color = { r: 0, g: 0, b: 0 };
    if (cls.color && cls.color.startsWith('#')) {
      const hex = cls.color.substring(1);
      color = {
        r: parseInt(hex.substring(0, 2), 16),
        g: parseInt(hex.substring(2, 4), 16),
        b: parseInt(hex.substring(4, 6), 16),
      };
    } else {
      // Generate distinct colors
      const hue = (index * 137) % 360;
      color = hslToRgb(hue / 360, 0.7, 0.5);
    }
    classColorMap.set(cls.id, color);
  });

  // Write class-color mapping file
  const colorMapping = classes.map((cls) => {
    const color = classColorMap.get(cls.id)!;
    return `${cls.name}: rgb(${color.r}, ${color.g}, ${color.b})`;
  });
  fs.writeFileSync(path.join(outputDir, 'class_colors.txt'), colorMapping.join('\n'));

  // For actual PNG generation, we'd need a canvas library like sharp or canvas
  // For now, write a metadata file indicating mask info
  let totalMasks = 0;

  const maskMetadata: any[] = [];
  assets.forEach((asset) => {
    const assetMasks: any[] = [];

    asset.annotations.forEach((annotation) => {
      const geometryPolygon = (annotation as any).geometryPolygon;
      
      if (annotation.type === 'mask' && (annotation.geometryRle || geometryPolygon)) {
        assetMasks.push({
          classId: annotation.classId,
          className: annotation.class.name,
          rle: annotation.geometryRle || null,
          polygon: geometryPolygon || null,
          confidence: annotation.confidence,
        });
        totalMasks++;
      }
    });

    if (assetMasks.length > 0) {
      maskMetadata.push({
        image: exportFileName(asset),
        width: asset.width,
        height: asset.height,
        masks: assetMasks,
      });
    }
  });

  // Write mask metadata JSON (compact: machine-consumed)
  fs.writeFileSync(
    path.join(masksDir, 'mask_metadata.json'),
    JSON.stringify(maskMetadata)
  );

  return totalMasks;
}

// ================================
// CreateML Format Export
// ================================
interface CreateMLAnnotation {
  image: string;
  annotations: Array<{
    label: string;
    coordinates: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }>;
}

export async function exportToCreateML(
  assets: AssetWithAnnotations[],
  classes: ClassDef[],
  outputPath: string
): Promise<number> {
  const dataset: CreateMLAnnotation[] = [];

  // Build class name mapping
  const classNameMap = new Map<string, string>();
  classes.forEach((cls) => {
    classNameMap.set(cls.id, cls.name);
  });

  let totalAnnotations = 0;

  assets.forEach((asset) => {
    const annotations: Array<{
      label: string;
      coordinates: { x: number; y: number; width: number; height: number };
    }> = [];

    asset.annotations.forEach((annotation) => {
      const className = classNameMap.get(annotation.classId);
      if (!className) return;

      const box = annotation.box as number[] | null;
      if (!box || box.length < 4) return;

      const [x1, y1, x2, y2] = box;
      
      // CreateML uses center coordinates
      annotations.push({
        label: className,
        coordinates: {
          x: (x1 + x2) / 2,
          y: (y1 + y2) / 2,
          width: x2 - x1,
          height: y2 - y1,
        },
      });
      totalAnnotations++;
    });

    if (annotations.length > 0) {
      dataset.push({
        image: exportFileName(asset),
        annotations,
      });
    }
  });

  // Compact JSON: CreateML consumes this programmatically
  fs.writeFileSync(outputPath, JSON.stringify(dataset));
  return totalAnnotations;
}

// ================================
// TFRecord Metadata Export
// ================================
export async function exportToTFRecordMeta(
  assets: AssetWithAnnotations[],
  classes: ClassDef[],
  outputDir: string
): Promise<number> {
  // TFRecord binary format requires Python, so we export metadata and a Python script
  fs.mkdirSync(outputDir, { recursive: true });

  // Build class mapping
  const classNameMap = new Map<string, string>();
  const classIndexMap = new Map<string, number>();
  classes.forEach((cls, index) => {
    classNameMap.set(cls.id, cls.name);
    classIndexMap.set(cls.id, index + 1); // 0 is background
  });

  // Write label map (pbtxt format)
  const labelMapLines = classes.map((cls, index) => 
    `item {\n  id: ${index + 1}\n  name: '${cls.name}'\n}`
  );
  fs.writeFileSync(path.join(outputDir, 'label_map.pbtxt'), labelMapLines.join('\n\n'));

  // Write annotations as JSON for Python script to convert
  const annotations: any[] = [];
  let totalAnnotations = 0;

  assets.forEach((asset) => {
    const imageAnnotations: any[] = [];

    asset.annotations.forEach((annotation) => {
      const className = classNameMap.get(annotation.classId);
      const classIndex = classIndexMap.get(annotation.classId);
      if (!className || classIndex === undefined) return;

      const box = annotation.box as number[] | null;
      if (!box || box.length < 4) return;

      const [xmin, ymin, xmax, ymax] = box;
      const imgWidth = asset.width || 1;
      const imgHeight = asset.height || 1;

      imageAnnotations.push({
        class_name: className,
        class_id: classIndex,
        xmin: xmin / imgWidth,
        ymin: ymin / imgHeight,
        xmax: xmax / imgWidth,
        ymax: ymax / imgHeight,
      });
      totalAnnotations++;
    });

    if (imageAnnotations.length > 0) {
      annotations.push({
        filename: exportFileName(asset),
        image_path: asset.uri,
        width: asset.width,
        height: asset.height,
        annotations: imageAnnotations,
      });
    }
  });

  // Compact JSON: consumed by the generated Python conversion script
  fs.writeFileSync(
    path.join(outputDir, 'annotations.json'),
    JSON.stringify(annotations)
  );

  // Write Python conversion script
  const pythonScript = `#!/usr/bin/env python3
"""
TFRecord Conversion Script
Generated by Lableit Export
Run: python create_tfrecord.py
"""
import json
import tensorflow as tf
from object_detection.utils import dataset_util

def create_tf_example(annotation, images_dir):
    filename = annotation['filename']
    image_path = f"{images_dir}/{filename}"
    
    with tf.io.gfile.GFile(image_path, 'rb') as fid:
        encoded_image = fid.read()
    
    width = annotation['width']
    height = annotation['height']
    
    xmins = []
    xmaxs = []
    ymins = []
    ymaxs = []
    classes_text = []
    classes = []
    
    for ann in annotation['annotations']:
        xmins.append(ann['xmin'])
        xmaxs.append(ann['xmax'])
        ymins.append(ann['ymin'])
        ymaxs.append(ann['ymax'])
        classes_text.append(ann['class_name'].encode('utf8'))
        classes.append(ann['class_id'])
    
    tf_example = tf.train.Example(features=tf.train.Features(feature={
        'image/height': dataset_util.int64_feature(height),
        'image/width': dataset_util.int64_feature(width),
        'image/filename': dataset_util.bytes_feature(filename.encode('utf8')),
        'image/encoded': dataset_util.bytes_feature(encoded_image),
        'image/format': dataset_util.bytes_feature(b'jpeg'),
        'image/object/bbox/xmin': dataset_util.float_list_feature(xmins),
        'image/object/bbox/xmax': dataset_util.float_list_feature(xmaxs),
        'image/object/bbox/ymin': dataset_util.float_list_feature(ymins),
        'image/object/bbox/ymax': dataset_util.float_list_feature(ymaxs),
        'image/object/class/text': dataset_util.bytes_list_feature(classes_text),
        'image/object/class/label': dataset_util.int64_list_feature(classes),
    }))
    return tf_example

if __name__ == '__main__':
    with open('annotations.json', 'r') as f:
        annotations = json.load(f)
    
    writer = tf.io.TFRecordWriter('output.tfrecord')
    for ann in annotations:
        tf_example = create_tf_example(ann, 'images')
        writer.write(tf_example.SerializeToString())
    writer.close()
    print(f'Created TFRecord with {len(annotations)} images')
`;
  fs.writeFileSync(path.join(outputDir, 'create_tfrecord.py'), pythonScript);

  return totalAnnotations;
}

// ================================
// LabelMe Format Export
// ================================
interface LabelMeShape {
  label: string;
  points: number[][];
  group_id: null;
  shape_type: 'rectangle' | 'polygon';
  flags: Record<string, boolean>;
}

interface LabelMeAnnotation {
  version: string;
  flags: Record<string, boolean>;
  shapes: LabelMeShape[];
  imagePath: string;
  imageData: null;
  imageHeight: number;
  imageWidth: number;
}

export async function exportToLabelMe(
  assets: AssetWithAnnotations[],
  classes: ClassDef[],
  outputDir: string
): Promise<number> {
  fs.mkdirSync(outputDir, { recursive: true });

  // Build class name mapping
  const classNameMap = new Map<string, string>();
  classes.forEach((cls) => {
    classNameMap.set(cls.id, cls.name);
  });

  let totalAnnotations = 0;

  assets.forEach((asset) => {
    const shapes: LabelMeShape[] = [];

    asset.annotations.forEach((annotation) => {
      const className = classNameMap.get(annotation.classId);
      if (!className) return;

      // First check for geometryPolygon (actual polygon points from SAM3)
      const geometryPolygon = (annotation as any).geometryPolygon;
      
      if (geometryPolygon && Array.isArray(geometryPolygon) && geometryPolygon.length >= 3) {
        // Use the actual polygon data from SAM3
        shapes.push({
          label: className,
          points: geometryPolygon,
          group_id: null,
          shape_type: 'polygon',
          flags: {},
        });
        totalAnnotations++;
      } else if (annotation.type === 'mask' && annotation.geometryRle) {
        // Fallback: Parse polygon points from RLE
        const parts = annotation.geometryRle.split(',').map(Number);

        if (parts.length === 4) {
          // Rectangle format: x, y, w, h
          const [x, y, w, h] = parts;
          shapes.push({
            label: className,
            points: [
              [x, y],
              [x + w, y + h],
            ],
            group_id: null,
            shape_type: 'rectangle',
            flags: {},
          });
        } else {
          // Polygon format: x1,y1,x2,y2,...
          const points: number[][] = [];
          for (let i = 0; i < parts.length - 1; i += 2) {
            points.push([parts[i], parts[i + 1]]);
          }
          if (points.length >= 3) {
            shapes.push({
              label: className,
              points,
              group_id: null,
              shape_type: 'polygon',
              flags: {},
            });
          }
        }
        totalAnnotations++;
      } else if (annotation.box) {
        // Bounding box
        const box = annotation.box as number[];
        if (box.length >= 4) {
          shapes.push({
            label: className,
            points: [
              [box[0], box[1]],
              [box[2], box[3]],
            ],
            group_id: null,
            shape_type: 'rectangle',
            flags: {},
          });
          totalAnnotations++;
        }
      }
    });

    const labelMeData: LabelMeAnnotation = {
      version: '5.0.1',
      flags: {},
      shapes,
      imagePath: exportFileName(asset),
      imageData: null,
      imageHeight: asset.height || 0,
      imageWidth: asset.width || 0,
    };

    // Write JSON file (disambiguated name matches the downloaded image name)
    const baseName = exportBaseName(asset);
    const jsonPath = path.join(outputDir, `${baseName}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(labelMeData, null, 2));
  });

  return totalAnnotations;
}

// ================================
// Helper Functions
// ================================
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

// ================================
// Main Export Function
// ================================
export async function exportDataset(options: ExportOptions): Promise<ExportResult> {
  const { format, projectId, includeClasses, outputDir } = options;

  // Fetch project with assets and annotations
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      classes: true,
      assets: {
        include: {
          annotations: {
            include: {
              class: true,
            },
          },
        },
      },
    },
  });

  if (!project) {
    throw new Error('Project not found');
  }

  // Filter classes if specified
  let classes = project.classes;
  if (includeClasses && includeClasses.length > 0) {
    classes = classes.filter((cls) => includeClasses.includes(cls.id));
  }

  // Filter out video files - only include images and video frames, not original video files
  // Also filter annotations by classes
  const assets = project.assets
    .filter((asset) => {
      // Exclude original video files (only export images and video_frames)
      const sourceType = (asset as any).sourceType;
      if (sourceType === 'video') {
        console.log(`  → Skipping original video file: ${asset.uri}`);
        return false;
      }
      // Also check file extension as fallback
      const isVideoFile = /\.(mp4|webm|mov|avi|mkv|m4v|flv|wmv)$/i.test(asset.uri);
      if (isVideoFile) {
        console.log(`  → Skipping video file by extension: ${asset.uri}`);
        return false;
      }
      return true;
    })
    .map((asset) => ({
      ...asset,
      annotations: asset.annotations.filter((ann) =>
        classes.some((cls) => cls.id === ann.classId)
      ),
    })) as AssetWithAnnotations[];

  // Create output directory
  fs.mkdirSync(outputDir, { recursive: true });

  // Download images from S3 and include in export
  // Create images directory based on format conventions
  let imagesDir: string;
  switch (format) {
    case 'voc':
      imagesDir = path.join(outputDir, 'JPEGImages');
      break;
    case 'yolo_detect':
    case 'yolo_segment':
    case 'tfrecord_meta':
      imagesDir = path.join(outputDir, 'images');
      break;
    default:
      imagesDir = path.join(outputDir, 'images');
  }

  console.log(`Downloading ${assets.length} images to ${imagesDir}...`);
  const downloadedImages = await downloadImagesForExport(assets, imagesDir);
  console.log(`Successfully downloaded ${downloadedImages.size} images`);

  let annotationsExported = 0;

  switch (format) {
    case 'coco':
      annotationsExported = await exportToCOCO(
        assets,
        classes,
        path.join(outputDir, 'annotations.json')
      );
      break;

    case 'yolo_detect':
      annotationsExported = await exportToYOLODetect(assets, classes, outputDir);
      break;

    case 'yolo_segment':
      annotationsExported = await exportToYOLOSegment(assets, classes, outputDir);
      break;

    case 'voc':
      annotationsExported = await exportToVOC(assets, classes, outputDir);
      break;

    case 'png_masks':
      annotationsExported = await exportToPNGMasks(assets, classes, outputDir);
      break;

    case 'createml':
      annotationsExported = await exportToCreateML(
        assets,
        classes,
        path.join(outputDir, 'annotations.json')
      );
      break;

    case 'tfrecord_meta':
      annotationsExported = await exportToTFRecordMeta(assets, classes, outputDir);
      break;

    case 'labelme':
      annotationsExported = await exportToLabelMe(assets, classes, outputDir);
      break;

    default:
      throw new Error(`Unsupported format: ${format}`);
  }

  return {
    success: true,
    format,
    outputPath: outputDir,
    filesGenerated: assets.length,
    annotationsExported,
    imagesIncluded: downloadedImages.size,
  } as ExportResult;
}

// ================================
// Archive Creation (Bun-compatible)
// ================================
export async function createExportArchive(
  outputDir: string,
  archivePath: string
): Promise<string> {
  try {
    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(archivePath);
      const archive = new yazl.ZipFile();

      output.on('close', () => resolve());
      output.on('error', reject);
      archive.outputStream.on('error', reject);

      for (const file of getAllFiles(outputDir)) {
        archive.addFile(file, path.relative(outputDir, file).split(path.sep).join('/'));
      }

      archive.outputStream.pipe(output);
      archive.end();
    });

    return archivePath;
  } catch (error) {
    // Archive creation failed. Previously this wrote a "_manifest.json" fallback and
    // then immediately threw, so the manifest was dead/unreachable output that no
    // caller could ever use (handleExport only references the .zip download path).
    // Surface the failure cleanly so the export job is marked failed.
    console.error('Failed to create archive:', error);
    throw new Error(`Archive creation failed: ${error}`);
  }
}

// Helper to get all files recursively
function getAllFiles(dir: string): string[] {
  const files: string[] = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      files.push(...getAllFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  
  return files;
}
