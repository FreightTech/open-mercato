import React, { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
} from '@open-mercato/ui/primitives/sheet';
import { ChevronDown, ChevronUp, Eye, Filter, ArrowUpDown, Layers, X } from 'lucide-react';
import { ColumnDef, FilterRow, FilterColor, LoadFilterSuggestions } from '../types/index';
import { SortRule, PerspectiveConfig, generatePerspectiveId } from '../types/perspective';
import type { GroupRule } from '../types/grouping';
import ConfigureViewFields from './ConfigureViewFields';
import ConfigureViewFilters from './ConfigureViewFilters';
import ConfigureViewSorting from './ConfigureViewSorting';
import ConfigureViewGrouping from './ConfigureViewGrouping';

const COLOR_PALETTE: { color: FilterColor; bg: string }[] = [
  { color: 'blue', bg: '#dbeafe' },
  { color: 'green', bg: '#dcfce7' },
  { color: 'teal', bg: '#ccfbf1' },
  { color: 'purple', bg: '#f3e8ff' },
  { color: 'pink', bg: '#fce7f3' },
  { color: 'red', bg: '#fee2e2' },
  { color: 'orange', bg: '#ffedd5' },
  { color: 'yellow', bg: '#fef9c3' },
];

interface ConfigureViewPanelProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  columns: ColumnDef[];
  visibleColumns: string[];
  hiddenColumns: string[];
  filters: FilterRow[];
  sortRules: SortRule[];
  groupRules?: GroupRule[];
  onColumnVisibilityChange: (visible: string[], hidden: string[]) => void;
  onFiltersChange: (filters: FilterRow[]) => void;
  onSortRulesChange: (rules: SortRule[]) => void;
  onGroupRulesChange?: (rules: GroupRule[]) => void;
  onSavePerspective: (perspective: PerspectiveConfig) => void;
  activePerspectiveId?: string | null;
  loadFilterSuggestions?: LoadFilterSuggestions;
  /** Section to auto-expand when opening (e.g., 'filters' from column menu "Filter by this field") */
  initialExpandedSection?: string | null;
}

const ConfigureViewPanel: React.FC<ConfigureViewPanelProps> = ({
  isOpen,
  onOpenChange,
  columns,
  visibleColumns,
  hiddenColumns,
  filters,
  sortRules,
  onColumnVisibilityChange,
  onFiltersChange,
  onSortRulesChange,
  groupRules = [],
  onGroupRulesChange,
  onSavePerspective,
  activePerspectiveId,
  loadFilterSuggestions,
  initialExpandedSection,
}) => {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [saveName, setSaveName] = useState('');
  const [saveColor, setSaveColor] = useState<FilterColor | null>(null);
  const [showSaveForm, setShowSaveForm] = useState(false);

  useEffect(() => {
    if (isOpen && initialExpandedSection) {
      setOpenSections(new Set([initialExpandedSection]));
    }
  }, [isOpen, initialExpandedSection]);

  const toggleSection = (section: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const hiddenCount = hiddenColumns.length;
  const visibleCount = visibleColumns.length;
  const filterCount = filters.length;
  const sortCount = sortRules.length;
  const groupCount = groupRules.length;

  const hasChanges = hiddenCount > 0 || filterCount > 0 || sortCount > 0 || groupCount > 0;

  const handleSave = () => {
    if (saveName.trim()) {
      const perspective: PerspectiveConfig = {
        id: generatePerspectiveId(),
        name: saveName.trim(),
        color: saveColor || undefined,
        columns: {
          visible: visibleColumns,
          hidden: hiddenColumns,
        },
        filters,
        sorting: sortRules,
        grouping: groupRules,
      };
      onSavePerspective(perspective);
      setSaveName('');
      setSaveColor(null);
      onOpenChange(false);
    }
  };

  const sectionIcon = (section: string) => {
    switch (section) {
      case 'fields': return <Eye className="w-4 h-4" />;
      case 'filters': return <Filter className="w-4 h-4" />;
      case 'sorting': return <ArrowUpDown className="w-4 h-4" />;
      case 'grouping': return <Layers className="w-4 h-4" />;
      default: return null;
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        ariaTitle="Configure View"
        hideCloseButton={true}
        className="hot-config-panel"
        overlayClassName="hot-config-overlay !backdrop-blur-none"
        onPointerDownOutside={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('.hot-container')) {
            e.preventDefault();
          }
        }}
      >
        <div className="hot-config-panel-inner">
          {/* Header */}
          <div className="hot-config-panel-header">
            <div className="hot-config-panel-header-row">
              <h3 className="hot-config-panel-title">Configure View</h3>
              <button
                className="hot-config-panel-close"
                onClick={() => onOpenChange(false)}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="hot-config-panel-subtitle">
              Customize fields, filters, and sorting for this view.
            </p>
          </div>

          {/* Sections */}
          <div className="hot-config-panel-body">
            {/* Fields Section */}
            <div className={`hot-config-section ${openSections.has('fields') ? 'is-open' : ''}`}>
              <button
                className="hot-config-section-header"
                onClick={() => toggleSection('fields')}
              >
                {sectionIcon('fields')}
                <span className="hot-config-section-title">Hide fields</span>
                <span className="hot-config-section-badge">
                  {visibleCount} of {visibleCount + hiddenCount} visible
                </span>
                {openSections.has('fields') ? (
                  <ChevronUp className="w-4 h-4 hot-config-section-chevron" />
                ) : (
                  <ChevronDown className="w-4 h-4 hot-config-section-chevron" />
                )}
              </button>
              {openSections.has('fields') && (
                <ConfigureViewFields
                  columns={columns}
                  visibleColumns={visibleColumns}
                  hiddenColumns={hiddenColumns}
                  onColumnVisibilityChange={onColumnVisibilityChange}
                />
              )}
            </div>

            {/* Filter Section */}
            <div className={`hot-config-section ${openSections.has('filters') ? 'is-open' : ''}`}>
              <button
                className="hot-config-section-header"
                onClick={() => toggleSection('filters')}
              >
                {sectionIcon('filters')}
                <span className="hot-config-section-title">Filter</span>
                {filterCount > 0 && (
                  <span className="hot-config-section-badge">
                    {filterCount} rule{filterCount !== 1 ? 's' : ''}
                  </span>
                )}
                {openSections.has('filters') ? (
                  <ChevronUp className="w-4 h-4 hot-config-section-chevron" />
                ) : (
                  <ChevronDown className="w-4 h-4 hot-config-section-chevron" />
                )}
              </button>
              {openSections.has('filters') && (
                <ConfigureViewFilters
                  columns={columns}
                  filters={filters}
                  onFiltersChange={onFiltersChange}
                  loadFilterSuggestions={loadFilterSuggestions}
                />
              )}
            </div>

            {/* Sort Section */}
            <div className={`hot-config-section ${openSections.has('sorting') ? 'is-open' : ''}`}>
              <button
                className="hot-config-section-header"
                onClick={() => toggleSection('sorting')}
              >
                {sectionIcon('sorting')}
                <span className="hot-config-section-title">Sort</span>
                {sortCount > 0 && (
                  <span className="hot-config-section-badge">
                    {sortCount} rule{sortCount !== 1 ? 's' : ''}
                  </span>
                )}
                {openSections.has('sorting') ? (
                  <ChevronUp className="w-4 h-4 hot-config-section-chevron" />
                ) : (
                  <ChevronDown className="w-4 h-4 hot-config-section-chevron" />
                )}
              </button>
              {openSections.has('sorting') && (
                <ConfigureViewSorting
                  columns={columns}
                  sortRules={sortRules}
                  onSortRulesChange={onSortRulesChange}
                />
              )}
            </div>

            {/* Grouping Section */}
            {onGroupRulesChange && (
              <div className={`hot-config-section ${openSections.has('grouping') ? 'is-open' : ''}`}>
                <button
                  className="hot-config-section-header"
                  onClick={() => toggleSection('grouping')}
                >
                  {sectionIcon('grouping')}
                  <span className="hot-config-section-title">Group</span>
                  {groupCount > 0 && (
                    <span className="hot-config-section-badge">
                      {groupCount} rule{groupCount !== 1 ? 's' : ''}
                    </span>
                  )}
                  {openSections.has('grouping') ? (
                    <ChevronUp className="w-4 h-4 hot-config-section-chevron" />
                  ) : (
                    <ChevronDown className="w-4 h-4 hot-config-section-chevron" />
                  )}
                </button>
                {openSections.has('grouping') && (
                  <ConfigureViewGrouping
                    columns={columns}
                    groupRules={groupRules}
                    onGroupRulesChange={onGroupRulesChange}
                  />
                )}
              </div>
            )}
          </div>

          {/* Save form: shown after clicking "Save as new view" */}
          {showSaveForm && (
            <div className="hot-config-panel-save">
              <label className="hot-config-save-label">View Name</label>
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g., Active Contractors"
                className="hot-config-save-input"
                autoFocus
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && saveName.trim()) {
                    handleSave();
                  }
                }}
              />
              <label className="hot-config-save-label">Color</label>
              <div className="hot-config-save-colors">
                {COLOR_PALETTE.map((item) => (
                  <button
                    key={item.color}
                    onClick={() => setSaveColor(item.color)}
                    className={`hot-config-save-color-btn ${saveColor === item.color ? 'selected' : ''}`}
                    style={{ background: item.bg }}
                    title={item.color}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Footer buttons */}
          <div className="hot-config-panel-footer">
            <button
              onClick={() => {
                if (showSaveForm) {
                  setShowSaveForm(false);
                  setSaveName('');
                  setSaveColor(null);
                } else {
                  onOpenChange(false);
                }
              }}
              className="hot-config-cancel-btn"
            >
              Cancel
            </button>
            {showSaveForm ? (
              <button
                onClick={handleSave}
                disabled={!saveName.trim()}
                className="hot-config-save-btn"
              >
                Save
              </button>
            ) : hasChanges ? (
              <button
                onClick={() => setShowSaveForm(true)}
                className="hot-config-save-btn"
              >
                Save as new view
              </button>
            ) : (
              <button
                onClick={() => onOpenChange(false)}
                className="hot-config-save-btn"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ConfigureViewPanel;
