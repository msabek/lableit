import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, Cpu, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { ServiceStatus, subscribeToServiceStatus, checkServiceHealth } from '../api';

interface ServiceStatusIndicatorProps {
  showDetails?: boolean;
  className?: string;
}

export default function ServiceStatusIndicator({ showDetails = false, className = '' }: ServiceStatusIndicatorProps) {
  const [status, setStatus] = useState<ServiceStatus>({
    api: 'checking',
    inference: 'checking',
    lastChecked: null,
  });
  const [checking, setChecking] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToServiceStatus(setStatus);
    
    // Initial health check
    checkServiceHealth();
    
    // Periodic health check every 30 seconds
    const interval = setInterval(() => {
      checkServiceHealth();
    }, 30000);
    
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const handleRefresh = async () => {
    setChecking(true);
    await checkServiceHealth();
    setChecking(false);
  };

  const isHealthy = status.api === 'connected';
  const isInferenceHealthy = status.inference === 'connected';

  // Simple indicator
  if (!showDetails) {
    return (
      <button
        onClick={() => setExpanded(!expanded)}
        className={`relative p-2 rounded-lg transition-colors ${
          isHealthy ? 'text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20' : 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
        } ${className}`}
        title={isHealthy ? 'Services connected' : 'Service connection issues'}
      >
        {status.api === 'checking' ? (
          <RefreshCw className="w-5 h-5 animate-spin" />
        ) : isHealthy ? (
          <Wifi className="w-5 h-5" />
        ) : (
          <WifiOff className="w-5 h-5" />
        )}
        
        {expanded && (
          <div className="absolute right-0 top-full mt-2 w-64 bg-surface border border-border rounded-lg shadow-lg p-4 z-50">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-muted">API Server</span>
                <StatusBadge status={status.api} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-muted">Inference</span>
                <StatusBadge status={status.inference} />
              </div>
              {status.error && (
                <p className="text-xs text-red-500">{status.error}</p>
              )}
              {status.lastChecked && (
                <p className="text-xs text-text-muted">
                  Last checked: {status.lastChecked.toLocaleTimeString()}
                </p>
              )}
              <button
                onClick={handleRefresh}
                disabled={checking}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-surface-elevated rounded-lg hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        )}
      </button>
    );
  }

  // Detailed indicator
  return (
    <div className={`bg-surface border border-border rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-text">Service Status</h3>
        <button
          onClick={handleRefresh}
          disabled={checking}
          className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 text-text-muted ${checking ? 'animate-spin' : ''}`} />
        </button>
      </div>
      
      <div className="space-y-3">
        <ServiceRow
          label="API Server"
          status={status.api}
          icon={<Wifi className="w-4 h-4" />}
        />
        <ServiceRow
          label="Inference Service"
          status={status.inference}
          icon={<Cpu className="w-4 h-4" />}
        />
      </div>
      
      {status.error && (
        <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-600 dark:text-red-400">{status.error}</p>
        </div>
      )}
      
      {status.lastChecked && (
        <p className="mt-3 text-xs text-text-muted text-right">
          Last checked: {status.lastChecked.toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: 'connected' | 'disconnected' | 'checking' }) {
  if (status === 'checking') {
    return (
      <span className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
        <RefreshCw className="w-3 h-3 animate-spin" /> Checking
      </span>
    );
  }
  
  if (status === 'connected') {
    return (
      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
        <CheckCircle className="w-3 h-3" /> Connected
      </span>
    );
  }
  
  return (
    <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
      <AlertCircle className="w-3 h-3" /> Disconnected
    </span>
  );
}

function ServiceRow({ label, status, icon }: { label: string; status: 'connected' | 'disconnected' | 'checking'; icon: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg bg-surface-elevated">
      <div className="flex items-center gap-2 text-text-muted">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <StatusBadge status={status} />
    </div>
  );
}
