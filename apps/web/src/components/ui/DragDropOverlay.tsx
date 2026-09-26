import React, { useState, useEffect, useCallback } from 'react';
import { Upload, Image, Video, FileUp } from 'lucide-react';

interface DragDropOverlayProps {
  onFilesDropped: (files: FileList) => void;
  accept?: string;
  disabled?: boolean;
}

export const DragDropOverlay: React.FC<DragDropOverlayProps> = ({
  onFilesDropped,
  accept = 'image/*,video/*',
  disabled = false
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;

    setDragCounter(prev => prev + 1);
    if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setDragCounter(prev => {
      const newCounter = prev - 1;
      if (newCounter === 0) {
        setIsDragging(false);
      }
      return newCounter;
    });
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setIsDragging(false);
    setDragCounter(0);

    if (disabled) return;

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      onFilesDropped(files);
    }
  }, [disabled, onFilesDropped]);

  useEffect(() => {
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

  if (!isDragging) return null;

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none animate-fade-in">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-primary/10 backdrop-blur-md" />

      {/* Border animation */}
      <div className="absolute inset-4 rounded-3xl border-4 border-dashed border-primary animate-pulse" />

      {/* Content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {/* Animated upload icon */}
        <div className="relative mb-6">
          <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
          <div className="relative w-24 h-24 rounded-full bg-gradient-primary flex items-center justify-center shadow-2xl shadow-primary/40">
            <Upload className="w-12 h-12 text-white animate-bounce" />
          </div>
        </div>

        {/* Text */}
        <h2 className="text-3xl font-bold text-text mb-2">Drop files to upload</h2>
        <p className="text-lg text-text-muted mb-6">Release to add files to your project</p>

        {/* Supported formats */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface/80 backdrop-blur">
            <Image className="w-5 h-5 text-indigo-400" />
            <span className="text-sm text-text">Images</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface/80 backdrop-blur">
            <Video className="w-5 h-5 text-purple-400" />
            <span className="text-sm text-text">Videos</span>
          </div>
        </div>

        {/* File indicators */}
        <div className="mt-8 flex items-center gap-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="w-16 h-20 rounded-xl bg-surface/60 backdrop-blur border-2 border-primary/30 flex items-center justify-center animate-bounce"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <FileUp className="w-8 h-8 text-primary/60" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Hook for handling drag-drop with state
export const useDragDropUpload = (onFiles: (files: FileList) => void, disabled = false) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = useCallback((files: FileList) => {
    if (!disabled) {
      onFiles(files);
    }
  }, [disabled, onFiles]);

  return {
    isDragging,
    setIsDragging,
    handleFiles
  };
};

export default DragDropOverlay;
