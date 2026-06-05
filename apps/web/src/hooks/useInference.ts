import { useState, useEffect, useCallback } from 'react';
import { inference } from '../api';

export function useInference() {
  const [availableModels, setAvailableModels] = useState<{ id: string; name: string }[]>([]);
  const [inferenceHealth, setInferenceHealth] = useState<any>(null);
  const [modelsLoading, setModelsLoading] = useState<Record<string, boolean>>({});
  const [preloadMessage, setPreloadMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadInferenceInfo = useCallback(async () => {
    try {
      const [modelsRes, healthRes] = await Promise.all([
        inference.getModels(),
        inference.getHealth()
      ]);
      setAvailableModels(modelsRes.models);
      setInferenceHealth(healthRes);
    } catch (err) {
      console.error('Inference service unavailable:', err);
      // Don't set global error here to avoid blocking UI, just log it
    }
  }, []);

  const handlePreloadModel = useCallback(async (modelId: string) => {
    setModelsLoading((m) => ({ ...m, [modelId]: true }));
    setPreloadMessage(null);
    try {
      await inference.loadModel(modelId);
      await loadInferenceInfo();
      setPreloadMessage(`Model ${modelId} loaded`);
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.message || 'Failed to load model';
      setPreloadMessage(`Failed to load ${modelId}: ${message}`);
      setError(message);
    } finally {
      setModelsLoading((m) => ({ ...m, [modelId]: false }));
      setTimeout(() => setPreloadMessage(null), 4000);
    }
  }, [loadInferenceInfo]);

  // Initial load
  useEffect(() => {
    loadInferenceInfo();
  }, [loadInferenceInfo]);

  return {
    availableModels,
    inferenceHealth,
    modelsLoading,
    preloadMessage,
    error,
    setError,
    loadInferenceInfo,
    handlePreloadModel
  };
}
