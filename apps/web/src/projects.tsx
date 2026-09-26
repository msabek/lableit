import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { projects, classes as classesApi, assets as assetsApi, Project, ClassDef, Asset, subscribeToServiceStatus, ServiceStatus, getProjectAssetCount } from './api';
import SettingsModal from './components/SettingsModal';
import { ThemeDropdown } from './components/ThemeToggle';
import ServiceStatusIndicator from './components/ServiceStatusIndicator';
import { useSettings } from './contexts/SettingsContext';
import { useUploader } from './hooks/useUploader';
import VideoSliceDialog from './components/VideoSliceDialog';
import ProjectCreateWizard from './components/ProjectCreateWizard';
import { DragDropOverlay } from './components/ui/DragDropOverlay';
import {
  Plus, FolderOpen, Tag, Settings, Search, Grid, List,
  Trash2, Edit3, X, Check, ChevronRight, Image, Film, Download, Upload,
  AlertCircle, Loader2, MoreHorizontal, Palette, ArrowLeft, RefreshCw
} from 'lucide-react';
import Logo from './components/Logo';

// Asset Preview Thumbnail with lazy URL loading
function AssetPreviewThumbnail({ asset, size = 'md' }: { asset: Asset; size?: 'sm' | 'md' | 'lg' }) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadUrl = async () => {
      try {
        const { url, thumbnailUrl: thumbUrl } = await assetsApi.getUrl(asset.id);
        if (!cancelled) {
          // Prefer thumbnail URL if available for grid display
          setThumbnailUrl(thumbUrl || url);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    };
    loadUrl();
    return () => { cancelled = true; };
  }, [asset.id]);

  const sizeClasses = {
    sm: 'w-16 h-16',
    md: 'w-24 h-24',
    lg: 'w-32 h-32'
  };

  return (
    <div className={`${sizeClasses[size]} rounded-xl glass-panel flex items-center justify-center overflow-hidden flex-shrink-0 group`}>
      {loading ? (
        <div className="skeleton w-full h-full" />
      ) : error || !thumbnailUrl ? (
        <div className="flex flex-col items-center gap-1">
          <Image className="w-6 h-6 text-text-muted opacity-50" />
        </div>
      ) : (
        <img
          src={thumbnailUrl}
          alt=""
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          onError={() => setError(true)}
        />
      )}
    </div>
  );
}

// Expanded Asset Grid for project detail view
function ExpandedAssetGrid({ assets, onAssetClick }: { assets: Asset[]; onAssetClick?: () => void }) {
  if (!assets || assets.length === 0) {
    return (
      <div className="glass-card rounded-xl text-center py-10 text-text-muted">
        <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 flex items-center justify-center">
          <Image className="w-8 h-8 text-indigo-400/50" />
        </div>
        <p className="text-sm font-medium">No assets uploaded yet</p>
        <p className="text-xs mt-1 text-text-muted">Start labeling to upload images</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
      {assets.map(asset => (
        <div 
          key={asset.id} 
          onClick={onAssetClick}
          className="cursor-pointer rounded-xl overflow-hidden transition-all duration-200 hover:ring-2 hover:ring-primary hover:ring-offset-2 hover:ring-offset-transparent hover:-translate-y-1 hover:shadow-glow"
        >
          <AssetPreviewThumbnail asset={asset} size="lg" />
        </div>
      ))}
    </div>
  );
}

// Color palette for new classes
const CLASS_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#F8B500', '#00CED1', '#FF6347', '#32CD32', '#FFD700'
];

interface ClassEditorProps {
  classDef?: ClassDef;
  projectId: string;
  onSave: (classDef: ClassDef) => void;
  onCancel: () => void;
}

function ClassEditor({ classDef, projectId, onSave, onCancel }: ClassEditorProps) {
  const [name, setName] = useState(classDef?.name || '');
  const [color, setColor] = useState(classDef?.color || CLASS_COLORS[Math.floor(Math.random() * CLASS_COLORS.length)]);
  const [threshold, setThreshold] = useState(classDef?.threshold || 0.5);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (classDef?.id) {
        const updated = await classesApi.update(classDef.id, { name, color, threshold });
        onSave(updated);
      } else {
        const created = await classesApi.create(projectId, name, color, threshold);
        onSave(created);
      }
    } catch (err) {
      console.error('Failed to save class:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 bg-surface-elevated rounded-lg border border-border">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-muted mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Class name"
            className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-text focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-muted mb-1">Color</label>
          <div className="flex flex-wrap gap-2">
            {CLASS_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${color === c ? 'border-text scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-8 h-8 rounded-full cursor-pointer"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-text-muted mb-1">
            Confidence Threshold: {(threshold * 100).toFixed(0)}%
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
            className="w-full"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-text-muted hover:text-text">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-4 py-2 bg-primary text-text-inverse rounded-lg hover:bg-primary-hover disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ProjectCardProps {
  project: Project;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  selected: boolean;
}

function ProjectCard({ project, onSelect, onDelete, selected }: ProjectCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const assetCount = getProjectAssetCount(project);
  const classCount = project.classes?.length || 0;

  return (
    <div
      onClick={() => onSelect(project.id)}
      className={`relative p-5 rounded-2xl cursor-pointer transition-all duration-300 glass-card group ${
        selected
          ? 'border-primary/50 shadow-glow-primary'
          : 'hover:border-primary/30'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-primary flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <FolderOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-text group-hover:text-primary transition-colors">{project.name}</h3>
            <p className="text-sm text-text-muted">
              {new Date(project.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
          className="p-1.5 rounded-lg hover:bg-white/10 dark:hover:bg-white/5 transition-colors"
        >
          <MoreHorizontal className="w-5 h-5 text-text-muted" />
        </button>
      </div>

      <div className="mt-4 flex gap-4 text-sm text-text-muted">
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 dark:bg-white/5">
          <Image className="w-4 h-4 text-indigo-400" /> {assetCount} assets
        </span>
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 dark:bg-white/5">
          <Tag className="w-4 h-4 text-purple-400" /> {classCount} classes
        </span>
      </div>

      {showMenu && (
        <div className="absolute right-2 top-14 z-10 glass-panel rounded-xl shadow-elevated py-1 min-w-[140px] animate-scale-in">
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(project.id); setShowMenu(false); }}
            className="w-full px-4 py-2.5 text-left text-red-400 hover:bg-red-500/10 flex items-center gap-2 transition-colors"
          >
            <Trash2 className="w-4 h-4" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

// Expanded Project Detail View Component
interface ProjectDetailViewProps {
  project: Project;
  onBack: () => void;
  onDelete: (id: string) => void;
  onClassSaved: (cls: ClassDef) => void;
  onClassDeleted: (classId: string) => void;
  onProjectUpdated: (project: Project) => void;
}

function ProjectDetailView({
  project,
  onBack,
  onDelete,
  onClassSaved,
  onClassDeleted,
  onProjectUpdated
}: ProjectDetailViewProps) {
  const navigate = useNavigate();
  const [showClassEditor, setShowClassEditor] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassDef | undefined>();
  const [clearingAnnotations, setClearingAnnotations] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Upload support - reuses same hook as labeling page
  const virtualDataset = { id: project.id, projectId: project.id, name: project.name, createdAt: project.createdAt, assets: project.assets || [] };
  const handleUploadComplete = useCallback(async () => {
    const updated = await projects.get(project.id);
    onProjectUpdated(updated);
  }, [project.id, onProjectUpdated]);
  const {
    files, uploading, uploadProgress,
    error: uploadError, setError: setUploadError,
    handleFileSelect, handleUpload,
    pendingVideoFile, showVideoSliceDialog, slicingVideo, slicingProgress,
    handleVideoSliceConfirm, handleVideoSliceCancel,
  } = useUploader(virtualDataset, handleUploadComplete);
  const handleFileDrop = useCallback((droppedFiles: FileList) => {
    handleFileSelect({ target: { files: droppedFiles } } as React.ChangeEvent<HTMLInputElement>);
  }, [handleFileSelect]);

  const handleDeleteClass = async (classId: string) => {
    if (!confirm('Delete this class?')) return;
    try {
      await classesApi.delete(classId);
      onClassDeleted(classId);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleClearAnnotations = async () => {
    if (!confirm('Are you sure you want to remove ALL annotations from ALL images in this project? This action cannot be undone.')) return;
    setClearingAnnotations(true);
    try {
      const result = await projects.clearAnnotations(project.id);
      setError(null);
      // Refresh project data
      const updated = await projects.get(project.id);
      onProjectUpdated(updated);
      alert(result.message);
    } catch (err: any) {
      setError(err.message || 'Failed to clear annotations');
    } finally {
      setClearingAnnotations(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-glass-border">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="icon-button-glass"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <FolderOpen className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text">{project.name}</h2>
            <p className="text-sm text-text-muted">
              Created {new Date(project.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/labeling/${project.id}`)}
            className="btn-primary-gradient flex items-center gap-2"
          >
            <Image className="w-4 h-4" /> Start Labeling
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-5 mt-5 p-4 glass-panel rounded-xl border-red-500/30 flex items-center gap-3 text-red-400 animate-slide-down">
          <div className="p-2 rounded-lg bg-red-500/10">
            <AlertCircle className="w-4 h-4" />
          </div>
          <span className="text-sm flex-1">{error}</span>
          <button onClick={() => setError(null)} className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stats Cards */}
        <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="stat-card rounded-xl p-4 hover-lift">
            <div className="relative">
              <div className="absolute top-0 left-0 right-0 h-[3px] -mt-4 rounded-t-xl bg-gradient-to-r from-indigo-500 to-blue-500" />
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500/20 to-blue-500/20 border border-indigo-500/20">
                <Image className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-text">{getProjectAssetCount(project)}</p>
                <p className="text-sm text-text-muted">Assets</p>
              </div>
            </div>
          </div>
          <div className="stat-card rounded-xl p-4 hover-lift">
            <div className="relative">
              <div className="absolute top-0 left-0 right-0 h-[3px] -mt-4 rounded-t-xl bg-gradient-to-r from-purple-500 to-pink-500" />
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/20">
                <Tag className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-text">{project.classes?.length || 0}</p>
                <p className="text-sm text-text-muted">Classes</p>
              </div>
            </div>
          </div>
          <div className="stat-card rounded-xl p-4 hover-lift">
            <div className="relative">
              <div className="absolute top-0 left-0 right-0 h-[3px] -mt-4 rounded-t-xl bg-gradient-to-r from-emerald-500 to-teal-500" />
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/20">
                <Check className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-text">
                  {project.assets?.filter(a => (a as any).annotations?.length > 0).length || 0}
                </p>
                <p className="text-sm text-text-muted">Labeled</p>
              </div>
            </div>
          </div>
        </div>

        {/* Classes Section */}
        <div className="lg:col-span-1">
          <div className="glass-panel rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-text flex items-center gap-2">
                <Tag className="w-4 h-4 text-purple-400" />
                Classes
              </h3>
              <div className="flex items-center gap-3">
                <label className="text-xs text-primary hover:text-primary-hover cursor-pointer flex items-center gap-1 transition-colors">
                  <Upload className="w-3 h-3" /> Import
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        try {
                          const result = await classesApi.importCsv(project.id, file);
                          if (result.errors?.length) {
                            setError(`Imported ${result.imported} classes. Errors: ${result.errors.join(', ')}`);
                          }
                          const updated = await projects.get(project.id);
                          onProjectUpdated(updated);
                        } catch (err: any) {
                          setError(err.message);
                        }
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
                <button
                  onClick={() => classesApi.exportCsv(project.id)}
                  className="text-xs text-primary hover:text-primary-hover flex items-center gap-1 transition-colors"
                >
                  <Download className="w-3 h-3" /> Export
                </button>
                <button
                  onClick={() => { setEditingClass(undefined); setShowClassEditor(true); }}
                  className="text-sm text-primary hover:text-primary-hover flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>
            </div>

            {showClassEditor && (
              <div className="mb-4">
                <ClassEditor
                  classDef={editingClass}
                  projectId={project.id}
                  onSave={(cls) => { onClassSaved(cls); setShowClassEditor(false); setEditingClass(undefined); }}
                  onCancel={() => { setShowClassEditor(false); setEditingClass(undefined); }}
                />
              </div>
            )}

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {project.classes?.map(cls => (
                <div key={cls.id} className="flex items-center gap-2 p-3 rounded-xl glass-button group">
                  <div 
                    className="w-4 h-4 rounded-full flex-shrink-0 ring-2 ring-white/20" 
                    style={{ backgroundColor: cls.color, boxShadow: `0 0 10px ${cls.color}40` }} 
                  />
                  <span className="flex-1 text-sm text-text truncate">{cls.name}</span>
                  <span className="text-xs text-text-muted bg-white/5 px-2 py-0.5 rounded-md">{(cls.threshold * 100).toFixed(0)}%</span>
                  <button
                    onClick={() => { setEditingClass(cls); setShowClassEditor(true); }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-text-muted hover:text-primary transition-all"
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleDeleteClass(cls.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-text-muted hover:text-red-400 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {(!project.classes || project.classes.length === 0) && (
                <div className="text-sm text-text-muted text-center py-6 rounded-xl bg-white/5">
                  <Tag className="w-6 h-6 mx-auto mb-2 opacity-50" />
                  No classes defined
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Assets Section */}
        <div className="lg:col-span-2">
          <div className="glass-panel rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3
                onClick={() => navigate(`/labeling/${project.id}`)}
                className="font-semibold text-text cursor-pointer hover:text-primary transition-colors flex items-center gap-2"
              >
                <Image className="w-4 h-4 text-indigo-400" />
                Assets ({getProjectAssetCount(project)})
                <span className="text-xs text-text-muted font-normal">Click to label</span>
              </h3>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-primary hover:text-primary-hover cursor-pointer rounded-xl hover:bg-primary/10 transition-all">
                  <Upload className="w-3.5 h-3.5" /> Upload
                  <input
                    type="file"
                    multiple
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </label>
                {project.assets && project.assets.length > 0 && (
                  <button
                    onClick={handleClearAnnotations}
                    disabled={clearingAnnotations}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all text-sm disabled:opacity-50"
                  >
                    {clearingAnnotations ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                    Clear All Annotations
                  </button>
                )}
              </div>
            </div>

            {/* Upload progress bar */}
            {uploading && (
              <div className="mb-4 p-3 glass-panel rounded-xl animate-slide-down">
                <div className="flex items-center gap-3 mb-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-sm text-text">Uploading... {uploadProgress}%</span>
                </div>
                <div className="w-full bg-surface rounded-full h-2 overflow-hidden">
                  <div
                    className="h-2 rounded-full transition-all duration-300 bg-gradient-to-r from-indigo-500 to-purple-500"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Upload error */}
            {uploadError && (
              <div className="mb-4 p-3 glass-panel rounded-xl border-red-500/30 flex items-center gap-2 text-red-400 text-sm animate-slide-down">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1">{uploadError}</span>
                <button onClick={() => setUploadError(null)} className="p-1 rounded hover:bg-red-500/10">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Files selected - upload button */}
            {files && !uploading && (
              <div className="mb-4 p-3 glass-panel rounded-xl flex items-center justify-between animate-slide-down">
                <span className="text-sm text-primary font-medium">{files.length} file(s) selected</span>
                <button
                  onClick={handleUpload}
                  className="btn-primary-gradient text-sm flex items-center gap-1.5 px-4 py-1.5"
                >
                  <Upload className="w-3.5 h-3.5" /> Upload Files
                </button>
              </div>
            )}

            {/* Asset grid or drop zone */}
            {(!project.assets || project.assets.length === 0) ? (
              <div
                className="glass-card rounded-xl text-center py-10 border-2 border-dashed border-glass-border hover:border-primary/50 transition-all hover:bg-primary/5 cursor-pointer"
                onClick={() => document.getElementById('project-file-upload')?.click()}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-primary', 'bg-primary/10'); }}
                onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-primary', 'bg-primary/10'); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('border-primary', 'bg-primary/10');
                  if (e.dataTransfer.files.length > 0) handleFileDrop(e.dataTransfer.files);
                }}
              >
                <input
                  id="project-file-upload"
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 flex items-center justify-center">
                  <Upload className="w-8 h-8 text-indigo-400/50" />
                </div>
                <p className="text-sm font-medium text-text">Drop images or videos here</p>
                <p className="text-xs mt-1 text-text-muted">or click to browse files</p>
              </div>
            ) : (
              <ExpandedAssetGrid
                assets={project.assets}
                onAssetClick={() => navigate(`/labeling/${project.id}`)}
              />
            )}
          </div>
        </div>

        {/* Actions Section */}
        <div className="lg:col-span-3">
          <div className="flex items-center justify-between pt-5 border-t border-glass-border">
            <button
              onClick={() => onDelete(project.id)}
              className="flex items-center gap-2 px-4 py-2.5 text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
            >
              <Trash2 className="w-4 h-4" /> Delete Project
            </button>
          </div>
        </div>
      </div>

      {/* Global drag-drop overlay */}
      <DragDropOverlay onFilesDropped={handleFileDrop} disabled={uploading} />

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
    </div>
  );
}

export default function Projects() {
  const navigate = useNavigate();
  const { effectiveTheme, colorTheme } = useSettings();

  const [projectsList, setProjectsList] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [retrying, setRetrying] = useState(false);

  // Track if we had a connection error and need to auto-retry
  const hadConnectionError = useRef(false);
  const lastApiStatus = useRef<'connected' | 'disconnected' | 'checking'>('checking');

  const loadProjects = useCallback(async (isAutoRetry = false) => {
    try {
      if (isAutoRetry) {
        setRetrying(true);
      } else {
        setLoading(true);
      }
      setError(null);
      console.log('[Projects] Loading projects...');
      const data = await projects.getAll();
      console.log('[Projects] Loaded', data.length, 'projects');
      setProjectsList(data);
      hadConnectionError.current = false; // Successfully loaded, clear the flag
    } catch (err: any) {
      console.error('[Projects] Failed to load:', err);
      // Use more descriptive error message for network errors
      const isNetworkError = err.code === 'ERR_NETWORK';
      const errorMsg = isNetworkError
        ? 'Cannot connect to server. Please ensure the API is running.'
        : err.response?.data?.error || err.message || 'Failed to load projects';
      setError(errorMsg);
      if (isNetworkError) {
        hadConnectionError.current = true; // Mark that we need to auto-retry
      }
    } finally {
      setLoading(false);
      setRetrying(false);
    }
  }, []);

  // Subscribe to service status and auto-retry when API comes online
  useEffect(() => {
    const unsubscribe = subscribeToServiceStatus((status: ServiceStatus) => {
      const wasDisconnected = lastApiStatus.current !== 'connected';
      const isNowConnected = status.api === 'connected';
      lastApiStatus.current = status.api;

      // Auto-retry if we had a connection error and API just came online
      if (wasDisconnected && isNowConnected && hadConnectionError.current) {
        console.log('[Projects] API reconnected, auto-retrying...');
        loadProjects(true);
      }
    });

    return unsubscribe;
  }, [loadProjects]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const filteredProjects = useMemo(() => {
    if (!searchQuery) return projectsList;
    const q = searchQuery.toLowerCase();
    return projectsList.filter(p => p.name.toLowerCase().includes(q));
  }, [projectsList, searchQuery]);

  const handleSelectProject = async (projectId: string) => {
    try {
      const project = await projects.get(projectId);
      setSelectedProject(project);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // The creation wizard owns project creation; this keeps the list/stats in sync
  // as the draft project is created and gains assets/classes.
  const handleWizardProjectChange = (project: Project) => {
    setProjectsList(prev =>
      prev.some(p => p.id === project.id)
        ? prev.map(p => (p.id === project.id ? project : p))
        : [project, ...prev]
    );
  };

  const handleDeleteProject = async (id: string) => {
    if (!confirm('Are you sure you want to delete this project?')) return;
    try {
      await projects.delete(id);
      setProjectsList(prev => prev.filter(p => p.id !== id));
      if (selectedProject?.id === id) setSelectedProject(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleClassSaved = (savedClass: ClassDef) => {
    if (selectedProject) {
      const exists = selectedProject.classes.find(c => c.id === savedClass.id);
      const updatedProject = {
        ...selectedProject,
        classes: exists
          ? selectedProject.classes.map(c => c.id === savedClass.id ? savedClass : c)
          : [...selectedProject.classes, savedClass]
      };
      setSelectedProject(updatedProject);
      setProjectsList(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
    }
  };

  const handleClassDeleted = (classId: string) => {
    if (selectedProject) {
      const updatedProject = {
        ...selectedProject,
        classes: selectedProject.classes.filter(c => c.id !== classId)
      };
      setSelectedProject(updatedProject);
      setProjectsList(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
    }
  };

  const handleProjectUpdated = (updatedProject: Project) => {
    setSelectedProject(updatedProject);
    setProjectsList(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
  };

  const totalAssets = projectsList.reduce((acc, p) => acc + getProjectAssetCount(p), 0);
  const totalClasses = projectsList.reduce((acc, p) => acc + (p.classes?.length || 0), 0);

  return (
    <div className="min-h-screen bg-[var(--color-background)] bg-mesh-gradient">
      {/* Header */}
      <header className="sticky top-0 z-40 glass-panel border-b border-glass-border">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => {
              setSelectedProject(null);
              navigate('/projects');
            }}
            className="flex items-center gap-3 rounded-xl hover:bg-primary/10 transition-colors p-1"
            title="Go to homepage"
          >
            <Logo size="md" />
            <div className="hidden md:flex items-center gap-2 badge-glass">
              <span className="status-dot status-dot-success" />
              <span className="text-xs text-text-muted">Workspace Live</span>
            </div>
          </button>

          <div className="flex items-center gap-3">
            <ServiceStatusIndicator />
            <ThemeDropdown />
            <button
              onClick={() => setShowSettings(true)}
              className="icon-button-glass"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6 relative z-[1]">
        {/* Show expanded project detail view when a project is selected */}
        {selectedProject ? (
          <ProjectDetailView
            project={selectedProject}
            onBack={() => setSelectedProject(null)}
            onDelete={handleDeleteProject}
            onClassSaved={handleClassSaved}
            onClassDeleted={handleClassDeleted}
            onProjectUpdated={handleProjectUpdated}
          />
        ) : (
          <>
            {/* Hero */}
            <div className="glass-card rounded-3xl p-6 sm:p-8 mb-6 overflow-hidden relative">
              <div className="absolute -top-20 -right-16 w-56 h-56 rounded-full opacity-40 blur-3xl" style={{ background: 'var(--gradient-primary)' }} />
              <div className="absolute -bottom-24 -left-20 w-64 h-64 rounded-full opacity-30 blur-3xl" style={{ background: 'var(--gradient-accent)' }} />
              <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-text-muted mb-2">Project Control Center</p>
                  <h1 className="text-2xl sm:text-3xl font-bold text-text mb-2">
                    Welcome to <span className="gradient-text">Lableit</span>
                  </h1>
                  <p className="text-sm sm:text-base text-text-muted max-w-2xl">
                    Build datasets faster with modern glass panels, stronger visual hierarchy, and global color themes.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:min-w-[280px]">
                  <div className="glass-panel rounded-2xl p-3">
                    <p className="text-xs text-text-muted mb-1">Theme Mode</p>
                    <p className="font-semibold text-text capitalize">{effectiveTheme}</p>
                  </div>
                  <div className="glass-panel rounded-2xl p-3">
                    <p className="text-xs text-text-muted mb-1">Color Style</p>
                    <p className="font-semibold text-text capitalize">{colorTheme}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {[
                {
                  key: 'projects',
                  label: 'Projects',
                  value: projectsList.length,
                  icon: FolderOpen,
                  iconWrap: 'from-primary/25 to-primary/10 border-primary/30',
                  iconColor: 'text-primary',
                  topBar: 'var(--gradient-primary)',
                },
                {
                  key: 'assets',
                  label: 'Total Assets',
                  value: totalAssets,
                  icon: Image,
                  iconWrap: 'from-emerald-500/25 to-cyan-500/10 border-emerald-500/30',
                  iconColor: 'text-emerald-400',
                  topBar: 'linear-gradient(90deg, #10b981 0%, #14b8a6 100%)',
                },
                {
                  key: 'classes',
                  label: 'Total Classes',
                  value: totalClasses,
                  icon: Tag,
                  iconWrap: 'from-fuchsia-500/25 to-violet-500/10 border-fuchsia-500/30',
                  iconColor: 'text-fuchsia-400',
                  topBar: 'linear-gradient(90deg, #d946ef 0%, #8b5cf6 100%)',
                },
              ].map((stat) => {
                const Icon = stat.icon;
                return (
                  <div key={stat.key} className="glass-card rounded-2xl overflow-hidden p-0 hover-lift">
                    <div className="h-1" style={{ background: stat.topBar }} />
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div className={`p-3 rounded-xl bg-gradient-to-br border ${stat.iconWrap}`}>
                          <Icon className={`w-5 h-5 ${stat.iconColor}`} />
                        </div>
                        <span className="badge-glass text-[10px] uppercase tracking-wide text-text-muted">{stat.label}</span>
                      </div>
                      <div className="flex items-end justify-between">
                        <p className="text-4xl font-extrabold leading-none text-text">{stat.value}</p>
                        <p className="text-sm text-text-muted">{stat.label}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {error && (
              <div className="mb-6 p-4 glass-panel rounded-xl border-red-500/30 flex items-center gap-3 text-red-400 animate-slide-down">
                <div className="p-2 rounded-lg bg-red-500/10">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <span className="flex-1">{error}</span>
                <button
                  onClick={() => loadProjects(true)}
                  disabled={retrying}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />
                  {retrying ? 'Retrying...' : 'Retry'}
                </button>
                <button onClick={() => setError(null)} className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Projects List Header */}
            <div className="glass-card rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-xl font-bold text-text">Projects</h2>
                <p className="text-xs text-text-muted mt-1">Manage assets, labels, and workflows from one place.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    type="text"
                    placeholder="Search projects..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-4 py-2.5 rounded-xl glass-input text-text w-48 focus:w-64 transition-all"
                  />
                </div>
                <div className="flex glass-panel rounded-xl overflow-hidden">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-2.5 transition-all ${viewMode === 'grid' ? 'bg-primary/20 text-primary' : 'text-text-muted hover:bg-white/5'}`}
                  >
                    <Grid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-2.5 transition-all ${viewMode === 'list' ? 'bg-primary/20 text-primary' : 'text-text-muted hover:bg-white/5'}`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
                <button
                  onClick={() => setShowNewProject(true)}
                  className="btn-primary-gradient flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> New Project
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-16">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-6 h-6 rounded-full bg-gradient-primary opacity-50 animate-pulse" />
                  </div>
                </div>
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="glass-card rounded-2xl text-center py-16 px-8">
                <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center">
                  <FolderOpen className="w-10 h-10 text-indigo-400" />
                </div>
                <p className="text-lg text-text mb-2">{searchQuery ? 'No projects match your search' : 'No projects yet'}</p>
                <p className="text-text-muted mb-6">Get started by creating your first labeling project</p>
                <button
                  onClick={() => setShowNewProject(true)}
                  className="btn-primary-gradient inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Create your first project
                </button>
              </div>
            ) : (
              <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5' : 'space-y-4'}>
                {filteredProjects.map(project => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    selected={false}
                    onSelect={handleSelectProject}
                    onDelete={handleDeleteProject}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* New Project Wizard (Media -> Classes -> Start) */}
      {showNewProject && (
        <ProjectCreateWizard
          onProjectChange={handleWizardProjectChange}
          onClose={() => setShowNewProject(false)}
        />
      )}

      {/* Settings Modal */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
