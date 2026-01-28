import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ColumnDef, FilterRow, LoadFilterSuggestions } from '../types/index';
import { FilterOperator, getOperatorsForType, needsValueInput, needsMultipleValues } from '../types/filters';
import { useCellStore } from '../hooks/index';
import { CellStore } from '../store/index';

// Debounce delay in milliseconds
const DEBOUNCE_DELAY = 500;
const SUGGESTIONS_DEBOUNCE_DELAY = 300;

// Extract unique values from a column in the store (fallback for client-side)
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
  fieldName: string;
  initialValue: string;
  isMultiValue: boolean;
  onValueChange: (id: string, value: string) => void;
  onValueAdd: (id: string, value: string) => void;
  /** Static suggestions (from column source or client-side extraction) */
  staticSuggestions?: string[];
  /** Async function to load suggestions from server */
  loadSuggestions?: (query: string) => Promise<string[]>;
}

const FilterValueInput: React.FC<FilterValueInputProps> = ({
  filterId,
  fieldName,
  initialValue,
  isMultiValue,
  onValueChange,
  onValueAdd,
  staticSuggestions = [],
  loadSuggestions,
}) => {
  const [localValue, setLocalValue] = useState(initialValue);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const [asyncSuggestions, setAsyncSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const suggestionsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync local value when initialValue changes (e.g., filter reset)
  useEffect(() => {
    setLocalValue(initialValue);
  }, [initialValue]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (suggestionsTimerRef.current) {
        clearTimeout(suggestionsTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
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

  // Load async suggestions when query changes
  useEffect(() => {
    if (!loadSuggestions) return;

    // Clear previous timer
    if (suggestionsTimerRef.current) {
      clearTimeout(suggestionsTimerRef.current);
    }

    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Debounce the API call
    suggestionsTimerRef.current = setTimeout(async () => {
      setIsLoadingSuggestions(true);
      abortControllerRef.current = new AbortController();

      try {
        const results = await loadSuggestions(localValue);
        setAsyncSuggestions(results);
      } catch (error) {
        // Ignore abort errors
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Failed to load filter suggestions:', error);
        }
        setAsyncSuggestions([]);
      } finally {
        setIsLoadingSuggestions(false);
      }
    }, SUGGESTIONS_DEBOUNCE_DELAY);
  }, [localValue, loadSuggestions]);

  // Determine which suggestions to use
  const suggestions = loadSuggestions ? asyncSuggestions : staticSuggestions;

  // Filter suggestions based on input (for static suggestions)
  const filteredSuggestions = useMemo(() => {
    if (loadSuggestions) {
      // For async suggestions, server already filtered
      return suggestions.slice(0, 8);
    }
    // For static suggestions, filter client-side
    if (!localValue.trim()) return suggestions.slice(0, 8);
    const query = localValue.toLowerCase().trim();
    return suggestions
      .filter(s => s.toLowerCase().includes(query))
      .slice(0, 8);
  }, [suggestions, localValue, loadSuggestions]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocalValue(value);
    updateDropdownPosition();
    setShowSuggestions(true);
    setSelectedIndex(-1);
    // Note: We don't update the filter here anymore.
    // Table updates only on Enter, blur, or suggestion selection.
    // This prevents the table from reloading on every keystroke.
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
    <div ref={containerRef} className="filter-popover-input-wrapper">
      <input
        ref={inputRef}
        type="text"
        placeholder={isMultiValue ? "Add value (Enter)" : "Enter value"}
        value={localValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onFocus={handleFocus}
        className="filter-popover-input"
      />
      {showSuggestions && (
        <div
          className={`filter-popover-suggestions ${isLoadingSuggestions ? 'loading' : ''}`}
          style={{
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            width: dropdownPosition.width,
          }}
        >
          {/* Loading spinner overlay */}
          {isLoadingSuggestions && (
            <div className="filter-popover-suggestions-spinner" />
          )}
          {/* Show suggestions (or empty state) - keep visible during loading */}
          {filteredSuggestions.length > 0 ? (
            filteredSuggestions.map((suggestion, index) => (
              <button
                key={suggestion}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSuggestion(suggestion)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`filter-popover-suggestion-btn ${index === selectedIndex ? 'selected' : ''}`}
              >
                {suggestion}
              </button>
            ))
          ) : isLoadingSuggestions ? (
            // Show minimal loading state only when no previous suggestions
            <div className="filter-popover-suggestion-loading">
              Loading...
            </div>
          ) : localValue.trim() ? (
            <div className="filter-popover-suggestion-empty">
              No matches found
            </div>
          ) : null}
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
  /** Function to load filter suggestions from the server (for large datasets) */
  loadFilterSuggestions?: LoadFilterSuggestions;
}

const FilterPopover: React.FC<FilterPopoverProps> = ({
  columns,
  filters,
  onFiltersChange,
  isOpen,
  onClose,
  anchorRef,
  loadFilterSuggestions,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const store = useCellStore();

  // Memoize static suggestions extraction per field (fallback when no async loader)
  const getStaticSuggestionsForField = useCallback(
    (fieldName: string): string[] => {
      // If column has predefined source, use that directly
      const column = columns.find(c => c.data === fieldName);
      if (column?.source && Array.isArray(column.source)) {
        return column.source.map(v => String(v)).filter(Boolean);
      }
      // Only extract from store if no async loader is provided
      if (!loadFilterSuggestions) {
        return extractColumnValues(store, fieldName, columns);
      }
      return [];
    },
    [store, columns, loadFilterSuggestions]
  );

  // Create memoized async loaders for each field
  // Using a Map to ensure stable function references per field
  const fieldLoadersRef = useRef<Map<string, (query: string) => Promise<string[]>>>(new Map());

  // Clear the loaders map when loadFilterSuggestions changes
  useEffect(() => {
    fieldLoadersRef.current.clear();
  }, [loadFilterSuggestions]);

  const getFieldLoader = useCallback(
    (fieldName: string): ((query: string) => Promise<string[]>) | undefined => {
      if (!loadFilterSuggestions) return undefined;

      // Return cached loader if it exists
      const cached = fieldLoadersRef.current.get(fieldName);
      if (cached) return cached;

      // Create and cache a new loader
      const loader = (query: string) => loadFilterSuggestions(fieldName, query);
      fieldLoadersRef.current.set(fieldName, loader);
      return loader;
    },
    [loadFilterSuggestions]
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
    >
      {/* Header */}
      <div className="filter-popover-header">
        <span className="filter-popover-title">
          Filter by conditions
        </span>
        <button onClick={clearAll} className="filter-popover-clear-btn">
          Clear all
        </button>
      </div>

      {/* Filter Rows */}
      <div className="filter-popover-content">
        {filters.length === 0 ? (
          <div className="filter-popover-empty">
            No filters applied
          </div>
        ) : (
          filters.map((row) => {
            const column = columns.find(c => c.data === row.field);
            const operators = getOperatorsForType(column?.type);
            const showValueInput = needsValueInput(row.operator as FilterOperator);
            const isMultiValue = needsMultipleValues(row.operator as FilterOperator);

            // Check if column has predefined source (dropdown options)
            const hasSource = column?.source && Array.isArray(column.source);

            return (
              <div key={row.id} className="filter-popover-row">
                <div className="filter-popover-row-controls">
                  {/* Field Select */}
                  <select
                    value={row.field}
                    onChange={(e) => updateFilterRow(row.id, { field: e.target.value })}
                    className="filter-popover-select"
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
                    className="filter-popover-select"
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
                    className="filter-popover-remove-btn"
                  >
                    ×
                  </button>
                </div>

                {/* Value Input */}
                {showValueInput && (
                  <div className="filter-popover-values">
                    {/* Value Pills (for multi-value) */}
                    {isMultiValue && row.values.map((value, idx) => (
                      <span key={idx} className="filter-popover-value-pill">
                        {String(value)}
                        <button
                          onClick={() => handleValueRemove(row.id, idx)}
                          className="filter-popover-value-pill-remove"
                        >
                          ×
                        </button>
                      </span>
                    ))}

                    {/* Value Input with Smart Suggestions */}
                    <FilterValueInput
                      filterId={row.id}
                      fieldName={row.field}
                      initialValue={!isMultiValue ? (row.values[0] as string) || '' : ''}
                      isMultiValue={isMultiValue}
                      onValueChange={handleDebouncedValueChange}
                      onValueAdd={handleValueAdd}
                      staticSuggestions={getStaticSuggestionsForField(row.field)}
                      loadSuggestions={hasSource ? undefined : getFieldLoader(row.field)}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="filter-popover-footer">
        <button onClick={addFilterRow} className="filter-popover-add-btn">
          <span>+</span>
          Add filter
        </button>
      </div>
    </div>
  );
};

export default FilterPopover;
