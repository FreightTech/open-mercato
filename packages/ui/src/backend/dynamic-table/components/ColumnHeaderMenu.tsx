import React, { useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { ArrowUpAZ, ArrowDownZA, Filter, Pin, PinOff, EyeOff } from 'lucide-react';
import { ColumnDef, ContextMenuAction } from '../types/index';

interface ColumnHeaderMenuProps {
  column: ColumnDef;
  colIndex: number;
  anchorRect: DOMRect;
  isFrozen: boolean;
  onSortAsc: () => void;
  onSortDesc: () => void;
  onFilterByField: () => void;
  onFreezeToggle: () => void;
  onHideField: () => void;
  onClose: () => void;
  extraActions?: ContextMenuAction[];
  onExtraAction?: (actionId: string) => void;
}

const ColumnHeaderMenu: React.FC<ColumnHeaderMenuProps> = ({
  column,
  colIndex,
  anchorRect,
  isFrozen,
  onSortAsc,
  onSortDesc,
  onFilterByField,
  onFreezeToggle,
  onHideField,
  onClose,
  extraActions,
  onExtraAction,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Position below anchor, clamped to viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    top: anchorRect.bottom + 4,
    left: anchorRect.left,
    zIndex: 9999,
  };

  // Clamp to right edge
  if (menuRef.current) {
    const menuRect = menuRef.current.getBoundingClientRect();
    if (style.left as number + menuRect.width > window.innerWidth - 8) {
      style.left = window.innerWidth - menuRect.width - 8;
    }
  }

  const menuContent = (
    <div ref={menuRef} className="hot-col-menu" style={style}>
      <button className="hot-col-menu-item" onClick={() => { onSortAsc(); onClose(); }}>
        <ArrowUpAZ className="w-4 h-4" />
        <span>Sort A → Z</span>
      </button>
      <button className="hot-col-menu-item" onClick={() => { onSortDesc(); onClose(); }}>
        <ArrowDownZA className="w-4 h-4" />
        <span>Sort Z → A</span>
      </button>
      <button className="hot-col-menu-item" onClick={() => { onFilterByField(); onClose(); }}>
        <Filter className="w-4 h-4" />
        <span>Filter by this field</span>
      </button>
      <button className="hot-col-menu-item" onClick={() => { onFreezeToggle(); onClose(); }}>
        {isFrozen ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
        <span>{isFrozen ? 'Unfreeze column' : 'Freeze column'}</span>
      </button>
      <button className="hot-col-menu-item" onClick={() => { onHideField(); onClose(); }}>
        <EyeOff className="w-4 h-4" />
        <span>Hide field</span>
      </button>

      {extraActions && extraActions.length > 0 && (
        <>
          <div className="hot-col-menu-divider" />
          {extraActions.map(action => (
            <button
              key={action.id}
              className="hot-col-menu-item"
              disabled={action.disabled}
              onClick={() => {
                onExtraAction?.(action.id);
                onClose();
              }}
            >
              <span>{action.label}</span>
            </button>
          ))}
        </>
      )}
    </div>
  );

  if (typeof document === 'undefined') return menuContent;
  return ReactDOM.createPortal(menuContent, document.body);
};

export default ColumnHeaderMenu;
