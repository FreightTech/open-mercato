import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ColumnDef, FilterRow, FilterColor, LoadFilterSuggestions } from '../types/index';
import { SortRule, PerspectiveConfig, generatePerspectiveId } from '../types/perspective';
import type { GroupRule } from '../types/grouping';
import ColumnsPopover from './ColumnsPopover';
import FilterPopover from './FilterPopover';
import SortPopover from './SortPopover';
import GroupPopover from './GroupPopover';

// Color palette for perspectives
const COLOR_PALETTE: { color: FilterColor; bg: string; border: string }[] = [
  { color: 'blue', bg: '#dbeafe', border: '#93c5fd' },
  { color: 'green', bg: '#dcfce7', border: '#86efac' },
  { color: 'teal', bg: '#ccfbf1', border: '#5eead4' },
  { color: 'purple', bg: '#f3e8ff', border: '#d8b4fe' },
  { color: 'pink', bg: '#fce7f3', border: '#f9a8d4' },
  { color: 'red', bg: '#fee2e2', border: '#fca5a5' },
  { color: 'orange', bg: '#ffedd5', border: '#fdba74' },
  { color: 'yellow', bg: '#fef9c3', border: '#fde047' },
];

interface PerspectiveToolbarProps {
  columns: ColumnDef[];
  visibleColumns: string[];
  hiddenColumns: string[];
  filters: FilterRow[];
  sortRules: SortRule[];
  groupRules?: GroupRule[];
  onColumnVisibilityChange: (visible: string[], hidden: string[]) => void;
  onColumnOrderChange: (newOrder: string[]) => void;
  onFiltersChange: (filters: FilterRow[]) => void;
  onSortRulesChange: (rules: SortRule[]) => void;
  onGroupRulesChange?: (rules: GroupRule[]) => void;
  onSavePerspective: (perspective: PerspectiveConfig) => void;
  hideColumnsButton?: boolean;
  hideFilterPopover?: boolean;
  hideSortButton?: boolean;
  hideGroupButton?: boolean;
  /** When viewing a saved perspective, hide the save button */
  activePerspectiveId?: string | null;
  /** Function to load filter suggestions from the server (for large datasets) */
  loadFilterSuggestions?: LoadFilterSuggestions;
}

type OpenPopover = 'columns' | 'filter' | 'sort' | 'group' | 'save' | null;

const PerspectiveToolbar: React.FC<PerspectiveToolbarProps> = ({
  columns,
  visibleColumns,
  hiddenColumns,
  filters,
  sortRules,
  groupRules = [],
  onColumnVisibilityChange,
  onColumnOrderChange,
  onFiltersChange,
  onSortRulesChange,
  onGroupRulesChange,
  onSavePerspective,
  hideColumnsButton = false,
  hideFilterPopover = false,
  hideSortButton = false,
  hideGroupButton = false,
  activePerspectiveId,
  loadFilterSuggestions,
}) => {
  const [openPopover, setOpenPopover] = useState<OpenPopover>(null);
  const [saveName, setSaveName] = useState('');
  const [saveColor, setSaveColor] = useState<FilterColor>('blue');

  const columnsButtonRef = useRef<HTMLButtonElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const sortButtonRef = useRef<HTMLButtonElement>(null);
  const groupButtonRef = useRef<HTMLButtonElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const savePopoverRef = useRef<HTMLDivElement>(null);

  // Close save popover on outside click
  useEffect(() => {
    if (openPopover !== 'save') return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        savePopoverRef.current &&
        !savePopoverRef.current.contains(e.target as Node) &&
        saveButtonRef.current &&
        !saveButtonRef.current.contains(e.target as Node)
      ) {
        setOpenPopover(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openPopover]);

  // Position save popover
  useEffect(() => {
    if (openPopover !== 'save' || !saveButtonRef.current || !savePopoverRef.current) return;

    const anchor = saveButtonRef.current.getBoundingClientRect();
    const popover = savePopoverRef.current;

    popover.style.top = `${anchor.bottom + 4}px`;
    popover.style.right = `${window.innerWidth - anchor.right}px`;
  }, [openPopover]);

  const togglePopover = useCallback((popover: OpenPopover) => {
    setOpenPopover(prev => prev === popover ? null : popover);
  }, []);

  const handleSave = useCallback(() => {
    if (saveName.trim()) {
      const perspective: PerspectiveConfig = {
        id: generatePerspectiveId(),
        name: saveName.trim(),
        color: saveColor,
        columns: {
          visible: visibleColumns,
          hidden: hiddenColumns,
        },
        filters: filters,
        sorting: sortRules,
        grouping: groupRules,
      };
      onSavePerspective(perspective);
      setSaveName('');
      setOpenPopover(null);
    }
  }, [saveName, saveColor, visibleColumns, hiddenColumns, filters, sortRules, groupRules, onSavePerspective]);

  // Count active settings
  const hiddenCount = hiddenColumns.length;
  const filterCount = filters.length;
  const sortCount = sortRules.length;
  const groupCount = groupRules.length;
  const hasChanges = hiddenCount > 0 || filterCount > 0 || sortCount > 0 || groupCount > 0;

  // Show save button only when there are unsaved changes (not viewing a saved perspective)
  const showSaveButton = hasChanges && !activePerspectiveId;

  return (
    <div className="perspective-toolbar">
      {/* Columns Button */}
      {!hideColumnsButton && (
        <button
          ref={columnsButtonRef}
          onClick={() => togglePopover('columns')}
          className={`perspective-btn ${openPopover === 'columns' ? 'active' : ''} ${hiddenCount > 0 ? 'has-count' : ''}`}
        >
          Columns
          {hiddenCount > 0 && (
            <span className="perspective-btn-badge">
              {hiddenCount} hidden
            </span>
          )}
        </button>
      )}

      {/* Filter Button */}
      {!hideFilterPopover && (
        <button
          ref={filterButtonRef}
          onClick={() => togglePopover('filter')}
          className={`perspective-btn ${openPopover === 'filter' ? 'active' : ''} ${filterCount > 0 ? 'has-count' : ''}`}
        >
          Filter
          {filterCount > 0 && (
            <span className="perspective-btn-badge">
              {filterCount}
            </span>
          )}
        </button>
      )}

      {/* Sort Button */}
      {!hideSortButton && (
        <button
          ref={sortButtonRef}
          onClick={() => togglePopover('sort')}
          className={`perspective-btn ${openPopover === 'sort' ? 'active' : ''} ${sortCount > 0 ? 'has-count' : ''}`}
        >
          Sort
          {sortCount > 0 && (
            <span className="perspective-btn-badge">
              {sortCount}
            </span>
          )}
        </button>
      )}

      {/* Group Button */}
      {!hideGroupButton && onGroupRulesChange && (
        <button
          ref={groupButtonRef}
          onClick={() => togglePopover('group')}
          className={`perspective-btn ${openPopover === 'group' ? 'active' : ''} ${groupCount > 0 ? 'has-count' : ''}`}
        >
          Group
          {groupCount > 0 && (
            <span className="perspective-btn-badge">
              {groupCount}
            </span>
          )}
        </button>
      )}

      {/* Save Button */}
      {showSaveButton && (
        <button
          ref={saveButtonRef}
          onClick={() => togglePopover('save')}
          className={`perspective-btn save-btn ${openPopover === 'save' ? 'active' : ''}`}
        >
          Save Perspective
        </button>
      )}

      {/* Columns Popover */}
      <ColumnsPopover
        columns={columns}
        visibleColumns={visibleColumns}
        hiddenColumns={hiddenColumns}
        onColumnVisibilityChange={onColumnVisibilityChange}
        onColumnOrderChange={onColumnOrderChange}
        isOpen={openPopover === 'columns'}
        onClose={() => setOpenPopover(null)}
        anchorRef={columnsButtonRef}
      />

      {/* Filter Popover */}
      <FilterPopover
        columns={columns}
        filters={filters}
        onFiltersChange={onFiltersChange}
        isOpen={openPopover === 'filter'}
        onClose={() => setOpenPopover(null)}
        anchorRef={filterButtonRef}
        loadFilterSuggestions={loadFilterSuggestions}
      />

      {/* Sort Popover */}
      <SortPopover
        columns={columns}
        sortRules={sortRules}
        onSortRulesChange={onSortRulesChange}
        isOpen={openPopover === 'sort'}
        onClose={() => setOpenPopover(null)}
        anchorRef={sortButtonRef}
      />

      {/* Group Popover */}
      {onGroupRulesChange && (
        <GroupPopover
          columns={columns}
          groupRules={groupRules}
          onGroupRulesChange={onGroupRulesChange}
          isOpen={openPopover === 'group'}
          onClose={() => setOpenPopover(null)}
          anchorRef={groupButtonRef}
        />
      )}

      {/* Save Popover */}
      {openPopover === 'save' && (
        <div
          ref={savePopoverRef}
          className="perspective-popover save-popover"
        >
          <div className="save-popover-field">
            <label className="save-popover-label">
              Perspective name
            </label>
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Enter name..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSave();
                }
              }}
              className="save-popover-input"
            />
          </div>

          <div className="save-popover-field">
            <label className="save-popover-label">
              Color
            </label>
            <div className="save-popover-colors">
              {COLOR_PALETTE.map((item) => (
                <button
                  key={item.color}
                  onClick={() => setSaveColor(item.color)}
                  className={`save-popover-color-btn ${saveColor === item.color ? 'selected' : ''}`}
                  style={{
                    background: item.bg,
                    borderColor: saveColor === item.color ? item.border : 'transparent',
                  }}
                  title={item.color}
                />
              ))}
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={!saveName.trim()}
            className={`save-popover-submit ${saveName.trim() ? 'enabled' : 'disabled'}`}
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
};

export default PerspectiveToolbar;
