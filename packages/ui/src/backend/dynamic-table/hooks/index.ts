// hooks.ts

import React, { useCallback, useContext, useSyncExternalStore, createContext, useMemo } from 'react';
import { CellStore } from '../store/index';
import { CellState, ColumnDef, DragState, SelectionState, LoadFilterSuggestions, KeyboardShortcutsConfig, OnRowAction, RowActionShortcut } from '../types/index';
import { apiCall } from '../../utils/apiCall';

// ============================================
// CONTEXT
// ============================================
export const CellStoreContext = createContext<CellStore | null>(null);

export const useCellStore = (): CellStore => {
  const store = useContext(CellStoreContext);
  if (!store) {
    throw new Error('useCellStore must be used within CellStoreContext.Provider');
  }
  return store;
};

// ============================================
// STORE REVISION HOOK (triggers re-render on row add/remove)
// ============================================
export function useStoreRevision(): number {
  const store = useCellStore();

  const subscribe = useCallback(
    (onStoreChange: () => void) => store.subscribeToStore(onStoreChange),
    [store]
  );

  const getSnapshot = useCallback(() => store.getStoreRevision(), [store]);
  const getServerSnapshot = useCallback(() => 0, []); // Return default value for SSR

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// ============================================
// CELL STATE HOOK
// ============================================
export function useCellState(row: number, col: number): CellState {
  const store = useCellStore();

  const subscribe = useCallback(
    (onStoreChange: () => void) => store.subscribe(row, col, onStoreChange),
    [store, row, col]
  );

  const getSnapshot = useCallback(() => store.getRevision(row, col), [store, row, col]);
  const getServerSnapshot = useCallback(() => 0, []); // Return default value for SSR

  // This triggers re-render when revision changes
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Return fresh state on each render
  return store.getCellState(row, col);
}

// ============================================
// SELECTION REVISION HOOK (triggers re-render on selection change)
// ============================================
export function useSelectionRevision(): number {
  const store = useCellStore();

  const subscribe = useCallback(
    (onStoreChange: () => void) => store.subscribeToSelection(onStoreChange),
    [store]
  );

  const getSnapshot = useCallback(() => store.getSelectionRevision(), [store]);
  const getServerSnapshot = useCallback(() => 0, []); // Return default value for SSR

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// ============================================
// SELECTION HOOK (for components that need selection without cell subscription)
// ============================================
export function useSelection(): SelectionState {
  const store = useCellStore();
  // Subscribe to selection changes so component re-renders
  useSelectionRevision();
  return store.getSelection();
}

// ============================================
// DRAG HANDLING HOOK
// ============================================
export function useDragHandling(
  store: CellStore,
  colCount: number
): {
  dragState: React.MutableRefObject<DragState>;
  handleDragStart: (row: number, col: number, type: 'cell' | 'row' | 'column') => void;
  handleDragMove: (row: number, col: number) => void;
  handleDragEnd: () => void;
} {
  const dragState = { current: { isDragging: false, type: null, start: null } as DragState };

  const handleDragStart = useCallback(
    (row: number, col: number, type: 'cell' | 'row' | 'column') => {
      dragState.current = {
        isDragging: true,
        type,
        start: { row, col },
      };

      if (type === 'row') {
        store.setSelection({
          type: 'rowRange',
          anchor: { row, col: 0 },
          focus: { row, col: colCount - 1 },
        });
      } else if (type === 'column') {
        store.setSelection({
          type: 'colRange',
          anchor: { row: 0, col },
          focus: { row: store.getRowCount() - 1, col },
        });
      } else {
        store.setSelection({
          type: 'range',
          anchor: { row, col },
          focus: { row, col },
        });
      }
    },
    [store, colCount]
  );

  const handleDragMove = useCallback(
    (row: number, col: number) => {
      if (!dragState.current.isDragging || !dragState.current.start) return;

      const selection = store.getSelection();
      if (!selection.anchor) return;

      if (dragState.current.type === 'row') {
        store.setSelection({
          ...selection,
          focus: { row, col: colCount - 1 },
        });
      } else if (dragState.current.type === 'column') {
        store.setSelection({
          ...selection,
          focus: { row: store.getRowCount() - 1, col },
        });
      } else {
        store.setSelection({
          ...selection,
          focus: { row, col },
        });
      }
    },
    [store, colCount]
  );

  const handleDragEnd = useCallback(() => {
    dragState.current = { isDragging: false, type: null, start: null };
  }, []);

  return {
    dragState,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
  };
}

// ============================================
// CELL EDITABILITY HELPER
// ============================================

/**
 * Determines if a cell is editable based on column configuration.
 * Used by keyboard navigation to skip read-only cells.
 */
function isEditableCell(column: ColumnDef | undefined): boolean {
  if (!column) return false;
  if (column.readOnly === true) return false;
  return true;
}

// ============================================
// KEYBOARD NAVIGATION HOOK
// ============================================
export function useKeyboardNavigation(
  store: CellStore,
  colCount: number,
  columns: ColumnDef[],
  autoEditOnTab: boolean = true,
  // Note: onSave parameter kept for backwards compatibility but editors now save before navigation
  _onSave?: (row: number, col: number, value: any) => void,
  siblingTableRefs?: {
    prev?: React.RefObject<HTMLDivElement | null>;
    next?: React.RefObject<HTMLDivElement | null>;
  }
) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Note: This handler should be attached to the table element (not document)
      // so it only receives events from within the table

      const editing = store.getEditingCell();
      const bounds = store.getSelectionBounds();

      // Enter navigation - when editing, move down (Excel-like behavior)
      // Note: Editors save the value before the event bubbles here
      if (e.key === 'Enter' && !e.shiftKey && editing) {
        e.preventDefault();

        const currentRow = editing.row;
        const currentCol = editing.col;

        // Move to next row (down), same column
        const nextRow = currentRow + 1;

        if (nextRow < store.getRowCount()) {
          store.clearEditing();
          store.setSelection({
            type: 'range',
            anchor: { row: nextRow, col: currentCol },
            focus: { row: nextRow, col: currentCol },
          });
          store.setEditingCell(nextRow, currentCol);
        } else {
          // At the last row, clear editing and restore focus to the table
          // container so subsequent Tab/Arrow keys still reach this handler.
          store.clearEditing();
          store.focusTable();
        }
        return;
      }

      // Enter to start editing (when not already editing)
      // Note: Shift+Enter is reserved for row-action shortcuts (e.g., open detail view)
      if (e.key === 'Enter' && !e.shiftKey && !editing && bounds) {
        if (bounds.startRow === bounds.endRow && bounds.startCol === bounds.endCol) {
          e.preventDefault();
          store.setEditingCell(bounds.startRow, bounds.startCol);
          return;
        }
      }

      // Escape: two-step behavior
      // 1st Escape while editing: exit edit mode without saving, keep cell selected
      // 2nd Escape (cell selected, not editing): clear selection, keep table focused
      // 3rd Escape (no selection, no editing): do nothing — let the event bubble
      //     to parent handlers (e.g., drawer close)
      if (e.key === 'Escape') {
        if (editing) {
          e.preventDefault();
          store.clearEditing();
        } else if (bounds) {
          e.preventDefault();
          store.setSelection({ type: null, anchor: null, focus: null });
        }
        // If neither editing nor selection, don't preventDefault —
        // let the event propagate so the parent (drawer) can handle it.
        return;
      }

      // Tab navigation - move to next/prev editable cell, skipping read-only columns
      // Wraps across rows. When no editable cell remains in the table,
      // clears state and lets native Tab move focus to the next focusable element.
      // Note: Editors save the value before the event bubbles here
      if (e.key === 'Tab') {
        const direction = e.shiftKey ? -1 : 1;
        let currentRow: number;
        let currentCol: number;

        if (editing) {
          currentRow = editing.row;
          currentCol = editing.col;
        } else if (bounds && bounds.startRow === bounds.endRow && bounds.startCol === bounds.endCol) {
          currentRow = bounds.startRow;
          currentCol = bounds.startCol;
        } else {
          // No selection yet — seed position so the search loop finds the
          // first editable cell (forward Tab) or last editable cell (Shift+Tab).
          // For forward: start at (0, -1) so +1 direction lands on col 0, row 0.
          // For backward: start at (lastRow, colCount) so -1 lands on last col, last row.
          const rowCount = store.getRowCount();
          if (rowCount === 0) return;
          currentRow = direction === 1 ? 0 : rowCount - 1;
          currentCol = direction === 1 ? -1 : colCount;
        }

        const rowCount = store.getRowCount();
        const totalCells = rowCount * colCount;
        let nextCol = currentCol + direction;
        let nextRow = currentRow;
        let checked = 0;

        // Wrap column and row boundaries
        if (nextCol >= colCount) {
          nextCol = 0;
          nextRow++;
        } else if (nextCol < 0) {
          nextCol = colCount - 1;
          nextRow--;
        }

        // Search for the next editable cell, wrapping across rows
        while (checked < totalCells) {
          if (nextRow < 0 || nextRow >= rowCount) break;

          if (isEditableCell(columns[nextCol])) {
            e.preventDefault();
            store.clearEditing();
            store.setSelection({
              type: 'range',
              anchor: { row: nextRow, col: nextCol },
              focus: { row: nextRow, col: nextCol },
            });
            if (autoEditOnTab) {
              store.setEditingCell(nextRow, nextCol);
            }
            return;
          }

          // Move to next candidate
          nextCol += direction;
          if (nextCol >= colCount) {
            nextCol = 0;
            nextRow++;
          } else if (nextCol < 0) {
            nextCol = colCount - 1;
            nextRow--;
          }
          checked++;
        }

        // No editable cell found forward/backward in this table.
        // Before trapping Tab, check if a sibling table exists in the
        // Tab direction so the user can navigate across stacked tables.
        const siblingRef = direction === 1
          ? siblingTableRefs?.next?.current
          : siblingTableRefs?.prev?.current;

        if (siblingRef) {
          e.preventDefault();
          store.clearEditing();
          store.setSelection({ type: null, anchor: null, focus: null });
          siblingRef.setAttribute('data-focus-direction', direction === 1 ? 'down' : 'up');
          siblingRef.setAttribute('data-focus-trigger', 'tab');
          siblingRef.focus();
          return;
        }

        // No sibling table — fall back to existing behaviour:
        // trap Tab for non-empty tables, let native Tab escape for empty ones.
        if (store.getRowCount() > 0) {
          e.preventDefault();
          if (!bounds) {
            const targetRow = direction === 1 ? 0 : store.getRowCount() - 1;
            store.setSelection({
              type: 'range',
              anchor: { row: targetRow, col: 0 },
              focus: { row: targetRow, col: 0 },
            });
          }
          return;
        }
        if (editing) {
          store.clearEditing();
        }
        store.setSelection({ type: null, anchor: null, focus: null });
        return;
      }

      // Arrow navigation (only when not editing)
      // Arrows move to the adjacent cell (including read-only cells).
      // Read-only skipping only applies to Tab navigation.
      // ArrowUp at first row / ArrowDown at last row can move to sibling tables.
      if (!editing && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();

        const rowCount = store.getRowCount();
        if (rowCount === 0) return;

        if (!bounds || bounds.startRow !== bounds.endRow || bounds.startCol !== bounds.endCol) {
          // No single-cell selection yet — select an initial cell based on direction.
          // ArrowDown/ArrowRight → first cell; ArrowUp/ArrowLeft → last cell.
          const isForward = e.key === 'ArrowDown' || e.key === 'ArrowRight';
          const targetRow = isForward ? 0 : rowCount - 1;
          const targetCol = isForward ? 0 : colCount - 1;
          store.setSelection({
            type: 'range',
            anchor: { row: targetRow, col: targetCol },
            focus: { row: targetRow, col: targetCol },
          });
          return;
        }

        const currentRow = bounds.startRow;
        const currentCol = bounds.startCol;
        let nextRow = currentRow;
        let nextCol = currentCol;

        if (e.key === 'ArrowLeft') {
          nextCol = Math.max(0, currentCol - 1);
        } else if (e.key === 'ArrowRight') {
          nextCol = Math.min(colCount - 1, currentCol + 1);
        } else if (e.key === 'ArrowUp') {
          if (currentRow === 0 && siblingTableRefs?.prev?.current) {
            // At first row — move to previous sibling table (select last row)
            store.setSelection({ type: null, anchor: null, focus: null });
            const target = siblingTableRefs.prev.current;
            target.setAttribute('data-focus-direction', 'up');
            target.focus();
            return;
          }
          nextRow = Math.max(0, currentRow - 1);
        } else {
          if (currentRow === rowCount - 1 && siblingTableRefs?.next?.current) {
            // At last row — move to next sibling table (select first row)
            store.setSelection({ type: null, anchor: null, focus: null });
            const target = siblingTableRefs.next.current;
            target.setAttribute('data-focus-direction', 'down');
            target.focus();
            return;
          }
          nextRow = Math.min(rowCount - 1, currentRow + 1);
        }

        // Only update selection if position actually changed
        if (nextRow !== currentRow || nextCol !== currentCol) {
          store.setSelection({
            type: 'range',
            anchor: { row: nextRow, col: nextCol },
            focus: { row: nextRow, col: nextCol },
          });
        }
      }
    },
    [store, colCount, columns, autoEditOnTab, siblingTableRefs]
  );

  return handleKeyDown;
}

// ============================================
// COPY HANDLER HOOK
// ============================================
export function useCopyHandler(
  store: CellStore,
  tableRef?: React.RefObject<HTMLDivElement | null>
) {
  const handleCopy = useCallback(
    (e: ClipboardEvent) => {
      // Only intercept copy if the event target is inside this table
      // This allows text selection in drawers/dialogs to work normally
      if (tableRef?.current && e.target instanceof Node) {
        if (!tableRef.current.contains(e.target)) {
          return;
        }
      }

      const cells = store.getCellsInSelection();
      if (cells.length === 0) return;

      const bounds = store.getSelectionBounds();
      if (!bounds) return;

      const rowCount = bounds.endRow - bounds.startRow + 1;
      const colCount = bounds.endCol - bounds.startCol + 1;

      const grid: string[][] = Array.from({ length: rowCount }, () =>
        Array.from({ length: colCount }, () => '')
      );

      cells.forEach((cell) => {
        const r = cell.row - bounds.startRow;
        const c = cell.col - bounds.startCol;
        grid[r][c] = String(cell.value ?? '');
      });

      const text = grid.map((row) => row.join('\t')).join('\n');

      if (e.clipboardData) {
        e.clipboardData.setData('text/plain', text);
        e.preventDefault();
      }
    },
    [store, tableRef]
  );

  return handleCopy;
}

// ============================================
// STICKY OFFSETS HOOK
// ============================================
export function useStickyOffsets(
  columns: { sticky?: 'left' | 'right'; width?: number }[],
  store: CellStore,
  rowHeaders: boolean
): {
  leftOffsets: (number | undefined)[];
  rightOffsets: (number | undefined)[];
} {
  const leftOffsets: (number | undefined)[] = [];
  const rightOffsets: (number | undefined)[] = [];

  let leftOffset = rowHeaders ? 50 : 0;
  let rightOffset = 0;

  // Calculate left sticky offsets
  columns.forEach((col, index) => {
    const colWidth = store.getColumnWidth(index);

    if (col.sticky === 'left') {
      leftOffsets[index] = leftOffset;
      leftOffset += colWidth;
    } else {
      leftOffsets[index] = undefined;
    }
  });

  // Calculate right sticky offsets (need to go backwards)
  const rightStickyCols: { index: number; width: number }[] = [];
  columns.forEach((col, index) => {
    if (col.sticky === 'right') {
      rightStickyCols.push({ index, width: store.getColumnWidth(index) });
    }
  });

  rightStickyCols.reverse().forEach(({ index, width }) => {
    rightOffsets[index] = rightOffset;
    rightOffset += width;
  });

  // Fill undefined for non-sticky columns
  columns.forEach((col, index) => {
    if (col.sticky !== 'right') {
      rightOffsets[index] = undefined;
    }
  });

  return { leftOffsets, rightOffsets };
}

// ============================================
// ROW ACTION SHORTCUTS HOOK
// ============================================

/**
 * Checks if a keyboard event matches a shortcut definition.
 */
function matchesShortcut(event: KeyboardEvent, shortcut: RowActionShortcut): boolean {
  if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) return false;

  const needsCtrlOrCmd = shortcut.ctrlOrCmd ?? false;
  const hasCtrlOrCmd = event.ctrlKey || event.metaKey;
  if (needsCtrlOrCmd !== hasCtrlOrCmd) return false;

  const needsShift = shortcut.shift ?? false;
  if (needsShift !== event.shiftKey) return false;

  const needsAlt = shortcut.alt ?? false;
  if (needsAlt !== event.altKey) return false;

  return true;
}

/**
 * Hook that returns a keydown handler for row-level keyboard shortcuts.
 * Shortcuts only fire when:
 * - A single cell is selected (not a range)
 * - Not currently editing a cell
 * - Not holding unexpected modifiers
 *
 * @returns A handler that should be called from the table's keydown handler.
 *          Returns true if a shortcut matched (caller should stop further processing).
 */
export function useRowActionShortcuts(
  store: CellStore,
  shortcuts?: KeyboardShortcutsConfig,
  onRowAction?: OnRowAction
) {
  const handleShortcut = useCallback(
    (event: KeyboardEvent): boolean => {
      if (!shortcuts?.rowActions?.length || !onRowAction) return false;

      // Only fire when not editing
      if (store.getEditingCell()) return false;

      // Only fire with a single-cell selection
      const bounds = store.getSelectionBounds();
      if (!bounds) return false;
      if (bounds.startRow !== bounds.endRow || bounds.startCol !== bounds.endCol) return false;

      const rowIndex = bounds.startRow;

      for (const shortcut of shortcuts.rowActions) {
        if (matchesShortcut(event, shortcut)) {
          event.preventDefault();
          const rowData = store.getRowData(rowIndex);
          onRowAction(shortcut.id, rowData, rowIndex);
          return true;
        }
      }

      return false;
    },
    [store, shortcuts, onRowAction]
  );

  return handleShortcut;
}

// ============================================
// FILTER SUGGESTIONS HOOK
// ============================================

export interface UseFilterSuggestionsOptions {
  /**
   * The entity type to fetch suggestions for.
   * Must be a valid entity ID (e.g., 'catalog:products', 'customers:people')
   */
  entityType: string;
  /**
   * Whether the hook is enabled. When false, returns undefined.
   * Useful for conditionally enabling server-side suggestions.
   * @default true
   */
  enabled?: boolean;
}

/**
 * Hook that returns a LoadFilterSuggestions function for use with DynamicTable.
 * Fetches filter suggestions from the server API for large datasets.
 *
 * @example
 * ```tsx
 * function ProductsTable() {
 *   const loadFilterSuggestions = useFilterSuggestions({
 *     entityType: 'catalog:products'
 *   });
 *
 *   return (
 *     <DynamicTable
 *       // ... other props
 *       loadFilterSuggestions={loadFilterSuggestions}
 *     />
 *   );
 * }
 * ```
 */
export function useFilterSuggestions(
  options: UseFilterSuggestionsOptions
): LoadFilterSuggestions | undefined {
  const { entityType, enabled = true } = options;

  const loadSuggestions = useMemo<LoadFilterSuggestions | undefined>(() => {
    if (!enabled || !entityType) return undefined;

    return async (field: string, query: string): Promise<string[]> => {
      try {
        const params = new URLSearchParams({
          entityId: entityType,
          field,
          query: query || '',
        });

        const result = await apiCall<{ items: string[] }>(
          `/api/entities/filter-suggestions?${params.toString()}`,
          { credentials: 'include' }
        );

        if (!result.ok || !result.result) {
          return [];
        }

        return result.result.items ?? [];
      } catch (error) {
        console.error('[useFilterSuggestions] Failed to fetch suggestions:', error);
        return [];
      }
    };
  }, [entityType, enabled]);

  return loadSuggestions;
}
