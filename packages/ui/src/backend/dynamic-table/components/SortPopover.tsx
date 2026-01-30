import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { ColumnDef } from '../types/index';
import { SortRule, generateSortRuleId } from '../types/perspective';

interface SortPopoverProps {
  columns: ColumnDef[];
  sortRules: SortRule[];
  onSortRulesChange: (rules: SortRule[]) => void;
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

const SortPopover: React.FC<SortPopoverProps> = ({
  columns,
  sortRules,
  onSortRulesChange,
  isOpen,
  onClose,
  anchorRef,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Position popover
  const updatePopoverPosition = useCallback(() => {
    if (!anchorRef.current || !popoverRef.current) return;

    const anchor = anchorRef.current.getBoundingClientRect();
    const popover = popoverRef.current;

    popover.style.top = `${anchor.bottom + 4}px`;
    popover.style.left = `${anchor.left}px`;
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

  // Add new sort rule
  const addSortRule = useCallback(() => {
    // Find first column not already in sort rules
    const usedFields = sortRules.map(r => r.field);
    const availableColumn = columns.find(c => !usedFields.includes(c.data));

    const newRule: SortRule = {
      id: generateSortRuleId(),
      field: availableColumn?.data || columns[0]?.data || '',
      direction: 'asc',
    };
    onSortRulesChange([...sortRules, newRule]);
  }, [columns, sortRules, onSortRulesChange]);

  // Remove sort rule
  const removeSortRule = useCallback((id: string) => {
    onSortRulesChange(sortRules.filter(rule => rule.id !== id));
  }, [sortRules, onSortRulesChange]);

  // Update sort rule
  const updateSortRule = useCallback((id: string, updates: Partial<SortRule>) => {
    onSortRulesChange(sortRules.map(rule =>
      rule.id === id ? { ...rule, ...updates } : rule
    ));
  }, [sortRules, onSortRulesChange]);

  // Toggle direction
  const toggleDirection = useCallback((id: string) => {
    const rule = sortRules.find(r => r.id === id);
    if (rule) {
      updateSortRule(id, { direction: rule.direction === 'asc' ? 'desc' : 'asc' });
    }
  }, [sortRules, updateSortRule]);

  // Clear all sort rules
  const clearAll = useCallback(() => {
    onSortRulesChange([]);
  }, [onSortRulesChange]);

  // Drag handlers for reordering
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedIndex !== null && index !== draggedIndex) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newRules = [...sortRules];
    const [draggedRule] = newRules.splice(draggedIndex, 1);
    newRules.splice(targetIndex, 0, draggedRule);

    onSortRulesChange(newRules);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Get available columns (not already used in other rules)
  const getAvailableColumns = (currentRuleId: string) => {
    const usedFields = sortRules
      .filter(r => r.id !== currentRuleId)
      .map(r => r.field);
    return columns.filter(c => !usedFields.includes(c.data));
  };

  const getRowClassName = (index: number) => {
    const classes = ['sort-popover-row'];
    if (draggedIndex === index) classes.push('dragging');
    if (dragOverIndex === index) classes.push('drag-over');
    return classes.join(' ');
  };

  if (!isOpen) return null;

  const popoverContent = (
    <div
      ref={popoverRef}
      className="perspective-popover sort-popover"
    >
      {/* Header */}
      <div className="sort-popover-header">
        <span className="sort-popover-title">
          Sort by
        </span>
        <button onClick={clearAll} className="sort-popover-clear-btn">
          Clear all
        </button>
      </div>

      {/* Sort Rules */}
      <div className="sort-popover-content">
        {sortRules.length === 0 ? (
          <div className="sort-popover-empty">
            No sorting applied
          </div>
        ) : (
          sortRules.map((rule, index) => {
            const availableColumns = getAvailableColumns(rule.id);
            const currentColumn = columns.find(c => c.data === rule.field);

            return (
              <div
                key={rule.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                className={getRowClassName(index)}
              >
                {/* Priority Number */}
                <span className="sort-popover-priority">
                  {index + 1}
                </span>

                {/* Field Select */}
                <select
                  value={rule.field}
                  onChange={(e) => updateSortRule(rule.id, { field: e.target.value })}
                  className="sort-popover-select"
                >
                  {/* Current selection (always show) */}
                  {currentColumn && (
                    <option value={currentColumn.data}>
                      {currentColumn.title || currentColumn.data}
                    </option>
                  )}
                  {/* Available options */}
                  {availableColumns
                    .filter(c => c.data !== rule.field)
                    .map(col => (
                      <option key={col.data} value={col.data}>
                        {col.title || col.data}
                      </option>
                    ))}
                </select>

                {/* Direction Toggle */}
                <button
                  onClick={() => toggleDirection(rule.id)}
                  className="sort-popover-direction-btn"
                >
                  {rule.direction === 'asc' ? '↑ A-Z' : '↓ Z-A'}
                </button>

                {/* Remove Button */}
                <button
                  onClick={() => removeSortRule(rule.id)}
                  className="sort-popover-remove-btn"
                >
                  ×
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="sort-popover-footer">
        <button
          onClick={addSortRule}
          disabled={sortRules.length >= columns.length}
          className="sort-popover-add-btn"
        >
          <span>+</span>
          Add sort
        </button>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return popoverContent;
  return ReactDOM.createPortal(popoverContent, document.body);
};

export default SortPopover;
