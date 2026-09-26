import React, { useState, useRef, useEffect } from 'react';
import { Zap, Sliders, Plus, Trash2, Loader2, Box, Layers, Grid3X3, Eye, RefreshCw } from 'lucide-react';
import { Project, ClassDef } from '../../api';

export type InferenceMode = 'boxes_only' | 'boxes_and_masks' | 'masks_only';

interface ControlPanelProps {
  model: string;
  setModel: (model: string) => void;
  availableModels: { id: string; name: string }[];
  interval: number;
  setIntervalValue: (val: number) => void;
  project: Project | null;
  onThresholdChange: (classId: string, val: number) => void;
  onColorChange?: (classId: string, color: string) => void;
  onAddClass?: (name: string, color: string, threshold: number) => Promise<void>;
  onDeleteClass?: (classId: string) => Promise<void>;
  hasVideoAssets?: boolean;
  // Inference mode
  inferenceMode?: InferenceMode;
  onInferenceModeChange?: (mode: InferenceMode) => void;
  // Mask opacity
  maskOpacity?: number;
  onMaskOpacityChange?: (opacity: number) => void;
  // Threshold refresh
  thresholdsChanged?: boolean;
  onRefreshWithNewThresholds?: () => void;
  isProcessing?: boolean;
}

// Predefined color palette
const COLOR_PALETTE = [
  '#FF6B6B', '#FF8E53', '#FFBE0B', '#8AC926', '#06D6A0',
  '#1982C4', '#6A4C93', '#E056FD', '#FF7979', '#4ECDC4',
  '#45B7D1', '#96CEB4', '#DDA0DD', '#98D8C8', '#F7DC6F',
  '#BB8FCE', '#85C1E9', '#F5B7B1', '#A9DFBF', '#D7BDE2'
];

// Color Picker Component
const ColorPicker: React.FC<{
  currentColor: string;
  onColorChange: (color: string) => void;
}> = ({ currentColor, onColorChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [customColor, setCustomColor] = useState(currentColor);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={pickerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-7 h-7 rounded-lg ring-2 ring-white/20 hover:ring-white/40 transition-all shadow-sm"
        style={{ backgroundColor: currentColor, boxShadow: `0 0 12px ${currentColor}40` }}
        title="Change color"
      />
      {isOpen && (
        <div className="absolute right-0 top-10 z-50 p-4 glass-card rounded-xl min-w-[220px] animate-scale-in">
          <div className="grid grid-cols-5 gap-2 mb-3">
            {COLOR_PALETTE.map((color) => (
              <button
                key={color}
                onClick={() => {
                  onColorChange(color);
                  setIsOpen(false);
                }}
                className={`w-7 h-7 rounded-lg transition-all hover:scale-110 ${
                  currentColor === color ? 'ring-2 ring-white/50 ring-offset-2 ring-offset-transparent' : ''
                }`}
                style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}30` }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 pt-3 border-t border-glass-border">
            <input
              type="color"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
              className="w-9 h-9 rounded-lg cursor-pointer"
            />
            <input
              type="text"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
              className="flex-1 px-3 py-1.5 text-xs glass-input rounded-lg font-mono text-text"
              placeholder="#RRGGBB"
            />
            <button
              onClick={() => {
                onColorChange(customColor);
                setIsOpen(false);
              }}
              className="px-3 py-1.5 text-xs bg-gradient-primary text-white rounded-lg hover:shadow-glow transition-all"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const INFERENCE_MODES: { id: InferenceMode; label: string; description: string; icon: React.ReactNode }[] = [
  { id: 'boxes_only', label: 'Boxes Only', description: 'Bounding boxes for object detection', icon: <Box className="w-4 h-4" /> },
  { id: 'boxes_and_masks', label: 'Boxes + Masks', description: 'Both bounding boxes and segmentation masks', icon: <Layers className="w-4 h-4" /> },
  { id: 'masks_only', label: 'Masks Only', description: 'Semantic segmentation masks only', icon: <Grid3X3 className="w-4 h-4" /> },
];

export const ControlPanel: React.FC<ControlPanelProps> = ({
  model,
  setModel,
  availableModels,
  interval,
  setIntervalValue,
  project,
  onThresholdChange,
  onColorChange,
  onAddClass,
  onDeleteClass,
  hasVideoAssets = false,
  inferenceMode = 'boxes_and_masks',
  onInferenceModeChange,
  maskOpacity = 30,
  onMaskOpacityChange,
  thresholdsChanged = false,
  onRefreshWithNewThresholds,
  isProcessing = false
}) => {
  const [newClassName, setNewClassName] = useState('');
  const [newClassColor, setNewClassColor] = useState(COLOR_PALETTE[0]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addingClass, setAddingClass] = useState(false);
  const [deletingClassId, setDeletingClassId] = useState<string | null>(null);

  const handleAddClass = async () => {
    if (!newClassName.trim() || !onAddClass) return;
    
    setAddingClass(true);
    try {
      await onAddClass(newClassName.trim(), newClassColor, 0.5);
      setNewClassName('');
      // Pick next color from palette
      const currentIndex = COLOR_PALETTE.indexOf(newClassColor);
      setNewClassColor(COLOR_PALETTE[(currentIndex + 1) % COLOR_PALETTE.length]);
      setShowAddForm(false);
    } catch (error) {
      console.error('Failed to add class:', error);
    } finally {
      setAddingClass(false);
    }
  };

  const handleDeleteClass = async (classId: string) => {
    if (!onDeleteClass) return;
    
    setDeletingClassId(classId);
    try {
      await onDeleteClass(classId);
    } catch (error) {
      console.error('Failed to delete class:', error);
    } finally {
      setDeletingClassId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Model Selection */}
      <div className="glass-card rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-text mb-4 flex items-center">
          <div className="p-2 rounded-lg bg-amber-500/20 mr-2">
            <Zap className="w-5 h-5 text-amber-400" />
          </div>
          Model Settings
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">SAM Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-4 py-3 glass-input rounded-xl text-text"
            >
              {availableModels.length > 0 ? (
                availableModels.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))
              ) : (
                <option value="sam3">SAM3 (Segment Anything 3)</option>
              )}
            </select>
          </div>

          {/* Only show video frame interval when there are video assets */}
          {hasVideoAssets && (
            <div>
              <label className="block text-sm font-medium text-text-muted mb-2">
                Video Frame Interval (seconds)
              </label>
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={interval}
                onChange={(e) => setIntervalValue(parseFloat(e.target.value))}
                className="w-full px-4 py-3 glass-input rounded-xl text-text"
              />
            </div>
          )}

          {/* Inference Mode Selection */}
          {onInferenceModeChange && (
            <div>
              <label className="block text-sm font-medium text-text-muted mb-2">
                Inference Mode
              </label>
              <div className="space-y-2">
                {INFERENCE_MODES.map((mode) => (
                  <label
                    key={mode.id}
                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
                      inferenceMode === mode.id
                        ? 'bg-primary/10 border border-primary/30 shadow-glow'
                        : 'glass-button hover:bg-white/5'
                    }`}
                  >
                    <input
                      type="radio"
                      name="inferenceMode"
                      value={mode.id}
                      checked={inferenceMode === mode.id}
                      onChange={() => onInferenceModeChange(mode.id)}
                      className="sr-only"
                    />
                    <div className={`p-1.5 rounded-lg ${
                      inferenceMode === mode.id ? 'bg-primary/20 text-primary' : 'bg-white/5 text-text-muted'
                    }`}>
                      {mode.icon}
                    </div>
                    <div className="flex-1">
                      <div className={`text-sm font-medium ${
                        inferenceMode === mode.id ? 'text-text' : 'text-text-muted'
                      }`}>
                        {mode.label}
                      </div>
                      <div className="text-xs text-text-muted">{mode.description}</div>
                    </div>
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      inferenceMode === mode.id
                        ? 'border-primary bg-primary'
                        : 'border-text-muted/30'
                    }`}>
                      {inferenceMode === mode.id && (
                        <div className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Mask Opacity Slider */}
          {onMaskOpacityChange && (inferenceMode === 'boxes_and_masks' || inferenceMode === 'masks_only') && (
            <div className="pt-4 border-t border-glass-border">
              <label className="flex items-center text-sm font-medium text-text-muted mb-3">
                <div className="p-1.5 rounded-lg bg-purple-500/20 mr-2">
                  <Eye className="w-4 h-4 text-purple-400" />
                </div>
                Mask Opacity
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={maskOpacity}
                  onChange={(e) => onMaskOpacityChange(parseInt(e.target.value))}
                  className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
                <span className="text-sm font-medium text-text w-12 text-right badge-glass px-2 py-1 rounded-lg">{maskOpacity}%</span>
              </div>
              <div className="flex justify-between text-xs text-text-muted mt-2">
                <span>Transparent</span>
                <span>Opaque</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Class Thresholds */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text flex items-center">
            <div className="p-2 rounded-lg bg-emerald-500/20 mr-2">
              <Sliders className="w-5 h-5 text-emerald-400" />
            </div>
            Class Thresholds
          </h2>
          {onAddClass && (
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Class
            </button>
          )}
        </div>

        {/* Add Class Form */}
        {showAddForm && onAddClass && (
          <div className="mb-4 p-4 glass-panel rounded-xl animate-slide-down">
            <div className="flex items-center gap-3 mb-3">
              <ColorPicker
                currentColor={newClassColor}
                onColorChange={setNewClassColor}
              />
              <input
                type="text"
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddClass()}
                placeholder="Class name (e.g., Dog, Car, Person)"
                className="flex-1 px-4 py-2.5 text-sm glass-input rounded-xl text-text"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowAddForm(false); setNewClassName(''); }}
                className="px-4 py-2 text-xs font-medium text-text-muted hover:bg-white/10 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddClass}
                disabled={!newClassName.trim() || addingClass}
                className="flex items-center gap-1 px-4 py-2 text-xs font-medium text-white bg-gradient-primary rounded-lg transition-all disabled:opacity-50 hover:shadow-glow"
              >
                {addingClass ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Plus className="w-3 h-3" />
                )}
                Add
              </button>
            </div>
          </div>
        )}

        {project?.classes.length === 0 && !showAddForm && (
          <div className="text-sm text-text-muted italic text-center py-4 glass-panel rounded-xl">
            <Sliders className="w-6 h-6 mx-auto mb-2 opacity-50" />
            No classes defined. Click "Add Class" to create one.
          </div>
        )}

        <div className="space-y-4">
          {project?.classes.map((cls) => (
            <div key={cls.id} className="space-y-3 glass-button rounded-xl p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {onColorChange ? (
                    <ColorPicker
                      currentColor={cls.color}
                      onColorChange={(color) => onColorChange(cls.id, color)}
                    />
                  ) : (
                    <span
                      className="w-4 h-4 rounded-full ring-2 ring-white/20"
                      style={{ backgroundColor: cls.color, boxShadow: `0 0 10px ${cls.color}40` }}
                    />
                  )}
                  <span className="text-sm font-medium text-text">{cls.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-text-muted badge-glass px-2 py-0.5 rounded-lg">{cls.threshold.toFixed(2)}</span>
                  {onDeleteClass && (
                    <button
                      onClick={() => handleDeleteClass(cls.id)}
                      disabled={deletingClassId === cls.id}
                      className="p-1.5 text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                      title="Delete class"
                    >
                      {deletingClassId === cls.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={cls.threshold}
                onChange={(e) => onThresholdChange(cls.id, parseFloat(e.target.value))}
                className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>
          ))}
        </div>

        {/* Refresh with new thresholds button */}
        {thresholdsChanged && onRefreshWithNewThresholds && (
          <div className="mt-4 pt-4 border-t border-glass-border animate-slide-up">
            <button
              onClick={onRefreshWithNewThresholds}
              disabled={isProcessing}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium text-white transition-all disabled:opacity-50 active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                boxShadow: '0 4px 15px -3px rgba(245, 158, 11, 0.4)'
              }}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Refresh with New Values
                </>
              )}
            </button>
            <p className="text-xs text-text-muted text-center mt-2">
              This will clear existing annotations and re-run inference with the updated thresholds
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
