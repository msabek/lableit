import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  jobs,
  projects,
  classes,
  assets as assetsApi,
  Project,
  Dataset,
  Asset,
  Tag
} from './api';
import { TagManager } from './components/labeling/TagManager';
import AnnotationCanvas from './components/AnnotationCanvas';
import ExportPanel from './ExportPanel';
import ExportWizard from './components/ExportWizard';
import VideoSliceDialog from './components/VideoSliceDialog';
import ConfirmationModal from './components/ConfirmationModal';
import { AssetGrid } from './components/labeling/AssetGrid';
import { ControlPanel, InferenceMode } from './components/labeling/ControlPanel';
import { useInference } from './hooks/useInference';
import { useProjectData } from './hooks/useProjectData';
import { useJobPolling } from './hooks/useJobPolling';
import { useUploader } from './hooks/useUploader';
import { useAssetAnnotation } from './hooks/useAssetAnnotation';
import { useAnnotationHistory } from './hooks/useUndoRedo';
// New UI components
import { Sidebar } from './components/ui/Sidebar';
import { EmptyState } from './components/ui/EmptyState';
import { WorkflowStepperInline, WorkflowStep } from './components/ui/WorkflowStepper';
import { KeyboardShortcutsModal, useKeyboardShortcuts, KeyHint } from './components/ui/KeyboardShortcuts';
import { DragDropOverlay } from './components/ui/DragDropOverlay';
import { FilterPresets, FilterState } from './components/labeling/FilterPresets';
import { ThemeDropdown } from './components/ThemeToggle';
import {
  Upload, Play, Settings, ChevronLeft, ChevronRight, Loader2,
  Download, RefreshCw, Check, AlertCircle, Video, Trash2, XCircle, Trash,
  Undo2, Redo2, Home, Tag as TagIcon, Layers, Eye, FolderOpen
} from 'lucide-react';

interface LabelingProps {
  onBack: () => void;
  projectId?: string;
}

export default function LabelingInterface({ onBack, projectId }: LabelingProps) {
  // Hooks
  const { 
    project, setProject, projectAssets, 
    loading: projectLoading, error: projectError, setError: setProjectError,
    refreshAssets 
  } = useProjectData(projectId);

  const {
    availableModels, inferenceHealth, modelsLoading, preloadMessage,
    error: inferenceError, setError: setInferenceError,
    loadInferenceInfo, handlePreloadModel
  } = useInference();

  const {
    currentJob, processing, setProcessing, 
    error: jobError, setError: setJobError, 
    progress: jobProgress, progressMessage: jobProgressMessage,
    pollJobStatus
  } = useJobPolling();

  const {
    selectedAsset, setSelectedAsset, selectedDetectionIndex, setSelectedDetectionIndex,
    assetUrl, setAssetUrl, assetDetections, setAssetDetections,
    error: annotationError, setError: setAnnotationError,
    handleAssetClick, handleAddDetection, handleUpdateDetection, 
    handleDeleteDetection, handleDeleteAsset
  } = useAssetAnnotation(project);

  // Create virtual dataset for uploader compatibility
  const virtualDataset = project ? { id: project.id, projectId: project.id, name: project.name, createdAt: project.createdAt, assets: projectAssets } : null;
  
  const {
    files, uploading, uploadProgress,
    error: uploadError, setError: setUploadError,
    handleFileSelect, handleUpload,
    // Video slicing
    pendingVideoFile, showVideoSliceDialog, slicingVideo, slicingProgress,
    handleVideoSliceConfirm, handleVideoSliceCancel,
    // Tag selection for uploads
    selectedTagIds: uploadTagIds, setSelectedTagIds: setUploadTagIds
  } = useUploader(virtualDataset, refreshAssets);

  // Local State
  const [interval, setIntervalValue] = useState(1);
  const [model, setModel] = useState('sam3');
  const [inferenceMode, setInferenceMode] = useState<InferenceMode>('boxes_and_masks');
  const [maskOpacity, setMaskOpacity] = useState(30); // Default 30% opacity for masks
  const [showExport, setShowExport] = useState(false);
  const [clearingAnnotations, setClearingAnnotations] = useState(false);
  
  // Confirmation modal state
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDeleteAssetConfirm, setShowDeleteAssetConfirm] = useState(false);
  const [assetToDelete, setAssetToDelete] = useState<Asset | null>(null);
  const [showDeleteClassConfirm, setShowDeleteClassConfirm] = useState(false);
  const [classToDelete, setClassToDelete] = useState<string | null>(null);
  
  // Asset selection mode for bulk operations
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [showDeleteSelectedConfirm, setShowDeleteSelectedConfirm] = useState(false);
  const [deletingAssets, setDeletingAssets] = useState(false);

  // Track threshold changes for refresh button
  const [thresholdsChanged, setThresholdsChanged] = useState(false);
  const [lastUsedThresholds, setLastUsedThresholds] = useState<Map<string, number>>(new Map());

  // New UI state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showExportWizard, setShowExportWizard] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('assets');
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [switchingPreviewAsset, setSwitchingPreviewAsset] = useState(false);

  // Workflow step tracking
  const getWorkflowStep = (): WorkflowStep => {
    if (projectAssets.length === 0) return 'upload';
    const hasAnnotations = projectAssets.some(a => a.annotations && a.annotations.length > 0);
    if (!hasAnnotations) return 'label';
    return 'review';
  };

  // Filter state
  const [filterState, setFilterState] = useState<FilterState>({
    annotationStatus: 'all',
    classes: [],
    dateRange: 'all',
    confidenceMin: 0,
    confidenceMax: 1
  });

  // Undo/Redo history
  const annotationHistory = useAnnotationHistory();

  // Keyboard shortcuts
  const handleUndo = useCallback(() => {
    const action = annotationHistory.undo();
    if (action) {
      refreshAssets();
    }
  }, [annotationHistory, refreshAssets]);

  const handleRedo = useCallback(() => {
    const action = annotationHistory.redo();
    if (action) {
      refreshAssets();
    }
  }, [annotationHistory, refreshAssets]);

  // Note: Functions like runPreview, runBatch, handleSelectAll, handleDeselectAll
  // are defined later in this component. We wrap them in arrow functions for lazy evaluation
  // to avoid Temporal Dead Zone (TDZ) errors during component initialization.
  const keyboardHandlers = {
    'ctrl+z': handleUndo,
    'ctrl+shift+z': handleRedo,
    'ctrl+e': () => setShowExportWizard(true),
    'ctrl+shift+p': () => runPreview(),
    'ctrl+enter': () => runBatch(),
    'escape': () => {
      if (showPreviewModal) {
        setShowPreviewModal(false);
      } else {
        onBack();
      }
    },
    'u': () => document.getElementById('file-upload')?.click(),
    'a': () => handleSelectAll(),
    'd': () => handleDeselectAll(),
  };

  const { showShortcuts, setShowShortcuts, closeShortcuts } = useKeyboardShortcuts(keyboardHandlers);

  // Handle drag-drop anywhere
  const handleGlobalFileDrop = useCallback((files: FileList) => {
    const syntheticEvent = {
      target: { files }
    } as React.ChangeEvent<HTMLInputElement>;
    handleFileSelect(syntheticEvent);
  }, [handleFileSelect]);

  // Refs for sections to enable scroll navigation
  const assetsRef = useRef<HTMLDivElement>(null);
  const classesRef = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<HTMLDivElement>(null);

  const selectedAssetIndex = selectedAsset
    ? projectAssets.findIndex((asset) => asset.id === selectedAsset.id)
    : -1;

  const openAssetPreview = useCallback(async (asset: Asset) => {
    setSwitchingPreviewAsset(true);
    try {
      await handleAssetClick(asset);
      setShowPreviewModal(true);
    } finally {
      setSwitchingPreviewAsset(false);
    }
  }, [handleAssetClick]);

  const movePreview = useCallback(async (direction: -1 | 1) => {
    if (projectAssets.length === 0 || selectedAssetIndex < 0 || switchingPreviewAsset) return;
    const nextIndex = (selectedAssetIndex + direction + projectAssets.length) % projectAssets.length;
    await openAssetPreview(projectAssets[nextIndex]);
  }, [openAssetPreview, projectAssets, selectedAssetIndex, switchingPreviewAsset]);

  useEffect(() => {
    if (!showPreviewModal) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        void movePreview(-1);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        void movePreview(1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [movePreview, showPreviewModal]);

  // Derived State
  const error = projectError || inferenceError || jobError || annotationError || uploadError;
  const clearError = () => {
    setProjectError(null);
    setInferenceError(null);
    setJobError(null);
    setAnnotationError(null);
    setUploadError(null);
  };

  // Handlers
  const handleThresholdChange = (classId: string, newThreshold: number) => {
    if (project) {
      setProject({
        ...project,
        classes: project.classes.map(c =>
          c.id === classId ? { ...c, threshold: newThreshold } : c
        )
      });

      // Check if threshold differs from last used value
      const lastUsed = lastUsedThresholds.get(classId);
      if (lastUsed !== undefined && Math.abs(lastUsed - newThreshold) > 0.001) {
        setThresholdsChanged(true);
      }
    }
  };

  const handleColorChange = (classId: string, newColor: string) => {
    if (project) {
      setProject({
        ...project,
        classes: project.classes.map(c =>
          c.id === classId ? { ...c, color: newColor } : c
        )
      });
    }
  };

  const handleAddClass = async (name: string, color: string, threshold: number) => {
    if (!project) return;
    
    try {
      const newClass = await classes.create(project.id, name, color, threshold);
      setProject({
        ...project,
        classes: [...project.classes, newClass]
      });
    } catch (err: any) {
      setJobError(err.response?.data?.error || 'Failed to add class');
      throw err;
    }
  };

  const handleDeleteClass = (classId: string) => {
    if (!project) return;
    const cls = project.classes.find(c => c.id === classId);
    if (!cls) return;
    setClassToDelete(classId);
    setShowDeleteClassConfirm(true);
  };

  const confirmDeleteClass = async () => {
    if (!project || !classToDelete) return;

    try {
      await classes.delete(classToDelete);
      setProject({
        ...project,
        classes: project.classes.filter(c => c.id !== classToDelete)
      });
      // Refresh assets to update annotation counts
      await refreshAssets();
      setClassToDelete(null);
    } catch (err: any) {
      setJobError(err.response?.data?.error || 'Failed to delete class');
      throw err;
    }
  };

  // Check if any assets are videos
  const hasVideoAssets = projectAssets.some((asset: Asset) => 
    asset.uri.match(/\.(mp4|webm|mov|avi|mkv)$/i)
  );

  const runPreview = async () => {
    if (!project || projectAssets.length === 0) return;

    setProcessing(true);
    clearError();

    try {
      const previewAssets = projectAssets.slice(0, 3);
      const assetIds = previewAssets.map((a: Asset) => a.id);

      const { jobId } = await jobs.createPreview({
        assetIds,
        model,
        classes: project.classes.map(c => ({
          id: c.id,
          name: c.name,
          threshold: c.threshold
        })),
        inferenceMode
      });

      pollJobStatus(jobId, refreshAssets);

    } catch (err: any) {
      setJobError(err.response?.data?.error || 'Preview failed');
      setProcessing(false);
    }
  };

  const runBatch = async () => {
    if (!project || projectAssets.length === 0) return;

    setProcessing(true);
    clearError();

    try {
      const assetIds = projectAssets.map((a: Asset) => a.id);

      const { jobId } = await jobs.createBatch({
        assetIds,
        model,
        classes: project.classes.map(c => ({
          id: c.id,
          name: c.name,
          threshold: c.threshold
        })),
        inferenceMode
      });

      // Save the thresholds used for this batch
      const newThresholds = new Map<string, number>();
      project.classes.forEach(c => newThresholds.set(c.id, c.threshold));
      setLastUsedThresholds(newThresholds);
      setThresholdsChanged(false);

      pollJobStatus(jobId, refreshAssets);

    } catch (err: any) {
      setJobError(err.response?.data?.error || 'Batch processing failed');
      setProcessing(false);
    }
  };

  // Refresh with new threshold values - clears annotations and re-runs inference
  const handleRefreshWithNewThresholds = async () => {
    if (!project || projectAssets.length === 0) return;

    setProcessing(true);
    clearError();

    try {
      // First clear all existing annotations
      await projects.clearAnnotations(project.id);
      setAssetDetections([]);

      // Then run batch with new thresholds
      const assetIds = projectAssets.map((a: Asset) => a.id);

      const { jobId } = await jobs.createBatch({
        assetIds,
        model,
        classes: project.classes.map(c => ({
          id: c.id,
          name: c.name,
          threshold: c.threshold
        })),
        inferenceMode
      });

      // Save the new thresholds
      const newThresholds = new Map<string, number>();
      project.classes.forEach(c => newThresholds.set(c.id, c.threshold));
      setLastUsedThresholds(newThresholds);
      setThresholdsChanged(false);

      pollJobStatus(jobId, refreshAssets);

    } catch (err: any) {
      setJobError(err.response?.data?.error || 'Failed to refresh with new thresholds');
      setProcessing(false);
    }
  };

  const handleSliceVideo = async () => {
    if (!selectedAsset || !project) return;
    setProcessing(true);
    try {
      const { jobId } = await jobs.sliceVideo(project.id, selectedAsset.id, interval);
      pollJobStatus(jobId, refreshAssets);
    } catch (err) {
      setJobError('Failed to start video slicing');
      setProcessing(false);
    }
  };

  const handleClearAllAnnotations = async () => {
    if (!project) return;
    
    setClearingAnnotations(true);
    clearError();
    
    try {
      const result = await projects.clearAnnotations(project.id);
      // Clear current asset detections if viewing an asset
      setAssetDetections([]);
      // Refresh assets to update annotation counts
      await refreshAssets();
    } catch (err: any) {
      setJobError(err.response?.data?.error || err.message || 'Failed to clear annotations');
      throw err; // Re-throw so the modal knows it failed
    } finally {
      setClearingAnnotations(false);
    }
  };

  // Handle asset deletion with confirmation
  const handleDeleteAssetWithConfirm = (asset: Asset) => {
    setAssetToDelete(asset);
    setShowDeleteAssetConfirm(true);
  };

  const confirmDeleteAsset = async () => {
    if (!assetToDelete) return;
    
    try {
      await handleDeleteAsset(assetToDelete.id);
      await refreshAssets();
      setAssetToDelete(null);
    } catch (err: any) {
      setJobError(err.response?.data?.error || err.message || 'Failed to delete asset');
      throw err;
    }
  };

  // Toggle asset selection
  const handleToggleSelection = (asset: Asset) => {
    setSelectedAssetIds(prev => {
      const next = new Set(prev);
      if (next.has(asset.id)) {
        next.delete(asset.id);
      } else {
        next.add(asset.id);
      }
      return next;
    });
  };

  // Select all assets
  const handleSelectAll = () => {
    setSelectedAssetIds(new Set(projectAssets.map(a => a.id)));
  };

  // Deselect all assets
  const handleDeselectAll = () => {
    setSelectedAssetIds(new Set());
  };

  // Toggle selection mode
  const toggleSelectionMode = () => {
    if (selectionMode) {
      // Exiting selection mode - clear selection
      setSelectedAssetIds(new Set());
    }
    setSelectionMode(!selectionMode);
  };

  // Delete all assets in project
  const handleDeleteAllAssets = async () => {
    if (!project) return;
    
    setDeletingAssets(true);
    clearError();
    
    try {
      await assetsApi.deleteAll(project.id);
      setSelectedAsset(null);
      setAssetUrl(null);
      setAssetDetections([]);
      await refreshAssets();
    } catch (err: any) {
      setJobError(err.response?.data?.error || err.message || 'Failed to delete assets');
      throw err;
    } finally {
      setDeletingAssets(false);
      setSelectionMode(false);
    }
  };

  // Delete selected assets
  const handleDeleteSelectedAssets = async () => {
    if (selectedAssetIds.size === 0) return;
    
    setDeletingAssets(true);
    clearError();
    
    try {
      await assetsApi.deleteBulk(Array.from(selectedAssetIds));
      // If current asset was deleted, clear it
      if (selectedAsset && selectedAssetIds.has(selectedAsset.id)) {
        setSelectedAsset(null);
        setAssetUrl(null);
        setAssetDetections([]);
      }
      setSelectedAssetIds(new Set());
      await refreshAssets();
    } catch (err: any) {
      setJobError(err.response?.data?.error || err.message || 'Failed to delete selected assets');
      throw err;
    } finally {
      setDeletingAssets(false);
      setSelectionMode(false);
    }
  };

  // Scroll to section helper
  const scrollToSection = (ref: React.RefObject<HTMLDivElement>, sectionId: string) => {
    setActiveSection(sectionId);
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Sidebar navigation items
  const sidebarItems = [
    { id: 'projects', label: 'Projects', icon: <Home className="w-5 h-5" />, shortcut: 'G P', onClick: onBack },
    { id: 'assets', label: 'Assets', icon: <Layers className="w-5 h-5" />, active: activeSection === 'assets', badge: projectAssets.length, onClick: () => scrollToSection(assetsRef, 'assets') },
    { id: 'classes', label: 'Classes', icon: <TagIcon className="w-5 h-5" />, active: activeSection === 'classes', badge: project?.classes.length, onClick: () => scrollToSection(classesRef, 'classes') },
    { id: 'preview', label: 'Preview', icon: <Eye className="w-5 h-5" />, active: showPreviewModal, onClick: () => selectedAsset ? setShowPreviewModal(true) : scrollToSection(assetsRef, 'assets') },
    { id: 'export', label: 'Export', icon: <Download className="w-5 h-5" />, shortcut: '\u2318E', onClick: () => setShowExportWizard(true) },
  ];

  // Calculate annotation count
  const totalAnnotations = projectAssets.reduce((sum, asset) => sum + (asset.annotations?.length || 0), 0);

  return (
    <div className="min-h-screen bg-[var(--color-background)] bg-mesh-gradient">
      {/* Drag-Drop Overlay */}
      <DragDropOverlay onFilesDropped={handleGlobalFileDrop} disabled={uploading} />

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal isOpen={showShortcuts} onClose={closeShortcuts} />

      {/* Sidebar Navigation */}
      <Sidebar
        items={sidebarItems}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        onItemClick={setActiveSection}
        onLogoClick={onBack}
      />

      {/* Main Content - adjusted for sidebar */}
      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-56'}`}>
        {/* Header */}
        <header className="glass-panel border-b border-glass-border sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-4">
                <button
                  onClick={onBack}
                  className="icon-button-glass lg:hidden"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <h1 className="text-xl font-bold gradient-text">
                  {project?.name || 'Labeling Interface'}
                </h1>

                {/* Workflow Stepper */}
                <div className="hidden md:block ml-4">
                  <WorkflowStepperInline
                    currentStep={getWorkflowStep()}
                    completedSteps={projectAssets.length > 0 ? ['upload'] : []}
                  />
                </div>
              </div>
            <div className="flex items-center gap-3">
              {/* Undo/Redo Buttons */}
              {project && (
                <div className="flex items-center gap-1 mr-2">
                  <button
                    onClick={handleUndo}
                    disabled={!annotationHistory.canUndo}
                    className="icon-button-glass disabled:opacity-30"
                    title={`Undo (Ctrl+Z) - ${annotationHistory.undoCount} actions`}
                  >
                    <Undo2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleRedo}
                    disabled={!annotationHistory.canRedo}
                    className="icon-button-glass disabled:opacity-30"
                    title={`Redo (Ctrl+Shift+Z) - ${annotationHistory.redoCount} actions`}
                  >
                    <Redo2 className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Selection Mode Toggle */}
              {project && projectAssets.length > 0 && (
                <button
                  onClick={toggleSelectionMode}
                  className={`flex items-center px-4 py-2 rounded-xl transition-all duration-200 active:scale-95 ${
                    selectionMode
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'glass-button'
                  }`}
                >
                  <Trash className="w-4 h-4 mr-1.5" />
                  {selectionMode ? 'Cancel' : 'Delete Assets'}
                </button>
              )}
              
              {/* Delete Selected Button (shown in selection mode when items selected) */}
              {selectionMode && selectedAssetIds.size > 0 && (
                <button
                  onClick={() => setShowDeleteSelectedConfirm(true)}
                  disabled={deletingAssets}
                  className="flex items-center px-4 py-2 rounded-xl font-medium text-white transition-all duration-200 disabled:opacity-50 active:scale-95 animate-fade-in"
                  style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', boxShadow: '0 4px 15px -3px rgba(239, 68, 68, 0.4)' }}
                >
                  {deletingAssets ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4 mr-2" />
                  )}
                  Delete Selected ({selectedAssetIds.size})
                </button>
              )}
              
              {/* Delete All Assets Button (shown in selection mode) */}
              {selectionMode && projectAssets.length > 0 && (
                <button
                  onClick={() => setShowDeleteAllConfirm(true)}
                  disabled={deletingAssets}
                  className="flex items-center px-4 py-2 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all duration-200 disabled:opacity-50 active:scale-95"
                >
                  {deletingAssets ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Trash className="w-4 h-4 mr-2" />
                  )}
                  Delete All ({projectAssets.length})
                </button>
              )}

              {/* Divider when not in selection mode */}
              {!selectionMode && project && projectAssets.length > 0 && (
                <div className="h-8 w-px bg-glass-border mx-1" />
              )}

              {/* Clear All Annotations Button */}
              {!selectionMode && project && projectAssets.length > 0 && (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  disabled={clearingAnnotations}
                  className="flex items-center px-4 py-2 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all duration-200 disabled:opacity-50 active:scale-95"
                >
                  {clearingAnnotations ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <XCircle className="w-4 h-4 mr-2" />
                  )}
                  Clear Annotations
                </button>
              )}
              {/* Export Button */}
              {!selectionMode && project && projectAssets.length > 0 && (
                <button
                  onClick={() => setShowExportWizard(true)}
                  className="btn-primary-gradient flex items-center"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export
                  <KeyHint keys={['\u2318', 'E']} />
                </button>
              )}
              <ThemeDropdown />
            </div>
          </div>
        </div>
      </header>

      {/* Inference Status Banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
        <div className="glass-card rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className={`h-3 w-3 rounded-full ${inferenceHealth?.cuda_available ? 'status-dot-success' : 'status-dot-warning'}`} />
            <div>
              <div className="text-sm font-semibold text-text">Inference Health</div>
              <div className="text-xs text-text-muted">
                {inferenceHealth
                  ? `Device: ${inferenceHealth.device} | CUDA: ${inferenceHealth.cuda_available ? 'Enabled' : 'Disabled'}`
                  : 'Checking inference service...'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {inferenceHealth?.model_loaded ? (
              <span className="inline-flex items-center px-4 py-2 text-xs font-medium rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <Check className="w-3 h-3 mr-1.5" />
                SAM3 Ready
              </span>
            ) : (
              <button
                onClick={() => handlePreloadModel('sam3')}
                disabled={modelsLoading['sam3']}
                className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/30 disabled:opacity-50 transition-all"
              >
                {modelsLoading['sam3'] ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                Load SAM3 Model
              </button>
            )}
            <button
              onClick={loadInferenceInfo}
              className="icon-button-glass"
              title="Refresh Status"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
        {preloadMessage && (
          <div className="mt-3 text-xs text-text-muted glass-panel rounded-xl px-4 py-3">
            {preloadMessage}
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
          <div className="glass-panel rounded-xl border-red-500/30 p-4 flex items-center justify-between animate-slide-down">
            <div className="flex items-center">
              <div className="p-2 rounded-lg bg-red-500/10 mr-3">
                <AlertCircle className="w-5 h-5 text-red-400" />
              </div>
              <span className="text-red-400">{error}</span>
            </div>
            <button onClick={clearError} className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-400 transition-colors">
              ×
            </button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel */}
          <div className="space-y-6">
            {/* Upload Section */}
            <div className="glass-card rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-text mb-4 flex items-center">
                <div className="p-2 rounded-lg bg-indigo-500/20 mr-2">
                  <Upload className="w-5 h-5 text-indigo-400" />
                </div>
                Upload Media
              </h2>
              <div
                className="border-2 border-dashed border-glass-border rounded-xl p-6 text-center hover:border-primary/50 transition-all hover:bg-primary/5"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.add('border-primary', 'bg-primary/10');
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.remove('border-primary', 'bg-primary/10');
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.remove('border-primary', 'bg-primary/10');
                  const droppedFiles = e.dataTransfer.files;
                  if (droppedFiles.length > 0) {
                    // Create a synthetic event to pass to handleFileSelect
                    const syntheticEvent = {
                      target: { files: droppedFiles }
                    } as React.ChangeEvent<HTMLInputElement>;
                    handleFileSelect(syntheticEvent);
                  }
                }}
              >
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center mx-auto mb-3">
                  <Upload className="w-7 h-7 text-indigo-400" />
                </div>
                <input
                  id="file-upload"
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer text-primary hover:text-primary-hover font-medium transition-colors"
                >
                  Choose files
                </label>
                <p className="text-xs text-text-muted mt-2">or drag and drop</p>
                {files && (
                  <div className="mt-3 text-sm text-primary font-medium badge-glass inline-flex px-3 py-1 rounded-full">
                    {files.length} file(s) selected
                  </div>
                )}
              </div>
              {files && project && (
                <div className="mt-4 space-y-3">
                  {/* Tag Selection for Upload */}
                  <div className="flex items-center gap-2">
                    <TagManager
                      projectId={project.id}
                      selectedAssetIds={[]}
                      mode="select"
                      selectedTagIds={uploadTagIds}
                      onSelectionChange={setUploadTagIds}
                      compact
                    />
                    {uploadTagIds.length > 0 && (
                      <span className="text-xs text-text-muted">
                        {uploadTagIds.length} tag{uploadTagIds.length !== 1 ? 's' : ''} will be applied
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="w-full btn-primary-gradient flex items-center justify-center disabled:opacity-50"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Uploading... {uploadProgress}%
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        Upload Files
                      </>
                    )}
                  </button>
                </div>
              )}
              {files && !project && (
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="w-full mt-4 btn-primary-gradient flex items-center justify-center disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Uploading... {uploadProgress}%
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Upload Files
                    </>
                  )}
                </button>
              )}
            </div>

            <div ref={classesRef}>
              <ControlPanel
                model={model}
                setModel={setModel}
                availableModels={availableModels}
                interval={interval}
                setIntervalValue={setIntervalValue}
                project={project}
                onThresholdChange={handleThresholdChange}
                onColorChange={handleColorChange}
                onAddClass={handleAddClass}
                onDeleteClass={handleDeleteClass}
                hasVideoAssets={hasVideoAssets}
                inferenceMode={inferenceMode}
                onInferenceModeChange={setInferenceMode}
                maskOpacity={maskOpacity}
                onMaskOpacityChange={setMaskOpacity}
                thresholdsChanged={thresholdsChanged}
                onRefreshWithNewThresholds={handleRefreshWithNewThresholds}
                isProcessing={processing}
              />
            </div>
          </div>

          {/* Right Panel */}
          <div className="lg:col-span-2 space-y-6">
             {/* Actions */}
            {projectAssets.length > 0 && (
              <div className="glass-card rounded-2xl p-6">
                <div className="flex flex-col sm:flex-row gap-4">
                  <button
                    onClick={runPreview}
                    disabled={processing}
                    className="flex-1 btn-primary-gradient flex items-center justify-center disabled:opacity-50"
                  >
                    {processing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Run Preview (3 samples)
                      </>
                    )}
                  </button>

                  <button
                    onClick={runBatch}
                    disabled={processing}
                    className="flex-1 btn-secondary-glass flex items-center justify-center disabled:opacity-50"
                  >
                    {processing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Settings className="w-4 h-4 mr-2" />
                        Run Batch (all assets)
                      </>
                    )}
                  </button>
                </div>

                {/* Job Status with Progress Bar */}
                {currentJob && (
                  <div className={`mt-4 p-5 rounded-2xl ${currentJob.status === 'succeeded' ? 'bg-emerald-500/10 border border-emerald-500/30' :
                    currentJob.status === 'failed' ? 'bg-red-500/10 border border-red-500/30' :
                      'bg-blue-500/10 border border-blue-500/30'
                    }`}>
                    {/* Status Header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        {currentJob.status === 'succeeded' ? (
                          <div className="p-2.5 rounded-xl bg-emerald-500/20">
                            <Check className="w-5 h-5 text-emerald-500" />
                          </div>
                        ) : currentJob.status === 'failed' ? (
                          <div className="p-2.5 rounded-xl bg-red-500/20">
                            <AlertCircle className="w-5 h-5 text-red-500" />
                          </div>
                        ) : (
                          <div className="p-2.5 rounded-xl bg-blue-500/20">
                            <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                          </div>
                        )}
                        <div>
                          <h4 className="font-semibold text-text capitalize">{currentJob.status}</h4>
                          {currentJob.result?.annotationsCreated !== undefined && (
                            <p className="text-sm text-text-muted">
                              {currentJob.result.annotationsCreated} annotations created
                            </p>
                          )}
                        </div>
                      </div>
                      {processing && (
                        <div className="text-right">
                          <span className="text-2xl font-bold text-primary">{jobProgress}%</span>
                          <p className="text-xs text-text-muted">Complete</p>
                        </div>
                      )}
                    </div>

                    {/* Enhanced Progress Bar for running jobs */}
                    {processing && (
                      <div className="space-y-3">
                        {/* Progress Bar Container */}
                        <div className="relative">
                          <div className="w-full bg-slate-200 dark:bg-slate-700/50 rounded-full h-4 overflow-hidden">
                            <div
                              className="h-4 rounded-full transition-all duration-500 ease-out relative overflow-hidden"
                              style={{
                                width: `${jobProgress}%`,
                                background: 'linear-gradient(90deg, #3b82f6 0%, #2563eb 50%, #1d4ed8 100%)'
                              }}
                            >
                              {/* Animated shine effect */}
                              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-shimmer"
                                style={{ backgroundSize: '200% 100%' }}
                              />
                            </div>
                          </div>
                          {/* Progress markers */}
                          <div className="absolute top-1/2 -translate-y-1/2 w-full flex justify-between px-1 pointer-events-none">
                            {[25, 50, 75].map((marker) => (
                              <div
                                key={marker}
                                className={`w-0.5 h-2 rounded ${jobProgress >= marker ? 'bg-white/50' : 'bg-slate-400/30'}`}
                                style={{ marginLeft: `${marker - 1}%` }}
                              />
                            ))}
                          </div>
                        </div>

                        {/* Progress Info */}
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                            <span className="text-text-muted">{jobProgressMessage}</span>
                          </div>
                          <span className="text-text-muted font-medium">
                            {Math.round(jobProgress * projectAssets.length / 100)} / {projectAssets.length} assets
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Asset Grid with Filters */}
            <div ref={assetsRef} className="glass-card rounded-2xl p-6">
              {/* Filter Bar */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-text flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-indigo-500/20">
                    <Layers className="w-4 h-4 text-indigo-400" />
                  </div>
                  Assets ({projectAssets.length})
                </h2>
                {project && (
                  <FilterPresets
                    currentFilter={filterState}
                    onFilterChange={setFilterState}
                    availableClasses={project.classes.map(c => ({ id: c.id, name: c.name, color: c.color }))}
                    projectId={project.id}
                  />
                )}
              </div>

              {/* Empty State or Asset Grid */}
              {projectAssets.length === 0 ? (
                <EmptyState
                  type="no-assets"
                  action={
                    <button
                      onClick={() => document.getElementById('file-upload')?.click()}
                      className="btn-primary-gradient flex items-center"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Upload Files
                      <KeyHint keys="U" />
                    </button>
                  }
                />
              ) : (
                <AssetGrid
                  assets={projectAssets}
                  selectedAssetId={selectedAsset?.id}
                  onAssetClick={openAssetPreview}
                  onDeleteAsset={handleDeleteAssetWithConfirm}
                  selectionMode={selectionMode}
                  selectedAssetIds={selectedAssetIds}
                  onToggleSelection={handleToggleSelection}
                  onSelectAll={handleSelectAll}
                  onDeselectAll={handleDeselectAll}
                />
              )}
            </div>
          </div>
        </div>
      </div>
      </div> {/* Close main content wrapper */}

      {/* Asset Preview Modal */}
      {showPreviewModal && selectedAsset && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm p-4 sm:p-6" onClick={() => setShowPreviewModal(false)}>
          <div className="mx-auto h-full max-w-7xl flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-full max-h-[94vh] glass-card rounded-2xl border border-glass-border overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-glass-border">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-text">Preview</h2>
                  <p className="text-xs text-text-muted truncate">
                    Asset {selectedAssetIndex + 1} of {projectAssets.length} • {selectedAsset.uri}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {selectedAsset.uri.match(/\.(mp4|webm|mov|avi)$/i) && (
                    <button
                      onClick={handleSliceVideo}
                      disabled={processing}
                      className="hidden sm:flex items-center px-3 py-2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl hover:bg-amber-500/30 transition-all text-sm"
                    >
                      <Video className="w-4 h-4 mr-2" />
                      Slice into Frames
                    </button>
                  )}
                  <button
                    onClick={() => setShowPreviewModal(false)}
                    className="icon-button-glass"
                    title="Close preview"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-4 sm:p-6">
                <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4 sm:gap-6">
                  <div className="relative">
                    <div className="relative aspect-video bg-gray-900 rounded-xl overflow-hidden">
                      {assetUrl ? (
                        <AnnotationCanvas
                          key={selectedAsset.id}
                          imageUrl={assetUrl}
                          detections={assetDetections}
                          selectedDetectionIndex={selectedDetectionIndex}
                          onSelectDetection={setSelectedDetectionIndex}
                          onAddDetection={handleAddDetection}
                          onUpdateDetection={handleUpdateDetection}
                          onDeleteDetection={handleDeleteDetection}
                          activeClass={project?.classes[0]?.name || 'object'}
                          labelColors={new Map(project?.classes.map(c => [c.name, c.color]))}
                          showMasks={inferenceMode !== 'boxes_only'}
                          maskOpacity={maskOpacity}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Loader2 className="w-8 h-8 animate-spin text-white/70" />
                        </div>
                      )}
                      {(switchingPreviewAsset || !assetUrl) && (
                        <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
                          <Loader2 className="w-6 h-6 animate-spin text-white" />
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => void movePreview(-1)}
                      disabled={switchingPreviewAsset || projectAssets.length <= 1}
                      className="absolute left-2 top-1/2 -translate-y-1/2 icon-button-glass disabled:opacity-40"
                      title="Previous asset"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => void movePreview(1)}
                      disabled={switchingPreviewAsset || projectAssets.length <= 1}
                      className="absolute right-2 top-1/2 -translate-y-1/2 icon-button-glass disabled:opacity-40"
                      title="Next asset"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="glass-panel rounded-xl p-3 sm:p-4 max-h-[42vh] xl:max-h-[65vh] overflow-auto">
                    <h3 className="text-sm font-medium text-text mb-3">Annotations</h3>
                    {(switchingPreviewAsset || !assetUrl) ? (
                      <p className="text-sm text-text-muted">Loading annotations...</p>
                    ) : assetDetections.length === 0 ? (
                      <p className="text-sm text-text-muted">No annotations for this asset yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {assetDetections.map((ann, idx) => {
                          const classDef = project?.classes.find(c => c.name === ann.class_name);
                          return (
                            <div
                              key={ann.id || idx}
                              onClick={() => setSelectedDetectionIndex(idx)}
                              className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                                selectedDetectionIndex === idx ? 'bg-primary/10 border border-primary/30' : 'glass-panel hover:bg-white/5'
                              }`}
                            >
                              <div className="flex items-center">
                                <span
                                  className="w-3 h-3 rounded-full mr-2"
                                  style={{ backgroundColor: classDef?.color || '#ccc' }}
                                />
                                <span className="text-sm font-medium">{ann.class_name}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-sm text-text-muted">
                                  {(ann.confidence * 100).toFixed(1)}%
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteDetection(idx);
                                  }}
                                  className="p-1 text-text-muted hover:text-red-400"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Export Wizard Modal */}
      {showExportWizard && project && (
        <ExportWizard
          datasetId={project.id}
          datasetName={project.name}
          classes={project.classes}
          assetCount={projectAssets.length}
          annotationCount={totalAnnotations}
          labeledAssetCount={projectAssets.filter(a => a.annotations && a.annotations.length > 0).length}
          onClose={() => setShowExportWizard(false)}
        />
      )}

      {/* Legacy Export Panel Modal (fallback) */}
      {showExport && project && (
        <ExportPanel
          datasetId={project.id}
          datasetName={project.name}
          classes={project.classes}
          onClose={() => setShowExport(false)}
        />
      )}

      {/* Video Slice Dialog */}
      {showVideoSliceDialog && pendingVideoFile && (
        <VideoSliceDialog
          videoFile={pendingVideoFile}
          onConfirm={handleVideoSliceConfirm}
          onCancel={handleVideoSliceCancel}
          isProcessing={slicingVideo}
          slicingProgress={slicingProgress}
        />
      )}

      {/* Clear All Annotations Confirmation Modal */}
      <ConfirmationModal
        isOpen={showClearConfirm}
        title="Clear All Annotations"
        message={`This will permanently remove ALL annotations from ALL ${projectAssets.length} images in this project. This action cannot be undone.`}
        confirmText="Clear All"
        cancelText="Keep Annotations"
        type="danger"
        isProcessing={clearingAnnotations}
        onConfirm={handleClearAllAnnotations}
        onCancel={() => setShowClearConfirm(false)}
      />

      {/* Delete Asset Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteAssetConfirm}
        title="Delete Asset"
        message={assetToDelete ? `Are you sure you want to delete this asset? This will also remove all its annotations. This action cannot be undone.` : ''}
        confirmText="Delete Asset"
        cancelText="Cancel"
        type="danger"
        onConfirm={confirmDeleteAsset}
        onCancel={() => {
          setShowDeleteAssetConfirm(false);
          setAssetToDelete(null);
        }}
      />

      {/* Delete All Assets Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteAllConfirm}
        title="Delete All Assets"
        message={`This will permanently delete ALL ${projectAssets.length} assets from this project, including all their annotations. This action cannot be undone.`}
        confirmText="Delete All Assets"
        cancelText="Cancel"
        type="danger"
        isProcessing={deletingAssets}
        onConfirm={handleDeleteAllAssets}
        onCancel={() => setShowDeleteAllConfirm(false)}
        requireTyping="DELETE ALL"
      />

      {/* Delete Class Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteClassConfirm}
        title="Delete Class"
        message={classToDelete ? `Delete class "${project?.classes.find(c => c.id === classToDelete)?.name}"? This will also remove all annotations with this class.` : ''}
        confirmText="Delete Class"
        cancelText="Cancel"
        type="danger"
        onConfirm={confirmDeleteClass}
        onCancel={() => {
          setShowDeleteClassConfirm(false);
          setClassToDelete(null);
        }}
      />

      {/* Delete Selected Assets Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteSelectedConfirm}
        title="Delete Selected Assets"
        message={`This will permanently delete ${selectedAssetIds.size} selected asset${selectedAssetIds.size !== 1 ? 's' : ''} and all their annotations. This action cannot be undone.`}
        confirmText={`Delete ${selectedAssetIds.size} Asset${selectedAssetIds.size !== 1 ? 's' : ''}`}
        cancelText="Cancel"
        type="danger"
        isProcessing={deletingAssets}
        onConfirm={handleDeleteSelectedAssets}
        onCancel={() => setShowDeleteSelectedConfirm(false)}
      />
    </div>
  );
}
