import React from 'react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
}

const sizeMap = {
  sm: { icon: 28, text: 'text-lg' },
  md: { icon: 36, text: 'text-xl' },
  lg: { icon: 48, text: 'text-2xl' },
  xl: { icon: 64, text: 'text-3xl' },
};

export default function Logo({ size = 'md', showText = true, className = '' }: LogoProps) {
  const { icon, text } = sizeMap[size];

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Logo Icon - Modern abstract label/tag design */}
      <svg
        width={icon}
        height={icon}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
      >
        {/* Background gradient circle */}
        <defs>
          <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="50%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
          <linearGradient id="logoGradient2" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          <filter id="logoShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#6366f1" floodOpacity="0.3"/>
          </filter>
        </defs>

        {/* Main rounded square background */}
        <rect
          x="4"
          y="4"
          width="56"
          height="56"
          rx="14"
          fill="url(#logoGradient)"
          filter="url(#logoShadow)"
        />

        {/* Inner highlight */}
        <rect
          x="8"
          y="8"
          width="48"
          height="48"
          rx="10"
          fill="none"
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="1"
        />

        {/* Abstract "L" shape with bounding box styling */}
        <path
          d="M18 16h6v24h16v6H18V16z"
          fill="white"
          opacity="0.95"
        />

        {/* Detection box corners - top right */}
        <path
          d="M40 16h8v8M48 28v-4"
          stroke="url(#logoGradient2)"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />

        {/* Detection box corners - bottom right */}
        <path
          d="M48 40v8h-8M36 48h-4"
          stroke="url(#logoGradient2)"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />

        {/* Small accent dots representing detection points */}
        <circle cx="44" cy="22" r="2.5" fill="white" opacity="0.8" />
        <circle cx="44" cy="44" r="2.5" fill="white" opacity="0.8" />
      </svg>

      {showText && (
        <span className={`font-bold ${text} tracking-tight`}>
          <span className="text-slate-800 dark:text-white">Lable</span>
          <span className="bg-gradient-to-r from-blue-500 to-indigo-600 bg-clip-text text-transparent">it</span>
        </span>
      )}
    </div>
  );
}

// Animated version of the logo for hero section
export function AnimatedLogo({ size = 'xl', className = '' }: Omit<LogoProps, 'showText'>) {
  const { icon, text } = sizeMap[size];

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <svg
        width={icon}
        height={icon}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0 animate-pulse"
      >
        <defs>
          <linearGradient id="animLogoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6">
              <animate attributeName="stopColor" values="#3b82f6;#8b5cf6;#3b82f6" dur="3s" repeatCount="indefinite" />
            </stop>
            <stop offset="50%" stopColor="#6366f1">
              <animate attributeName="stopColor" values="#6366f1;#3b82f6;#6366f1" dur="3s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%" stopColor="#8b5cf6">
              <animate attributeName="stopColor" values="#8b5cf6;#6366f1;#8b5cf6" dur="3s" repeatCount="indefinite" />
            </stop>
          </linearGradient>
          <filter id="animLogoGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        <rect
          x="4"
          y="4"
          width="56"
          height="56"
          rx="14"
          fill="url(#animLogoGradient)"
          filter="url(#animLogoGlow)"
        />

        <rect
          x="8"
          y="8"
          width="48"
          height="48"
          rx="10"
          fill="none"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="1"
        />

        <path
          d="M18 16h6v24h16v6H18V16z"
          fill="white"
          opacity="0.95"
        />

        <path
          d="M40 16h8v8M48 28v-4"
          stroke="rgba(255,255,255,0.9)"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        >
          <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" />
        </path>

        <path
          d="M48 40v8h-8M36 48h-4"
          stroke="rgba(255,255,255,0.9)"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        >
          <animate attributeName="opacity" values="1;0.6;1" dur="2s" repeatCount="indefinite" />
        </path>

        <circle cx="44" cy="22" r="2.5" fill="white" opacity="0.8">
          <animate attributeName="r" values="2;3;2" dur="1.5s" repeatCount="indefinite" />
        </circle>
        <circle cx="44" cy="44" r="2.5" fill="white" opacity="0.8">
          <animate attributeName="r" values="3;2;3" dur="1.5s" repeatCount="indefinite" />
        </circle>
      </svg>

      <span className={`font-bold ${text} tracking-tight`}>
        <span className="text-slate-800 dark:text-white">Lable</span>
        <span className="bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 bg-clip-text text-transparent animate-gradient">it</span>
      </span>
    </div>
  );
}
