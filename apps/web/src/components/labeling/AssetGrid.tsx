import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Asset, Tag, assets as assetsApi } from '../../api';
import { Image, Video, Eye, Trash2, CheckCircle, Circle, Filter, CheckSquare, Square, XSquare, ChevronLeft, ChevronRight, Tag as TagIcon } from 'lucide-react';

const PAGE_SIZE = 60;
const EMPTY_SELECTED_ASSET_IDS = new Set<string>();

type ResolvedUrl = { url: string; thumbnailUrl: string | null };

// Resolve signed URLs for the whole visible page in ONE batch request (instead
// of one getUrl() call per thumbnail). The batch primes the shared urlCache, so
// any later getUrl() fallback is a cache hit. Returns a map of assetId -> URL so
// thumbnails render directly from the batch result.
const usePageUrls = (assets: Asset[]): Map<string, ResolvedUrl> => {
  const [urls, setUrls] = useState<Map<string, ResolvedUrl>>(() => new Map());

  useEffect(() => {
    // Only image assets need signed URLs (videos render a placeholder).
    const imageIds = assets
      .filter(a => !a.uri.match(/\.(mp4|webm|mov|avi|mkv)$/i))
      .map(a => a.id);

    if (imageIds.length === 0) {
      setUrls(new Map());
      return;
    }

    let cancelled = false;

    assetsApi
      .getBatchUrls(imageIds)
      .then(result => {
        if (cancelled) return;
        const next = new Map<string, ResolvedUrl>();
        for (const [id, data] of Object.entries(result)) {
          next.set(id, { url: data.url, thumbnailUrl: data.thumbnailUrl });
        }
        setUrls(next);
      })
      .catch(() => {
        // Silently fail - thumbnails fall back to individual cached requests.
      });

    return () => {
      cancelled = true;
    };
  }, [assets]);

  return urls;
};

interface AssetGridProps {
  assets: Asset[];
  selectedAssetId?: string;
  onAssetClick: (asset: Asset) => void;
  onDeleteAsset: (asset: Asset) => void;
  // Multi-select mode
  selectionMode?: boolean;
  selectedAssetIds?: Set<string>;
  onToggleSelection?: (asset: Asset) => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
}

type FilterMode = 'all' | 'with_annotations' | 'without_annotations';

// Helper to generate consistent color from class name
const getClassColor = (className: string): string => {
  let hash = 0;
  for (let i = 0; i < className.length; i++) {
    hash = className.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 50%)`;
};

// Asset thumbnail component with lazy loading and annotation overlay
const AssetThumbnail: React.FC<{
  asset: Asset;
  isSelected: boolean;
  isChecked?: boolean;
  selectionMode?: boolean;
  resolvedUrl?: ResolvedUrl;
  onClick: () => void;
  onDelete: () => void;
  onToggleCheck?: () => void;
}> = React.memo(({ asset, isSelected, isChecked = false, selectionMode = false, resolvedUrl, onClick, onDelete, onToggleCheck }) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [imageDims, setImageDims] = useState<{ width: number; height: number } | null>(null);

  const isVideo = asset.uri.match(/\.(mp4|webm|mov|avi|mkv)$/i);
  const hasAnnotations = asset.annotations && asset.annotations.length > 0;

  useEffect(() => {
    // Videos don't load a thumbnail.
    if (isVideo) {
      setLoading(false);
      return;
    }

    // Prefer the URL resolved by the page-level batch request. This avoids a
    // per-thumbnail getUrl() call for the visible page.
    if (resolvedUrl) {
      setThumbnailUrl(resolvedUrl.thumbnailUrl || resolvedUrl.url);
      setLoading(false);
      return;
    }

    // Fallback: resolve individually (hits the shared cache the batch primed).
    let cancelled = false;
    assetsApi
      .getUrl(asset.id)
      .then(({ url, thumbnailUrl: thumbUrl }) => {
        if (cancelled) return;
        setThumbnailUrl(thumbUrl || url);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load thumbnail:', err);
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [asset.id, isVideo, resolvedUrl]);

  // Get actual image dimensions for accurate box overlay
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageDims({ width: img.naturalWidth, height: img.naturalHeight });
  };

  // Calculate box position as percentage for CSS overlay
  const getBoxStyle = (box: number[]): React.CSSProperties => {
    if (!imageDims || imageDims.width === 0 || imageDims.height === 0) return {};
    
    const [x1, y1, x2, y2] = box;
    const left = (x1 / imageDims.width) * 100;
    const top = (y1 / imageDims.height) * 100;
    const width = ((x2 - x1) / imageDims.width) * 100;
    const height = ((y2 - y1) / imageDims.height) * 100;
    
    return {
      left: `${left}%`,
      top: `${top}%`,
      width: `${width}%`,
      height: `${height}%`,
    };
  };

  const handleClick = (e: React.MouseEvent) => {
    if (selectionMode && onToggleCheck) {
      e.stopPropagation();
      onToggleCheck();
    } else {
      onClick();
    }
  };

  return (
    <div
      className={`relative group rounded-xl overflow-hidden transition-all cursor-pointer ${
        isChecked
          ? 'ring-2 ring-red-500 shadow-lg bg-red-500/10'
          : isSelected
          ? 'ring-2 ring-primary shadow-glow'
          : 'glass-panel hover:ring-1 hover:ring-primary/30'
      }`}
      onClick={handleClick}
    >
      <div className="aspect-square bg-white/5 flex items-center justify-center overflow-hidden relative">
        {loading ? (
          <div className="skeleton w-full h-full" />
        ) : error || isVideo ? (
          isVideo ? (
            <div className="flex flex-col items-center gap-1">
              <Video className="w-8 h-8 text-text-muted" />
              <span className="text-xs text-text-muted">Video</span>
            </div>
          ) : (
            <Image className="w-8 h-8 text-text-muted" />
          )
        ) : thumbnailUrl ? (
          <>
            <img
              src={thumbnailUrl}
              alt={`Asset ${asset.id}`}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
              onError={() => setError(true)}
              onLoad={handleImageLoad}
            />
            {/* Annotation overlays */}
            {hasAnnotations && imageDims && asset.annotations?.map((ann: any, idx: number) => {
              const box = ann.box;
              if (!box || !Array.isArray(box) || box.length < 4) return null;
              
              const className = ann.class?.name || 'object';
              const color = ann.class?.color || getClassColor(className);
              
              return (
                <div
                  key={ann.id || idx}
                  className="absolute pointer-events-none rounded-sm"
                  style={{
                    ...getBoxStyle(box),
                    border: `2px solid ${color}`,
                    backgroundColor: `${color}22`,
                    boxShadow: `0 0 8px ${color}40`,
                  }}
                />
              );
            })}
          </>
        ) : (
          <Image className="w-8 h-8 text-text-muted" />
        )}
      </div>

      {/* Overlay on hover */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center justify-center gap-3">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          className="p-2.5 glass-panel rounded-xl hover:bg-white/20 transform hover:scale-110 transition-all duration-200 active:scale-95"
          title="View"
        >
          <Eye className="w-4 h-4 text-white" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-2.5 glass-panel rounded-xl hover:bg-red-500/30 transform hover:scale-110 transition-all duration-200 active:scale-95"
          title="Delete"
        >
          <Trash2 className="w-4 h-4 text-red-400" />
        </button>
      </div>

      {/* Selection checkbox (top-right) - shown in selection mode */}
      {selectionMode && (
        <div className="absolute top-2 right-2 z-10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleCheck?.();
            }}
            className={`p-1.5 rounded-lg backdrop-blur-sm transition-all duration-200 ${
              isChecked 
                ? 'bg-red-500 text-white shadow-lg' 
                : 'glass-panel text-text-muted hover:text-text'
            }`}
          >
            {isChecked ? (
              <CheckSquare className="w-5 h-5" />
            ) : (
              <Square className="w-5 h-5" />
            )}
          </button>
        </div>
      )}

      {/* Annotation status indicator (top-left) */}
      <div className="absolute top-2 left-2">
        {hasAnnotations ? (
          <div className="flex items-center bg-emerald-500/90 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-lg shadow-lg" style={{ boxShadow: '0 0 10px rgba(16, 185, 129, 0.4)' }}>
            <CheckCircle className="w-3 h-3 mr-1" />
            {asset.annotations!.length}
          </div>
        ) : (
          <div className="flex items-center glass-panel text-text-muted text-xs px-2.5 py-1 rounded-lg">
            <Circle className="w-3 h-3 mr-1" />
            0
          </div>
        )}
      </div>

      {/* Info bar (bottom) */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent text-white text-xs p-2.5 pt-6">
        {/* Tags row */}
        {asset.tags && asset.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1">
            {asset.tags.slice(0, 3).map((assetTag) => (
              <span
                key={assetTag.id}
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
                style={{
                  backgroundColor: (assetTag.tag?.color || '#6366f1') + '40',
                  color: assetTag.tag?.color || '#6366f1'
                }}
              >
                {assetTag.tag?.name || 'Tag'}
              </span>
            ))}
            {asset.tags.length > 3 && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/20 text-white/80">
                +{asset.tags.length - 3}
              </span>
            )}
          </div>
        )}
        <div className="truncate font-medium">
          {asset.width > 0 ? `${asset.width}×${asset.height}` : 'Processing...'}
        </div>
      </div>
    </div>
  );
});

export const AssetGrid: React.FC<AssetGridProps> = ({ 
  assets, 
  selectedAssetId, 
  onAssetClick, 
  onDeleteAsset,
  selectionMode = false,
  selectedAssetIds = EMPTY_SELECTED_ASSET_IDS,
  onToggleSelection,
  onSelectAll,
  onDeselectAll
}) => {
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [page, setPage] = useState(1);
  
  // Count assets by annotation status
  const counts = useMemo(() => {
    const withAnnotations = assets.filter(a => a.annotations && a.annotations.length > 0).length;
    return {
      all: assets.length,
      with_annotations: withAnnotations,
      without_annotations: assets.length - withAnnotations
    };
  }, [assets]);

  // Filter assets based on selected mode
  const filteredAssets = useMemo(() => {
    switch (filterMode) {
      case 'with_annotations':
        return assets.filter(a => a.annotations && a.annotations.length > 0);
      case 'without_annotations':
        return assets.filter(a => !a.annotations || a.annotations.length === 0);
      default:
        return assets;
    }
  }, [assets, filterMode]);

  const pageCount = Math.max(1, Math.ceil(filteredAssets.length / PAGE_SIZE));
  const boundedPage = Math.min(page, pageCount);
  const visibleAssets = useMemo(() => {
    const start = (boundedPage - 1) * PAGE_SIZE;
    return filteredAssets.slice(start, start + PAGE_SIZE);
  }, [filteredAssets, boundedPage]);

  useEffect(() => {
    setPage(1);
  }, [filterMode, assets.length]);

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  // Resolve URLs for the current page in a single batch request, then hand each
  // thumbnail its resolved URL (no per-thumbnail signed-URL bursts).
  const pageUrls = usePageUrls(visibleAssets);

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-text flex items-center gap-2">
            <div className="p-2 rounded-lg bg-indigo-500/20">
              <Image className="w-5 h-5 text-indigo-400" />
            </div>
            Assets ({filteredAssets.length}{filterMode !== 'all' ? ` of ${assets.length}` : ''})
          </h2>
          
          {/* Selection mode indicator */}
          {selectionMode && selectedAssetIds.size > 0 && (
            <span className="inline-flex items-center px-3 py-1 text-xs font-medium rounded-xl bg-red-500/20 text-red-400 border border-red-500/30 animate-fade-in">
              {selectedAssetIds.size} selected
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Select all / Deselect all buttons (shown in selection mode) */}
          {selectionMode && assets.length > 0 && (
            <div className="flex items-center gap-1 mr-2">
              <button
                onClick={onSelectAll}
                className="flex items-center px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text glass-button rounded-lg transition-all duration-200"
              >
                <CheckSquare className="w-3.5 h-3.5 mr-1" />
                Select All
              </button>
              {selectedAssetIds.size > 0 && (
                <button
                  onClick={onDeselectAll}
                  className="flex items-center px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text glass-button rounded-lg transition-all duration-200"
                >
                  <XSquare className="w-3.5 h-3.5 mr-1" />
                  Deselect
                </button>
              )}
            </div>
          )}
          
          {/* Filter buttons */}
          {assets.length > 0 && (
            <div className="flex items-center gap-1 glass-panel rounded-xl p-1">
              <button
                onClick={() => setFilterMode('all')}
                className={`flex items-center px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  filterMode === 'all'
                    ? 'bg-primary/20 text-primary'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                All ({counts.all})
              </button>
              <button
                onClick={() => setFilterMode('with_annotations')}
                className={`flex items-center px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  filterMode === 'with_annotations'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                <CheckCircle className="w-3 h-3 mr-1" />
                Labeled ({counts.with_annotations})
              </button>
              <button
                onClick={() => setFilterMode('without_annotations')}
                className={`flex items-center px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  filterMode === 'without_annotations'
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                <Circle className="w-3 h-3 mr-1" />
                Unlabeled ({counts.without_annotations})
              </button>
            </div>
          )}
        </div>
      </div>

      {assets.length === 0 ? (
        <div className="text-center py-16 text-text-muted">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center">
            <Image className="w-10 h-10 text-indigo-400/50" />
          </div>
          <p className="text-text font-medium mb-1">No assets uploaded yet</p>
          <p className="text-sm">Upload some media to get started</p>
        </div>
      ) : filteredAssets.length === 0 ? (
        <div className="text-center py-16 text-text-muted">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
            <Filter className="w-10 h-10 text-amber-400/50" />
          </div>
          <p className="text-text font-medium mb-1">No assets match the current filter</p>
          <button
            onClick={() => setFilterMode('all')}
            className="mt-2 text-sm text-primary hover:text-primary-hover transition-colors"
          >
            Show all assets
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {visibleAssets.map((asset) => (
              <AssetThumbnail
                key={asset.id}
                asset={asset}
                isSelected={selectedAssetId === asset.id}
                isChecked={selectedAssetIds.has(asset.id)}
                selectionMode={selectionMode}
                resolvedUrl={pageUrls.get(asset.id)}
                onClick={() => onAssetClick(asset)}
                onDelete={() => onDeleteAsset(asset)}
                onToggleCheck={() => onToggleSelection?.(asset)}
              />
            ))}
          </div>

          {pageCount > 1 && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-text-muted">
                Showing {(boundedPage - 1) * PAGE_SIZE + 1}-{Math.min(boundedPage * PAGE_SIZE, filteredAssets.length)} of {filteredAssets.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={boundedPage === 1}
                  className="icon-button-glass disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-text-muted min-w-[5rem] text-center">
                  {boundedPage} / {pageCount}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(pageCount, p + 1))}
                  disabled={boundedPage === pageCount}
                  className="icon-button-glass disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
