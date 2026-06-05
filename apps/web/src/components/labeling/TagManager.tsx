import React, { useState, useEffect } from 'react';
import { Tag as TagIcon, Plus, X, Check, ChevronDown } from 'lucide-react';
import { tags as tagsApi, Tag } from '../../api';

interface TagManagerProps {
  projectId: string;
  selectedAssetIds: string[];
  onTagsChanged?: () => void;
  mode?: 'manage' | 'select'; // manage = CRUD operations, select = just picking tags
  selectedTagIds?: string[];
  onSelectionChange?: (tagIds: string[]) => void;
  compact?: boolean;
}

export const TagManager: React.FC<TagManagerProps> = ({
  projectId,
  selectedAssetIds,
  onTagsChanged,
  mode = 'manage',
  selectedTagIds = [],
  onSelectionChange,
  compact = false,
}) => {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDropdown, setShowDropdown] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6366f1');
  const [isCreating, setIsCreating] = useState(false);
  const [applyingTags, setApplyingTags] = useState(false);

  // Predefined colors for quick selection
  const colorOptions = [
    '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
    '#eab308', '#22c55e', '#14b8a6', '#0ea5e9', '#64748b',
  ];

  useEffect(() => {
    loadTags();
  }, [projectId]);

  const loadTags = async () => {
    try {
      setLoading(true);
      const projectTags = await tagsApi.getAll(projectId);
      setTags(projectTags);
    } catch (err) {
      console.error('Failed to load tags:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;

    try {
      setIsCreating(true);
      const tag = await tagsApi.create(projectId, newTagName.trim(), newTagColor);
      setTags(prev => [...prev, tag]);
      setNewTagName('');
      setNewTagColor('#6366f1');
      onTagsChanged?.();
    } catch (err: any) {
      console.error('Failed to create tag:', err);
      alert(err.response?.data?.error || 'Failed to create tag');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    if (!confirm('Delete this tag? It will be removed from all assets.')) return;

    try {
      await tagsApi.delete(tagId);
      setTags(prev => prev.filter(t => t.id !== tagId));
      onTagsChanged?.();
    } catch (err) {
      console.error('Failed to delete tag:', err);
    }
  };

  const handleApplyTags = async (tagIds: string[]) => {
    if (selectedAssetIds.length === 0 || tagIds.length === 0) return;

    try {
      setApplyingTags(true);
      await tagsApi.addToAssets(selectedAssetIds, tagIds);
      onTagsChanged?.();
    } catch (err) {
      console.error('Failed to apply tags:', err);
    } finally {
      setApplyingTags(false);
    }
  };

  const handleRemoveTags = async (tagIds: string[]) => {
    if (selectedAssetIds.length === 0 || tagIds.length === 0) return;

    try {
      setApplyingTags(true);
      await tagsApi.removeFromAssets(selectedAssetIds, tagIds);
      onTagsChanged?.();
    } catch (err) {
      console.error('Failed to remove tags:', err);
    } finally {
      setApplyingTags(false);
    }
  };

  const toggleTagSelection = (tagId: string) => {
    if (onSelectionChange) {
      const newSelection = selectedTagIds.includes(tagId)
        ? selectedTagIds.filter(id => id !== tagId)
        : [...selectedTagIds, tagId];
      onSelectionChange(newSelection);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-text-muted">
        <TagIcon className="w-4 h-4 animate-pulse" />
        <span>Loading tags...</span>
      </div>
    );
  }

  // Compact mode for inline use (e.g., in toolbar)
  if (compact) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-elevated hover:bg-surface-elevated/80 border border-border text-sm transition-colors"
        >
          <TagIcon className="w-4 h-4" />
          <span>Tags</span>
          {selectedTagIds.length > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-primary/20 text-primary rounded-full">
              {selectedTagIds.length}
            </span>
          )}
          <ChevronDown className="w-3 h-3" />
        </button>

        {showDropdown && (
          <div className="absolute top-full left-0 mt-1 w-64 bg-surface-elevated border border-border rounded-xl shadow-lg z-50">
            <div className="p-2 max-h-64 overflow-y-auto">
              {tags.length === 0 ? (
                <div className="text-sm text-text-muted text-center py-4">
                  No tags yet. Create one below.
                </div>
              ) : (
                tags.map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => toggleTagSelection(tag.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                      selectedTagIds.includes(tag.id)
                        ? 'bg-primary/20 text-primary'
                        : 'hover:bg-surface text-text'
                    }`}
                  >
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="flex-1 text-left text-sm truncate">{tag.name}</span>
                    {selectedTagIds.includes(tag.id) && (
                      <Check className="w-4 h-4" />
                    )}
                  </button>
                ))
              )}
            </div>

            {/* Quick create */}
            <div className="border-t border-border p-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
                  placeholder="New tag name..."
                  className="flex-1 px-2 py-1.5 text-sm bg-surface border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  onClick={handleCreateTag}
                  disabled={!newTagName.trim() || isCreating}
                  className="p-1.5 rounded-lg bg-primary text-white hover:bg-primary/80 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Full mode for tag management panel
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text flex items-center gap-2">
          <TagIcon className="w-4 h-4" />
          Tags
        </h3>
        {tags.length > 0 && (
          <span className="text-xs text-text-muted">
            {tags.length} tag{tags.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Tag list */}
      <div className="space-y-1">
        {tags.map(tag => (
          <div
            key={tag.id}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface hover:bg-surface-elevated group transition-colors"
          >
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: tag.color }}
            />
            <span className="flex-1 text-sm truncate">{tag.name}</span>
            {tag._count && (
              <span className="text-xs text-text-muted">
                {tag._count.assets}
              </span>
            )}
            {mode === 'manage' && (
              <button
                onClick={() => handleDeleteTag(tag.id)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/20 text-red-400 transition-all"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}

        {tags.length === 0 && (
          <div className="text-sm text-text-muted text-center py-4">
            No tags yet. Create one below.
          </div>
        )}
      </div>

      {/* Create new tag */}
      <div className="pt-2 border-t border-border">
        <div className="flex items-center gap-2 mb-2">
          <input
            type="text"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
            placeholder="New tag name..."
            className="flex-1 px-3 py-2 text-sm bg-surface border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={handleCreateTag}
            disabled={!newTagName.trim() || isCreating}
            className="px-3 py-2 rounded-lg bg-primary text-white hover:bg-primary/80 disabled:opacity-50 text-sm"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Color picker */}
        <div className="flex items-center gap-1">
          {colorOptions.map(color => (
            <button
              key={color}
              onClick={() => setNewTagColor(color)}
              className={`w-5 h-5 rounded-full transition-all ${
                newTagColor === color ? 'ring-2 ring-offset-2 ring-primary ring-offset-surface' : ''
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      {/* Apply to selected assets */}
      {mode === 'manage' && selectedAssetIds.length > 0 && tags.length > 0 && (
        <div className="pt-3 border-t border-border">
          <p className="text-xs text-text-muted mb-2">
            Apply tags to {selectedAssetIds.length} selected asset{selectedAssetIds.length !== 1 ? 's' : ''}:
          </p>
          <div className="flex flex-wrap gap-1">
            {tags.map(tag => (
              <button
                key={tag.id}
                onClick={() => handleApplyTags([tag.id])}
                disabled={applyingTags}
                className="flex items-center gap-1 px-2 py-1 rounded-full text-xs hover:opacity-80 transition-opacity disabled:opacity-50"
                style={{ backgroundColor: tag.color + '30', color: tag.color }}
              >
                <Plus className="w-3 h-3" />
                {tag.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Simple tag badge component for displaying tags on assets
export const TagBadge: React.FC<{ tag: Tag; onRemove?: () => void; size?: 'sm' | 'md' }> = ({
  tag,
  onRemove,
  size = 'sm',
}) => {
  const sizeClasses = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full ${sizeClasses}`}
      style={{ backgroundColor: tag.color + '30', color: tag.color }}
    >
      {tag.name}
      {onRemove && (
        <button onClick={onRemove} className="hover:opacity-70">
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
};

export default TagManager;
