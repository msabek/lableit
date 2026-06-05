import React, { useState, useEffect } from 'react';
import {
  Filter, ChevronDown, Plus, X, Check, Save,
  Star, Clock, Tag, Image, AlertCircle
} from 'lucide-react';

export interface FilterState {
  annotationStatus: 'all' | 'with_annotations' | 'without_annotations';
  classes: string[];
  dateRange: 'all' | 'today' | 'week' | 'month';
  confidenceMin: number;
  confidenceMax: number;
}

export interface FilterPreset {
  id: string;
  name: string;
  icon: string;
  filter: FilterState;
  isBuiltIn?: boolean;
}

const DEFAULT_FILTER: FilterState = {
  annotationStatus: 'all',
  classes: [],
  dateRange: 'all',
  confidenceMin: 0,
  confidenceMax: 1
};

const BUILT_IN_PRESETS: FilterPreset[] = [
  {
    id: 'all',
    name: 'All Assets',
    icon: 'image',
    filter: DEFAULT_FILTER,
    isBuiltIn: true
  },
  {
    id: 'unlabeled',
    name: 'Needs Labeling',
    icon: 'alert',
    filter: { ...DEFAULT_FILTER, annotationStatus: 'without_annotations' },
    isBuiltIn: true
  },
  {
    id: 'labeled',
    name: 'Already Labeled',
    icon: 'check',
    filter: { ...DEFAULT_FILTER, annotationStatus: 'with_annotations' },
    isBuiltIn: true
  },
  {
    id: 'recent',
    name: 'Added Today',
    icon: 'clock',
    filter: { ...DEFAULT_FILTER, dateRange: 'today' },
    isBuiltIn: true
  }
];

interface FilterPresetsProps {
  currentFilter: FilterState;
  onFilterChange: (filter: FilterState) => void;
  availableClasses: { id: string; name: string; color: string }[];
  projectId: string;
}

// Get icon component from string
const getIcon = (iconName: string) => {
  switch (iconName) {
    case 'image': return <Image className="w-4 h-4" />;
    case 'alert': return <AlertCircle className="w-4 h-4" />;
    case 'check': return <Check className="w-4 h-4" />;
    case 'clock': return <Clock className="w-4 h-4" />;
    case 'tag': return <Tag className="w-4 h-4" />;
    case 'star': return <Star className="w-4 h-4" />;
    default: return <Filter className="w-4 h-4" />;
  }
};

export const FilterPresets: React.FC<FilterPresetsProps> = ({
  currentFilter,
  onFilterChange,
  availableClasses,
  projectId
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [customPresets, setCustomPresets] = useState<FilterPreset[]>([]);

  // Load custom presets from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(`filterPresets-${projectId}`);
    if (stored) {
      try {
        setCustomPresets(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to load filter presets:', e);
      }
    }
  }, [projectId]);

  // Save custom presets to localStorage
  const savePresets = (presets: FilterPreset[]) => {
    setCustomPresets(presets);
    localStorage.setItem(`filterPresets-${projectId}`, JSON.stringify(presets));
  };

  const allPresets = [...BUILT_IN_PRESETS, ...customPresets];

  const handleSavePreset = () => {
    if (!newPresetName.trim()) return;

    const newPreset: FilterPreset = {
      id: `custom-${Date.now()}`,
      name: newPresetName.trim(),
      icon: 'star',
      filter: { ...currentFilter }
    };

    savePresets([...customPresets, newPreset]);
    setNewPresetName('');
    setShowSaveDialog(false);
  };

  const handleDeletePreset = (presetId: string) => {
    savePresets(customPresets.filter(p => p.id !== presetId));
  };

  const handleSelectPreset = (preset: FilterPreset) => {
    onFilterChange(preset.filter);
    setIsOpen(false);
  };

  // Check if current filter matches a preset
  const activePreset = allPresets.find(p =>
    JSON.stringify(p.filter) === JSON.stringify(currentFilter)
  );

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all ${
          isOpen || activePreset
            ? 'bg-primary/20 text-primary border border-primary/30'
            : 'glass-button'
        }`}
      >
        <Filter className="w-4 h-4" />
        <span className="text-sm font-medium">
          {activePreset?.name || 'Filter'}
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          <div className="absolute top-full left-0 mt-2 z-50 w-72 glass-card rounded-xl overflow-hidden shadow-2xl animate-scale-in">
            {/* Presets List */}
            <div className="p-2 space-y-1 max-h-64 overflow-y-auto">
              <div className="px-2 py-1 text-xs font-semibold text-text-muted uppercase tracking-wider">
                Quick Filters
              </div>

              {BUILT_IN_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => handleSelectPreset(preset)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                    activePreset?.id === preset.id
                      ? 'bg-primary/20 text-primary'
                      : 'hover:bg-surface-elevated text-text'
                  }`}
                >
                  {getIcon(preset.icon)}
                  <span className="text-sm flex-1 text-left">{preset.name}</span>
                  {activePreset?.id === preset.id && (
                    <Check className="w-4 h-4" />
                  )}
                </button>
              ))}

              {customPresets.length > 0 && (
                <>
                  <div className="px-2 py-1 mt-2 text-xs font-semibold text-text-muted uppercase tracking-wider">
                    Saved Filters
                  </div>
                  {customPresets.map(preset => (
                    <div
                      key={preset.id}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors group ${
                        activePreset?.id === preset.id
                          ? 'bg-primary/20 text-primary'
                          : 'hover:bg-surface-elevated text-text'
                      }`}
                    >
                      <button
                        onClick={() => handleSelectPreset(preset)}
                        className="flex items-center gap-3 flex-1"
                      >
                        <Star className="w-4 h-4 text-amber-400" />
                        <span className="text-sm flex-1 text-left">{preset.name}</span>
                      </button>
                      <button
                        onClick={() => handleDeletePreset(preset.id)}
                        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-red-400 transition-all"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Class Filter */}
            {availableClasses.length > 0 && (
              <div className="p-3 border-t border-glass-border">
                <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                  Filter by Class
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {availableClasses.map(cls => (
                    <button
                      key={cls.id}
                      onClick={() => {
                        const newClasses = currentFilter.classes.includes(cls.id)
                          ? currentFilter.classes.filter(c => c !== cls.id)
                          : [...currentFilter.classes, cls.id];
                        onFilterChange({ ...currentFilter, classes: newClasses });
                      }}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors ${
                        currentFilter.classes.includes(cls.id)
                          ? 'bg-primary/20 text-primary border border-primary/30'
                          : 'bg-surface-elevated text-text-muted hover:text-text'
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: cls.color }}
                      />
                      {cls.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Save Current Filter */}
            <div className="p-3 border-t border-glass-border bg-surface-elevated/50">
              {showSaveDialog ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    placeholder="Filter name..."
                    className="flex-1 px-3 py-1.5 text-sm rounded-lg bg-surface border border-border focus:ring-2 focus:ring-primary focus:border-transparent"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSavePreset();
                      if (e.key === 'Escape') setShowSaveDialog(false);
                    }}
                  />
                  <button
                    onClick={handleSavePreset}
                    disabled={!newPresetName.trim()}
                    className="p-1.5 rounded-lg bg-primary text-white hover:bg-primary-hover disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setShowSaveDialog(false)}
                    className="p-1.5 rounded-lg hover:bg-surface text-text-muted"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowSaveDialog(true)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border text-text-muted hover:text-text hover:border-primary/50 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  <span className="text-sm">Save Current Filter</span>
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default FilterPresets;
