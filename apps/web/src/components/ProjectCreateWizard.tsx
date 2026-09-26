import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  projects, classes as classesApi, Project, ClassDef, Dataset,
  getProjectAssetCount,
} from '../api';
import { useUploader } from '../hooks/useUploader';
import VideoSliceDialog from './VideoSliceDialog';
import {
  X, Upload, Tag, Image as ImageIcon, Check, Plus, Trash2, Loader2,
  ArrowRight, ArrowLeft, FolderOpen, AlertCircle, Sparkles,
} from 'lucide-react';

const CLASS_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#F8B500', '#00CED1', '#FF6347', '#32CD32', '#FFD700',
];

type Step = 1 | 2 | 3;

interface ProjectCreateWizardProps {
  // Called whenever the draft project is created or its data changes, so the
  // parent list/stats stay in sync (project exists on the server once created).
  onProjectChange: (project: Project) => void;
  onClose: () => void;
}

const STEPS: { id: Step; label: string; icon: React.ReactNode }[] = [
  { id: 1, label: 'Media', icon: <Upload className="w-4 h-4" /> },
  { id: 2, label: 'Classes', icon: <Tag className="w-4 h-4" /> },
  { id: 3, label: 'Start', icon: <Sparkles className="w-4 h-4" /> },
];

export default function ProjectCreateWizard({ onProjectChange, onClose }: ProjectCreateWizardProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState('');
  const [project, setProject] = useState<Project | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Class adder state
  const [className, setClassName] = useState('');
  const [classColor, setClassColor] = useState(CLASS_COLORS[0]);
  const [addingClass, setAddingClass] = useState(false);

  const refreshProject = useCallback(async () => {
    if (!project) return;
    const updated = await projects.get(project.id);
    setProject(updated);
    onProjectChange(updated);
  }, [project, onProjectChange]);

  // Uploader reuses the labeling/detail upload path (images + video slicing).
  // It needs a real project id, so it is inert until the project is created.
  const virtualDataset = (project
    ? { id: project.id, projectId: project.id, name: project.name, createdAt: project.createdAt, assets: project.assets || [] }
    : null) as Dataset | null;
  const {
    files, uploading, uploadProgress,
    error: uploadError, setError: setUploadError,
    handleFileSelect, handleUpload,
    pendingVideoFile, showVideoSliceDialog, slicingVideo, slicingProgress,
    handleVideoSliceConfirm, handleVideoSliceCancel,
  } = useUploader(virtualDataset, refreshProject);

  const handleFileDrop = useCallback((dropped: FileList) => {
    handleFileSelect({ target: { files: dropped } } as React.ChangeEvent<HTMLInputElement>);
  }, [handleFileSelect]);

  // Explicit, user-triggered creation (not on blur) so we never spawn stray
  // projects when someone just tabs through the name field.
  const createProject = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const created = await projects.create(name.trim());
      setProject(created);
      onProjectChange(created);
    } catch (err: any) {
      setError(err?.message || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  const handleAddClass = async () => {
    if (!project || !className.trim() || addingClass) return;
    setAddingClass(true);
    setError(null);
    try {
      await classesApi.create(project.id, className.trim(), classColor, 0.5);
      setClassName('');
      setClassColor(CLASS_COLORS[Math.floor(Math.random() * CLASS_COLORS.length)]);
      await refreshProject();
    } catch (err: any) {
      setError(err?.message || 'Failed to add class');
    } finally {
      setAddingClass(false);
    }
  };

  const handleDeleteClass = async (classId: string) => {
    try {
      await classesApi.delete(classId);
      await refreshProject();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete class');
    }
  };

  const assetCount = project ? getProjectAssetCount(project) : 0;
  const classCount = project?.classes?.length || 0;

  const goNext = () => setStep((s) => (Math.min(3, s + 1) as Step));
  const goBack = () => setStep((s) => (Math.max(1, s - 1) as Step));

  const startLabeling = () => {
    if (!project) return;
    onClose();
    navigate(`/labeling/${project.id}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center glass-overlay animate-fade-in p-4">
      <div className="glass-card rounded-2xl shadow-elevated-lg w-full max-w-lg animate-scale-in flex flex-col max-h-[90vh]">
        {/* Header + stepper */}
        <div className="p-6 pb-4 border-b border-glass-border">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center">
                <FolderOpen className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-xl font-bold text-text">New Project</h3>
            </div>
            <button onClick={onClose} className="icon-button-glass" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Step indicator */}
          <div className="flex items-center justify-between px-2">
            {STEPS.map((s, i) => {
              const status = s.id === step ? 'current' : s.id < step ? 'done' : 'upcoming';
              return (
                <React.Fragment key={s.id}>
                  <div className="flex flex-col items-center gap-1.5">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 ${
                        status === 'done'
                          ? 'bg-gradient-primary text-white shadow-lg shadow-primary/30'
                          : status === 'current'
                          ? 'bg-primary/20 text-primary border-2 border-primary ring-4 ring-primary/20'
                          : 'bg-surface-elevated text-text-muted border-2 border-border'
                      }`}
                    >
                      {status === 'done' ? <Check className="w-4 h-4" /> : s.icon}
                    </div>
                    <span className={`text-xs font-medium ${status === 'current' ? 'text-primary' : status === 'done' ? 'text-text' : 'text-text-muted'}`}>
                      {s.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 -mt-5 ${s.id < step ? 'bg-primary' : 'bg-border'}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Body (scrolls) */}
        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 p-3 glass-panel rounded-xl border-red-500/30 flex items-center gap-2 text-red-400 text-sm animate-slide-down">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)} className="p-1 rounded hover:bg-red-500/10"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          {/* STEP 1: Name + media */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1.5">Project name</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Traffic cameras"
                    disabled={!!project}
                    autoFocus
                    className="flex-1 px-4 py-2.5 rounded-xl glass-input text-text disabled:opacity-60"
                    onKeyDown={(e) => { if (e.key === 'Enter' && !project) createProject(); }}
                  />
                  {!project && (
                    <button
                      onClick={createProject}
                      disabled={!name.trim() || creating}
                      className="btn-primary-gradient flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                    >
                      {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Create
                    </button>
                  )}
                </div>
                {project && (
                  <p className="mt-1.5 text-xs text-emerald-400 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Project created. Add images or videos below.
                  </p>
                )}
              </div>

              {/* Upload zone (enabled once the project exists) */}
              <div className={project ? '' : 'opacity-50 pointer-events-none'}>
                <label className="block text-sm font-medium text-text-muted mb-1.5">Media</label>

                {uploading && (
                  <div className="mb-3 p-3 glass-panel rounded-xl">
                    <div className="flex items-center gap-2 mb-2 text-sm text-text">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" /> Uploading... {uploadProgress}%
                    </div>
                    <div className="w-full bg-surface rounded-full h-2 overflow-hidden">
                      <div className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  </div>
                )}

                {uploadError && (
                  <div className="mb-3 p-3 glass-panel rounded-xl border-red-500/30 flex items-center gap-2 text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1">{uploadError}</span>
                    <button onClick={() => setUploadError(null)} className="p-1 rounded hover:bg-red-500/10"><X className="w-3.5 h-3.5" /></button>
                  </div>
                )}

                {files && !uploading && (
                  <div className="mb-3 p-3 glass-panel rounded-xl flex items-center justify-between">
                    <span className="text-sm text-primary font-medium">{files.length} file(s) selected</span>
                    <button onClick={handleUpload} className="btn-primary-gradient text-sm flex items-center gap-1.5 px-4 py-1.5">
                      <Upload className="w-3.5 h-3.5" /> Upload
                    </button>
                  </div>
                )}

                <div
                  className="glass-card rounded-xl text-center py-8 border-2 border-dashed border-glass-border hover:border-primary/50 transition-all hover:bg-primary/5 cursor-pointer"
                  onClick={() => document.getElementById('wizard-file-upload')?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-primary', 'bg-primary/10'); }}
                  onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-primary', 'bg-primary/10'); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove('border-primary', 'bg-primary/10');
                    if (e.dataTransfer.files.length > 0) handleFileDrop(e.dataTransfer.files);
                  }}
                >
                  <input
                    id="wizard-file-upload"
                    type="file"
                    multiple
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <div className="w-14 h-14 mx-auto mb-3 rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 flex items-center justify-center">
                    <Upload className="w-7 h-7 text-indigo-400/60" />
                  </div>
                  <p className="text-sm font-medium text-text">Drop images or videos here</p>
                  <p className="text-xs mt-1 text-text-muted">or click to browse · videos can be sliced into frames</p>
                </div>

                {project && assetCount > 0 && (
                  <p className="mt-3 text-sm text-text flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-indigo-400" />
                    <span className="font-semibold">{assetCount}</span> asset(s) added
                  </p>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: Classes */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-text-muted">Add the labels you want to detect. You can refine thresholds later in the project.</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  placeholder="Class name (e.g. car)"
                  className="flex-1 px-4 py-2.5 rounded-xl glass-input text-text"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddClass(); }}
                />
                <button
                  onClick={handleAddClass}
                  disabled={!className.trim() || addingClass}
                  className="btn-primary-gradient flex items-center gap-1.5 disabled:opacity-50"
                >
                  {addingClass ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {CLASS_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setClassColor(c)}
                    className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${classColor === c ? 'border-text scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                    aria-label={`Pick color ${c}`}
                  />
                ))}
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {project?.classes?.map((cls: ClassDef) => (
                  <div key={cls.id} className="flex items-center gap-2 p-3 rounded-xl glass-button group">
                    <div className="w-4 h-4 rounded-full flex-shrink-0 ring-2 ring-white/20" style={{ backgroundColor: cls.color }} />
                    <span className="flex-1 text-sm text-text truncate">{cls.name}</span>
                    <button onClick={() => handleDeleteClass(cls.id)} className="opacity-0 group-hover:opacity-100 p-1.5 text-text-muted hover:text-red-400 transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {classCount === 0 && (
                  <div className="text-sm text-text-muted text-center py-6 rounded-xl bg-white/5">
                    <Tag className="w-6 h-6 mx-auto mb-2 opacity-50" />
                    No classes yet
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: Review + start */}
          {step === 3 && (
            <div className="space-y-4 text-center py-2">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-primary flex items-center justify-center shadow-lg shadow-primary/30">
                <Check className="w-8 h-8 text-white" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-text">{project?.name}</h4>
                <p className="text-sm text-text-muted">Ready to label</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="glass-panel rounded-xl p-4">
                  <p className="text-2xl font-bold text-text">{assetCount}</p>
                  <p className="text-xs text-text-muted flex items-center justify-center gap-1"><ImageIcon className="w-3 h-3" /> Assets</p>
                </div>
                <div className="glass-panel rounded-xl p-4">
                  <p className="text-2xl font-bold text-text">{classCount}</p>
                  <p className="text-xs text-text-muted flex items-center justify-center gap-1"><Tag className="w-3 h-3" /> Classes</p>
                </div>
              </div>
              {assetCount === 0 && (
                <p className="text-xs text-amber-400">No media yet, you can still start and upload while labeling.</p>
              )}
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="p-5 border-t border-glass-border flex items-center justify-between gap-3">
          <button
            onClick={step === 1 ? onClose : goBack}
            className="btn-secondary-glass flex items-center gap-1.5"
          >
            {step === 1 ? 'Cancel' : (<><ArrowLeft className="w-4 h-4" /> Back</>)}
          </button>

          {step < 3 ? (
            <button
              onClick={goNext}
              disabled={!project}
              title={!project ? 'Create the project first' : undefined}
              className="btn-primary-gradient flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={startLabeling} className="btn-primary-gradient flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" /> Start labeling
            </button>
          )}
        </div>
      </div>

      {/* Video slicing dialog (reused from the labeling flow) */}
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
