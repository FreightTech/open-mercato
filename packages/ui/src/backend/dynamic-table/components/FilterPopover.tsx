import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ColumnDef, FilterRow } from '../types/index';
import { FilterOperator, getOperatorsForType, needsValueInput, needsMultipleValues } from '../types/filters';
import { useCellStore } from '../hooks/index';
import { CellStore } from '../store/index';

// Debounce delay in milliseconds
const DEBOUNCE_DELAY = 500;

// Extract unique values from a column in the store
function extractColumnValues(
  store: CellStore,
  fieldName: string,
  columns: ColumnDef[]
): string[] {
  const colIndex = columns.findIndex(c => c.data === fieldName);
  if (colIndex === -1) return [];

  const column = columns[colIndex];

  // If column has predefined source values, use those
  if (column.source && Array.isArray(column.source)) {
    return column.source.map(v => String(v)).filter(Boolean);
  }

  // Extract unique values from the data
  const values = new Set<string>();
  const rowCount = store.getRowCount();

  for (let row = 0; row < rowCount; row++) {
    const rowData = store.getRowData(row);
    if (rowData && rowData[fieldName] != null) {
      const value = String(rowData[fieldName]).trim();
      if (value) {
        values.add(value);
      }
    }
  }

  // Return sorted unique values (limit to reasonable amount for performance)
  return Array.from(values).sort((a, b) => a.localeCompare(b)).slice(0, 100);
}

// Debounced filter value input component with autocomplete
interface FilterValueInputProps {
  filterId: string;
  initialValue: string;
  isMultiValue: boolean;
  onValueChange: (id: string, value: string) => void;
  onValueAdd: (id: string, value: string) => void;
  suggestions?: string[];
}

const FilterValueInput: React.FC<FilterValueInputProps> = ({
  filterId,
  initialValue,
  isMultiValue,
  onValueChange,
  onValueAdd,
  suggestions = [],
}) => {
  const [localValue, setLocalValue] = useState(initialValue);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync local value when initialValue changes (e.g., filter reset)
  useEffect(() => {
    setLocalValue(initialValue);
  }, [initialValue]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Close suggestions on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter suggestions based on input
  const filteredSuggestions = useMemo(() => {
    if (!localValue.trim()) return suggestions.slice(0, 8);
    const query = localValue.toLowerCase().trim();
    return suggestions
      .filter(s => s.toLowerCase().includes(query))
      .slice(0, 8);
  }, [suggestions, localValue]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalValue(value);
    updateDropdownPosition();
    setShowSuggestions(true);
    setSelectedIndex(-1);

    // Only debounce for single-value inputs
    if (!isMultiValue) {
      // Clear previous timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Set new debounced update
      debounceTimerRef.current = setTimeout(() => {
        onValueChange(filterId, value);
      }, DEBOUNCE_DELAY);
    }
  };

  const selectSuggestion = (value: string) => {
    if (isMultiValue) {
      onValueAdd(filterId, value);
      setLocalValue('');
    } else {
      setLocalValue(value);
      // Clear any pending debounce
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      onValueChange(filterId, value);
    }
    setShowSuggestions(false);
    setSelectedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions && filteredSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filteredSuggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, -1));
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSuggestions(false);
        setSelectedIndex(-1);
        return;
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      // Clear any pending debounce
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // If a suggestion is selected, use it
      if (selectedIndex >= 0 && filteredSuggestions[selectedIndex]) {
        selectSuggestion(filteredSuggestions[selectedIndex]);
        return;
      }

      if (isMultiValue) {
        if (localValue.trim()) {
          onValueAdd(filterId, localValue.trim());
          setLocalValue('');
        }
      } else {
        onValueChange(filterId, localValue);
      }
      setShowSuggestions(false);
    }
  };

  const handleBlur = () => {
    // Delay to allow click on suggestions
    setTimeout(() => {
      // Clear any pending debounce and apply immediately on blur
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      if (!isMultiValue && localValue !== initialValue) {
        onValueChange(filterId, localValue);
      }
      setShowSuggestions(false);
    }, 150);
  };

  const updateDropdownPosition = useCallback(() => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
  }, []);

  // Update dropdown position on scroll
  useEffect(() => {
    if (!showSuggestions) return;

    const handleScroll = () => {
      updateDropdownPosition();
    };

    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [showSuggestions, updateDropdownPosition]);

  const handleFocus = () => {
    updateDropdownPosition();
    setShowSuggestions(true);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: 1, minWidth: 100 }}>
      <input
        ref={inputRef}
        type="text"
        placeholder={isMultiValue ? "Add value (Enter)" : "Enter value"}
        value={localValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onFocus={handleFocus}
        style={{
          width: '100%',
          padding: '6px 8px',
          border: '1px solid #e5e7eb',
          borderRadius: 6,
          fontSize: 12,
          outline: 'none',
        }}
      />
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div
          style={{
            position: 'fixed',
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            width: dropdownPosition.width,
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: 10002,
            maxHeight: 200,
            overflowY: 'auto',
          }}
        >
          {filteredSuggestions.map((suggestion, index) => (
            <button
              key={suggestion}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectSuggestion(suggestion)}
              onMouseEnter={() => setSelectedIndex(index)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: 'none',
                background: index === selectedIndex ? '#f3f4f6' : 'white',
                fontSize: 12,
                textAlign: 'left',
                cursor: 'pointer',
                display: 'block',
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

interface FilterPopoverProps {
  columns: ColumnDef[];
  filters: FilterRow[];
  onFiltersChange: (filters: FilterRow[]) => void;
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

const FilterPopover: React.FC<FilterPopoverProps> = ({
  columns,
  filters,
  onFiltersChange,
  isOpen,
  onClose,
  anchorRef,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const store = useCellStore();

  // Memoize suggestions extraction per field
  const getSuggestionsForField = useCallback(
    (fieldName: string): string[] => {
      return extractColumnValues(store, fieldName, columns);
    },
    [store, columns]
  );

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

  // Add new filter row
  const addFilterRow = useCallback(() => {
    const newRow: FilterRow = {
      id: `filter-${Date.now()}`,
      field: columns[0]?.data || '',
      operator: 'contains',
      values: [],
    };
    onFiltersChange([...filters, newRow]);
  }, [columns, filters, onFiltersChange]);

  // Remove filter row
  const removeFilterRow = useCallback((id: string) => {
    onFiltersChange(filters.filter(row => row.id !== id));
  }, [filters, onFiltersChange]);

  // Update filter row
  const updateFilterRow = useCallback((id: string, updates: Partial<FilterRow>) => {
    onFiltersChange(filters.map(row =>
      row.id === id ? { ...row, ...updates } : row
    ));
  }, [filters, onFiltersChange]);

  // Handle value add for multi-value operators
  const handleValueAdd = useCallback((id: string, value: string) => {
    const row = filters.find(r => r.id === id);
    if (row && value.trim()) {
      updateFilterRow(id, { values: [...row.values, value.trim()] });
    }
  }, [filters, updateFilterRow]);

  // Handle value remove
  const handleValueRemove = useCallback((id: string, valueIndex: number) => {
    const row = filters.find(r => r.id === id);
    if (row) {
      updateFilterRow(id, { values: row.values.filter((_, i) => i !== valueIndex) });
    }
  }, [filters, updateFilterRow]);

  // Handle debounced single value change
  const handleDebouncedValueChange = useCallback((id: string, value: string) => {
    updateFilterRow(id, { values: value ? [value] : [] });
  }, [updateFilterRow]);

  // Handle operator change (reset values when operator changes)
  const handleOperatorChange = useCallback((id: string, operator: FilterOperator) => {
    updateFilterRow(id, { operator, values: [] });
  }, [updateFilterRow]);

  // Clear all filters
  const clearAll = useCallback(() => {
    onFiltersChange([]);
  }, [onFiltersChange]);

  if (!isOpen) return null;

  return (
    <div
      ref={popoverRef}
      className="perspective-popover filter-popover"
      style={{
        position: 'fixed',
        zIndex: 10000,
        background: 'white',
        borderRadius: 8,
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
        border: '1px solid #e5e7eb',
        width: 400,
        maxHeight: 400,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '12px',
        borderBottom: '1px solid #f3f4f6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 12, color: '#6b7280' }}>
          Filter by conditions
        </span>
        <button
          onClick={clearAll}
          style={{
            background: 'none',
            border: 'none',
            color: '#6b7280',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Clear all
        </button>
      </div>

      {/* Filter Rows */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
        {filters.length === 0 ? (
          <div style={{
            padding: '20px 0',
            textAlign: 'center',
            color: '#9ca3af',
            fontSize: 13,
          }}>
            No filters applied
          </div>
        ) : (
          filters.map((row, index) => {
            const column = columns.find(c => c.data === row.field);
            const operators = getOperatorsForType(column?.type);
            const showValueInput = needsValueInput(row.operator as FilterOperator);
            const isMultiValue = needsMultipleValues(row.operator as FilterOperator);

            return (
              <div
                key={row.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  padding: '8px 0',
                  borderBottom: index < filters.length - 1 ? '1px solid #f3f4f6' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Field Select */}
                  <select
                    value={row.field}
                    onChange={(e) => updateFilterRow(row.id, { field: e.target.value })}
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      border: '1px solid #e5e7eb',
                      borderRadius: 6,
                      fontSize: 12,
                      background: 'white',
                      cursor: 'pointer',
                    }}
                  >
                    {columns.map(col => (
                      <option key={col.data} value={col.data}>
                        {col.title || col.data}
                      </option>
                    ))}
                  </select>

                  {/* Operator Select */}
                  <select
                    value={row.operator}
                    onChange={(e) => handleOperatorChange(row.id, e.target.value as FilterOperator)}
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      border: '1px solid #e5e7eb',
                      borderRadius: 6,
                      fontSize: 12,
                      background: 'white',
                      cursor: 'pointer',
                    }}
                  >
                    {operators.map(op => (
                      <option key={op.value} value={op.value}>
                        {op.label}
                      </option>
                    ))}
                  </select>

                  {/* Remove Button */}
                  <button
                    onClick={() => removeFilterRow(row.id)}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 4,
                      border: 'none',
                      background: '#fee2e2',
                      color: '#dc2626',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                </div>

                {/* Value Input */}
                {showValueInput && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                    {/* Value Pills (for multi-value) */}
                    {isMultiValue && row.values.map((value, idx) => (
                      <span
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '2px 6px 2px 8px',
                          background: '#dbeafe',
                          borderRadius: 4,
                          fontSize: 11,
                          color: '#1e40af',
                        }}
                      >
                        {String(value)}
                        <button
                          onClick={() => handleValueRemove(row.id, idx)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#3b82f6',
                            cursor: 'pointer',
                            padding: 0,
                            fontSize: 12,
                            lineHeight: 1,
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}

                    {/* Debounced Value Input with Smart Suggestions */}
                    <FilterValueInput
                      filterId={row.id}
                      initialValue={!isMultiValue ? (row.values[0] as string) || '' : ''}
                      isMultiValue={isMultiValue}
                      onValueChange={handleDebouncedValueChange}
                      onValueAdd={handleValueAdd}
                      suggestions={getSuggestionsForField(row.field)}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 12px',
        borderTop: '1px solid #f3f4f6',
      }}>
        <button
          onClick={addFilterRow}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px dashed #d1d5db',
            borderRadius: 6,
            background: 'white',
            color: '#6b7280',
            fontSize: 12,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <span style={{ fontSize: 14 }}>+</span>
          Add filter
        </button>
      </div>
    </div>
  );
};

export default FilterPopover;
