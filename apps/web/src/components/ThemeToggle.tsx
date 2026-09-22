import React, { useEffect, useRef, useState } from 'react';
import { Sun, Moon, Monitor, Palette } from 'lucide-react';
import { ColorTheme, ThemeMode, useSettings } from '../contexts/SettingsContext';

interface ThemeToggleProps {
  showLabel?: boolean;
  className?: string;
}

// Roughly the panel's rendered height; used to decide which way it opens.
const PANEL_MAX_HEIGHT = 230;

const MODE_OPTIONS: { id: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { id: 'light', label: 'Light', icon: <Sun className="w-4 h-4" /> },
  { id: 'dark', label: 'Dark', icon: <Moon className="w-4 h-4" /> },
  { id: 'system', label: 'System', icon: <Monitor className="w-4 h-4" /> },
];

const COLOR_OPTIONS: { id: ColorTheme; label: string; swatch: string }[] = [
  { id: 'indigo', label: 'Indigo', swatch: 'linear-gradient(135deg, #4f46e5 0%, #8b5cf6 100%)' },
  { id: 'ocean', label: 'Ocean', swatch: 'linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)' },
  { id: 'sunset', label: 'Sunset', swatch: 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)' },
  { id: 'forest', label: 'Forest', swatch: 'linear-gradient(135deg, #16a34a 0%, #14b8a6 100%)' },
];

export default function ThemeToggle({ showLabel = false, className = '' }: ThemeToggleProps) {
  const { settings, setTheme } = useSettings();

  return (
    <div className={`flex items-center gap-1 p-1 rounded-lg glass-panel ${className}`}>
      {MODE_OPTIONS.map((theme) => (
        <button
          key={theme.id}
          onClick={() => setTheme(theme.id)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
            settings.theme === theme.id
              ? 'bg-primary/15 text-primary border border-primary/30'
              : 'text-text-muted hover:text-text'
          }`}
          title={theme.label}
        >
          {theme.icon}
          {showLabel && <span>{theme.label}</span>}
        </button>
      ))}
    </div>
  );
}

export function ThemeDropdown({ className = '' }: { className?: string }) {
  const { settings, setTheme, colorTheme, setColorTheme } = useSettings();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // The floating dock places this button near the bottom of the screen, where a panel
  // opening downwards would fall outside the viewport. Flip it upwards when
  // there is not enough room below.
  const [openUpwards, setOpenUpwards] = useState(false);
  useEffect(() => {
    if (!open || !containerRef.current) return;
    const spaceBelow = window.innerHeight - containerRef.current.getBoundingClientRect().bottom;
    setOpenUpwards(spaceBelow < PANEL_MAX_HEIGHT);
  }, [open]);

  const currentModeIcon = settings.theme === 'light'
    ? <Sun className="w-4 h-4" />
    : settings.theme === 'dark'
      ? <Moon className="w-4 h-4" />
      : <Monitor className="w-4 h-4" />;

  const currentColor = COLOR_OPTIONS.find((opt) => opt.id === colorTheme);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="glass-button rounded-xl px-3 py-2.5 flex items-center gap-2 text-text-muted hover:text-text"
        title="Theme and appearance"
      >
        {currentModeIcon}
        <Palette className="w-4 h-4" />
        <span
          className="w-3 h-3 rounded-full border border-white/30"
          style={{ background: currentColor?.swatch || COLOR_OPTIONS[0].swatch }}
        />
      </button>

      {open && (
        <div className={`absolute right-0 w-64 glass-card rounded-2xl p-3 z-50 animate-scale-in ${openUpwards ? 'bottom-full mb-2' : 'mt-2'}`}>
          <div className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2 px-1">Mode</div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {MODE_OPTIONS.map((mode) => (
              <button
                key={mode.id}
                onClick={() => setTheme(mode.id)}
                className={`rounded-xl px-2 py-2 text-xs font-medium border transition-all flex items-center justify-center gap-1.5 ${
                  settings.theme === mode.id
                    ? 'border-primary/50 bg-primary/15 text-primary'
                    : 'border-glass-border text-text-muted hover:text-text hover:border-primary/30'
                }`}
              >
                {mode.icon}
                {mode.label}
              </button>
            ))}
          </div>

          <div className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2 px-1">Palette</div>
          <div className="grid grid-cols-2 gap-2">
            {COLOR_OPTIONS.map((color) => (
              <button
                key={color.id}
                onClick={() => setColorTheme(color.id)}
                className={`rounded-xl px-2 py-2 text-xs font-medium border transition-all flex items-center gap-2 ${
                  colorTheme === color.id
                    ? 'border-primary/50 bg-primary/10 text-text'
                    : 'border-glass-border text-text-muted hover:text-text hover:border-primary/30'
                }`}
              >
                <span className="w-4 h-4 rounded-full border border-white/30" style={{ background: color.swatch }} />
                {color.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
