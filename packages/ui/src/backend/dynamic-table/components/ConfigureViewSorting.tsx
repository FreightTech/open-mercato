import React, { useCallback } from 'react';
import { X } from 'lucide-react';
import { ColumnDef } from '../types/index';
import { SortRule, generateSortRuleId } from '../types/perspective';

interface ConfigureViewSortingProps {
  columns: ColumnDef[];
  sortRules: SortRule[];
  onSortRulesChange: (rules: SortRule[]) => void;
}

const ConfigureViewSorting: React.FC<ConfigureViewSortingProps> = ({
  columns,
  sortRules,
  onSortRulesChange,
}) => {
  const addSortRule = useCallback(() => {
    const usedFields = sortRules.map(r => r.field);
    const availableColumn = columns.find(c => !usedFields.includes(c.data));
    const newRule: SortRule = {
      id: generateSortRuleId(),
      field: availableColumn?.data || columns[0]?.data || '',
      direction: 'asc',
    };
    onSortRulesChange([...sortRules, newRule]);
  }, [columns, sortRules, onSortRulesChange]);

  const removeSortRule = useCallback((id: string) => {
    onSortRulesChange(sortRules.filter(rule => rule.id !== id));
  }, [sortRules, onSortRulesChange]);

  const updateSortRule = useCallback((id: string, updates: Partial<SortRule>) => {
    onSortRulesChange(sortRules.map(rule =>
      rule.id === id ? { ...rule, ...updates } : rule
    ));
  }, [sortRules, onSortRulesChange]);

  const clearAll = useCallback(() => {
    onSortRulesChange([]);
  }, [onSortRulesChange]);

  const getAvailableColumns = (currentRuleId: string) => {
    const usedFields = sortRules
      .filter(r => r.id !== currentRuleId)
      .map(r => r.field);
    return columns.filter(c => !usedFields.includes(c.data));
  };

  return (
    <div className="hot-config-sorting">
      {sortRules.length === 0 ? null : (
        <>
          <div className="hot-config-sorting-header">
            <span className="hot-config-sorting-header-label">Sort by</span>
            <button onClick={clearAll} className="hot-config-clear-btn">
              Clear all
            </button>
          </div>
          {sortRules.map((rule, index) => {
            const availableColumns = getAvailableColumns(rule.id);
            const currentColumn = columns.find(c => c.data === rule.field);

            return (
              <div key={rule.id} className="hot-config-sort-row">
                <span className="hot-config-sort-index">{index + 1}</span>
                <select
                  value={rule.field}
                  onChange={(e) => updateSortRule(rule.id, { field: e.target.value })}
                  className="hot-config-sort-select"
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
                <select
                  value={rule.direction}
                  onChange={(e) => updateSortRule(rule.id, { direction: e.target.value as 'asc' | 'desc' })}
                  className="hot-config-sort-direction-select"
                >
                  <option value="asc">A &rarr; Z</option>
                  <option value="desc">Z &rarr; A</option>
                </select>
                <button
                  onClick={() => removeSortRule(rule.id)}
                  className="hot-config-sort-remove"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </>
      )}
      <button
        onClick={addSortRule}
        disabled={sortRules.length >= columns.length}
        className="hot-config-add-btn"
      >
        + Add sort
      </button>
    </div>
  );
};

export default ConfigureViewSorting;
