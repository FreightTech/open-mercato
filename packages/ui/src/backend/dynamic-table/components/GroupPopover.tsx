import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { ColumnDef } from '../types/index';
import { GroupRule, generateGroupRuleId } from '../types/grouping';

interface GroupPopoverProps {
  columns: ColumnDef[];
  groupRules: GroupRule[];
  onGroupRulesChange: (rules: GroupRule[]) => void;
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

const GroupPopover: React.FC<GroupPopoverProps> = ({
  columns,
  groupRules,
  onGroupRulesChange,
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

    updatePopoverPosition();

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

  const addGroupRule = useCallback(() => {
    const usedFields = groupRules.map(r => r.field);
    const availableColumn = columns.find(c => !usedFields.includes(c.data));

    const newRule: GroupRule = {
      id: generateGroupRuleId(),
      field: availableColumn?.data || columns[0]?.data || '',
      direction: 'asc',
    };
    onGroupRulesChange([...groupRules, newRule]);
  }, [columns, groupRules, onGroupRulesChange]);

  const removeGroupRule = useCallback((id: string) => {
    onGroupRulesChange(groupRules.filter(rule => rule.id !== id));
  }, [groupRules, onGroupRulesChange]);

  const updateGroupRule = useCallback((id: string, updates: Partial<GroupRule>) => {
    onGroupRulesChange(groupRules.map(rule =>
      rule.id === id ? { ...rule, ...updates } : rule
    ));
  }, [groupRules, onGroupRulesChange]);

  const toggleDirection = useCallback((id: string) => {
    const rule = groupRules.find(r => r.id === id);
    if (rule) {
      updateGroupRule(id, { direction: rule.direction === 'asc' ? 'desc' : 'asc' });
    }
  }, [groupRules, updateGroupRule]);

  const clearAll = useCallback(() => {
    onGroupRulesChange([]);
  }, [onGroupRulesChange]);

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

    const newRules = [...groupRules];
    const [draggedRule] = newRules.splice(draggedIndex, 1);
    newRules.splice(targetIndex, 0, draggedRule);

    onGroupRulesChange(newRules);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const getAvailableColumns = (currentRuleId: string) => {
    const usedFields = groupRules
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
          Group by
        </span>
        <button onClick={clearAll} className="sort-popover-clear-btn">
          Clear all
        </button>
      </div>

      {/* Group Rules */}
      <div className="sort-popover-content">
        {groupRules.length === 0 ? (
          <div className="sort-popover-empty">
            No grouping applied
          </div>
        ) : (
          groupRules.map((rule, index) => {
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
                  onChange={(e) => updateGroupRule(rule.id, { field: e.target.value })}
                  className="sort-popover-select"
                >
                  {currentColumn && (
                    <option value={currentColumn.data}>
                      {currentColumn.title || currentColumn.data}
                    </option>
                  )}
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
                  onClick={() => removeGroupRule(rule.id)}
                  className="sort-popover-remove-btn"
                >
                  &times;
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="sort-popover-footer">
        <button
          onClick={addGroupRule}
          disabled={groupRules.length >= columns.length}
          className="sort-popover-add-btn"
        >
          <span>+</span>
          Add group
        </button>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return popoverContent;
  return ReactDOM.createPortal(popoverContent, document.body);
};

export default GroupPopover;
