import React, { useState, useEffect } from 'react';
import {
  X, ChevronLeft, ChevronRight, Download, Check,
  FileJson, FileText, FileCode, Image, AlertTriangle,
  Loader2, Eye, Package, CheckCircle
} from 'lucide-react';
import { ClassDef, exportApi, ExportFormat, ExportFormatInfo } from '../api';

// Icon mapping for formats
const getFormatIcon = (format: ExportFormat) => {
  if (format.includes('yolo')) return <FileCode className="w-6 h-6" />;
  if (format === 'voc') return <FileText className="w-6 h-6" />;
  if (format === 'png_masks') return <Image className="w-6 h-6" />;
  return <FileJson className="w-6 h-6" />;
};

// Color mapping for formats
const getFormatColor = (format: ExportFormat): string => {
  if (format === 'coco') return 'indigo';
  if (format.includes('yolo')) return 'amber';
  if (format === 'voc') return 'emerald';
  if (format === 'png_masks') return 'cyan';
  if (format === 'createml') return 'purple';
  if (format === 'labelme') return 'blue';
  return 'gray';
};

// Extension mapping
const getFormatExtension = (format: ExportFormat): string => {
  if (format.includes('yolo')) return '.txt';
  if (format === 'voc') return '.xml';
  if (format === 'png_masks') return '.png';
  return '.json';
};

interface ExportWizardProps {
  datasetId: string;
  datasetName: string;
  classes: ClassDef[];
  assetCount: number;
  annotationCount: number;
  labeledAssetCount?: number;
  onClose: () => void;
}

interface ValidationWarning {
  type: 'error' | 'warning';
  message: string;
}

export const ExportWizard: React.FC<ExportWizardProps> = ({
  datasetId,
  datasetName,
  classes,
  assetCount,
  annotationCount,
  labeledAssetCount,
  onClose
}) => {
  const [step, setStep] = useState(1);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat | null>(null);
  const [formats, setFormats] = useState<ExportFormatInfo[]>([]);
  const [loadingFormats, setLoadingFormats] = useState(true);
  const [includeImages, setIncludeImages] = useState(false);
  const [splitRatio, setSplitRatio] = useState({ train: 80, val: 20 });
  const [isExporting, setIsExporting] = useState(false);
  const [exportComplete, setExportComplete] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportMessage, setExportMessage] = useState('');
  const [previewData, setPreviewData] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<ValidationWarning[]>([]);

  // Load formats from API
  useEffect(() => {
    const loadFormats = async () => {
      try {
        const { formats: fetchedFormats } = await exportApi.getFormats();
        setFormats(fetchedFormats);
        if (fetchedFormats.length > 0) {
          setSelectedFormat(fetchedFormats[0].id);
        }
      } catch (error) {
        console.error('Failed to load export formats:', error);
        setWarnings(prev => [...prev, { 
          type: 'error', 
          message: 'Failed to load export formats. Please refresh the page.' 
        }]);
      } finally {
        setLoadingFormats(false);
      }
    };
    loadFormats();
  }, []);

  // Validate and generate warnings
  useEffect(() => {
    const newWarnings: ValidationWarning[] = [];

    if (annotationCount === 0) {
      newWarnings.push({
        type: 'error',
        message: 'No annotations to export. Run inference or add annotations first.'
      });
    }

    if (classes.length === 0) {
      newWarnings.push({
        type: 'warning',
        message: 'No classes defined. Annotations will use default class names.'
      });
    }

    const labeled = labeledAssetCount ?? 0;
    const assetsWithoutAnnotations = assetCount - labeled;
    if (assetsWithoutAnnotations > 0 && annotationCount > 0) {
      newWarnings.push({
        type: 'warning',
        message: `${assetsWithoutAnnotations} assets have no annotations and will be skipped.`
      });
    }

    setWarnings(newWarnings);
  }, [annotationCount, classes.length, assetCount, labeledAssetCount]);

  // Generate preview when format is selected
  useEffect(() => {
    if (selectedFormat && step === 2) {
      // Generate sample preview
      const sampleData = generatePreviewData(selectedFormat);
      setPreviewData(sampleData);
    }
  }, [selectedFormat, step]);

  const generatePreviewData = (format: ExportFormat): string => {
    const sampleClass = classes[0]?.name || 'object';

    switch (format) {
      case 'coco':
        return JSON.stringify({
          "images": [
            { "id": 1, "file_name": "image_001.jpg", "width": 1920, "height": 1080 }
          ],
          "annotations": [
            { "id": 1, "image_id": 1, "category_id": 1, "bbox": [100, 200, 150, 180], "area": 27000 }
          ],
          "categories": [
            { "id": 1, "name": sampleClass }
          ]
        }, null, 2);

      case 'yolo_detect':
      case 'yolo_segment':
        return `# YOLO format: class_id x_center y_center width height (normalized)\n0 0.5 0.5 0.1 0.15\n0 0.3 0.4 0.08 0.12`;

      case 'voc':
        return `<?xml version="1.0"?>
<annotation>
  <filename>image_001.jpg</filename>
  <size>
    <width>1920</width>
    <height>1080</height>
  </size>
  <object>
    <name>${sampleClass}</name>
    <bndbox>
      <xmin>100</xmin>
      <ymin>200</ymin>
      <xmax>250</xmax>
      <ymax>380</ymax>
    </bndbox>
  </object>
</annotation>`;

      case 'png_masks':
        return `# PNG Masks format\n# Each annotation saved as a separate PNG file\n# Mask pixels: white (255) = object, black (0) = background\n# Filename: image_001_annotation_0.png`;

      case 'createml':
        return JSON.stringify({
          "version": "1.0",
          "annotations": [
            {
              "image": "image_001.jpg",
              "annotations": [
                {
                  "label": sampleClass,
                  "coordinates": {
                    "x": 175,
                    "y": 290,
                    "width": 150,
                    "height": 180
                  }
                }
              ]
            }
          ]
        }, null, 2);

      case 'labelme':
        return JSON.stringify({
          "version": "5.0.1",
          "flags": {},
          "shapes": [
            {
              "label": sampleClass,
              "points": [[100, 200], [250, 200], [250, 380], [100, 380]],
              "group_id": null,
              "shape_type": "rectangle",
              "flags": {}
            }
          ],
          "imagePath": "image_001.jpg",
          "imageData": null,
          "imageHeight": 1080,
          "imageWidth": 1920
        }, null, 2);

      case 'tfrecord_meta':
        return JSON.stringify({
          "images": [
            {
              "filename": "image_001.jpg",
              "annotations": [
                { "class": sampleClass, "bbox": [100, 200, 250, 380], "confidence": 0.95 }
              ]
            }
          ]
        }, null, 2);

      default:
        return '';
    }
  };

  const handleExport = async () => {
    if (!selectedFormat) return;

    setIsExporting(true);
    setExportProgress(0);
    setExportMessage('Starting export...');

    try {
      const blob = await exportApi.download(
        datasetId,
        selectedFormat,
        (progress, message) => {
          setExportProgress(progress);
          setExportMessage(message);
        }
      );

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${datasetName}-${selectedFormat}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportComplete(true);
      setStep(4);
    } catch (error: any) {
      console.error('Export failed:', error);
      setWarnings(prev => [...prev, { type: 'error', message: error.message || 'Export failed. Please try again.' }]);
    } finally {
      setIsExporting(false);
    }
  };

  const estimatedSize = () => {
    const baseSize = annotationCount * 0.5; // ~0.5KB per annotation
    const imageSize = includeImages ? assetCount * 500 : 0; // ~500KB per image avg
    const total = baseSize + imageSize;

    if (total > 1000) {
      return `~${(total / 1000).toFixed(1)} MB`;
    }
    return `~${total.toFixed(0)} KB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative glass-card rounded-2xl w-full max-w-2xl overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-glass-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/20">
              <Download className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-text">Export Annotations</h2>
              <p className="text-sm text-text-muted">Step {step} of 3</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-elevated text-text-muted hover:text-text transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-5 py-3 bg-surface-elevated/50">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <React.Fragment key={s}>
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-all ${
                    s < step
                      ? 'bg-primary text-white'
                      : s === step
                      ? 'bg-primary/20 text-primary border-2 border-primary'
                      : 'bg-surface text-text-muted border-2 border-border'
                  }`}
                >
                  {s < step ? <Check className="w-4 h-4" /> : s}
                </div>
                {s < 3 && (
                  <div className={`flex-1 h-1 rounded ${s < step ? 'bg-primary' : 'bg-border'}`} />
                )}
              </React.Fragment>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-xs text-text-muted">
            <span>Format</span>
            <span>Preview</span>
            <span>Export</span>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 min-h-[300px]">
          {/* Step 1: Select Format */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-text mb-4">Choose export format</h3>
              {loadingFormats ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span className="ml-2 text-text-muted">Loading formats...</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {formats.map((format) => {
                    const color = getFormatColor(format.id);
                    const icon = getFormatIcon(format.id);
                    const extension = getFormatExtension(format.id);
                    return (
                      <button
                        key={format.id}
                        onClick={() => setSelectedFormat(format.id)}
                        className={`flex items-start gap-3 p-4 rounded-xl text-left transition-all ${
                          selectedFormat === format.id
                            ? 'bg-primary/20 border-2 border-primary'
                            : 'bg-surface-elevated hover:bg-surface border-2 border-transparent'
                        }`}
                      >
                        <div className={`p-2 rounded-lg bg-${color}-500/20 text-${color}-400`}>
                          {icon}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-text">{format.name}</div>
                          <div className="text-xs text-text-muted mt-0.5">{format.description}</div>
                          <div className="text-xs text-primary mt-1">{extension}</div>
                        </div>
                        {selectedFormat === format.id && (
                          <Check className="w-5 h-5 text-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-text">Preview</h3>
                <span className="text-sm text-text-muted">
                  {formats.find(f => f.id === selectedFormat)?.name || selectedFormat}
                </span>
              </div>

              {/* Warnings */}
              {warnings.length > 0 && (
                <div className="space-y-2">
                  {warnings.map((warning, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                        warning.type === 'error'
                          ? 'bg-red-500/10 text-red-400'
                          : 'bg-amber-500/10 text-amber-400'
                      }`}
                    >
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span className="text-sm">{warning.message}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Code Preview */}
              <div className="relative rounded-xl bg-gray-900 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
                  <span className="text-xs text-gray-400">Sample output</span>
                  <Eye className="w-4 h-4 text-gray-500" />
                </div>
                <pre className="p-4 text-sm text-gray-300 overflow-x-auto max-h-48">
                  <code>{previewData}</code>
                </pre>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-surface-elevated text-center">
                  <div className="text-2xl font-bold text-text">{assetCount}</div>
                  <div className="text-xs text-text-muted">Assets</div>
                </div>
                <div className="p-3 rounded-xl bg-surface-elevated text-center">
                  <div className="text-2xl font-bold text-text">{annotationCount}</div>
                  <div className="text-xs text-text-muted">Annotations</div>
                </div>
                <div className="p-3 rounded-xl bg-surface-elevated text-center">
                  <div className="text-2xl font-bold text-text">{classes.length}</div>
                  <div className="text-xs text-text-muted">Classes</div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Export Options */}
          {step === 3 && (
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-text">Export Options</h3>

              {/* Include Images Option */}
              <label className="flex items-center justify-between p-4 rounded-xl bg-surface-elevated cursor-pointer hover:bg-surface transition-colors">
                <div className="flex items-center gap-3">
                  <Image className="w-5 h-5 text-text-muted" />
                  <div>
                    <div className="font-medium text-text">Include images</div>
                    <div className="text-xs text-text-muted">Bundle original images with annotations</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={includeImages}
                  onChange={(e) => setIncludeImages(e.target.checked)}
                  className="w-5 h-5 rounded border-border text-primary focus:ring-primary"
                />
              </label>

              {/* Summary */}
              <div className="p-4 rounded-xl border border-dashed border-border">
                <div className="flex items-center gap-3 mb-3">
                  <Package className="w-5 h-5 text-primary" />
                  <span className="font-medium text-text">Export Summary</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-muted">Format</span>
                    <span className="text-text">{formats.find(f => f.id === selectedFormat)?.name || selectedFormat}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Annotations</span>
                    <span className="text-text">{annotationCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Estimated size</span>
                    <span className="text-text">{estimatedSize()}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Complete */}
          {step === 4 && exportComplete && (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mb-4">
                <CheckCircle className="w-8 h-8 text-success" />
              </div>
              <h3 className="text-xl font-semibold text-text mb-2">Export Complete!</h3>
              <p className="text-text-muted text-center mb-6">
                Your annotations have been exported successfully.
              </p>
              <button
                onClick={onClose}
                className="btn-primary-gradient"
              >
                Done
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {step < 4 && (
          <div className="flex items-center justify-between p-5 border-t border-glass-border bg-surface-elevated/50">
            <button
              onClick={() => step > 1 ? setStep(step - 1) : onClose()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-text-muted hover:text-text hover:bg-surface transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              {step > 1 ? 'Back' : 'Cancel'}
            </button>

            {step < 3 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={step === 1 && !selectedFormat}
                className="flex items-center gap-2 btn-primary-gradient disabled:opacity-50"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <div className="flex flex-col items-end gap-2">
                {isExporting && (
                  <div className="w-64">
                    <div className="flex justify-between text-xs text-text-muted mb-1">
                      <span>{exportMessage}</span>
                      <span>{exportProgress}%</span>
                    </div>
                    <div className="w-full h-2 bg-surface-elevated rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-primary to-purple-500 transition-all duration-300"
                        style={{ width: `${exportProgress}%` }}
                      />
                    </div>
                  </div>
                )}
                <button
                  onClick={handleExport}
                  disabled={isExporting || warnings.some(w => w.type === 'error')}
                  className="flex items-center gap-2 btn-primary-gradient disabled:opacity-50"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Exporting... {exportProgress}%
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Export Now
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ExportWizard;
