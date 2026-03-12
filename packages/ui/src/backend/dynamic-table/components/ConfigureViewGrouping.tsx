import React, { useCallback } from 'react';
import { X } from 'lucide-react';
import { ColumnDef } from '../types/index';
import { GroupRule, generateGroupRuleId } from '../types/grouping';

interface ConfigureViewGroupingProps {
  columns: ColumnDef[];
  groupRules: GroupRule[];
  onGroupRulesChange: (rules: GroupRule[]) => void;
}

const ConfigureViewGrouping: React.FC<ConfigureViewGroupingProps> = ({
  columns,
  groupRules,
  onGroupRulesChange,
}) => {
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

  const clearAll = useCallback(() => {
    onGroupRulesChange([]);
  }, [onGroupRulesChange]);

  const getAvailableColumns = (currentRuleId: string) => {
    const usedFields = groupRules
      .filter(r => r.id !== currentRuleId)
      .map(r => r.field);
    return columns.filter(c => !usedFields.includes(c.data));
  };

  return (
    <div className="hot-config-sorting">
      {groupRules.length === 0 ? null : (
        <>
          <div className="hot-config-sorting-header">
            <span className="hot-config-sorting-header-label">Group by</span>
            <button onClick={clearAll} className="hot-config-clear-btn">
              Clear all
            </button>
          </div>
          {groupRules.map((rule, index) => {
            const availableColumns = getAvailableColumns(rule.id);
            const currentColumn = columns.find(c => c.data === rule.field);

            return (
              <div key={rule.id} className="hot-config-sort-row">
                <span className="hot-config-sort-index">{index + 1}</span>
                <select
                  value={rule.field}
                  onChange={(e) => updateGroupRule(rule.id, { field: e.target.value })}
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
                  onChange={(e) => updateGroupRule(rule.id, { direction: e.target.value as 'asc' | 'desc' })}
                  className="hot-config-sort-direction-select"
                >
                  <option value="asc">A &rarr; Z</option>
                  <option value="desc">Z &rarr; A</option>
                </select>
                <button
                  onClick={() => removeGroupRule(rule.id)}
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
        onClick={addGroupRule}
        disabled={groupRules.length >= columns.length}
        className="hot-config-add-btn"
      >
        + Add group
      </button>
    </div>
  );
};

export default ConfigureViewGrouping;
