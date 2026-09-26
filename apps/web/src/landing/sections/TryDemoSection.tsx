import React, { useState, useRef, useCallback } from 'react';
import {
  Upload,
  Sparkles,
  X,
  Check,
  Loader2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  AlertCircle
} from 'lucide-react';

// Predefined classes users can select
const availableClasses = [
  { id: 'person', name: 'Person', color: '#ef4444' },
  { id: 'car', name: 'Car', color: '#3b82f6' },
  { id: 'dog', name: 'Dog', color: '#f59e0b' },
  { id: 'cat', name: 'Cat', color: '#8b5cf6' },
  { id: 'bicycle', name: 'Bicycle', color: '#10b981' },
  { id: 'motorcycle', name: 'Motorcycle', color: '#ec4899' },
  { id: 'bus', name: 'Bus', color: '#06b6d4' },
  { id: 'truck', name: 'Truck', color: '#84cc16' },
  { id: 'bird', name: 'Bird', color: '#f97316' },
  { id: 'horse', name: 'Horse', color: '#6366f1' },
  { id: 'boat', name: 'Boat', color: '#14b8a6' },
  { id: 'airplane', name: 'Airplane', color: '#a855f7' },
];

interface Detection {
  classId: string;
  className: string;
  confidence: number;
  box: [number, number, number, number]; // [x, y, width, height] as percentages
  color: string;
}

// Simulated detections for demo purposes
const generateSimulatedDetections = (selectedClasses: string[]): Detection[] => {
  const detections: Detection[] = [];
  const classData = availableClasses.filter(c => selectedClasses.includes(c.id));

  classData.forEach((cls, index) => {
    // Generate 1-2 random detections per class
    const count = Math.random() > 0.5 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const x = 10 + Math.random() * 60;
      const y = 10 + Math.random() * 50;
      const w = 15 + Math.random() * 25;
      const h = 20 + Math.random() * 30;

      detections.push({
        classId: cls.id,
        className: cls.name,
        confidence: 0.75 + Math.random() * 0.24,
        box: [x, y, w, h],
        color: cls.color,
      });
    }
  });

  return detections;
};

export default function TryDemoSection() {
  const [image, setImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [selectedClasses, setSelectedClasses] = useState<string[]>(['person', 'car']);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [showDetections, setShowDetections] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  }, []);

  const handleFile = (file: File) => {
    setError(null);

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (JPG, PNG, etc.)');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('Image size should be less than 10MB');
      return;
    }

    setImageFile(file);
    setDetections([]);
    setShowDetections(false);
    setZoom(1);

    const reader = new FileReader();
    reader.onload = (e) => {
      setImage(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const toggleClass = (classId: string) => {
    setSelectedClasses(prev =>
      prev.includes(classId)
        ? prev.filter(c => c !== classId)
        : [...prev, classId]
    );
  };

  const runInference = async () => {
    if (!image || selectedClasses.length === 0) return;

    setIsProcessing(true);
    setError(null);

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));

    // Generate simulated detections
    const newDetections = generateSimulatedDetections(selectedClasses);
    setDetections(newDetections);
    setShowDetections(true);
    setIsProcessing(false);
  };

  const resetDemo = () => {
    setImage(null);
    setImageFile(null);
    setDetections([]);
    setShowDetections(false);
    setZoom(1);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="max-w-6xl mx-auto w-full">
      {/* Section Header */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-sm mb-6">
          <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span className="text-indigo-700 dark:text-indigo-300 font-medium">Interface Preview</span>
        </div>
        <h2 className="animate-on-scroll heading-lg mb-4">
          <span className="text-slate-800 dark:text-white">Try It </span>
          <span className="gradient-text">Right Now</span>
        </h2>
        <p className="animate-on-scroll body-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          Get a feel for the workflow: upload an image and pick the objects to find.
          This preview draws <strong>example boxes at random</strong>; open Lableit to run the real SAM3 model on your images.
        </p>
      </div>

      <div className="animate-on-scroll glass-card rounded-3xl p-6 md:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Side - Image Upload & Preview */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-white">
                1. Upload Image
              </h3>
              {image && (
                <button
                  onClick={resetDemo}
                  className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 flex items-center gap-1"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset
                </button>
              )}
            </div>

            {/* Dropzone / Image Preview */}
            <div
              ref={canvasRef}
              className={`relative rounded-2xl overflow-hidden transition-all duration-300 ${
                image ? 'aspect-auto min-h-[300px]' : 'aspect-video'
              } ${isDragActive ? 'demo-dropzone drag-active' : 'demo-dropzone'}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => !image && fileInputRef.current?.click()}
            >
              {!image ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center mb-4">
                    <Upload className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 font-medium mb-2">
                    Drop an image here or click to browse
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Supports JPG, PNG, WebP (max 10MB)
                  </p>
                  <div className="flex gap-2 mt-4">
                    <span className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs">JPG</span>
                    <span className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs">PNG</span>
                    <span className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs">WebP</span>
                  </div>
                </div>
              ) : (
                <div className="relative w-full h-full min-h-[300px] bg-slate-100 dark:bg-slate-900 flex items-center justify-center">
                  {/* Image with zoom */}
                  <div
                    className="relative transition-transform duration-200"
                    style={{ transform: `scale(${zoom})` }}
                  >
                    <img
                      src={image}
                      alt="Uploaded"
                      className="max-w-full max-h-[400px] object-contain"
                    />

                    {/* Detection boxes overlay */}
                    {showDetections && detections.map((det, index) => (
                      <div
                        key={index}
                        className="absolute detection-box"
                        style={{
                          left: `${det.box[0]}%`,
                          top: `${det.box[1]}%`,
                          width: `${det.box[2]}%`,
                          height: `${det.box[3]}%`,
                          border: `3px solid ${det.color}`,
                          borderRadius: '4px',
                          boxShadow: `0 0 10px ${det.color}40`,
                        }}
                      >
                        <div
                          className="absolute -top-6 left-0 px-2 py-0.5 rounded text-xs font-medium text-white whitespace-nowrap"
                          style={{ backgroundColor: det.color }}
                        >
                          {det.className} {(det.confidence * 100).toFixed(0)}%
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Processing overlay */}
                  {isProcessing && (
                    <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm flex flex-col items-center justify-center">
                      <Loader2 className="w-10 h-10 text-white animate-spin mb-3" />
                      <p className="text-white font-medium">Preparing preview...</p>
                      <p className="text-white/60 text-sm mt-1">Example boxes only, not real detections</p>
                    </div>
                  )}

                  {/* Remove image button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); resetDemo(); }}
                    className="absolute top-3 right-3 p-2 rounded-full bg-slate-900/70 text-white hover:bg-slate-900/90 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>

                  {/* Zoom controls */}
                  <div className="absolute bottom-3 right-3 flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); setZoom(z => Math.max(0.5, z - 0.1)); }}
                      className="p-2 rounded-lg bg-slate-900/70 text-white hover:bg-slate-900/90"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <span className="text-white text-sm bg-slate-900/70 px-2 py-1 rounded">
                      {Math.round(zoom * 100)}%
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setZoom(z => Math.min(2, z + 0.1)); }}
                      className="p-2 rounded-lg bg-slate-900/70 text-white hover:bg-slate-900/90"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}
          </div>

          {/* Right Side - Class Selection & Run */}
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">
                2. Select Classes to Detect
              </h3>
              <div className="flex flex-wrap gap-2">
                {availableClasses.map((cls) => (
                  <button
                    key={cls.id}
                    onClick={() => toggleClass(cls.id)}
                    className={`class-chip flex items-center gap-2 ${
                      selectedClasses.includes(cls.id) ? 'selected' : ''
                    }`}
                    style={{
                      borderColor: selectedClasses.includes(cls.id) ? cls.color : undefined,
                      backgroundColor: selectedClasses.includes(cls.id) ? `${cls.color}15` : undefined,
                      color: selectedClasses.includes(cls.id) ? cls.color : undefined,
                    }}
                  >
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: cls.color }}
                    />
                    {cls.name}
                    {selectedClasses.includes(cls.id) && (
                      <Check className="w-4 h-4" />
                    )}
                  </button>
                ))}
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-3">
                Select one or more classes to detect in your image
              </p>
            </div>

            {/* Run Button */}
            <div>
              <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">
                3. Run Detection
              </h3>
              <button
                onClick={runInference}
                disabled={!image || selectedClasses.length === 0 || isProcessing}
                className={`w-full btn-primary-gradient text-lg py-4 flex items-center justify-center gap-3 ${
                  (!image || selectedClasses.length === 0 || isProcessing)
                    ? 'opacity-50 cursor-not-allowed'
                    : ''
                }`}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Detect Objects
                  </>
                )}
              </button>
              {!image && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 text-center">
                  Upload an image first to run detection
                </p>
              )}
              {image && selectedClasses.length === 0 && (
                <p className="text-sm text-amber-600 dark:text-amber-400 mt-2 text-center">
                  Select at least one class to detect
                </p>
              )}
            </div>

            {/* Results Summary */}
            {showDetections && detections.length > 0 && (
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
                    <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-emerald-800 dark:text-emerald-300">
                      Preview ready
                    </h4>
                    <p className="text-sm text-emerald-600 dark:text-emerald-400">
                      {detections.length} example box{detections.length !== 1 ? 'es' : ''}, placed at random
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  {Object.entries(
                    detections.reduce((acc, det) => {
                      acc[det.className] = (acc[det.className] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>)
                  ).map(([className, count]) => {
                    const cls = availableClasses.find(c => c.name === className);
                    return (
                      <div
                        key={className}
                        className="flex items-center justify-between p-2 rounded-lg bg-white/50 dark:bg-slate-800/50"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: cls?.color }}
                          />
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            {className}
                          </span>
                        </div>
                        <span className="text-sm text-slate-500 dark:text-slate-400">
                          {count} detected
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* CTA into the app */}
            {showDetections && (
              <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-200 dark:border-indigo-500/20">
                <p className="text-sm text-slate-700 dark:text-slate-300 mb-3">
                  <strong>Like what you see?</strong> Open Lableit to unlock:
                </p>
                <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1 mb-4">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500" />
                    Real SAM3 AI inference
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500" />
                    Batch processing for multiple images
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500" />
                    Export in 8 formats (COCO, YOLO, etc.)
                  </li>
                </ul>
                <a
                  href="/projects"
                  className="btn-primary-gradient w-full flex items-center justify-center gap-2"
                >
                  Open Lableit
                  <Sparkles className="w-4 h-4" />
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
