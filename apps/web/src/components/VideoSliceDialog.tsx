import React, { useState, useEffect } from 'react';
import { X, Video, Scissors, Loader2, Film, Clock, Image, CheckCircle, AlertCircle } from 'lucide-react';
import type { SlicingProgress } from '../hooks/useUploader';

interface VideoSliceDialogProps {
  videoFile: File;
  onConfirm: (intervalSeconds: number, estimatedFrames?: number) => void;
  onCancel: () => void;
  isProcessing?: boolean;
  slicingProgress?: SlicingProgress | null;
}

const PRESET_INTERVALS = [
  { label: '1 frame/sec', value: 1 },
  { label: '1 frame/2 sec', value: 2 },
  { label: '1 frame/5 sec', value: 5 },
  { label: '1 frame/10 sec', value: 10 },
];

// Format duration as MM:SS or HH:MM:SS
function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Format time remaining
function formatTimeRemaining(seconds: number): string {
  if (seconds < 60) {
    return `${Math.ceil(seconds)}s remaining`;
  } else if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s remaining`;
  } else {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hrs}h ${mins}m remaining`;
  }
}

export const VideoSliceDialog: React.FC<VideoSliceDialogProps> = ({
  videoFile,
  onConfirm,
  onCancel,
  isProcessing = false,
  slicingProgress
}) => {
  const [intervalSeconds, setIntervalSeconds] = useState(1);
  const [useCustom, setUseCustom] = useState(false);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);

  // Load video metadata to get duration
  useEffect(() => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    
    const objectUrl = URL.createObjectURL(videoFile);
    setVideoPreviewUrl(objectUrl);
    
    video.onloadedmetadata = () => {
      setVideoDuration(video.duration);
    };
    
    video.onerror = () => {
      console.warn('Could not load video metadata');
      setVideoDuration(null);
    };
    
    video.src = objectUrl;
    
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [videoFile]);

  // Calculate estimated frame count
  const estimatedFrames = videoDuration 
    ? Math.ceil(videoDuration / intervalSeconds)
    : null;

  const handlePresetClick = (value: number) => {
    setIntervalSeconds(value);
    setUseCustom(false);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIntervalSeconds(parseFloat(e.target.value));
    setUseCustom(true);
  };

  const handleCustomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val > 0) {
      setIntervalSeconds(val);
      setUseCustom(true);
    }
  };

  const handleConfirm = () => {
    onConfirm(intervalSeconds, estimatedFrames ?? undefined);
  };

  // Get stage-specific styling
  const getStageColor = () => {
    if (!slicingProgress) return 'indigo';
    switch (slicingProgress.stage) {
      case 'complete': return 'emerald';
      case 'failed': return 'red';
      default: return 'indigo';
    }
  };

  const stageColor = getStageColor();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1c2e] border border-white/10 rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-gradient-to-r from-purple-500/10 to-indigo-500/10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-xl">
              <Video className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Slice Video into Frames</h2>
              <p className="text-xs text-gray-400 truncate max-w-[200px]">{videoFile.name}</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={isProcessing && slicingProgress?.stage !== 'failed'}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {/* Show progress UI when processing */}
          {isProcessing && slicingProgress ? (
            <div className="space-y-6">
              {/* Progress Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {slicingProgress.stage === 'complete' ? (
                    <div className="p-2 bg-emerald-500/20 rounded-xl">
                      <CheckCircle className="w-6 h-6 text-emerald-400" />
                    </div>
                  ) : slicingProgress.stage === 'failed' ? (
                    <div className="p-2 bg-red-500/20 rounded-xl">
                      <AlertCircle className="w-6 h-6 text-red-400" />
                    </div>
                  ) : (
                    <div className="p-2 bg-indigo-500/20 rounded-xl">
                      <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      {slicingProgress.stage === 'complete' ? 'Complete!' :
                       slicingProgress.stage === 'failed' ? 'Failed' :
                       'Processing Video'}
                    </h3>
                    <p className="text-sm text-gray-400">{slicingProgress.message}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-2xl font-bold text-${stageColor}-400`}>
                    {slicingProgress.progress}%
                  </div>
                  {slicingProgress.estimatedTimeRemaining && slicingProgress.stage !== 'complete' && (
                    <div className="text-xs text-gray-500">
                      {formatTimeRemaining(slicingProgress.estimatedTimeRemaining)}
                    </div>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="h-3 bg-white/5 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-500 ease-out ${
                      slicingProgress.stage === 'complete' 
                        ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                        : slicingProgress.stage === 'failed'
                        ? 'bg-red-500'
                        : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 bg-[length:200%_100%] animate-[shimmer_2s_infinite]'
                    }`}
                    style={{ width: `${slicingProgress.progress}%` }}
                  />
                </div>
                
                {/* Stage indicators */}
                <div className="flex justify-between text-xs text-gray-500">
                  <span className={slicingProgress.progress >= 0 ? 'text-indigo-400' : ''}>Upload</span>
                  <span className={slicingProgress.progress >= 10 ? 'text-indigo-400' : ''}>Download</span>
                  <span className={slicingProgress.progress >= 20 ? 'text-indigo-400' : ''}>Extract</span>
                  <span className={slicingProgress.progress >= 90 ? 'text-indigo-400' : ''}>Save</span>
                  <span className={slicingProgress.progress >= 100 ? 'text-emerald-400' : ''}>Done</span>
                </div>
              </div>

              {/* Processing Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                    <Image className="w-3 h-3" />
                    Estimated Frames
                  </div>
                  <div className="text-lg font-semibold text-white">
                    {slicingProgress.totalFrames || estimatedFrames || '?'}
                  </div>
                </div>
                <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                    <Clock className="w-3 h-3" />
                    Elapsed Time
                  </div>
                  <div className="text-lg font-semibold text-white">
                    {formatDuration((Date.now() - slicingProgress.startTime) / 1000)}
                  </div>
                </div>
              </div>

              {/* Error retry button */}
              {slicingProgress.stage === 'failed' && (
                <button
                  onClick={onCancel}
                  className="w-full px-4 py-3 text-sm font-medium text-white bg-red-500/20 border border-red-500/30 rounded-xl hover:bg-red-500/30 transition-colors"
                >
                  Close and Try Again
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Normal configuration UI */}
              <p className="text-sm text-gray-400 mb-4">
                Choose how often to extract frames from the video. Each frame will become a separate image for labeling.
              </p>

              {/* Preset Buttons */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                {PRESET_INTERVALS.map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => handlePresetClick(preset.value)}
                    disabled={isProcessing}
                    className={`px-4 py-2.5 text-sm font-medium rounded-xl border transition-all ${
                      !useCustom && intervalSeconds === preset.value
                        ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/50'
                        : 'bg-white/5 text-gray-300 border-white/10 hover:border-indigo-500/30 hover:bg-indigo-500/10'
                    } disabled:opacity-50`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Custom Slider */}
              <div className="space-y-2">
                <label className="flex items-center justify-between text-sm font-medium text-gray-300">
                  <span>Custom Interval</span>
                  <span className={`${useCustom ? 'text-indigo-400' : 'text-gray-500'}`}>
                    {intervalSeconds.toFixed(1)} sec
                  </span>
                </label>
                <input
                  type="range"
                  min={0.5}
                  max={30}
                  step={0.5}
                  value={intervalSeconds}
                  onChange={handleSliderChange}
                  disabled={isProcessing}
                  className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500 disabled:opacity-50"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0.1}
                    max={60}
                    step={0.1}
                    value={intervalSeconds}
                    onChange={handleCustomInputChange}
                    disabled={isProcessing}
                    className="w-24 px-3 py-1.5 text-sm bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50"
                  />
                  <span className="text-sm text-gray-500">seconds between frames</span>
                </div>
              </div>

              {/* Video Info & Frame Estimate */}
              <div className="mt-4 space-y-3">
                {/* Video Duration */}
                {videoDuration !== null && (
                  <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <Clock className="w-4 h-4" />
                        <span>Video Duration</span>
                      </div>
                      <span className="text-sm font-medium text-white">
                        {formatDuration(videoDuration)}
                      </span>
                    </div>
                  </div>
                )}
                
                {/* Frame Estimate - Highlighted */}
                <div className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                  estimatedFrames !== null 
                    ? 'bg-indigo-500/10 border-indigo-500/30' 
                    : 'bg-white/5 border-white/10'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-indigo-500/20 rounded-lg">
                        <Image className="w-4 h-4 text-indigo-400" />
                      </div>
                      <span className="text-sm font-medium text-gray-300">Estimated Frames</span>
                    </div>
                    <div className="text-right">
                      {estimatedFrames !== null ? (
                        <div>
                          <span className="text-2xl font-bold text-indigo-400">{estimatedFrames}</span>
                          <span className="text-sm text-gray-500 ml-1">images</span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500 italic">Calculating...</span>
                      )}
                    </div>
                  </div>
                  
                  {estimatedFrames !== null && (
                    <p className="mt-2 text-xs text-gray-500">
                      1 frame every {intervalSeconds} second{intervalSeconds !== 1 ? 's' : ''} from a {formatDuration(videoDuration!)} video
                    </p>
                  )}
                </div>
                
                {/* Warning for large frame counts */}
                {estimatedFrames !== null && estimatedFrames > 100 && (
                  <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20">
                    <div className="flex items-start gap-2">
                      <Film className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-amber-400">
                        <strong>Note:</strong> This will generate {estimatedFrames} images. 
                        Consider using a larger interval to reduce the number of frames.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer - Only show when not processing or when failed */}
        {(!isProcessing || slicingProgress?.stage === 'failed') && (
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-white/10 bg-black/20">
            <button
              onClick={onCancel}
              disabled={isProcessing}
              className="px-4 py-2.5 text-sm font-medium text-gray-300 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={isProcessing}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl hover:from-indigo-600 hover:to-purple-600 shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-50"
            >
              <Scissors className="w-4 h-4" />
              Slice into {estimatedFrames ?? '?'} Frames
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoSliceDialog;
