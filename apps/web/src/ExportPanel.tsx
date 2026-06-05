import React, { useState, useEffect } from 'react';
import { exportApi, jobs, ExportFormat, ExportFormatInfo, ClassDef } from './api';
import { Download, Loader2, Check, AlertCircle, FileArchive, X } from 'lucide-react';

interface ExportPanelProps {
    datasetId: string;
    datasetName: string;
    classes: ClassDef[];
    onClose: () => void;
}

export default function ExportPanel({ datasetId, datasetName, classes, onClose }: ExportPanelProps) {
    const [formats, setFormats] = useState<ExportFormatInfo[]>([]);
    const [selectedFormat, setSelectedFormat] = useState<ExportFormat | null>(null);
    const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
    const [allClassesSelected, setAllClassesSelected] = useState(true);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportJobId, setExportJobId] = useState<string | null>(null);
    const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'completed' | 'failed'>('idle');
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [exportProgress, setExportProgress] = useState(0);
    const [progressMessage, setProgressMessage] = useState('');

    useEffect(() => {
        loadFormats();
    }, []);

    const loadFormats = async () => {
        setLoading(true);
        try {
            const { formats } = await exportApi.getFormats();
            setFormats(formats);
            if (formats.length > 0) {
                setSelectedFormat(formats[0].id);
            }
        } catch (err) {
            setError('Failed to load export formats');
        } finally {
            setLoading(false);
        }
    };

    const handleClassToggle = (classId: string) => {
        setAllClassesSelected(false);
        if (selectedClasses.includes(classId)) {
            setSelectedClasses(selectedClasses.filter(id => id !== classId));
        } else {
            setSelectedClasses([...selectedClasses, classId]);
        }
    };

    const handleSelectAllClasses = () => {
        setAllClassesSelected(true);
        setSelectedClasses([]);
    };

    const handleExport = async () => {
        if (!selectedFormat) return;

        setExporting(true);
        setExportStatus('exporting');
        setError(null);

        try {
            const includeClasses = allClassesSelected ? undefined : selectedClasses;
            const { jobId } = await exportApi.create(datasetId, selectedFormat, includeClasses);
            setExportJobId(jobId);

            // Poll for completion with progress updates
            const pollInterval = setInterval(async () => {
                try {
                    const { status, progress, progressMessage: message, result } = await exportApi.getStatus(jobId);
                    
                    // Update progress
                    if (progress !== undefined) {
                        setExportProgress(progress);
                    }
                    if (message) {
                        setProgressMessage(message);
                    }

                    if (status === 'succeeded') {
                        clearInterval(pollInterval);
                        setExportProgress(100);
                        setProgressMessage('Export complete!');
                        setExportStatus('completed');
                        // Use the downloadPath from result if available (contains descriptive filename)
                        const downloadPath = result?.downloadPath;
                        const archiveName = result?.archiveName;
                        console.log('Export result:', { downloadPath, archiveName, result });
                        
                        if (downloadPath) {
                            // Build full URL using API base
                            const apiBase = `${window.location.protocol}//${window.location.hostname}:3001`;
                            setDownloadUrl(`${apiBase}${downloadPath}`);
                        } else {
                            // Fallback to old naming (shouldn't happen)
                            console.warn('No downloadPath in result, using fallback');
                            setDownloadUrl(exportApi.getDownloadUrl(jobId));
                        }
                        setExporting(false);
                    } else if (status === 'failed') {
                        clearInterval(pollInterval);
                        setExportStatus('failed');
                        setError(result?.error || 'Export failed');
                        setExporting(false);
                    }
                } catch (err) {
                    clearInterval(pollInterval);
                    setExportStatus('failed');
                    setError('Failed to check export status');
                    setExporting(false);
                }
            }, 1000); // Poll more frequently for smoother progress

            // Timeout after 5 minutes
            setTimeout(() => {
                clearInterval(pollInterval);
                if (exportStatus === 'exporting') {
                    setExportStatus('failed');
                    setError('Export timed out');
                    setExporting(false);
                }
            }, 300000);

        } catch (err: any) {
            setExportStatus('failed');
            setError(err.response?.data?.error || 'Failed to start export');
            setExporting(false);
        }
    };

    const handleDownload = () => {
        if (downloadUrl) {
            window.open(downloadUrl, '_blank');
        }
    };

    // Format symbols (no emojis for better compatibility)
    const formatIcons: Record<string, string> = {
        coco: '[JSON]',
        yolo_detect: '[YOLO]',
        yolo_segment: '[SEG]',
        voc: '[XML]',
        png_masks: '[PNG]',
        createml: '[ML]',
        tfrecord_meta: '[TF]',
        labelme: '[LM]',
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-indigo-500 to-purple-600">
                    <div className="flex items-center">
                        <FileArchive className="w-6 h-6 text-white mr-3" />
                        <div>
                            <h2 className="text-xl font-bold text-white">Export Dataset</h2>
                            <p className="text-indigo-100 text-sm">{datasetName}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-white" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                        </div>
                    ) : (
                        <>
                            {/* Format Selection */}
                            <div className="mb-6">
                                <h3 className="text-sm font-semibold text-gray-700 mb-3">Export Format</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    {formats.map((format) => (
                                        <button
                                            key={format.id}
                                            onClick={() => setSelectedFormat(format.id)}
                                            className={`p-4 rounded-lg border-2 text-left transition-all ${selectedFormat === format.id
                                                    ? 'border-indigo-500 bg-indigo-50'
                                                    : 'border-gray-200 hover:border-gray-300'
                                                }`}
                                        >
                                            <div className="flex items-center mb-1">
                                                <span className="text-xs font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded mr-2">{formatIcons[format.id]}</span>
                                                <span className="font-medium text-gray-900">{format.name}</span>
                                            </div>
                                            <p className="text-xs text-gray-500 line-clamp-2">{format.description}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Class Filter */}
                            {classes.length > 0 && (
                                <div className="mb-6">
                                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Include Classes</h3>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={handleSelectAllClasses}
                                            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${allClassesSelected
                                                    ? 'bg-indigo-600 text-white'
                                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                }`}
                                        >
                                            All Classes
                                        </button>
                                        {classes.map((cls) => (
                                            <button
                                                key={cls.id}
                                                onClick={() => handleClassToggle(cls.id)}
                                                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center ${!allClassesSelected && selectedClasses.includes(cls.id)
                                                        ? 'bg-indigo-600 text-white'
                                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                    }`}
                                            >
                                                <span
                                                    className="w-3 h-3 rounded-full mr-2"
                                                    style={{ backgroundColor: cls.color }}
                                                />
                                                {cls.name}
                                            </button>
                                        ))}
                                    </div>
                                    {!allClassesSelected && selectedClasses.length === 0 && (
                                        <p className="text-sm text-amber-600 mt-2">
                                            Please select at least one class
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Export Status with Progress Bar */}
                            {exportStatus === 'exporting' && (
                                <div className="mb-6 p-4 bg-indigo-50 rounded-lg">
                                    <div className="flex items-center mb-3">
                                        <Loader2 className="w-5 h-5 text-indigo-600 animate-spin mr-3" />
                                        <div className="flex-1">
                                            <p className="font-medium text-indigo-900">Exporting...</p>
                                            <p className="text-sm text-indigo-600">{progressMessage || 'Processing...'}</p>
                                        </div>
                                        <span className="text-sm font-medium text-indigo-700">{exportProgress}%</span>
                                    </div>
                                    {/* Progress Bar */}
                                    <div className="w-full bg-indigo-200 rounded-full h-2.5 overflow-hidden">
                                        <div 
                                            className="bg-gradient-to-r from-indigo-500 to-purple-600 h-2.5 rounded-full transition-all duration-300 ease-out"
                                            style={{ width: `${exportProgress}%` }}
                                        />
                                    </div>
                                    <p className="text-xs text-indigo-500 mt-2">
                                        {exportProgress < 20 && 'Preparing export data...'}
                                        {exportProgress >= 20 && exportProgress < 70 && 'Downloading images from storage...'}
                                        {exportProgress >= 70 && exportProgress < 90 && 'Creating ZIP archive...'}
                                        {exportProgress >= 90 && 'Almost done...'}
                                    </p>
                                </div>
                            )}

                            {exportStatus === 'completed' && (
                                <div className="mb-6 p-4 bg-green-50 rounded-lg">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center">
                                            <Check className="w-5 h-5 text-green-600 mr-3" />
                                            <div>
                                                <p className="font-medium text-green-900">Export Complete!</p>
                                                <p className="text-sm text-green-600">Your dataset is ready for download</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={handleDownload}
                                            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                                        >
                                            <Download className="w-4 h-4 mr-2" />
                                            Download
                                        </button>
                                    </div>
                                </div>
                            )}

                            {exportStatus === 'failed' && error && (
                                <div className="mb-6 p-4 bg-red-50 rounded-lg">
                                    <div className="flex items-center">
                                        <AlertCircle className="w-5 h-5 text-red-600 mr-3" />
                                        <div>
                                            <p className="font-medium text-red-900">Export Failed</p>
                                            <p className="text-sm text-red-600">{error}</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleExport}
                        disabled={
                            !selectedFormat ||
                            exporting ||
                            exportStatus === 'completed' ||
                            (!allClassesSelected && selectedClasses.length === 0)
                        }
                        className="flex items-center px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {exporting ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Exporting...
                            </>
                        ) : (
                            <>
                                <Download className="w-4 h-4 mr-2" />
                                Export
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
