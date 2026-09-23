import React, { useState } from 'react';
import {
  ChevronLeft, ChevronRight, Upload, Tag, Settings, Download,
  Home, Layers, FolderOpen, Zap, Eye, HelpCircle
} from 'lucide-react';
import Logo from '../Logo';

interface SidebarItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  onClick?: () => void;
  active?: boolean;
  badge?: number | string;
}

interface SidebarProps {
  items: SidebarItem[];
  collapsed?: boolean;
  onToggle?: () => void;
  onItemClick?: (id: string) => void;
  footer?: React.ReactNode;
  onLogoClick?: () => void;
  onShortcutsClick?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  items,
  collapsed = false,
  onToggle,
  onItemClick,
  footer,
  onLogoClick,
  onShortcutsClick
}) => {
  return (
    <aside
      className={`fixed left-0 top-0 h-screen z-30 transition-all duration-300 ease-out ${
        collapsed ? 'w-16' : 'w-56'
      }`}
    >
      <div className="h-full glass-panel border-r border-glass-border flex flex-col">
        {/* Logo Section */}
        <div className={`p-4 border-b border-glass-border flex items-center ${collapsed ? 'justify-center' : 'justify-start'}`}>
          <button
            onClick={onLogoClick}
            className="w-full text-left rounded-xl hover:bg-primary/10 transition-colors p-1"
            title="Go to homepage"
          >
            {collapsed ? (
              <Logo size="sm" showText={false} />
            ) : (
              <Logo size="sm" showText={true} />
            )}
          </button>
        </div>

        {/* Toggle Button */}
        <button
          onClick={onToggle}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full glass-card border border-glass-border flex items-center justify-center hover:bg-primary/10 transition-colors z-10"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5 text-text-muted" />
          )}
        </button>

        {/* Navigation Items */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                item.onClick?.();
                onItemClick?.(item.id);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
                item.active
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'text-text-muted hover:bg-surface-elevated hover:text-text'
              }`}
              title={collapsed ? item.label : undefined}
            >
              <span className={`flex-shrink-0 ${item.active ? 'text-primary' : 'text-text-muted group-hover:text-text'}`}>
                {item.icon}
              </span>

              {!collapsed && (
                <>
                  <span className="flex-1 text-left text-sm font-medium truncate">
                    {item.label}
                  </span>

                  {item.badge !== undefined && (
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-primary/20 text-primary">
                      {item.badge}
                    </span>
                  )}

                  {item.shortcut && (
                    <kbd className="hidden lg:inline-block px-1.5 py-0.5 text-[10px] font-mono rounded bg-surface-elevated text-text-muted border border-border">
                      {item.shortcut}
                    </kbd>
                  )}
                </>
              )}
            </button>
          ))}
        </nav>

        {/* Footer */}
        {footer && !collapsed && (
          <div className="p-3 border-t border-glass-border">
            {footer}
          </div>
        )}

        {/* Help shortcut at bottom - only rendered when it can actually do something */}
        {onShortcutsClick && (
        <div className="p-2 border-t border-glass-border">
          <button
            onClick={onShortcutsClick}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-text-muted hover:bg-surface-elevated hover:text-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            title={collapsed ? 'Keyboard Shortcuts' : undefined}
          >
            <HelpCircle className="w-5 h-5 flex-shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left text-sm">Shortcuts</span>
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-surface-elevated text-text-muted border border-border">
                  ?
                </kbd>
              </>
            )}
          </button>
        </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
