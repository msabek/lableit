import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Upload, Search, Eye, Download, ChevronLeft, ChevronRight, X,
  Image as ImageIcon, Video, Loader2, Check, AlertCircle, Cpu,
  Plus, Trash2, RefreshCw, Settings, AlertTriangle
} from 'lucide-react';
import {
  upload, assets as assetsApi, inference, annotations as annotationsApi,
  exportApi, Dataset, Asset, ClassDef, Detection, InferenceResponse,
  ExportFormat, ModelStatus
} from '../api';
import AnnotationCanvas from './AnnotationCanvas';
import SettingsModal from './SettingsModal';

// ================================
// Types
// ================================
interface BuildFlowProps {
  dataset: Dataset;
  projectId?: string;
  classes: ClassDef[];
  onBack: () => void;
  onComplete: () => void;
}

type BuildStep = 'upload' | 'prompt' | 'review' | 'export';

interface UploadedFile {
  id: string;
  file: File;
  preview: string;
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
  progress: number;
  asset?: Asset;
}

interface PromptLabel {
  id: string;
  name: string;
  color: string;
  threshold: number;
  enabled: boolean;
}

interface AnnotatedAsset {
  asset: Asset;
  detections: Detection[];
  imageUrl: string;
}

// ================================
// Step Indicator Component
// ================================
const StepIndicator: React.FC<{ currentStep: BuildStep }> = ({ currentStep }) => {
  const steps: { id: BuildStep; label: string; icon: React.ReactNode }[] = [
    { id: 'upload', label: 'Upload', icon: <Upload className="w-4 h-4" /> },
    { id: 'prompt', label: 'Prompt', icon: <Search className="w-4 h-4" /> },
    { id: 'review', label: 'Review', icon: <Eye className="w-4 h-4" /> },
    { id: 'export', label: 'Export', icon: <Download className="w-4 h-4" /> },
  ];

  const currentIndex = steps.findIndex(s => s.id === currentStep);

  return (
    <div className="flex items-center justify-center space-x-2 mb-8">
      {steps.map((step, index) => (
        <React.Fragment key={step.id}>
          <div
            className={`flex items-center space-x-2 px-4 py-2 rounded-full transition-all ${
              index === currentIndex
                ? 'bg-primary text-text-inverse'
                : index < currentIndex
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'bg-surface-elevated text-text-muted'
            }`}
          >
            {index < currentIndex ? (
              <Check className="w-4 h-4" />
            ) : (
              step.icon
            )}
            <span className="text-sm font-medium">{step.label}</span>
          </div>
          {index < steps.length - 1 && (
            <ChevronRight className="w-4 h-4 text-text-muted" />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

// ================================
// Main BuildFlow Component
// ================================
export default function BuildFlow({ dataset, projectId, classes, onBack, onComplete }: BuildFlowProps) {
  // Use projectId if provided, otherwise fall back to dataset.id (for backwards compatibility)
  const uploadTargetId = projectId || dataset.projectId || dataset.id;
  const [step, setStep] = useState<BuildStep>('upload');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [promptLabels, setPromptLabels] = useState<PromptLabel[]>([]);
  const [promptInput, setPromptInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [annotatedAssets, setAnnotatedAssets] = useState<AnnotatedAsset[]>([]);
  const [selectedAssetIndex, setSelectedAssetIndex] = useState(0);
  const [selectedDetectionIndex, setSelectedDetectionIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load model status on mount
  useEffect(() => {
    inference.getModelStatus()
      .then(setModelStatus)
      .catch((err) => {
        console.error('Failed to get model status:', err);
        setError('Cannot connect to inference service. Please start it first.');
      });
  }, []);

  // Generate colors for labels
  const generateColor = (index: number): string => {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
    ];
    return colors[index % colors.length];
  };

  // ================================
  // Upload Step Handlers
  // ================================
  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files) return;

    const newFiles: UploadedFile[] = Array.from(files).map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      preview: URL.createObjectURL(file),
      status: 'pending',
      progress: 0
    }));

    setUploadedFiles(prev => [...prev, ...newFiles]);
  }, []);

  const handleUploadAll = useCallback(async () => {
    const pendingFiles = uploadedFiles.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    for (const file of pendingFiles) {
      setUploadedFiles(prev => prev.map(f =>
        f.id === file.id ? { ...f, status: 'uploading' } : f
      ));

      try {
        const result = await upload.file(uploadTargetId, file.file, (progress) => {
          setUploadedFiles(prev => prev.map(f =>
            f.id === file.id ? { ...f, progress } : f
          ));
        });

        setUploadedFiles(prev => prev.map(f =>
          f.id === file.id ? { ...f, status: 'uploaded', asset: result.asset } : f
        ));
      } catch (err) {
        setUploadedFiles(prev => prev.map(f =>
          f.id === file.id ? { ...f, status: 'error' } : f
        ));
      }
    }
  }, [uploadedFiles, uploadTargetId]);

  const removeFile = useCallback((id: string) => {
    setUploadedFiles(prev => {
      const file = prev.find(f => f.id === id);
      if (file) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter(f => f.id !== id);
    });
  }, []);

  // ================================
  // Prompt Step Handlers
  // ================================
  const addPromptLabel = useCallback(() => {
    const labels = promptInput.split(',').map(s => s.trim()).filter(s => s.length > 0);

    const newLabels: PromptLabel[] = labels.map((name, i) => ({
      id: `${Date.now()}-${i}`,
      name: name.toLowerCase(),
      color: generateColor(promptLabels.length + i),
      threshold: 0.5,
      enabled: true
    }));

    // Filter out duplicates
    const uniqueLabels = newLabels.filter(
      newLabel => !promptLabels.some(existing => existing.name === newLabel.name)
    );

    setPromptLabels(prev => [...prev, ...uniqueLabels]);
    setPromptInput('');
  }, [promptInput, promptLabels]);

  const removePromptLabel = useCallback((id: string) => {
    setPromptLabels(prev => prev.filter(l => l.id !== id));
  }, []);

  const updateLabelThreshold = useCallback((id: string, threshold: number) => {
    setPromptLabels(prev => prev.map(l =>
      l.id === id ? { ...l, threshold } : l
    ));
  }, []);

  const updateLabelColor = useCallback((id: string, color: string) => {
    setPromptLabels(prev => prev.map(l =>
      l.id === id ? { ...l, color } : l
    ));
  }, []);

  const runInference = useCallback(async () => {
    const uploadedAssets = uploadedFiles.filter(f => f.status === 'uploaded' && f.asset);
    if (uploadedAssets.length === 0 || promptLabels.length === 0) return;

    setIsProcessing(true);
    setError(null);

    try {
      // Check model status first
      const status = await inference.getModelStatus();
      setModelStatus(status);

      // Check if model is downloaded
      if (!status.downloaded) {
        setError('Model not downloaded. Please download the SAM3 model first from Settings.');
        setShowSettings(true);
        setIsProcessing(false);
        return;
      }

      // Load SAM3 model if not loaded
      if (!status.model_loaded) {
        await inference.loadModel('sam3');
      }

      const results: AnnotatedAsset[] = [];

      for (const file of uploadedAssets) {
        if (!file.asset) continue;

        try {
          // Get asset URL
          const { url } = await assetsApi.getUrl(file.asset.id);

          // Run inference
          const response = await inference.inferWithText({
            image_base64: undefined,
            image_url: url,
            prompts: promptLabels.filter(l => l.enabled).map(l => l.name),
            confidence_threshold: Math.min(...promptLabels.map(l => l.threshold)),
            return_masks: true,
            return_boxes: true
          });

          results.push({
            asset: file.asset,
            detections: response.detections,
            imageUrl: url
          });
        } catch (err) {
          console.error(`Failed to process asset ${file.asset.id}:`, err);
        }
      }

      setAnnotatedAssets(results);
      setStep('review');
    } catch (err: any) {
      setError(err.message || 'Inference failed');
    } finally {
      setIsProcessing(false);
    }
  }, [uploadedFiles, promptLabels]);

  // ================================
  // Review Step Handlers
  // ================================
  const handleAddDetection = useCallback((box: number[], className: string) => {
    setAnnotatedAssets(prev => prev.map((aa, i) => {
      if (i !== selectedAssetIndex) return aa;
      return {
        ...aa,
        detections: [...aa.detections, { class_name: className, confidence: 1.0, box }]
      };
    }));
  }, [selectedAssetIndex]);

  const handleUpdateDetection = useCallback((detIndex: number, box: number[]) => {
    setAnnotatedAssets(prev => prev.map((aa, i) => {
      if (i !== selectedAssetIndex) return aa;
      const newDetections = [...aa.detections];
      newDetections[detIndex] = { ...newDetections[detIndex], box };
      return { ...aa, detections: newDetections };
    }));
  }, [selectedAssetIndex]);

  const handleDeleteDetection = useCallback((detIndex: number) => {
    setAnnotatedAssets(prev => prev.map((aa, i) => {
      if (i !== selectedAssetIndex) return aa;
      return {
        ...aa,
        detections: aa.detections.filter((_, idx) => idx !== detIndex)
      };
    }));
    setSelectedDetectionIndex(null);
  }, [selectedAssetIndex]);

  const saveAnnotationsToBackend = useCallback(async () => {
    setIsProcessing(true);
    try {
      for (const aa of annotatedAssets) {
        // First delete existing annotations for this asset (if we were re-running)
        const existing = await annotationsApi.getAll(aa.asset.id);
        for (const ann of existing) {
          await annotationsApi.delete(ann.id);
        }

        // Create new ones
        for (const det of aa.detections) {
          // Match class name to project classes
          const classDef = classes.find(c => c.name.toLowerCase() === det.class_name.toLowerCase())
            || promptLabels.find(l => l.name.toLowerCase() === det.class_name.toLowerCase());

          if (!classDef) continue;

          await annotationsApi.create(aa.asset.id, {
            classId: classDef.id,
            box: det.box,
            type: det.mask_rle ? 'mask' : 'box',
            geometryRle: det.mask_rle,
            confidence: det.confidence
          });
        }
      }
    } catch (err) {
      console.error('Failed to save annotations:', err);
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, [annotatedAssets, classes, promptLabels]);

  const handleExportTrigger = useCallback(async (format: ExportFormat) => {
    try {
      const { jobId } = await exportApi.create(dataset.id, format);
      // We could wait for completion here, but let's just let the user know it started
      // Or we can open the download URL once it's finished
      alert(`Export job ${jobId} started for format ${format}. Click OK to monitor status.`);
      window.open(`/exports/${jobId}/status`, '_blank');
    } catch (err) {
      alert('Export failed');
    }
  }, [dataset.id]);

  // ================================
  // Navigation
  // ================================
  const canProceed = (): boolean => {
    switch (step) {
      case 'upload':
        return uploadedFiles.some(f => f.status === 'uploaded');
      case 'prompt':
        return promptLabels.length > 0;
      case 'review':
        return annotatedAssets.length > 0;
      default:
        return true;
    }
  };

  const handleNext = useCallback(async () => {
    if (step === 'upload') {
      setStep('prompt');
    } else if (step === 'prompt') {
      runInference();
    } else if (step === 'review') {
      try {
        await saveAnnotationsToBackend();
        setStep('export');
      } catch (err) {
        setError('Failed to save annotations');
      }
    } else if (step === 'export') {
      onComplete();
    }
  }, [step, runInference, saveAnnotationsToBackend, onComplete]);

  const handleBack = useCallback(() => {
    if (step === 'prompt') {
      setStep('upload');
    } else if (step === 'review') {
      setStep('prompt');
    } else if (step === 'export') {
      setStep('review');
    } else {
      onBack();
    }
  }, [step, onBack]);

  // ================================
  // Render Upload Step
  // ================================
  const renderUploadStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">Upload Your Media</h2>
        <p className="mt-2 text-gray-600">
          Drop images or videos to start annotating. We'll analyze them with SAM3.
        </p>
      </div>

      {/* Drop Zone */}
      <div
        className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-indigo-400 transition-colors cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-indigo-500', 'bg-indigo-50'); }}
        onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-indigo-500', 'bg-indigo-50'); }}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.classList.remove('border-indigo-500', 'bg-indigo-50');
          handleFileSelect(e.dataTransfer.files);
        }}
      >
        <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-lg font-medium text-gray-900">
          Drop files here or click to browse
        </p>
        <p className="mt-1 text-sm text-gray-500">
          Supports JPG, PNG, MP4, and MOV files
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files)}
        />
      </div>

      {/* File List */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">
              Files ({uploadedFiles.length})
            </h3>
            <button
              onClick={handleUploadAll}
              disabled={!uploadedFiles.some(f => f.status === 'pending')}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload All
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {uploadedFiles.map((file) => (
              <div
                key={file.id}
                className="relative group rounded-lg overflow-hidden bg-gray-100 aspect-square"
              >
                <img
                  src={file.preview}
                  alt={file.file.name}
                  className="w-full h-full object-cover"
                />

                {/* Status Overlay */}
                {file.status === 'uploading' && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <div className="text-center text-white">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                      <span className="text-sm mt-1">{file.progress}%</span>
                    </div>
                  </div>
                )}

                {file.status === 'uploaded' && (
                  <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1">
                    <Check className="w-3 h-3" />
                  </div>
                )}

                {file.status === 'error' && (
                  <div className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1">
                    <AlertCircle className="w-3 h-3" />
                  </div>
                )}

                {/* Remove Button */}
                <button
                  onClick={() => removeFile(file.id)}
                  className="absolute top-2 left-2 bg-black/50 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // ================================
  // Render Prompt Step
  // ================================
  const renderPromptStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">What are you looking for?</h2>
        <p className="mt-2 text-gray-600">
          Enter the objects you want to detect. SAM3 will find them for you.
        </p>
      </div>

      {/* Model Status Warning */}
      {modelStatus && !modelStatus.downloaded && (
        <div className="max-w-2xl mx-auto p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center space-x-3">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
          <div className="flex-1">
            <span className="text-amber-800 font-medium">Model not downloaded</span>
            <p className="text-sm text-amber-700">You need to download the SAM3 model before running inference.</p>
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 flex items-center gap-2"
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </div>
      )}

      {/* Inference Health */}
      {modelStatus && modelStatus.downloaded && (
        <div className="flex items-center justify-center space-x-4 p-4 bg-gray-50 rounded-lg">
          <Cpu className="w-5 h-5 text-gray-600" />
          <span className={`text-sm font-medium ${modelStatus.cuda_available ? 'text-green-600' : 'text-gray-600'}`}>
            {modelStatus.cuda_available ? 'GPU Ready' : 'CPU Mode'}
          </span>
          <span className={`text-sm ${modelStatus.model_loaded ? 'text-green-600' : 'text-yellow-600'}`}>
            {modelStatus.model_loaded ? 'SAM3 Loaded' : 'SAM3 Not Loaded'}
          </span>
        </div>
      )}

      {/* Prompt Input */}
      <div className="max-w-2xl mx-auto">
        <div className="flex space-x-2">
          <input
            type="text"
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addPromptLabel()}
            placeholder="Enter objects: person, car, dog..."
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <button
            onClick={addPromptLabel}
            disabled={!promptInput.trim()}
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add
          </button>
        </div>

        {/* Suggested Labels */}
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="text-sm text-gray-500">Try:</span>
          {['person', 'car', 'dog', 'cat', 'bottle'].map((label) => (
            <button
              key={label}
              onClick={() => {
                // Add the label directly instead of setting input and calling addPromptLabel
                // This avoids the React async state update issue
                const existingLabel = promptLabels.find(l => l.name === label.toLowerCase());
                if (existingLabel) return; // Don't add duplicates
                
                const newLabel: PromptLabel = {
                  id: `${Date.now()}-suggested`,
                  name: label.toLowerCase(),
                  color: generateColor(promptLabels.length),
                  threshold: 0.5,
                  enabled: true
                };
                setPromptLabels(prev => [...prev, newLabel]);
              }}
              className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Active Labels */}
      {promptLabels.length > 0 && (
        <div className="max-w-2xl mx-auto space-y-3">
          <h3 className="text-lg font-medium text-gray-900">Objects to Find</h3>
          {promptLabels.map((label) => (
            <div
              key={label.id}
              className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg"
            >
              <div className="flex items-center space-x-3">
                {/* Color picker */}
                <input
                  type="color"
                  value={label.color}
                  onChange={(e) => updateLabelColor(label.id, e.target.value)}
                  className="w-6 h-6 rounded-full cursor-pointer border-2 border-gray-300 hover:border-gray-400"
                  title="Click to change color"
                />
                <span className="font-medium text-gray-900">{label.name}</span>
              </div>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-500">Threshold:</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={label.threshold}
                    onChange={(e) => updateLabelThreshold(label.id, parseFloat(e.target.value))}
                    className="w-24"
                  />
                  <span className="text-sm font-mono text-gray-700 w-10">
                    {label.threshold.toFixed(2)}
                  </span>
                </div>
                <button
                  onClick={() => removePromptLabel(label.id)}
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="max-w-2xl mx-auto p-4 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <span className="text-red-700">{error}</span>
        </div>
      )}
    </div>
  );

  // ================================
  // Render Review Step
  // ================================
  const renderReviewStep = () => {
    const currentAsset = annotatedAssets[selectedAssetIndex];

    // Filter detections by threshold
    const filteredDetections = currentAsset?.detections.filter(det => {
      const label = promptLabels.find(l => l.name === det.class_name);
      return label ? det.confidence >= label.threshold : true;
    }) || [];

    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">Review Detections</h2>
          <p className="mt-2 text-gray-600">
            Adjust thresholds to fine-tune which objects are detected.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Image Preview */}
          <div className="lg:col-span-3">
            {currentAsset && (
              <div className="bg-gray-900 rounded-xl overflow-hidden aspect-video relative">
                <AnnotationCanvas
                  imageUrl={currentAsset.imageUrl}
                  detections={currentAsset.detections}
                  selectedDetectionIndex={selectedDetectionIndex}
                  onSelectDetection={setSelectedDetectionIndex}
                  onAddDetection={handleAddDetection}
                  onUpdateDetection={handleUpdateDetection}
                  onDeleteDetection={handleDeleteDetection}
                  activeClass={promptLabels.find(l => l.enabled)?.name || 'object'}
                  labelColors={new Map(promptLabels.map(l => [l.name, l.color]))}
                />
              </div>
            )}

            {/* Image Navigation */}
            {annotatedAssets.length > 1 && (
              <div className="flex items-center justify-center space-x-4 mt-4">
                <button
                  onClick={() => setSelectedAssetIndex(i => Math.max(0, i - 1))}
                  disabled={selectedAssetIndex === 0}
                  className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-sm text-gray-600">
                  {selectedAssetIndex + 1} / {annotatedAssets.length}
                </span>
                <button
                  onClick={() => setSelectedAssetIndex(i => Math.min(annotatedAssets.length - 1, i + 1))}
                  disabled={selectedAssetIndex === annotatedAssets.length - 1}
                  className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900">Adjust Thresholds</h3>

            {promptLabels.map((label) => {
              const count = filteredDetections.filter(d => d.class_name === label.name).length;
              return (
                <div key={label.id} className="p-4 bg-white border border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: label.color }}
                      />
                      <span className="font-medium">{label.name}</span>
                    </div>
                    <span className="text-sm text-gray-500">{count} found</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={label.threshold}
                    onChange={(e) => updateLabelThreshold(label.id, parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <div className="text-right text-sm text-gray-500">
                    {(label.threshold * 100).toFixed(0)}%
                  </div>
                </div>
              );
            })}

            <button
              onClick={() => setStep('prompt')}
              className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Re-run with New Prompts
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ================================
  // Render Export Step
  // ================================
  const renderExportStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">Export Your Annotations</h2>
        <p className="mt-2 text-gray-600">
          Download your annotated dataset in your preferred format.
        </p>
      </div>

      <div className="max-w-2xl mx-auto">
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <Check className="w-12 h-12 text-green-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-green-900">Annotations Complete!</h3>
          <p className="mt-2 text-green-700">
            {annotatedAssets.length} images annotated with {promptLabels.length} object classes.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4">
          {[
            { id: 'coco', name: 'COCO JSON', desc: 'Standard COCO format' },
            { id: 'yolo_detect', name: 'YOLO', desc: 'For YOLO training' },
            { id: 'voc', name: 'Pascal VOC', desc: 'XML format' },
            { id: 'labelme', name: 'LabelMe', desc: 'JSON polygons' },
          ].map((format) => (
            <button
              key={format.id}
              onClick={() => handleExportTrigger(format.id as any)}
              className="p-4 border border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors text-left"
            >
              <div className="font-medium text-gray-900">{format.name}</div>
              <div className="text-sm text-gray-500">{format.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // ================================
  // Main Render
  // ================================
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          onClose={() => {
            setShowSettings(false);
            // Refresh model status when settings close
            inference.getModelStatus().then(setModelStatus).catch(console.error);
          }}
        />
      )}

      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <button
                onClick={handleBack}
                className="flex items-center text-gray-600 hover:text-gray-900 mr-4"
              >
                <ChevronLeft className="w-5 h-5 mr-1" />
                Back
              </button>
              <h1 className="text-xl font-semibold text-gray-900">
                {dataset.name} - Annotation
              </h1>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <StepIndicator currentStep={step} />

        {step === 'upload' && renderUploadStep()}
        {step === 'prompt' && renderPromptStep()}
        {step === 'review' && renderReviewStep()}
        {step === 'export' && renderExportStep()}

        {/* Navigation Buttons */}
        <div className="mt-8 flex justify-between">
          <button
            onClick={handleBack}
            className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Back
          </button>
          <button
            onClick={handleNext}
            disabled={!canProceed() || isProcessing}
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : step === 'prompt' ? (
              <>
                <Search className="w-4 h-4 mr-2" />
                Find Objects
              </>
            ) : step === 'export' ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                Done
              </>
            ) : (
              <>
                Continue
                <ChevronRight className="w-4 h-4 ml-2" />
              </>
            )}
          </button>
        </div>
      </main>
    </div>
  );
}
