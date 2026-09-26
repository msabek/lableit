import { useState, useCallback, useRef } from 'react';
import { upload, jobs, Dataset } from '../api';

// Video file extensions
const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|avi|mkv|m4v|flv|wmv)$/i;

// Slicing progress state
export interface SlicingProgress {
  stage: 'uploading' | 'processing' | 'extracting' | 'complete' | 'failed';
  progress: number; // 0-100
  message: string;
  framesExtracted?: number;
  totalFrames?: number;
  startTime: number;
  estimatedTimeRemaining?: number; // in seconds
}

export function useUploader(selectedDataset: Dataset | null, onUploadComplete: () => void) {
  const [files, setFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Tag state for uploads
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  // Video slicing state
  const [pendingVideoFile, setPendingVideoFile] = useState<File | null>(null);
  const [showVideoSliceDialog, setShowVideoSliceDialog] = useState(false);
  const [slicingVideo, setSlicingVideo] = useState(false);
  const [slicingProgress, setSlicingProgress] = useState<SlicingProgress | null>(null);

  // Refs for cleanup
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isVideoFile = useCallback((file: File): boolean => {
    return VIDEO_EXTENSIONS.test(file.name);
  }, []);

  const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    // Validate file sizes before upload
    for (let i = 0; i < selectedFiles.length; i++) {
      if (selectedFiles[i].size > MAX_FILE_SIZE) {
        setError(`File "${selectedFiles[i].name}" exceeds the 500MB size limit.`);
        return;
      }
    }

    // Check if any file is a video
    const videoFiles: File[] = [];
    const imageFiles: File[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      if (isVideoFile(file)) {
        videoFiles.push(file);
      } else {
        imageFiles.push(file);
      }
    }

    // If there are video files, show the slice dialog for the first one
    if (videoFiles.length > 0) {
      setPendingVideoFile(videoFiles[0]);
      setShowVideoSliceDialog(true);
      // Store remaining files (both remaining videos and images) for later
      // For now, we handle one video at a time
      if (imageFiles.length > 0 || videoFiles.length > 1) {
        // Create a DataTransfer to store non-video files
        const dt = new DataTransfer();
        imageFiles.forEach(f => dt.items.add(f));
        // Add remaining videos after the first one
        videoFiles.slice(1).forEach(f => dt.items.add(f));
        setFiles(dt.files.length > 0 ? dt.files : null);
      } else {
        setFiles(null);
      }
    } else {
      setFiles(selectedFiles);
    }
  };

  const cleanupPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const handleVideoSliceConfirm = async (intervalSeconds: number, estimatedFrames?: number) => {
    if (!pendingVideoFile || !selectedDataset) return;

    const startTime = Date.now();
    setSlicingVideo(true);
    setError(null);
    setSlicingProgress({
      stage: 'uploading',
      progress: 0,
      message: 'Uploading video file...',
      startTime,
      totalFrames: estimatedFrames
    });

    try {
      // First upload the video file
      const uploadResult = await upload.file(selectedDataset.id, pendingVideoFile, (progress) => {
        setSlicingProgress(prev => ({
          ...prev!,
          stage: 'uploading',
          progress: Math.round(progress * 0.1), // Upload is 0-10%
          message: `Uploading video... ${Math.round(progress)}%`
        }));
      });
      
      // Videos are uploaded but not stored as assets - we get videoUri instead
      if (!uploadResult.videoUri) {
        throw new Error('Video upload failed - no video URI returned');
      }
      
      setSlicingProgress(prev => ({
        ...prev!,
        stage: 'processing',
        progress: 10,
        message: 'Starting frame extraction...'
      }));

      // Then trigger video slicing job using the videoUri (pass tags if selected)
      const { jobId } = await jobs.sliceVideo(selectedDataset.id, uploadResult.videoUri, intervalSeconds, selectedTagIds.length > 0 ? selectedTagIds : undefined);
      
      // Poll for job completion with progress updates
      pollIntervalRef.current = setInterval(async () => {
        try {
          const job = await jobs.get(jobId);
          const now = Date.now();
          const elapsed = (now - startTime) / 1000;
          
          if (job.status === 'succeeded') {
            cleanupPolling();
            setSlicingProgress({
              stage: 'complete',
              progress: 100,
              message: `Complete! Extracted ${job.result?.framesExtracted || '?'} frames`,
              framesExtracted: job.result?.framesExtracted,
              startTime
            });
            
            // Short delay to show completion
            setTimeout(() => {
              setSlicingVideo(false);
              setShowVideoSliceDialog(false);
              setPendingVideoFile(null);
              setSlicingProgress(null);
              onUploadComplete();
            }, 1500);
            
          } else if (job.status === 'failed') {
            cleanupPolling();
            setSlicingProgress({
              stage: 'failed',
              progress: 0,
              message: job.result?.error || 'Video slicing failed',
              startTime
            });
            setSlicingVideo(false);
            setError(job.result?.error || 'Video slicing failed');
            
          } else {
            // Job is still processing - update progress
            const jobProgress = job.progress || 0;
            // Map job progress (0-100) to our range (10-99)
            const mappedProgress = 10 + Math.round(jobProgress * 0.89);
            
            // Calculate estimated time remaining
            let estimatedTimeRemaining: number | undefined;
            if (jobProgress > 5 && elapsed > 2) {
              const progressRate = jobProgress / elapsed;
              const remainingProgress = 100 - jobProgress;
              estimatedTimeRemaining = remainingProgress / progressRate;
            }
            
            // Determine stage based on progress
            let stage: SlicingProgress['stage'] = 'extracting';
            let message = 'Extracting frames...';
            
            if (jobProgress < 10) {
              message = 'Downloading video for processing...';
            } else if (jobProgress < 50) {
              message = 'Extracting frames from video...';
            } else if (jobProgress < 95) {
              const framesProcessed = estimatedFrames 
                ? Math.round((jobProgress - 10) / 89 * estimatedFrames)
                : undefined;
              message = framesProcessed 
                ? `Uploading frame ${framesProcessed} of ~${estimatedFrames}...`
                : `Processing frames... ${jobProgress}%`;
            } else {
              message = 'Finalizing...';
            }
            
            setSlicingProgress({
              stage,
              progress: mappedProgress,
              message,
              totalFrames: estimatedFrames,
              startTime,
              estimatedTimeRemaining
            });
          }
        } catch (err) {
          cleanupPolling();
          setSlicingVideo(false);
          setSlicingProgress(null);
          setError('Failed to check slicing status');
        }
      }, 1000); // Poll every second for smoother updates

      // Timeout after 10 minutes
      timeoutRef.current = setTimeout(() => {
        cleanupPolling();
        if (slicingVideo) {
          setSlicingVideo(false);
          setSlicingProgress(null);
          setError('Video slicing timed out');
        }
      }, 600000);

    } catch (err: any) {
      cleanupPolling();
      setSlicingVideo(false);
      setSlicingProgress(null);
      setError(err.response?.data?.error || 'Failed to upload and slice video');
    }
  };

  const handleVideoSliceCancel = () => {
    cleanupPolling();
    setShowVideoSliceDialog(false);
    setPendingVideoFile(null);
    setSlicingProgress(null);
    // Reset file input
    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const handleUpload = async () => {
    if (!files || !selectedDataset) return;

    setUploading(true);
    setUploadProgress(0);
    const totalFiles = files.length;
    let uploaded = 0;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Check if this is a video file that should be sliced
        if (isVideoFile(file)) {
          // Show dialog for this video
          setPendingVideoFile(file);
          setShowVideoSliceDialog(true);
          // Stop processing - we'll continue after video dialog
          setUploading(false);
          return;
        }
        
        await upload.file(selectedDataset.id, file, (progress) => {
          const overallProgress = ((uploaded + (progress / 100)) / totalFiles) * 100;
          setUploadProgress(Math.round(overallProgress));
        }, selectedTagIds.length > 0 ? selectedTagIds : undefined);
        uploaded++;
      }

      onUploadComplete();

      setFiles(null);
      setSelectedTagIds([]); // Clear selected tags after upload
      const fileInput = document.getElementById('file-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } catch (err) {
      setError('Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  return {
    files,
    setFiles,
    uploading,
    uploadProgress,
    error,
    setError,
    handleFileSelect,
    handleUpload,
    // Video slicing
    pendingVideoFile,
    showVideoSliceDialog,
    slicingVideo,
    slicingProgress,
    handleVideoSliceConfirm,
    handleVideoSliceCancel,
    // Tag selection for uploads
    selectedTagIds,
    setSelectedTagIds
  };
}
