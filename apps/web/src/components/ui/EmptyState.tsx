import React from 'react';

type EmptyStateType = 'no-assets' | 'no-annotations' | 'no-classes' | 'no-projects' | 'upload' | 'processing';

interface EmptyStateProps {
  type: EmptyStateType;
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

// SVG Illustrations for each empty state
const illustrations: Record<EmptyStateType, React.ReactNode> = {
  'no-assets': (
    <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-32 h-28">
      {/* Frame/Image placeholder */}
      <rect x="20" y="15" width="80" height="60" rx="8" className="fill-primary/10 stroke-primary/30" strokeWidth="2" strokeDasharray="6 4" />
      <circle cx="45" cy="35" r="8" className="fill-primary/20" />
      <path d="M25 65 L50 45 L70 55 L95 35" className="stroke-primary/30" strokeWidth="2" strokeLinecap="round" />
      {/* Plus icon */}
      <circle cx="85" cy="65" r="15" className="fill-primary/20 stroke-primary" strokeWidth="2" />
      <path d="M85 58 V72 M78 65 H92" className="stroke-primary" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  'no-annotations': (
    <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-32 h-28">
      {/* Image with bounding box */}
      <rect x="15" y="10" width="70" height="55" rx="6" className="fill-surface-elevated stroke-border" strokeWidth="2" />
      <rect x="25" y="25" width="30" height="25" rx="2" className="stroke-primary/40" strokeWidth="2" strokeDasharray="4 3" />
      {/* Cursor/pointer */}
      <path d="M75 50 L90 65 L82 67 L78 78 L72 76 L76 65 L68 60 Z" className="fill-primary/80 stroke-primary" strokeWidth="1.5" />
      {/* Sparkles indicating AI */}
      <circle cx="100" cy="20" r="3" className="fill-amber-400" />
      <circle cx="95" cy="30" r="2" className="fill-amber-300" />
      <circle cx="105" cy="28" r="2" className="fill-amber-400" />
    </svg>
  ),
  'no-classes': (
    <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-32 h-28">
      {/* Tag icons */}
      <path d="M30 25 L55 25 L70 40 L55 55 L30 55 L30 25 Z" className="fill-purple-500/20 stroke-purple-400" strokeWidth="2" />
      <circle cx="42" cy="40" r="4" className="fill-purple-400" />
      <path d="M50 45 L70 45 L85 60 L70 75 L50 75 L50 45 Z" className="fill-cyan-500/20 stroke-cyan-400" strokeWidth="2" />
      <circle cx="62" cy="60" r="4" className="fill-cyan-400" />
      {/* Plus */}
      <circle cx="95" cy="35" r="12" className="fill-primary/20 stroke-primary" strokeWidth="2" />
      <path d="M95 29 V41 M89 35 H101" className="stroke-primary" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  'no-projects': (
    <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-32 h-28">
      {/* Folder stack */}
      <path d="M20 35 L20 75 L90 75 L90 35 L55 35 L50 25 L25 25 L20 35 Z" className="fill-amber-500/10 stroke-amber-400/50" strokeWidth="2" />
      <path d="M25 40 L25 70 L85 70 L85 40 L55 40 L50 32 L30 32 L25 40 Z" className="fill-amber-500/20 stroke-amber-400" strokeWidth="2" />
      {/* Plus icon */}
      <circle cx="95" cy="25" r="12" className="fill-primary/20 stroke-primary" strokeWidth="2" />
      <path d="M95 19 V31 M89 25 H101" className="stroke-primary" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  'upload': (
    <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-32 h-28">
      {/* Cloud */}
      <path d="M30 60 C20 60 15 50 20 42 C15 35 22 25 35 25 C40 15 55 10 70 18 C85 12 100 22 98 38 C110 42 108 60 95 60 Z"
        className="fill-primary/10 stroke-primary/50" strokeWidth="2" />
      {/* Upload arrow */}
      <path d="M60 45 V70" className="stroke-primary" strokeWidth="3" strokeLinecap="round" />
      <path d="M50 55 L60 45 L70 55" className="stroke-primary" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {/* Files */}
      <rect x="35" y="75" width="12" height="15" rx="2" className="fill-indigo-400/50 stroke-indigo-400" strokeWidth="1.5" />
      <rect x="54" y="75" width="12" height="15" rx="2" className="fill-purple-400/50 stroke-purple-400" strokeWidth="1.5" />
      <rect x="73" y="75" width="12" height="15" rx="2" className="fill-pink-400/50 stroke-pink-400" strokeWidth="1.5" />
    </svg>
  ),
  'processing': (
    <svg viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-32 h-28">
      {/* Gear/cog */}
      <circle cx="60" cy="50" r="20" className="fill-primary/10" />
      <circle cx="60" cy="50" r="12" className="fill-surface stroke-primary" strokeWidth="2" />
      <g className="animate-spin origin-center" style={{ transformOrigin: '60px 50px' }}>
        <rect x="57" y="25" width="6" height="10" rx="2" className="fill-primary" />
        <rect x="57" y="65" width="6" height="10" rx="2" className="fill-primary" />
        <rect x="35" y="47" width="10" height="6" rx="2" className="fill-primary" />
        <rect x="75" y="47" width="10" height="6" rx="2" className="fill-primary" />
        <rect x="38" y="30" width="8" height="6" rx="2" transform="rotate(45 42 33)" className="fill-primary" />
        <rect x="74" y="64" width="8" height="6" rx="2" transform="rotate(45 78 67)" className="fill-primary" />
        <rect x="74" y="30" width="8" height="6" rx="2" transform="rotate(-45 78 33)" className="fill-primary" />
        <rect x="38" y="64" width="8" height="6" rx="2" transform="rotate(-45 42 67)" className="fill-primary" />
      </g>
      {/* Sparkles */}
      <circle cx="95" cy="25" r="4" className="fill-amber-400 animate-pulse" />
      <circle cx="25" cy="30" r="3" className="fill-cyan-400 animate-pulse" style={{ animationDelay: '0.5s' }} />
      <circle cx="90" cy="75" r="3" className="fill-purple-400 animate-pulse" style={{ animationDelay: '1s' }} />
    </svg>
  )
};

const defaultContent: Record<EmptyStateType, { title: string; description: string }> = {
  'no-assets': {
    title: 'No assets yet',
    description: 'Upload images or videos to start labeling your data'
  },
  'no-annotations': {
    title: 'No annotations',
    description: 'Run inference or manually draw annotations on your assets'
  },
  'no-classes': {
    title: 'No classes defined',
    description: 'Add classes to categorize your annotations'
  },
  'no-projects': {
    title: 'No projects yet',
    description: 'Create your first project to start organizing your data'
  },
  'upload': {
    title: 'Drop files here',
    description: 'Drag and drop images or videos to upload'
  },
  'processing': {
    title: 'Processing...',
    description: 'AI is analyzing your images'
  }
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  type,
  title,
  description,
  action
}) => {
  const content = defaultContent[type];

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="mb-4 opacity-80">
        {illustrations[type]}
      </div>
      <h3 className="text-lg font-semibold text-text mb-1">
        {title || content.title}
      </h3>
      <p className="text-sm text-text-muted max-w-xs mb-4">
        {description || content.description}
      </p>
      {action && (
        <div className="mt-2">
          {action}
        </div>
      )}
    </div>
  );
};

export default EmptyState;
