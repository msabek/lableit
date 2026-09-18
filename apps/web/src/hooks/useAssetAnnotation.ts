import { useState, useCallback, useRef } from 'react';
import { assets as assetsApi, annotations as annotationsApi, Asset, Project } from '../api';

// Type for detection data used in the canvas
export interface Detection {
  id: string;
  class_name: string;
  confidence: number;
  box: [number, number, number, number];
  mask_rle?: string;
  mask_polygon?: number[][];
}

export function useAssetAnnotation(project: Project | null) {
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [selectedDetectionIndex, setSelectedDetectionIndex] = useState<number | null>(null);
  const [assetUrl, setAssetUrl] = useState<string | null>(null);
  const [assetDetections, setAssetDetections] = useState<Detection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const loadRequestIdRef = useRef(0);

  const handleAssetClick = useCallback(async (asset: Asset) => {
    const requestId = ++loadRequestIdRef.current;
    setSelectedAsset(asset);
    setSelectedDetectionIndex(null);
    setAssetUrl(null);
    setAssetDetections([]);

    try {
      const [{ url }, anns] = await Promise.all([
        assetsApi.getUrl(asset.id),
        annotationsApi.getAll(asset.id)
      ]);

      // Ignore stale responses when users switch assets quickly.
      if (requestId !== loadRequestIdRef.current) {
        return;
      }

      setAssetUrl(url);

      setAssetDetections(anns.map(a => {
        // Handle box data carefully - Prisma Json type can return various formats
        let boxArray: [number, number, number, number] = [0, 0, 0, 0];
        if (a.box) {
          if (Array.isArray(a.box)) {
            boxArray = [
              Number(a.box[0]) || 0,
              Number(a.box[1]) || 0,
              Number(a.box[2]) || 0,
              Number(a.box[3]) || 0
            ];
          } else if (typeof a.box === 'object') {
            // Handle case where box might be stored as object {0: x1, 1: y1, ...}
            const boxObj = a.box as Record<string, unknown>;
            boxArray = [
              Number(boxObj[0] ?? boxObj['x1'] ?? 0),
              Number(boxObj[1] ?? boxObj['y1'] ?? 0),
              Number(boxObj[2] ?? boxObj['x2'] ?? 0),
              Number(boxObj[3] ?? boxObj['y2'] ?? 0)
            ];
          }
        }

        // Handle polygon data
        let polygonArray: number[][] | undefined = undefined;
        if (a.geometryPolygon && Array.isArray(a.geometryPolygon)) {
          polygonArray = a.geometryPolygon;
        }

        return {
          id: a.id,
          class_name: a.class?.name || 'object',
          confidence: a.confidence,
          box: boxArray,
          mask_rle: a.geometryRle,
          mask_polygon: polygonArray
        };
      }));
    } catch (err) {
      if (requestId !== loadRequestIdRef.current) {
        return;
      }
      setError('Failed to load asset details');
    }
  }, []);

  const handleAddDetection = useCallback(async (box: number[], className: string) => {
    if (!selectedAsset || !project) return;
    try {
      const classDef = project.classes.find(c => c.name === className);
      if (!classDef) return;

      const ann = await annotationsApi.create(selectedAsset.id, {
        classId: classDef.id,
        box,
        type: 'box',
        confidence: 1.0
      });

      setAssetDetections(prev => [...prev, {
        id: ann.id,
        class_name: className,
        confidence: 1.0,
        box: box as Detection['box']
      }]);
    } catch (err) {
      setError('Failed to add annotation');
    }
  }, [selectedAsset, project]);

  const handleUpdateDetection = useCallback(async (index: number, box: number[]) => {
    const det = assetDetections[index];
    if (!det.id) return;

    try {
      await annotationsApi.update(det.id, { box });
      setAssetDetections(prev => {
        const next = [...prev];
        next[index] = { ...next[index], box: box as Detection['box'] };
        return next;
      });
    } catch (err) {
      setError('Failed to update annotation');
    }
  }, [assetDetections]);

  const handleDeleteDetection = useCallback(async (index: number) => {
    const det = assetDetections[index];
    if (!det.id) return;

    try {
      await annotationsApi.delete(det.id);
      setAssetDetections(prev => prev.filter((_, i) => i !== index));
      setSelectedDetectionIndex(null);
    } catch (err) {
      setError('Failed to delete annotation');
    }
  }, [assetDetections]);

  const handleDeleteAsset = useCallback(async (assetId: string) => {
    if (!assetId) {
      setError('Invalid asset ID');
      return;
    }

    try {
      await assetsApi.delete(assetId);
      if (selectedAsset?.id === assetId) {
        setSelectedAsset(null);
        setAssetUrl(null);
        setAssetDetections([]);
      }
    } catch (err) {
      setError('Failed to delete asset');
      throw err;
    }
  }, [selectedAsset]);

  return {
    selectedAsset,
    setSelectedAsset,
    selectedDetectionIndex,
    setSelectedDetectionIndex,
    assetUrl,
    setAssetUrl,
    assetDetections,
    setAssetDetections,
    error,
    setError,
    handleAssetClick,
    handleAddDetection,
    handleUpdateDetection,
    handleDeleteDetection,
    handleDeleteAsset
  };
}
