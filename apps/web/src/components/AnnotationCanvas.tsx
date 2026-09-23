import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Detection } from '../api';
import { HelpCircle } from 'lucide-react';

// ================================
// Types
// ================================
interface Point {
  x: number;
  y: number;
}

interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface AnnotationCanvasProps {
  imageUrl: string;
  detections: Detection[];
  selectedDetectionIndex: number | null;
  onSelectDetection: (index: number | null) => void;
  onDeleteDetection?: (index: number) => void;
  onUpdateDetection?: (index: number, box: number[], commit?: boolean) => void;
  onAddDetection?: (box: number[], className: string) => void;
  activeClass?: string;
  showLabels?: boolean;
  showMasks?: boolean;
  maskOpacity?: number; // 0-100 percentage
  readonly?: boolean;
  labelColors?: Map<string, string>;
}

type DrawingMode = 'none' | 'drawing' | 'moving' | 'resizing';
type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | null;

// ================================
// Helper Functions
// ================================
const getColor = (className: string, colors?: Map<string, string>): string => {
  if (colors?.has(className)) {
    return colors.get(className)!;
  }
  // Generate consistent color from class name
  let hash = 0;
  for (let i = 0; i < className.length; i++) {
    hash = className.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 50%)`;
};

const boxFromDetection = (det: Detection): Box => ({
  x1: det.box[0],
  y1: det.box[1],
  x2: det.box[2],
  y2: det.box[3]
});

const detectionFromBox = (box: Box, className: string, confidence: number = 1.0): Detection => ({
  class_name: className,
  confidence,
  box: [box.x1, box.y1, box.x2, box.y2]
});

// ================================
// Main Component
// ================================
export default function AnnotationCanvas({
  imageUrl,
  detections,
  selectedDetectionIndex,
  onSelectDetection,
  onDeleteDetection,
  onUpdateDetection,
  onAddDetection,
  activeClass = 'object',
  showLabels = true,
  showMasks = true,
  maskOpacity = 30, // Default 30% opacity
  readonly = false,
  labelColors
}: AnnotationCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  
  const [mode, setMode] = useState<DrawingMode>('none');
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentBox, setCurrentBox] = useState<Box | null>(null);
  const [resizeHandle, setResizeHandle] = useState<ResizeHandle>(null);
  const pendingUpdateRef = useRef<{ index: number; box: number[] } | null>(null);
  const [hoveredDetection, setHoveredDetection] = useState<number | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Load image
  useEffect(() => {
    // Reset immediately so we don't render stale previous image while loading next one.
    setImageLoaded(false);
    imageRef.current = null;

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      imageRef.current = img;
      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      setImageLoaded(true);
    };
    img.onerror = () => {
      if (cancelled) return;
      setImageLoaded(false);
    };
    img.src = imageUrl;

    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [imageUrl]);

  // Resize canvas to fit container
  useEffect(() => {
    const updateSize = () => {
      if (!containerRef.current || !imageLoaded) return;
      
      const container = containerRef.current;
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      
      // Calculate scale to fit image in container
      const scaleX = containerWidth / imageDimensions.width;
      const scaleY = containerHeight / imageDimensions.height;
      const newScale = Math.min(scaleX, scaleY, 1); // Don't upscale
      
      const canvasWidth = imageDimensions.width * newScale;
      const canvasHeight = imageDimensions.height * newScale;
      
      setScale(newScale);
      setCanvasSize({ width: canvasWidth, height: canvasHeight });
      setOffset({
        x: (containerWidth - canvasWidth) / 2,
        y: (containerHeight - canvasHeight) / 2
      });
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [imageLoaded, imageDimensions]);

  // Draw canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const img = imageRef.current;
    
    if (!canvas || !ctx || !img || !imageLoaded) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw image
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    
    // Draw detections
    detections.forEach((det, index) => {
      const isSelected = selectedDetectionIndex === index;
      const isHovered = hoveredDetection === index;
      const color = getColor(det.class_name, labelColors);
      
      // Validate box data - ensure it's a valid array with numbers
      if (!det.box || !Array.isArray(det.box) || det.box.length < 4) {
        return; // Skip invalid detections
      }
      
      // Scale box to canvas coordinates
      const box = {
        x1: (Number(det.box[0]) || 0) * scale,
        y1: (Number(det.box[1]) || 0) * scale,
        x2: (Number(det.box[2]) || 0) * scale,
        y2: (Number(det.box[3]) || 0) * scale
      };
      
      // Skip if box has no dimensions
      const boxWidth = box.x2 - box.x1;
      const boxHeight = box.y2 - box.y1;
      if (boxWidth < 1 || boxHeight < 1) {
        return; // Skip zero-dimension boxes
      }
      
      // Draw mask if available
      if (showMasks && det.mask_polygon && det.mask_polygon.length > 0) {
        ctx.beginPath();
        ctx.moveTo(det.mask_polygon[0][0] * scale, det.mask_polygon[0][1] * scale);
        for (let i = 1; i < det.mask_polygon.length; i++) {
          ctx.lineTo(det.mask_polygon[i][0] * scale, det.mask_polygon[i][1] * scale);
        }
        ctx.closePath();
        // Convert opacity percentage (0-100) to hex (00-FF)
        const opacityHex = Math.round((maskOpacity / 100) * 255).toString(16).padStart(2, '0');
        ctx.fillStyle = color + opacityHex;
        ctx.fill();
      }
      
      // Draw bounding box with thicker stroke for visibility
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 4 : isHovered ? 3 : 2.5;
      ctx.setLineDash(isSelected ? [] : []);
      ctx.strokeRect(box.x1, box.y1, boxWidth, boxHeight);
      
      // Add a subtle fill for better visibility
      ctx.fillStyle = color + '15'; // 8% opacity fill
      ctx.fillRect(box.x1, box.y1, boxWidth, boxHeight);
      
      // Draw label
      if (showLabels) {
        const label = `${det.class_name} ${(det.confidence * 100).toFixed(0)}%`;
        const labelHeight = 18;
        const labelPadding = 4;
        
        ctx.font = 'bold 12px Inter, sans-serif';
        const labelWidth = ctx.measureText(label).width + labelPadding * 2;
        
        // Label background
        ctx.fillStyle = color;
        ctx.fillRect(box.x1, box.y1 - labelHeight, labelWidth, labelHeight);
        
        // Label text
        ctx.fillStyle = 'white';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, box.x1 + labelPadding, box.y1 - labelHeight / 2);
      }
      
      // Draw resize handles for selected detection
      if (isSelected && !readonly) {
        const handleSize = 8;
        const handles = [
          { x: box.x1, y: box.y1 },                           // nw
          { x: (box.x1 + box.x2) / 2, y: box.y1 },           // n
          { x: box.x2, y: box.y1 },                           // ne
          { x: box.x2, y: (box.y1 + box.y2) / 2 },           // e
          { x: box.x2, y: box.y2 },                           // se
          { x: (box.x1 + box.x2) / 2, y: box.y2 },           // s
          { x: box.x1, y: box.y2 },                           // sw
          { x: box.x1, y: (box.y1 + box.y2) / 2 }            // w
        ];
        
        handles.forEach(h => {
          ctx.fillStyle = 'white';
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.rect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
          ctx.fill();
          ctx.stroke();
        });
      }
    });
    
    // Draw current drawing box
    if (currentBox && mode === 'drawing') {
      const color = getColor(activeClass, labelColors);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(
        currentBox.x1 * scale,
        currentBox.y1 * scale,
        (currentBox.x2 - currentBox.x1) * scale,
        (currentBox.y2 - currentBox.y1) * scale
      );
      ctx.setLineDash([]);
    }
  }, [
    imageLoaded, scale, detections, selectedDetectionIndex, hoveredDetection,
    showLabels, showMasks, maskOpacity, readonly, labelColors, currentBox, mode, activeClass
  ]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Convert screen coordinates to image coordinates
  const screenToImage = useCallback((screenX: number, screenY: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const x = (screenX - rect.left) / scale;
    const y = (screenY - rect.top) / scale;
    
    return { x, y };
  }, [scale]);

  // Find detection at point
  const findDetectionAtPoint = useCallback((point: Point): number | null => {
    for (let i = detections.length - 1; i >= 0; i--) {
      const det = detections[i];
      if (
        point.x >= det.box[0] && point.x <= det.box[2] &&
        point.y >= det.box[1] && point.y <= det.box[3]
      ) {
        return i;
      }
    }
    return null;
  }, [detections]);

  // Find resize handle at point
  const findResizeHandle = useCallback((point: Point, detIndex: number): ResizeHandle => {
    if (detIndex < 0 || detIndex >= detections.length) return null;
    
    const det = detections[detIndex];
    const box = boxFromDetection(det);
    const handleSize = 10 / scale;
    
    const handles: { handle: ResizeHandle; x: number; y: number }[] = [
      { handle: 'nw', x: box.x1, y: box.y1 },
      { handle: 'n', x: (box.x1 + box.x2) / 2, y: box.y1 },
      { handle: 'ne', x: box.x2, y: box.y1 },
      { handle: 'e', x: box.x2, y: (box.y1 + box.y2) / 2 },
      { handle: 'se', x: box.x2, y: box.y2 },
      { handle: 's', x: (box.x1 + box.x2) / 2, y: box.y2 },
      { handle: 'sw', x: box.x1, y: box.y2 },
      { handle: 'w', x: box.x1, y: (box.y1 + box.y2) / 2 }
    ];
    
    for (const h of handles) {
      if (
        Math.abs(point.x - h.x) <= handleSize &&
        Math.abs(point.y - h.y) <= handleSize
      ) {
        return h.handle;
      }
    }
    return null;
  }, [detections, scale]);

  // Mouse event handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (readonly) return;
    
    const point = screenToImage(e.clientX, e.clientY);
    
    // Check for resize handle first
    if (selectedDetectionIndex !== null) {
      const handle = findResizeHandle(point, selectedDetectionIndex);
      if (handle) {
        setMode('resizing');
        setResizeHandle(handle);
        setStartPoint(point);
        return;
      }
    }
    
    // Check for detection selection
    const detIndex = findDetectionAtPoint(point);
    if (detIndex !== null) {
      onSelectDetection(detIndex);
      setMode('moving');
      setStartPoint(point);
      return;
    }
    
    // Start drawing new box
    onSelectDetection(null);
    setMode('drawing');
    setStartPoint(point);
    setCurrentBox({ x1: point.x, y1: point.y, x2: point.x, y2: point.y });
  }, [readonly, screenToImage, selectedDetectionIndex, findResizeHandle, findDetectionAtPoint, onSelectDetection]);

  // Last box produced by the in-progress drag/resize, written to the API once the
  // gesture ends rather than on every mouse-move.
  const commitPendingUpdate = useCallback(() => {
    const pending = pendingUpdateRef.current;
    pendingUpdateRef.current = null;
    if (pending && onUpdateDetection) {
      onUpdateDetection(pending.index, pending.box, true);
    }
  }, [onUpdateDetection]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const point = screenToImage(e.clientX, e.clientY);
    
    // Update cursor based on hover state
    const target = e.currentTarget as HTMLElement;
    if (!readonly && selectedDetectionIndex !== null) {
      const handle = findResizeHandle(point, selectedDetectionIndex);
      if (handle) {
        const cursors: Record<string, string> = {
          nw: 'nwse-resize', n: 'ns-resize', ne: 'nesw-resize',
          e: 'ew-resize', se: 'nwse-resize', s: 'ns-resize',
          sw: 'nesw-resize', w: 'ew-resize'
        };
        target.style.cursor = cursors[handle] || 'default';
      } else {
        target.style.cursor = 'move';
      }
    } else {
      const detIndex = findDetectionAtPoint(point);
      target.style.cursor = detIndex !== null ? 'pointer' : (readonly ? 'default' : 'crosshair');
      setHoveredDetection(detIndex);
    }
    
    if (mode === 'none' || !startPoint) return;
    
    if (mode === 'drawing') {
      setCurrentBox({
        x1: Math.min(startPoint.x, point.x),
        y1: Math.min(startPoint.y, point.y),
        x2: Math.max(startPoint.x, point.x),
        y2: Math.max(startPoint.y, point.y)
      });
    } else if (mode === 'moving' && selectedDetectionIndex !== null && onUpdateDetection) {
      const det = detections[selectedDetectionIndex];
      const dx = point.x - startPoint.x;
      const dy = point.y - startPoint.y;
      
      const newBox = [
        det.box[0] + dx,
        det.box[1] + dy,
        det.box[2] + dx,
        det.box[3] + dy
      ];
      
      onUpdateDetection(selectedDetectionIndex, newBox, false);
      pendingUpdateRef.current = { index: selectedDetectionIndex, box: newBox };
      setStartPoint(point);
    } else if (mode === 'resizing' && selectedDetectionIndex !== null && resizeHandle && onUpdateDetection) {
      const det = detections[selectedDetectionIndex];
      let box = [...det.box];
      
      switch (resizeHandle) {
        case 'nw': box[0] = point.x; box[1] = point.y; break;
        case 'n': box[1] = point.y; break;
        case 'ne': box[2] = point.x; box[1] = point.y; break;
        case 'e': box[2] = point.x; break;
        case 'se': box[2] = point.x; box[3] = point.y; break;
        case 's': box[3] = point.y; break;
        case 'sw': box[0] = point.x; box[3] = point.y; break;
        case 'w': box[0] = point.x; break;
      }
      
      // Ensure valid box (x1 < x2, y1 < y2)
      if (box[0] > box[2]) [box[0], box[2]] = [box[2], box[0]];
      if (box[1] > box[3]) [box[1], box[3]] = [box[3], box[1]];
      
      onUpdateDetection(selectedDetectionIndex, box, false);
      pendingUpdateRef.current = { index: selectedDetectionIndex, box };
    }
  }, [screenToImage, readonly, selectedDetectionIndex, findResizeHandle, findDetectionAtPoint, mode, startPoint, detections, resizeHandle, onUpdateDetection]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    commitPendingUpdate();

    if (mode === 'drawing' && currentBox && onAddDetection) {
      const width = currentBox.x2 - currentBox.x1;
      const height = currentBox.y2 - currentBox.y1;
      
      // Only add if box is large enough
      if (width > 10 && height > 10) {
        onAddDetection(
          [currentBox.x1, currentBox.y1, currentBox.x2, currentBox.y2],
          activeClass
        );
      }
    }
    
    setMode('none');
    setStartPoint(null);
    setCurrentBox(null);
    setResizeHandle(null);
  }, [mode, currentBox, onAddDetection, activeClass, commitPendingUpdate]);

  const handleMouseLeave = useCallback(() => {
    setHoveredDetection(null);
    if (mode === 'drawing') {
      setMode('none');
      setCurrentBox(null);
    } else if (mode === 'moving' || mode === 'resizing') {
      // Mouse-up can land outside the canvas - save the move rather than lose it.
      commitPendingUpdate();
      setMode('none');
      setStartPoint(null);
      setResizeHandle(null);
    }
  }, [mode, commitPendingUpdate]);

  // Keyboard handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedDetectionIndex !== null && onDeleteDetection) {
          onDeleteDetection(selectedDetectionIndex);
          onSelectDetection(null);
        }
      } else if (e.key === 'Escape') {
        onSelectDetection(null);
        setMode('none');
        setCurrentBox(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDetectionIndex, onDeleteDetection, onSelectDetection]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-gray-900 overflow-hidden flex items-center justify-center"
      role="application"
      aria-label="Annotation canvas for labeling images"
    >
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        className="max-w-full max-h-full"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        style={{ cursor: readonly ? 'default' : 'crosshair' }}
        role="img"
        aria-label={`Image with ${detections.length} annotations. ${readonly ? 'View only mode.' : 'Click and drag to draw bounding boxes.'}`}
        tabIndex={0}
      />

      {/* Keyboard Shortcuts Help */}
      {!readonly && (
        <div className="absolute top-2 right-2">
          <button
            onClick={() => setShowShortcuts(!showShortcuts)}
            className="p-2 rounded-lg bg-black/50 text-white/70 hover:text-white hover:bg-black/70 transition-all"
            aria-label="Show keyboard shortcuts"
            title="Keyboard shortcuts"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {showShortcuts && (
            <div className="absolute top-full right-0 mt-2 p-3 rounded-lg bg-black/90 text-white text-xs min-w-[180px] shadow-xl border border-white/10">
              <div className="font-semibold mb-2 text-white/90">Keyboard Shortcuts</div>
              <div className="space-y-1.5 text-white/70">
                <div className="flex justify-between gap-4">
                  <span>Delete annotation</span>
                  <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[10px]">Del</kbd>
                </div>
                <div className="flex justify-between gap-4">
                  <span>Deselect</span>
                  <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[10px]">Esc</kbd>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-white/10 text-white/50 text-[10px]">
                Click & drag to draw boxes
              </div>
            </div>
          )}
        </div>
      )}

      {!imageLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-transparent" />
        </div>
      )}
    </div>
  );
}
