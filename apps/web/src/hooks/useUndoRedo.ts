import { useState, useCallback, useRef } from 'react';

interface HistoryAction<T> {
  type: string;
  timestamp: number;
  previousState: T;
  nextState: T;
  description: string;
}

interface UseUndoRedoOptions {
  maxHistory?: number;
}

export function useUndoRedo<T>(
  initialState: T,
  options: UseUndoRedoOptions = {}
) {
  const { maxHistory = 50 } = options;

  const [state, setState] = useState<T>(initialState);
  const [history, setHistory] = useState<HistoryAction<T>[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isUndoRedoAction = useRef(false);

  // Push a new action to history
  const pushAction = useCallback((
    type: string,
    nextState: T,
    description: string
  ) => {
    // Skip if this is from an undo/redo operation
    if (isUndoRedoAction.current) {
      isUndoRedoAction.current = false;
      return;
    }

    const action: HistoryAction<T> = {
      type,
      timestamp: Date.now(),
      previousState: state,
      nextState,
      description
    };

    setHistory(prev => {
      // Remove any forward history if we're not at the end
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(action);

      // Limit history size
      if (newHistory.length > maxHistory) {
        return newHistory.slice(-maxHistory);
      }
      return newHistory;
    });

    setHistoryIndex(prev => Math.min(prev + 1, maxHistory - 1));
    setState(nextState);
  }, [state, historyIndex, maxHistory]);

  // Undo the last action
  const undo = useCallback(() => {
    if (historyIndex < 0 || history.length === 0) return null;

    const action = history[historyIndex];
    if (!action) return null;

    isUndoRedoAction.current = true;
    setState(action.previousState);
    setHistoryIndex(prev => prev - 1);

    return action;
  }, [history, historyIndex]);

  // Redo the next action
  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return null;

    const action = history[historyIndex + 1];
    if (!action) return null;

    isUndoRedoAction.current = true;
    setState(action.nextState);
    setHistoryIndex(prev => prev + 1);

    return action;
  }, [history, historyIndex]);

  // Check if undo is available
  const canUndo = historyIndex >= 0 && history.length > 0;

  // Check if redo is available
  const canRedo = historyIndex < history.length - 1;

  // Get recent history for display
  const recentHistory = history.slice(Math.max(0, historyIndex - 4), historyIndex + 1);

  // Clear all history
  const clearHistory = useCallback(() => {
    setHistory([]);
    setHistoryIndex(-1);
  }, []);

  // Reset to initial state
  const reset = useCallback(() => {
    setState(initialState);
    clearHistory();
  }, [initialState, clearHistory]);

  return {
    state,
    setState: pushAction,
    undo,
    redo,
    canUndo,
    canRedo,
    history: recentHistory,
    historyIndex,
    clearHistory,
    reset
  };
}

// Annotation-specific undo/redo hook
export interface AnnotationAction {
  id: string;
  type: 'add' | 'update' | 'delete' | 'batch';
  assetId: string;
  data: any;
}

export function useAnnotationHistory(maxHistory = 50) {
  const [history, setHistory] = useState<AnnotationAction[]>([]);
  const [undoStack, setUndoStack] = useState<AnnotationAction[]>([]);
  const [redoStack, setRedoStack] = useState<AnnotationAction[]>([]);

  const recordAction = useCallback((action: Omit<AnnotationAction, 'id'>) => {
    const actionWithId: AnnotationAction = {
      ...action,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };

    setHistory(prev => {
      const newHistory = [...prev, actionWithId];
      return newHistory.slice(-maxHistory);
    });

    setUndoStack(prev => {
      const newStack = [...prev, actionWithId];
      return newStack.slice(-maxHistory);
    });

    // Clear redo stack when a new action is performed
    setRedoStack([]);
  }, [maxHistory]);

  const undo = useCallback((): AnnotationAction | null => {
    const lastAction = undoStack[undoStack.length - 1];
    if (!lastAction) return null;

    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, lastAction]);

    return lastAction;
  }, [undoStack]);

  const redo = useCallback((): AnnotationAction | null => {
    const nextAction = redoStack[redoStack.length - 1];
    if (!nextAction) return null;

    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, nextAction]);

    return nextAction;
  }, [redoStack]);

  return {
    history,
    recordAction,
    undo,
    redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    undoCount: undoStack.length,
    redoCount: redoStack.length,
    clear: () => {
      setHistory([]);
      setUndoStack([]);
      setRedoStack([]);
    }
  };
}

export default useUndoRedo;
