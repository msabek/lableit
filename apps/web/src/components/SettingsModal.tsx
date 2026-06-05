import React, { useState, useEffect, useCallback } from 'react';
import { inference, ModelStatus } from '../api';
import {
    X, Check, AlertTriangle, RefreshCw, Download,
    Activity, Cpu, HardDrive, Loader2, CheckCircle2,
    XCircle, FolderOpen, Zap, Cloud
} from 'lucide-react';

interface SettingsModalProps {
    onClose: () => void;
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
    const [loading, setLoading] = useState(false);
    const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [downloadPolling, setDownloadPolling] = useState(false);
    const [serviceAvailable, setServiceAvailable] = useState(true);

    const fetchStatus = useCallback(async () => {
        try {
            setError(null);
            const status = await inference.getModelStatus();
            setModelStatus(status);
            setServiceAvailable(true);

            // Start polling if download is in progress
            if (status.download?.in_progress && !downloadPolling) {
                setDownloadPolling(true);
            } else if (!status.download?.in_progress && downloadPolling) {
                setDownloadPolling(false);
                if (status.download?.status === 'complete') {
                    setMessage('Model downloaded successfully!');
                } else if (status.download?.status === 'failed') {
                    setError(status.download?.error || 'Download failed');
                }
            }
        } catch (err: any) {
            console.error('Failed to fetch model status:', err);
            if (err.response?.status === 503) {
                setServiceAvailable(false);
                setError('Inference service is not running. Start it first.');
            } else {
                setError('Failed to fetch status');
            }
        }
    }, [downloadPolling]);

    useEffect(() => {
        fetchStatus();
    }, []);

    // Poll for download progress
    useEffect(() => {
        if (!downloadPolling) return;

        const interval = setInterval(() => {
            fetchStatus();
        }, 2000);

        return () => clearInterval(interval);
    }, [downloadPolling, fetchStatus]);

    const handleDownloadModel = async () => {
        setLoading(true);
        setError(null);
        setMessage(null);
        try {
            const result = await inference.downloadModel('sam3');
            if (result.status === 'already_downloaded') {
                setMessage('Model is already downloaded!');
                await fetchStatus();
            } else if (result.status === 'started') {
                setMessage('Download started...');
                setDownloadPolling(true);
            } else if (result.status === 'already_downloading') {
                setMessage('Download already in progress...');
                setDownloadPolling(true);
            }
        } catch (err: any) {
            setError(err.response?.data?.detail || err.response?.data?.error || 'Failed to start download');
        } finally {
            setLoading(false);
        }
    };

    const handleLoadModel = async () => {
        setLoading(true);
        setError(null);
        setMessage(null);
        try {
            await inference.loadModel('sam3');
            setMessage('Model loaded successfully!');
            await fetchStatus();
        } catch (err: any) {
            setError(err.response?.data?.detail || err.response?.data?.error || 'Failed to load model');
        } finally {
            setLoading(false);
        }
    };

    const handleUnloadModel = async () => {
        setLoading(true);
        setError(null);
        try {
            await inference.unloadModel('sam3');
            setMessage('Model unloaded');
            await fetchStatus();
        } catch (err: any) {
            setError(err.response?.data?.detail || err.response?.data?.error || 'Failed to unload model');
        } finally {
            setLoading(false);
        }
    };

    const getDownloadProgress = () => {
        if (!modelStatus?.download) return 0;
        return modelStatus.download.progress;
    };

    const isDownloading = modelStatus?.download?.in_progress || false;
    const isDownloaded = modelStatus?.downloaded || false;
    const isLoaded = modelStatus?.model_loaded || false;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="bg-gradient-to-br from-[#1a1c2e] to-[#0f1117] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl text-white overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/10 bg-black/30">
                    <h2 className="text-2xl font-bold flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/20 rounded-xl">
                            <Activity className="w-6 h-6 text-indigo-400" />
                        </div>
                        System Settings
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">

                    {/* Service Status */}
                    <div className={`p-4 rounded-xl border ${serviceAvailable
                        ? 'bg-emerald-500/10 border-emerald-500/30'
                        : 'bg-rose-500/10 border-rose-500/30'}`}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                {serviceAvailable ? (
                                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                                ) : (
                                    <XCircle className="w-6 h-6 text-rose-400" />
                                )}
                                <div>
                                    <div className="font-semibold">Inference Service</div>
                                    <div className="text-sm text-gray-400">
                                        {serviceAvailable ? 'Running on port 8001' : 'Not running'}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={fetchStatus}
                                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                            >
                                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                    </div>

                    {/* Status Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Model Downloaded Status */}
                        <div className={`p-4 rounded-xl border transition-all ${isDownloaded
                                ? 'bg-emerald-500/10 border-emerald-500/30'
                                : 'bg-amber-500/10 border-amber-500/30'
                            }`}>
                            <div className="flex items-center gap-2 mb-2">
                                <HardDrive className="w-4 h-4" />
                                <span className="text-xs uppercase tracking-wider font-semibold opacity-70">Model File</span>
                            </div>
                            <div className="flex items-center gap-2 text-lg font-bold">
                                {isDownloaded ? (
                                    <>
                                        <Check className="w-5 h-5 text-emerald-400" />
                                        Downloaded
                                    </>
                                ) : (
                                    <>
                                        <Download className="w-5 h-5 text-amber-400" />
                                        Not Found
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Model Loaded Status */}
                        <div className={`p-4 rounded-xl border transition-all ${isLoaded
                                ? 'bg-emerald-500/10 border-emerald-500/30'
                                : 'bg-gray-500/10 border-gray-500/30'
                            }`}>
                            <div className="flex items-center gap-2 mb-2">
                                <Zap className="w-4 h-4" />
                                <span className="text-xs uppercase tracking-wider font-semibold opacity-70">Model Status</span>
                            </div>
                            <div className="flex items-center gap-2 text-lg font-bold">
                                {isLoaded ? (
                                    <>
                                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                                        Loaded
                                    </>
                                ) : (
                                    <>
                                        <XCircle className="w-5 h-5 text-gray-400" />
                                        Not Loaded
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Device Status */}
                        <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/30">
                            <div className="flex items-center gap-2 mb-2">
                                <Cpu className="w-4 h-4" />
                                <span className="text-xs uppercase tracking-wider font-semibold opacity-70">Compute</span>
                            </div>
                            <div className="flex items-center gap-2 text-lg font-bold">
                                {modelStatus?.cuda_available ? (
                                    <>
                                        <Zap className="w-5 h-5 text-indigo-400" />
                                        GPU
                                    </>
                                ) : (
                                    <>
                                        <Cpu className="w-5 h-5 text-gray-400" />
                                        CPU
                                    </>
                                )}
                            </div>
                            {modelStatus?.cuda_device && (
                                <div className="text-xs text-gray-400 mt-1 truncate">
                                    {modelStatus.cuda_device}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Download Section */}
                    {!isDownloaded && serviceAvailable && (
                        <div className="p-5 rounded-xl bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20">
                            <div className="flex items-start gap-4">
                                <div className="p-3 bg-indigo-500/20 rounded-xl">
                                    <Cloud className="w-8 h-8 text-indigo-400" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-lg font-semibold mb-1">Download SAM3 Model</h3>
                                    <p className="text-sm text-gray-400 mb-4">
                                        The SAM3 model (~3-4GB) will be downloaded to the local models directory.
                                        This is required before you can run inference.
                                    </p>

                                    {isDownloading ? (
                                        <div className="space-y-2">
                                            <div className="h-3 bg-black/30 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
                                                    style={{ width: `${getDownloadProgress()}%` }}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-gray-400 flex items-center gap-2">
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    {modelStatus?.download?.status || 'Downloading...'}
                                                </span>
                                                <span className="font-mono text-indigo-400">{getDownloadProgress()}%</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={handleDownloadModel}
                                            disabled={loading}
                                            className="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white rounded-xl font-semibold shadow-lg hover:shadow-indigo-500/25 transition-all disabled:opacity-50 flex items-center gap-2"
                                        >
                                            {loading ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    Starting...
                                                </>
                                            ) : (
                                                <>
                                                    <Download className="w-4 h-4" />
                                                    Download Model
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Model Path Info */}
                    {isDownloaded && modelStatus?.model_path && (
                        <div className="p-4 rounded-xl bg-black/20 border border-white/5">
                            <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
                                <FolderOpen className="w-4 h-4" />
                                Model Location
                            </div>
                            <code className="text-xs font-mono text-gray-300 break-all bg-black/30 px-3 py-2 rounded-lg block">
                                {modelStatus.model_path}
                            </code>
                            {modelStatus.source && (
                                <div className="text-xs text-gray-500 mt-2">
                                    Downloaded from: {modelStatus.source}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Error/Message Display */}
                    {(error || message) && (
                        <div className={`p-4 rounded-xl flex items-center gap-3 ${error
                                ? 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                                : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                            }`}>
                            {error ? (
                                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                            ) : (
                                <Check className="w-5 h-5 flex-shrink-0" />
                            )}
                            <span className="text-sm">{error || message}</span>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="pt-4 border-t border-white/10">
                        <div className="flex items-center justify-between">
                            <button
                                onClick={fetchStatus}
                                className="px-4 py-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors flex items-center gap-2"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Refresh Status
                            </button>

                            <div className="flex gap-3">
                                {isLoaded ? (
                                    <button
                                        onClick={handleUnloadModel}
                                        disabled={loading || !serviceAvailable}
                                        className="px-6 py-2.5 bg-rose-500/80 hover:bg-rose-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-rose-500/25 transition-all disabled:opacity-50"
                                    >
                                        Unload Model
                                    </button>
                                ) : isDownloaded ? (
                                    <button
                                        onClick={handleLoadModel}
                                        disabled={loading || !serviceAvailable}
                                        className="px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white rounded-xl font-semibold shadow-lg hover:shadow-indigo-500/25 transition-all disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                                        Load Model
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
