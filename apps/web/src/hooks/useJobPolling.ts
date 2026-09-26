import { useState, useCallback } from 'react';
import { jobs, Job } from '../api';

export function useJobPolling() {
  const [currentJob, setCurrentJob] = useState<Job | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');

  const pollJobStatus = useCallback((jobId: string, onSuccess?: () => void) => {
    setProcessing(true);
    setProgress(0);
    setProgressMessage('Starting...');
    
    const checkStatus = async () => {
      try {
        const job = await jobs.get(jobId);
        setCurrentJob(job);
        
        // Update progress from job response
        if (job.progress !== undefined) {
          setProgress(job.progress);
        }
        if (job.progressMessage) {
          setProgressMessage(job.progressMessage);
        }

        if (job.status === 'succeeded' || job.status === 'failed') {
          setProcessing(false);
          if (job.status === 'succeeded') {
            setProgress(100);
            setProgressMessage('Complete!');
          }
          if (job.status === 'failed') {
            setError(job.result?.error || 'Processing failed');
            setProgressMessage('Failed');
          } else {
            if (onSuccess) onSuccess();
          }
          return;
        }

        // Continue polling more frequently for smoother progress
        setTimeout(checkStatus, 1000);
      } catch (err) {
        setProcessing(false);
        setError('Failed to check job status');
        setProgressMessage('Error');
      }
    };

    checkStatus();
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    currentJob,
    processing,
    setProcessing,
    error,
    setError,
    clearError,
    progress,
    progressMessage,
    pollJobStatus
  };
}
