import React, { useState, useEffect } from 'react';
import { AlertTriangle, Trash2, X, Loader2, CheckCircle, XCircle } from 'lucide-react';

export type ConfirmationType = 'danger' | 'warning' | 'info';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: ConfirmationType;
  isProcessing?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  // Optional: require typing to confirm
  requireTyping?: string;
}

const typeStyles: Record<ConfirmationType, {
  iconBg: string;
  iconColor: string;
  confirmBg: string;
  confirmHover: string;
  Icon: typeof AlertTriangle;
}> = {
  danger: {
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
    confirmBg: 'bg-red-600',
    confirmHover: 'hover:bg-red-700',
    Icon: Trash2,
  },
  warning: {
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    confirmBg: 'bg-amber-600',
    confirmHover: 'hover:bg-amber-700',
    Icon: AlertTriangle,
  },
  info: {
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    confirmBg: 'bg-blue-600',
    confirmHover: 'hover:bg-blue-700',
    Icon: CheckCircle,
  },
};

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'danger',
  isProcessing = false,
  onConfirm,
  onCancel,
  requireTyping,
}) => {
  const [typedValue, setTypedValue] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const styles = typeStyles[type];
  const IconComponent = styles.Icon;

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setTypedValue('');
      setIsConfirming(false);
      setShowSuccess(false);
    }
  }, [isOpen]);

  const canConfirm = requireTyping ? typedValue === requireTyping : true;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    
    setIsConfirming(true);
    try {
      await onConfirm();
      setShowSuccess(true);
      // Auto-close after showing success
      setTimeout(() => {
        onCancel();
      }, 1000);
    } catch (error) {
      setIsConfirming(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop with animation */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={!isProcessing && !isConfirming ? onCancel : undefined}
      />
      
      {/* Modal with animation */}
      <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-scale-in">
        {/* Success overlay */}
        {showSuccess && (
          <div className="absolute inset-0 bg-white z-10 flex flex-col items-center justify-center animate-fade-in">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4 animate-bounce-in">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <p className="text-lg font-medium text-gray-900">Done!</p>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 ${styles.iconBg} rounded-lg`}>
              <IconComponent className={`w-5 h-5 ${styles.iconColor}`} />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          </div>
          <button
            onClick={onCancel}
            disabled={isProcessing || isConfirming}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all duration-200 disabled:opacity-50 hover:rotate-90"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <p className="text-sm text-gray-600 leading-relaxed">{message}</p>
          
          {/* Type to confirm input */}
          {requireTyping && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-red-600">{requireTyping}</span> to confirm:
              </label>
              <input
                type="text"
                value={typedValue}
                onChange={(e) => setTypedValue(e.target.value)}
                disabled={isProcessing || isConfirming}
                placeholder={requireTyping}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all duration-200 disabled:opacity-50"
                autoFocus
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onCancel}
            disabled={isProcessing || isConfirming}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-all duration-200 disabled:opacity-50 active:scale-95"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isProcessing || isConfirming || !canConfirm}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium text-white ${styles.confirmBg} ${styles.confirmHover} rounded-lg transition-all duration-200 disabled:opacity-50 active:scale-95 ${!canConfirm && requireTyping ? 'cursor-not-allowed' : ''}`}
          >
            {isProcessing || isConfirming ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <IconComponent className="w-4 h-4" />
                {confirmText}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
