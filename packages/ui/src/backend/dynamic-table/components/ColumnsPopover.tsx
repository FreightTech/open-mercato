import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { ColumnDef } from '../types/index';

interface ColumnsPopoverProps {
  columns: ColumnDef[];
  visibleColumns: string[];
  hiddenColumns: string[];
  onColumnVisibilityChange: (visible: string[], hidden: string[]) => void;
  onColumnOrderChange: (newOrder: string[]) => void;
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

const ColumnsPopover: React.FC<ColumnsPopoverProps> = ({
  columns,
  visibleColumns,
  hiddenColumns,
  onColumnVisibilityChange,
  onColumnOrderChange,
  isOpen,
  onClose,
  anchorRef,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Visible columns first (in their order), then hidden columns
  const allColumnKeys = React.useMemo(() => {
    return [...visibleColumns, ...hiddenColumns];
  }, [visibleColumns, hiddenColumns]);

  // Get column title by key
  const getColumnTitle = (key: string) => {
    const col = columns.find(c => c.data === key);
    return col?.title || key;
  };

  // Get column type icon
  const getColumnIcon = (key: string) => {
    const col = columns.find(c => c.data === key);
    switch (col?.type) {
      case 'numeric': return '#';
      case 'date': return '📅';
      case 'boolean': return '✓';
      case 'dropdown': return '▼';
      default: return 'A';
    }
  };

  // Filter columns by search query
  const filteredColumns = allColumnKeys.filter(key => {
    const title = getColumnTitle(key).toLowerCase();
    return title.includes(searchQuery.toLowerCase());
  });

  // Position popover with viewport boundary clamping
  const updatePopoverPosition = useCallback(() => {
    if (!anchorRef.current || !popoverRef.current) return;

    const anchor = anchorRef.current.getBoundingClientRect();
    const popover = popoverRef.current;
    const popoverRect = popover.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 8;

    let top = anchor.bottom + 4;
    let left = anchor.left;

    // Clamp to right edge of viewport
    if (left + popoverRect.width > viewportWidth - padding) {
      left = viewportWidth - popoverRect.width - padding;
    }

    // Clamp to left edge of viewport
    if (left < padding) {
      left = padding;
    }

    // If not enough space below, position above the anchor
    if (top + popoverRect.height > viewportHeight - padding) {
      const topAbove = anchor.top - popoverRect.height - 4;
      if (topAbove >= padding) {
        top = topAbove;
      }
    }

    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
  }, [anchorRef]);

  useEffect(() => {
    if (!isOpen) return;

    // Initial positioning
    updatePopoverPosition();

    // Update position on scroll (capture phase to catch scrolling in any container)
    const handleScroll = () => {
      updatePopoverPosition();
    };

    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [isOpen, updatePopoverPosition]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, anchorRef]);

  // Toggle column visibility - preserve position in the list
  const toggleColumn = useCallback((key: string) => {
    const isVisible = visibleColumns.includes(key);

    if (isVisible) {
      // Hide: remove from visible, add to end of hidden
      const newVisible = visibleColumns.filter(k => k !== key);
      const newHidden = [...hiddenColumns, key];
      onColumnVisibilityChange(newVisible, newHidden);
    } else {
      // Show: remove from hidden, add to end of visible
      const newHidden = hiddenColumns.filter(k => k !== key);
      const newVisible = [...visibleColumns, key];
      onColumnVisibilityChange(newVisible, newHidden);
    }
  }, [visibleColumns, hiddenColumns, onColumnVisibilityChange]);

  // Hide all columns (keep at least first one visible)
  const hideAll = useCallback(() => {
    const firstColumn = visibleColumns[0];
    if (firstColumn) {
      // Keep first visible, move rest to hidden (preserving order)
      const newHidden = [...visibleColumns.slice(1), ...hiddenColumns];
      onColumnVisibilityChange([firstColumn], newHidden);
    }
  }, [visibleColumns, hiddenColumns, onColumnVisibilityChange]);

  // Show all columns (preserve current order)
  const showAll = useCallback(() => {
    // Move all to visible, preserving current order
    const allVisible = [...visibleColumns, ...hiddenColumns];
    onColumnVisibilityChange(allVisible, []);
  }, [visibleColumns, hiddenColumns, onColumnVisibilityChange]);

  // Drag handlers for reordering
  const handleDragStart = (e: React.DragEvent, key: string) => {
    setDraggedItem(key);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', key);
  };

  const handleDragOver = (e: React.DragEvent, key: string) => {
    e.preventDefault();

    // Only allow drop within same visibility group
    const draggedIsVisible = draggedItem ? visibleColumns.includes(draggedItem) : false;
    const targetIsVisible = visibleColumns.includes(key);

    if (draggedIsVisible !== targetIsVisible) {
      e.dataTransfer.dropEffect = 'none';
      setDragOverItem(null);
      return;
    }

    e.dataTransfer.dropEffect = 'move';
    if (draggedItem && key !== draggedItem) {
      setDragOverItem(key);
    }
  };

  const handleDragLeave = () => {
    setDragOverItem(null);
  };

  const handleDrop = (e: React.DragEvent, targetKey: string) => {
    e.preventDefault();
    if (!draggedItem || draggedItem === targetKey) {
      setDraggedItem(null);
      setDragOverItem(null);
      return;
    }

    const draggedIsVisible = visibleColumns.includes(draggedItem);
    const targetIsVisible = visibleColumns.includes(targetKey);

    // Only allow reordering within the same visibility group
    if (draggedIsVisible !== targetIsVisible) {
      setDraggedItem(null);
      setDragOverItem(null);
      return;
    }

    if (draggedIsVisible) {
      // Reorder within visible columns
      const newVisible = [...visibleColumns];
      const draggedIndex = newVisible.indexOf(draggedItem);
      const targetIndex = newVisible.indexOf(targetKey);

      newVisible.splice(draggedIndex, 1);
      newVisible.splice(targetIndex, 0, draggedItem);

      onColumnOrderChange(newVisible);
    } else {
      // Reorder within hidden columns
      const newHidden = [...hiddenColumns];
      const draggedIndex = newHidden.indexOf(draggedItem);
      const targetIndex = newHidden.indexOf(targetKey);

      newHidden.splice(draggedIndex, 1);
      newHidden.splice(targetIndex, 0, draggedItem);

      onColumnVisibilityChange(visibleColumns, newHidden);
    }

    setDraggedItem(null);
    setDragOverItem(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverItem(null);
  };

  if (!isOpen) return null;

  const getItemClassName = (key: string) => {
    const isDragging = draggedItem === key;
    const isDragOver = dragOverItem === key;
    const classes = ['columns-popover-item'];
    if (isDragging) classes.push('dragging');
    if (isDragOver) classes.push('drag-over');
    return classes.join(' ');
  };

  const popoverContent = (
    <div
      ref={popoverRef}
      className="perspective-popover columns-popover"
    >
      {/* Header */}
      <div className="columns-popover-header">
        <div className="columns-popover-header-row">
          <span className="columns-popover-title">Hide fields</span>
          <span className="columns-popover-count">
            {visibleColumns.length} visible
          </span>
        </div>
        <input
          type="text"
          placeholder="Find a field"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="columns-popover-search"
        />
      </div>

      {/* Column List */}
      <div className="columns-popover-list">
        {/* Visible columns section */}
        {filteredColumns.filter(k => visibleColumns.includes(k)).map((key) => (
          <div
            key={key}
            draggable
            onDragStart={(e) => handleDragStart(e, key)}
            onDragOver={(e) => handleDragOver(e, key)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, key)}
            onDragEnd={handleDragEnd}
            className={getItemClassName(key)}
          >
            {/* Visibility Toggle */}
            <button
              onClick={() => toggleColumn(key)}
              className="columns-popover-toggle visible"
            >
              ✓
            </button>

            {/* Column Icon */}
            <span className="columns-popover-icon">
              {getColumnIcon(key)}
            </span>

            {/* Column Name */}
            <span className="columns-popover-name">
              {getColumnTitle(key)}
            </span>

            {/* Drag Handle */}
            <span className="columns-popover-drag-handle">
              ⋮⋮
            </span>
          </div>
        ))}

        {/* Separator between visible and hidden */}
        {filteredColumns.some(k => visibleColumns.includes(k)) &&
         filteredColumns.some(k => hiddenColumns.includes(k)) && (
          <div className="columns-popover-separator">
            <span className="columns-popover-separator-label">Hidden columns</span>
          </div>
        )}

        {/* Hidden columns section */}
        {filteredColumns.filter(k => hiddenColumns.includes(k)).map((key) => (
          <div
            key={key}
            draggable
            onDragStart={(e) => handleDragStart(e, key)}
            onDragOver={(e) => handleDragOver(e, key)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, key)}
            onDragEnd={handleDragEnd}
            className={getItemClassName(key)}
          >
            {/* Visibility Toggle */}
            <button
              onClick={() => toggleColumn(key)}
              className="columns-popover-toggle hidden"
            >
              {''}
            </button>

            {/* Column Icon */}
            <span className="columns-popover-icon">
              {getColumnIcon(key)}
            </span>

            {/* Column Name */}
            <span className="columns-popover-name hidden">
              {getColumnTitle(key)}
            </span>

            {/* Drag Handle */}
            <span className="columns-popover-drag-handle">
              ⋮⋮
            </span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="columns-popover-footer">
        <button onClick={hideAll} className="columns-popover-btn">
          Hide all
        </button>
        <button onClick={showAll} className="columns-popover-btn">
          Show all
        </button>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return popoverContent;
  return ReactDOM.createPortal(popoverContent, document.body);
};

export default ColumnsPopover;
