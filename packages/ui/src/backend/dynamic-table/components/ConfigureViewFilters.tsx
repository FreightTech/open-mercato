import React, { useCallback } from 'react';
import { X } from 'lucide-react';
import { ColumnDef, FilterRow, LoadFilterSuggestions } from '../types/index';
import { FilterOperator, getOperatorsForType, needsValueInput, needsMultipleValues } from '../types/filters';

interface ConfigureViewFiltersProps {
  columns: ColumnDef[];
  filters: FilterRow[];
  onFiltersChange: (filters: FilterRow[]) => void;
  loadFilterSuggestions?: LoadFilterSuggestions;
}

const ConfigureViewFilters: React.FC<ConfigureViewFiltersProps> = ({
  columns,
  filters,
  onFiltersChange,
  loadFilterSuggestions,
}) => {
  const addFilterRow = useCallback(() => {
    const newRow: FilterRow = {
      id: `filter-${Date.now()}`,
      field: columns[0]?.data || '',
      operator: 'contains',
      values: [],
    };
    onFiltersChange([...filters, newRow]);
  }, [columns, filters, onFiltersChange]);

  const removeFilterRow = useCallback((id: string) => {
    onFiltersChange(filters.filter(row => row.id !== id));
  }, [filters, onFiltersChange]);

  const updateFilterRow = useCallback((id: string, updates: Partial<FilterRow>) => {
    onFiltersChange(filters.map(row =>
      row.id === id ? { ...row, ...updates } : row
    ));
  }, [filters, onFiltersChange]);

  const handleOperatorChange = useCallback((id: string, operator: FilterOperator) => {
    updateFilterRow(id, { operator, values: [] });
  }, [updateFilterRow]);

  const handleValueChange = useCallback((id: string, value: string) => {
    updateFilterRow(id, { values: value ? [value] : [] });
  }, [updateFilterRow]);

  const handleValueAdd = useCallback((id: string, value: string) => {
    const row = filters.find(r => r.id === id);
    if (row && value.trim()) {
      updateFilterRow(id, { values: [...row.values, value.trim()] });
    }
  }, [filters, updateFilterRow]);

  const handleValueRemove = useCallback((id: string, valueIndex: number) => {
    const row = filters.find(r => r.id === id);
    if (row) {
      updateFilterRow(id, { values: row.values.filter((_, i) => i !== valueIndex) });
    }
  }, [filters, updateFilterRow]);

  return (
    <div className="hot-config-filters">
      {filters.length > 0 && (
        <>
          <span className="hot-config-filters-label">Where</span>
          {filters.map((row) => {
            const column = columns.find(c => c.data === row.field);
            const operators = getOperatorsForType(column?.type);
            const showValueInput = needsValueInput(row.operator as FilterOperator);
            const isMultiValue = needsMultipleValues(row.operator as FilterOperator);

            return (
              <div key={row.id} className="hot-config-filter-row">
                <select
                  value={row.field}
                  onChange={(e) => updateFilterRow(row.id, { field: e.target.value })}
                  className="hot-config-filter-select"
                >
                  {columns.map(col => (
                    <option key={col.data} value={col.data}>
                      {col.title || col.data}
                    </option>
                  ))}
                </select>
                <select
                  value={row.operator}
                  onChange={(e) => handleOperatorChange(row.id, e.target.value as FilterOperator)}
                  className="hot-config-filter-select hot-config-filter-operator"
                >
                  {operators.map(op => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  ))}
                </select>
                {showValueInput && (
                  <>
                    {isMultiValue && row.values.map((value, idx) => (
                      <span key={idx} className="hot-config-filter-pill">
                        {String(value)}
                        <button onClick={() => handleValueRemove(row.id, idx)} className="hot-config-filter-pill-remove">×</button>
                      </span>
                    ))}
                    <input
                      type="text"
                      placeholder="Enter value"
                      className="hot-config-filter-input"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const value = (e.target as HTMLInputElement).value.trim();
                          if (isMultiValue) {
                            if (value) {
                              handleValueAdd(row.id, value);
                              (e.target as HTMLInputElement).value = '';
                            }
                          } else {
                            handleValueChange(row.id, value);
                          }
                        }
                      }}
                      onBlur={(e) => {
                        if (!isMultiValue) {
                          handleValueChange(row.id, e.target.value.trim());
                        }
                      }}
                      defaultValue={!isMultiValue ? (row.values[0] as string) || '' : ''}
                    />
                  </>
                )}
                <button
                  onClick={() => removeFilterRow(row.id)}
                  className="hot-config-filter-remove"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </>
      )}
      <button onClick={addFilterRow} className="hot-config-add-btn">
        + Add condition
      </button>
    </div>
  );
};

export default ConfigureViewFilters;
