import React, { useEffect, useState, useCallback } from 'react';
import { X, Keyboard } from 'lucide-react';

interface Shortcut {
  keys: string[];
  description: string;
  category: string;
}

// Only shortcuts that are actually wired up belong in this list. Removed entries
// (G P, G S, B, 1-9, Ctrl+S, Ctrl+Z, Ctrl+Shift+Z) were never implemented.
const shortcuts: Shortcut[] = [
  // Navigation
  { keys: ['Esc'], description: 'Close preview / back to projects', category: 'Navigation' },
  { keys: ['?'], description: 'Show keyboard shortcuts', category: 'Navigation' },

  // Asset Management
  { keys: ['U'], description: 'Upload files', category: 'Assets' },
  { keys: ['A'], description: 'Select all assets', category: 'Assets' },
  { keys: ['D'], description: 'Deselect all assets', category: 'Assets' },
  { keys: ['\u2190', '\u2192'], description: 'Previous / next asset in preview', category: 'Assets' },

  // Annotation
  { keys: ['Del'], description: 'Delete selected annotation (Backspace works too)', category: 'Annotation' },

  // Inference
  { keys: ['Ctrl', 'Enter'], description: 'Run batch inference', category: 'Inference' },
  { keys: ['Ctrl', 'Shift', 'P'], description: 'Run preview (3 samples)', category: 'Inference' },

  // Export
  { keys: ['Ctrl', 'E'], description: 'Open export wizard', category: 'Export' },
];

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Group shortcuts by category
  const grouped = shortcuts.reduce((acc, shortcut) => {
    if (!acc[shortcut.category]) {
      acc[shortcut.category] = [];
    }
    acc[shortcut.category].push(shortcut);
    return acc;
  }, {} as Record<string, Shortcut[]>);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative glass-card rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-glass-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/20">
              <Keyboard className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-text">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-elevated text-text-muted hover:text-text transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto max-h-[calc(80vh-80px)]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.entries(grouped).map(([category, categoryShortcuts]) => (
              <div key={category}>
                <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">
                  {category}
                </h3>
                <div className="space-y-2">
                  {categoryShortcuts.map((shortcut, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-surface-elevated transition-colors"
                    >
                      <span className="text-sm text-text">{shortcut.description}</span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, keyIndex) => (
                          <React.Fragment key={keyIndex}>
                            <kbd className="px-2 py-1 text-xs font-mono rounded-md bg-surface border border-border text-text-muted min-w-[24px] text-center">
                              {key}
                            </kbd>
                            {keyIndex < shortcut.keys.length - 1 && (
                              <span className="text-text-muted text-xs">+</span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-glass-border bg-surface-elevated/50">
          <p className="text-xs text-text-muted text-center">
            Press <kbd className="px-1.5 py-0.5 text-xs font-mono rounded bg-surface border border-border">?</kbd> anytime to show this menu
          </p>
        </div>
      </div>
    </div>
  );
};

// Hook to handle global keyboard shortcuts
export const useKeyboardShortcuts = (handlers: Record<string, () => void>) => {
  const [showShortcuts, setShowShortcuts] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore if typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    // Show shortcuts modal on '?'
    if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      setShowShortcuts(true);
      return;
    }

    // Handle registered shortcuts
    const key = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;

    // Build shortcut key
    let shortcutKey = '';
    if (ctrl) shortcutKey += 'ctrl+';
    if (shift) shortcutKey += 'shift+';
    shortcutKey += key;

    if (handlers[shortcutKey]) {
      e.preventDefault();
      handlers[shortcutKey]();
    }
  }, [handlers]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return {
    showShortcuts,
    setShowShortcuts,
    closeShortcuts: () => setShowShortcuts(false)
  };
};

// Key hint component to show on buttons
export const KeyHint: React.FC<{ keys: string | string[] }> = ({ keys }) => {
  const keyArray = Array.isArray(keys) ? keys : [keys];

  return (
    <span className="hidden lg:inline-flex items-center gap-0.5 ml-2">
      {keyArray.map((key, index) => (
        <React.Fragment key={index}>
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-black/10 dark:bg-white/10 text-text-muted">
            {key}
          </kbd>
          {index < keyArray.length - 1 && <span className="text-text-muted text-[10px]">+</span>}
        </React.Fragment>
      ))}
    </span>
  );
};

export default KeyboardShortcutsModal;
