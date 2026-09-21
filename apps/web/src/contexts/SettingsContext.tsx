import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { inference } from '../api';

// ================================
// Types
// ================================
export type ThemeMode = 'light' | 'dark' | 'system';
export type ColorTheme = 'indigo' | 'ocean' | 'sunset' | 'forest';

export interface AppSettings {
  // Inference settings
  defaultConfidenceThreshold: number;
  preloadOnStartup: boolean;
  inferenceTimeout: number;
  
  // Processing settings
  defaultVideoFrameInterval: number;
  maxConcurrentJobs: number;
  autoRetryFailedJobs: boolean;
  
  // Display settings
  showConfidenceScores: boolean;
  showMasksOnCanvas: boolean;
  canvasZoomSensitivity: number;
  theme: ThemeMode;
  colorTheme: ColorTheme;
  
  // Export defaults
  defaultExportFormat: string;
  includeMasksByDefault: boolean;
  
  // Storage
  storageWarningThresholdGB: number;
}

export interface ModelStatus {
  downloaded: boolean;
  modelPath: string | null;
  modelSizeMB: number | null;
  source: string | null;
  modelLoaded: boolean;
  loadError: string | null;
  loadTime: string | null;
  lastInference: string | null;
  inferenceCount: number;
  device: string;
  cudaAvailable: boolean;
  cudaDevice: string | null;
  modelsDir: string | null;
  download: {
    inProgress: boolean;
    progress: number;
    status: string;
    error: string | null;
    startedAt: string | null;
    completedAt: string | null;
  };
}

export interface GPUInfo {
  cudaAvailable: boolean;
  deviceCount?: number;
  currentDevice?: number;
  deviceName?: string;
  memoryAllocatedMB?: number;
  memoryReservedMB?: number;
  maxMemoryAllocatedMB?: number;
  memoryTotalMB?: number;
}

interface SettingsContextType {
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => void;
  resetSettings: () => void;
  
  // Theme helpers
  effectiveTheme: 'light' | 'dark';
  setTheme: (theme: ThemeMode) => void;
  colorTheme: ColorTheme;
  setColorTheme: (theme: ColorTheme) => void;
  
  modelStatus: ModelStatus | null;
  gpuInfo: GPUInfo | null;
  serviceAvailable: boolean;
  
  refreshModelStatus: () => Promise<void>;
  refreshGPUInfo: () => Promise<void>;
  
  loadModel: () => Promise<boolean>;
  unloadModel: () => Promise<boolean>;
  downloadModel: () => Promise<boolean>;
  
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
}

// ================================
// Default Settings
// ================================
const DEFAULT_SETTINGS: AppSettings = {
  // Inference
  defaultConfidenceThreshold: 0.5,
  preloadOnStartup: true,
  inferenceTimeout: 60,
  
  // Processing
  defaultVideoFrameInterval: 1,
  maxConcurrentJobs: 3,
  autoRetryFailedJobs: true,
  
  // Display
  showConfidenceScores: true,
  showMasksOnCanvas: true,
  canvasZoomSensitivity: 1.0,
  // Light is the default look. Visitors on a dark-mode device still land on
  // the light theme; they can pick 'dark' or 'system' from the theme toggle.
  theme: 'light',
  colorTheme: 'indigo',
  
  // Export
  defaultExportFormat: 'coco',
  includeMasksByDefault: true,
  
  // Storage
  storageWarningThresholdGB: 50
};

const SETTINGS_STORAGE_KEY = 'lableit_settings';
// Marker for the one-time switch of the default theme from 'system' to 'light'.
const THEME_DEFAULT_MIGRATED_KEY = 'lableit_theme_default_v2';

// Browsers that only ever saw the old 'system' default are moved to the light
// default once; after that the visitor's own choice is kept. Runs at module
// load, not inside the state initializer, which React may call twice.
function migrateThemeDefault(): void {
  try {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(THEME_DEFAULT_MIGRATED_KEY)) return;
    localStorage.setItem(THEME_DEFAULT_MIGRATED_KEY, '1');
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!stored) return;
    const parsed = JSON.parse(stored);
    if (parsed?.theme === 'system') {
      localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({ ...parsed, theme: DEFAULT_SETTINGS.theme })
      );
    }
  } catch (e) {
    console.warn('Theme default migration skipped:', e);
  }
}
migrateThemeDefault();

// ================================
// Context
// ================================
const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

// ================================
// Provider
// ================================
interface SettingsProviderProps {
  children: ReactNode;
}

export function SettingsProvider({ children }: SettingsProviderProps) {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.warn('Failed to load settings from localStorage:', e);
    }
    return DEFAULT_SETTINGS;
  });
  
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [gpuInfo, setGPUInfo] = useState<GPUInfo | null>(null);
  const [serviceAvailable, setServiceAvailable] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Persist settings to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn('Failed to save settings to localStorage:', e);
    }
  }, [settings]);
  
  // Theme management
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });
  
  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);
  
  // Calculate effective theme
  const effectiveTheme: 'light' | 'dark' = settings.theme === 'system' 
    ? systemTheme 
    : settings.theme;
  
  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    if (effectiveTheme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
  }, [effectiveTheme]);

  // Apply color palette across the entire app via CSS variables.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.colorTheme);
  }, [settings.colorTheme]);
  
  const setTheme = useCallback((theme: ThemeMode) => {
    setSettings(prev => ({ ...prev, theme }));
  }, []);

  const setColorTheme = useCallback((theme: ColorTheme) => {
    setSettings(prev => ({ ...prev, colorTheme: theme }));
  }, []);
  
  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, []);
  
  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);
  
  const clearError = useCallback(() => {
    setError(null);
  }, []);
  
  const refreshModelStatus = useCallback(async () => {
    try {
      const status = await inference.getModelStatus();
      setModelStatus({
        downloaded: status.downloaded,
        modelPath: status.model_path,
        modelSizeMB: status.model_size_mb,
        source: status.source,
        modelLoaded: status.model_loaded,
        loadError: status.load_error,
        loadTime: status.load_time,
        lastInference: status.last_inference,
        inferenceCount: status.inference_count || 0,
        device: status.device,
        cudaAvailable: status.cuda_available,
        cudaDevice: status.cuda_device,
        modelsDir: status.models_dir,
        download: {
          inProgress: status.download?.in_progress || false,
          progress: status.download?.progress || 0,
          status: status.download?.status || 'idle',
          error: status.download?.error,
          startedAt: status.download?.started_at,
          completedAt: status.download?.completed_at
        }
      });
      setServiceAvailable(true);
    } catch (err: any) {
      console.error('Failed to fetch model status:', err);
      if (err.response?.status === 503 || err.code === 'ERR_NETWORK') {
        setServiceAvailable(false);
      }
      setError('Failed to connect to inference service');
    }
  }, []);
  
  const refreshGPUInfo = useCallback(async () => {
    try {
      const info = await inference.getGpuInfo();
      setGPUInfo({
        cudaAvailable: info.cuda_available,
        deviceCount: info.device_count,
        currentDevice: info.current_device,
        deviceName: info.device_name,
        memoryAllocatedMB: info.memory_allocated_mb,
        memoryReservedMB: info.memory_reserved_mb,
        maxMemoryAllocatedMB: info.max_memory_allocated_mb,
        memoryTotalMB: info.memory_total_mb
      });
    } catch (err) {
      console.error('Failed to fetch GPU info:', err);
    }
  }, []);
  
  const loadModel = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      await inference.loadModel('sam3');
      await refreshModelStatus();
      return true;
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Failed to load model';
      setError(msg);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [refreshModelStatus]);
  
  const unloadModel = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      await inference.unloadModel('sam3');
      await refreshModelStatus();
      return true;
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Failed to unload model';
      setError(msg);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [refreshModelStatus]);
  
  const downloadModel = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await inference.downloadModel('sam3');
      if (result.status === 'already_downloaded') {
        await refreshModelStatus();
        return true;
      }
      // Start polling for progress
      const pollInterval = setInterval(async () => {
        await refreshModelStatus();
        if (modelStatus?.download.status === 'complete' || modelStatus?.download.status === 'failed') {
          clearInterval(pollInterval);
          setIsLoading(false);
        }
      }, 2000);
      return true;
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Failed to start download';
      setError(msg);
      setIsLoading(false);
      return false;
    }
  }, [refreshModelStatus, modelStatus]);
  
  // Initial load
  useEffect(() => {
    refreshModelStatus();
    refreshGPUInfo();
    
    // Poll for status every 30 seconds
    const interval = setInterval(() => {
      refreshModelStatus();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [refreshModelStatus, refreshGPUInfo]);
  
  const value: SettingsContextType = {
    settings,
    updateSettings,
    resetSettings,
    effectiveTheme,
    setTheme,
    colorTheme: settings.colorTheme,
    setColorTheme,
    modelStatus,
    gpuInfo,
    serviceAvailable,
    refreshModelStatus,
    refreshGPUInfo,
    loadModel,
    unloadModel,
    downloadModel,
    isLoading,
    error,
    clearError
  };
  
  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

// ================================
// Hook
// ================================
export function useSettings(): SettingsContextType {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

export default SettingsContext;
