// DynamicTable.tsx


'use client';

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import { createCellStore, CellStore } from './store/index';
import {
  CellStoreContext,
  useStickyOffsets,
  useKeyboardNavigation,
  useCopyHandler,
  useRowActionShortcuts,
} from './hooks/index';
import {
  createCellHandlers,
  createRowHandlers,
  createDragHandlers,
  createMouseHandlers,
  createColumnHeaderHandlers,
  createRowHeaderHandlers,
  createContextMenuHandlers,
  createResizeHandlers,
  DragState,
} from './handlers/index';
import { createPerspectiveHandlers, initializePerspectiveState } from './handlers/perspectiveHandlers';
import { dispatch, useEventHandlers } from './events/events';
import {
  ColumnDef,
  ContextMenuState,
  SortState,
  FilterRow,
  TableEvents,
  FilterChangeEvent,
  PaginationProps,
  ContextMenuAction,
  SavedFilter,
  TableUIConfig,
  LoadFilterSuggestions,
  KeyboardShortcutsConfig,
  OnRowAction,
} from './types/index';
import {
  PerspectiveConfig,
  SortRule,
  PerspectiveChangeEvent,
} from './types/perspective';

// Import components
import PerspectiveToolbar from './components/PerspectiveToolbar';
import PerspectiveTabs from './components/PerspectiveTabs';
import SearchBar from './components/SearchBar';
import ContextMenu from './components/ContextMenu';
import VirtualRow from './components/VirtualRow';
import ColumnHeaders from './components/ColumnHeaders';
import Debugger from './components/Debugger';
import FullscreenOverlay from './components/FullscreenOverlay';
import { Maximize2 } from 'lucide-react';

if (typeof window !== 'undefined') {
  import('./styles/DynamicTable.css');
}

// ============================================
// PROPS INTERFACE
// ============================================

export interface DynamicTableProps {
  data?: any[];
  columns?: ColumnDef[];
  colHeaders?: boolean;
  rowHeaders?: boolean;
  height?: string | number;
  width?: string | number;
  idColumnName?: string;
  tableName?: string;
  tableRef: React.RefObject<HTMLDivElement | null>;
  /** Message to display when data is empty (e.g., "No addresses") */
  emptyMessage?: string;
  columnActions?: (column: ColumnDef, colIndex: number) => ContextMenuAction[];
  rowActions?: (rowData: any, rowIndex: number) => ContextMenuAction[];
  actionsRenderer?: (rowData: any, rowIndex: number) => React.ReactNode;
  pagination?: PaginationProps;
  /** When true, columns stretch proportionally to fill container width */
  stretchColumns?: boolean;

  // NEW - Perspective management
  /**
   * Array of perspective configurations to display in the perspective tabs/dropdown.
   * Perspectives define saved views with filters, sorting, column visibility, etc.
   * 
   * VIRTUAL PERSPECTIVES:
   * Perspectives with IDs starting with '__' (double underscore) are considered
   * "virtual" or "system" perspectives. They are hidden from the UI tabs (via
   * PerspectiveTabs.tsx filter) but can still be active to provide functionality
   * like URL-based filtering.
   * 
   * Example virtual perspective: `{ id: '__url_filters__', name: 'Filters from URL', ... }`
   */
  savedPerspectives?: PerspectiveConfig[];
  
  /**
   * The ID of the currently active perspective. When controlled by parent component,
   * the table will sync its internal state (filters, sorting, columns) to match
   * the active perspective.
   * 
   * CONTROLLED MODE:
   * When both `savedPerspectives` and `activePerspectiveId` are provided, the table
   * operates in controlled mode. The parent component manages perspective state and
   * the table syncs to match.
   * 
   * CLEARING PERSPECTIVES:
   * Set to `null` to clear the active perspective. The table will update its internal
   * state but will NOT re-apply the perspective if the parent tries to set it again
   * to the same value (prevents infinite loops when user manually clears filters).
   * 
   * VIRTUAL PERSPECTIVES:
   * Virtual perspective IDs (starting with '__') can be used as `activePerspectiveId`
   * to provide hidden functionality without cluttering the UI.
   */
  activePerspectiveId?: string | null;
  
  /** Default columns to hide when no perspective is active */
  defaultHiddenColumns?: string[];

  // DEPRECATED - Keep for backward compatibility (converts to perspectives internally)
  savedFilters?: SavedFilter[];
  activeFilterId?: string | null;
  hiddenColumns?: string[];

  // Debug mode - shows floating event log panel
  debug?: boolean;

  // UI visibility configuration
  uiConfig?: TableUIConfig;

  /** When true, automatically selects the first cell when table receives focus with no existing selection */
  autoSelectOnFocus?: boolean;

  /**
   * When true, Tab navigation enters edit mode on the target cell (Excel-like behavior).
   * When false, Tab only selects the cell without entering edit mode.
   * @default true
   */
  autoEditOnTab?: boolean;

  /**
   * Function to load filter suggestions from the server.
   * When provided, the filter popover will fetch suggestions via this function
   * instead of extracting values from currently loaded data.
   * Recommended for large datasets (1000+ rows) to avoid client-side performance issues.
   */
  loadFilterSuggestions?: LoadFilterSuggestions;

  /**
   * Keyboard shortcuts configuration for row-level actions.
   * Shortcuts only fire when a single cell is selected (not editing, not multi-select).
   */
  keyboardShortcuts?: KeyboardShortcutsConfig;

  /**
   * Callback fired when a keyboard shortcut triggers a row action.
   * Receives the shortcut id, the row data, and the row index.
   */
  onRowAction?: OnRowAction;

  /**
   * Refs to adjacent DynamicTable containers for cross-table navigation.
   * ArrowDown at the last row / ArrowUp at the first row moves focus to
   * `next` / `prev`. Tab past the last editable cell also moves to `next`,
   * and Shift+Tab before the first editable cell moves to `prev`.
   */
  siblingTableRefs?: {
    prev?: React.RefObject<HTMLDivElement | null>;
    next?: React.RefObject<HTMLDivElement | null>;
  };
}

// ============================================
// MAIN DYNAMIC TABLE COMPONENT
// ============================================
const DynamicTable: React.FC<DynamicTableProps> = ({
  data = [],
  columns = [],
  colHeaders = true,
  rowHeaders = false,
  height = 'auto',
  width = 'auto',
  idColumnName = 'id',
  tableName = 'Table Name',
  tableRef,
  emptyMessage,
  columnActions,
  rowActions,
  actionsRenderer,
  pagination,
  // New perspective props
  savedPerspectives: propSavedPerspectives,
  activePerspectiveId: controlledActivePerspectiveId,
  defaultHiddenColumns = [],
  // Deprecated props (backward compatibility)
  savedFilters: deprecatedSavedFilters,
  activeFilterId: deprecatedActiveFilterId,
  hiddenColumns: deprecatedHiddenColumns = [],
  debug = false,
  uiConfig = {},
  stretchColumns = false,
  autoSelectOnFocus = false,
  autoEditOnTab = true,
  loadFilterSuggestions,
  keyboardShortcuts,
  onRowAction,
  siblingTableRefs,
}) => {
  // -------------------- BACKWARD COMPATIBILITY --------------------
  // Convert deprecated savedFilters to savedPerspectives format
  const savedPerspectives = useMemo(() => {
    if (propSavedPerspectives) {
      return propSavedPerspectives;
    }
    // Convert old savedFilters to perspectives
    if (deprecatedSavedFilters && deprecatedSavedFilters.length > 0) {
      return deprecatedSavedFilters.map(filter => ({
        id: filter.id,
        name: filter.name,
        color: filter.color,
        columns: {
          visible: columns.map(c => c.data),
          hidden: [],
        },
        filters: filter.rows,
        sorting: [],
      }));
    }
    return [];
  }, [propSavedPerspectives, deprecatedSavedFilters, columns]);

  // Use new prop or deprecated prop
  const controlledActiveId = controlledActivePerspectiveId !== undefined
    ? controlledActivePerspectiveId
    : deprecatedActiveFilterId;

  // Merge hidden columns from deprecated prop and new prop
  const initialHiddenColumns = useMemo(() => {
    return [...new Set([...defaultHiddenColumns, ...deprecatedHiddenColumns])];
  }, [defaultHiddenColumns, deprecatedHiddenColumns]);

  // -------------------- UI CONFIG --------------------
  const {
    hideToolbar = false,
    hideTitle = false,
    hideSearch = false,
    hideFilterButton = false,
    hideAddRowButton = false,
    hideBottomBar = false,
    hideActionsColumn = false,
    toolbarPosition = 'top',
    hideColumnsButton = false,
    hideFilterPopover = false,
    hideSortButton = false,
    topBarStart,
    topBarEnd,
    bottomBarStart,
    bottomBarEnd,
    enableFullscreen = false,
    onFullscreenChange,
  } = uiConfig;

  // -------------------- REFS --------------------
  const storeRef = useRef<CellStore | null>(null);
  const dragStateRef = useRef<DragState>({
    isDragging: false,
    type: null,
    start: null,
  });

  // -------------------- CONSTANTS --------------------
  const actionsColumnWidth = 80;

  // -------------------- BASE COLUMNS --------------------
  const baseColumns = useMemo(() => {
    if (columns.length > 0) {
      return columns;
    }
    if (data.length > 0 && typeof data[0] === 'object' && !Array.isArray(data[0])) {
      return Object.keys(data[0])
        .filter((k) => k !== '_isNew')
        .map((k) => ({ data: k }));
    }
    return [];
  }, [columns, data]);

  // -------------------- PERSPECTIVE STATE --------------------
  const initialState = useMemo(() => {
    // Find active perspective
    const activePerspective = controlledActiveId
      ? savedPerspectives.find(p => p.id === controlledActiveId)
      : null;
    return initializePerspectiveState(baseColumns, activePerspective, initialHiddenColumns);
  }, []); // Only compute on mount

  const [visibleColumns, setVisibleColumns] = useState<string[]>(initialState.visibleColumns);
  const [hiddenColumns, setHiddenColumns] = useState<string[]>(initialState.hiddenColumns);
  const [filters, setFilters] = useState<FilterRow[]>(initialState.filters);
  const [sortRules, setSortRules] = useState<SortRule[]>(initialState.sortRules);
  const [internalActivePerspectiveId, setInternalActivePerspectiveId] = useState<string | null>(
    controlledActiveId ?? null
  );

  // Active perspective ID (controlled or internal)
  const activePerspectiveId = controlledActiveId !== undefined
    ? controlledActiveId
    : internalActivePerspectiveId;

  // Display name: use perspective name if selected (except for built-in perspectives starting with '_'), otherwise default tableName
  const displayTableName = useMemo(() => {
    if (activePerspectiveId && !activePerspectiveId.startsWith('_')) {
      const activePerspective = savedPerspectives.find(p => p.id === activePerspectiveId);
      if (activePerspective) {
        return activePerspective.name;
      }
    }
    return tableName;
  }, [activePerspectiveId, savedPerspectives, tableName]);

  // -------------------- FULLSCREEN STATE --------------------
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [savedColumnWidths, setSavedColumnWidths] = useState<Map<number, number> | null>(null);

  // -------------------- COMPUTED COLUMNS (ordered by perspective) --------------------
  const cols = useMemo(() => {
    // Get columns in the order specified by visibleColumns
    const orderedCols: ColumnDef[] = [];
    for (const key of visibleColumns) {
      const col = baseColumns.find(c => c.data === key);
      if (col) {
        orderedCols.push(col);
      }
    }
    return orderedCols;
  }, [baseColumns, visibleColumns]);

  // -------------------- STORE INITIALIZATION --------------------
  if (!storeRef.current) {
    storeRef.current = createCellStore(data, cols);
  }
  const store = storeRef.current;

  // -------------------- OTHER STATE --------------------
  const [rowCount, setRowCount] = useState(store.getRowCount());
  const [storeRevision, setStoreRevision] = useState(0);
  const [sortState, setSortState] = useState<SortState>({
    columnIndex: null,
    direction: null,
  });
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // -------------------- COMPUTED VALUES --------------------
  const { leftOffsets, rightOffsets } = useStickyOffsets(cols, store, rowHeaders);

  const showActionsColumn = !hideActionsColumn;

  const totalWidth = useMemo(() => {
    return (
      cols.reduce((sum, _, idx) => sum + store.getColumnWidth(idx), 0) +
      (rowHeaders ? 50 : 0) +
      (showActionsColumn ? actionsColumnWidth : 0)
    );
  }, [cols, store, rowHeaders, actionsColumnWidth, showActionsColumn, storeRevision]);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => tableRef?.current,
    estimateSize: () => 32,
    overscan: 10,
  });

  // Re-measure when fullscreen state changes
  useEffect(() => {
    // Small delay to ensure DOM is ready after fullscreen transition
    const timer = setTimeout(() => {
      rowVirtualizer.measure();
    }, 50);
    return () => clearTimeout(timer);
  }, [isFullscreen, rowVirtualizer]);

  const virtualRows = rowVirtualizer.getVirtualItems();

  // -------------------- HANDLERS --------------------
  const { handleCellSave } = createCellHandlers(store, cols, tableRef, idColumnName);
  const { handleAddRow, handleSaveNewRow, handleCancelNewRow } = createRowHandlers(
    store,
    cols,
    tableRef
  );
  const dragHandlers = createDragHandlers(store, cols, dragStateRef);
  const { handleMouseDown, handleMouseMove, handleMouseUp, handleDoubleClick } =
    createMouseHandlers(store, cols, dragStateRef, dragHandlers);
  const { handleColumnSort, handleColumnHeaderDoubleClick, handleColumnHeaderMouseDown } =
    createColumnHeaderHandlers(
      store,
      cols,
      tableRef,
      sortState,
      setSortState,
      setContextMenu,
      columnActions
    );
  const { handleRowHeaderDoubleClick } = createRowHeaderHandlers(
    store,
    tableRef,
    setContextMenu,
    rowActions
  );
  const { handleContextMenuAction, handleContextMenuClose } = createContextMenuHandlers(
    store,
    cols,
    tableRef,
    contextMenu,
    setContextMenu
  );
  const { handleResizeStart } = createResizeHandlers(store);

  // Perspective handlers
  const {
    handleColumnVisibilityChange,
    handleColumnOrderChange,
    handleFiltersChange,
    handleSortRulesChange,
    handleSavePerspective,
    handlePerspectiveSelect,
    handlePerspectiveRename,
    handlePerspectiveDelete,
  } = createPerspectiveHandlers({
    tableRef,
    columns: baseColumns,
    savedPerspectives,
    activePerspectiveId,
    setVisibleColumns,
    setHiddenColumns,
    setFilters,
    setSortRules,
    setInternalActivePerspectiveId,
  });

  const keyboardHandler = useKeyboardNavigation(store, cols.length, cols, autoEditOnTab, handleCellSave, siblingTableRefs);
  const shortcutHandler = useRowActionShortcuts(store, keyboardShortcuts, onRowAction);
  const handleCopy = useCopyHandler(store);

  // Wrap keyboard handler for React event system
  // Shortcuts are checked first; if one matches, skip normal navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (shortcutHandler(e.nativeEvent)) return;
    keyboardHandler(e.nativeEvent);
  }, [keyboardHandler, shortcutHandler]);

  // Auto-select cell on focus (when enabled and no existing selection).
  // Reads optional data-focus-direction / data-focus-trigger attributes set
  // by the cross-table arrow and Tab handlers.
  const handleFocus = useCallback(() => {
    const direction = tableRef.current?.getAttribute('data-focus-direction');
    const trigger = tableRef.current?.getAttribute('data-focus-trigger');
    if (direction) tableRef.current?.removeAttribute('data-focus-direction');
    if (trigger) tableRef.current?.removeAttribute('data-focus-trigger');

    if (store.getRowCount() === 0) {
      // Empty table: if Tab-triggered, forward to the next sibling in the
      // same direction so empty tables are transparently skipped.
      if (trigger === 'tab') {
        const nextSibling = direction === 'up'
          ? siblingTableRefs?.prev?.current
          : siblingTableRefs?.next?.current;
        if (nextSibling) {
          nextSibling.setAttribute('data-focus-direction', direction || 'down');
          nextSibling.setAttribute('data-focus-trigger', 'tab');
          nextSibling.focus();
        }
      }
      return;
    }

    if (!autoSelectOnFocus || store.getSelection().anchor) return;

    const rowCount = store.getRowCount();
    const targetRow = direction === 'up' ? rowCount - 1 : 0;
    store.setSelection({
      type: 'range',
      anchor: { row: targetRow, col: 0 },
      focus: { row: targetRow, col: 0 },
    });
  }, [autoSelectOnFocus, store, tableRef, siblingTableRefs]);

  // Returns true when the target element sits inside a modal dialog that
  // does NOT contain this table.  Modal dialogs (delete confirmations,
  // forms) are rendered as sibling portals — keeping selection while
  // they're open is correct because they return focus to the table on
  // close via onCloseAutoFocus.  Drawers/Sheets also carry
  // `role="dialog"` but they *contain* the table, so they must NOT be
  // exempted (sibling tables inside the same drawer need independent
  // selection clearing).
  const isInsideExternalDialog = useCallback((el: HTMLElement): boolean => {
    const dialog = el.closest('[role="dialog"]');
    if (!dialog) return false;
    return !dialog.contains(tableRef?.current);
  }, [tableRef]);

  // Clear selection when DOM focus leaves the table container.
  // This ensures that when a user clicks on another table (or any element
  // outside this table), the stale selection is removed so only the newly
  // focused table shows a highlight.  We skip clearing when focus moves to
  // portal-rendered popups (date pickers, dropdowns, entity search) that
  // logically belong to this table even though they live outside its DOM.
  const handleBlur = useCallback((e: React.FocusEvent) => {
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    // Focus left the window entirely (e.g. alt-tab) — keep selection.
    if (!relatedTarget) return;
    // Focus stayed inside our table container — nothing to clear.
    if (tableRef?.current?.contains(relatedTarget)) return;
    // Focus moved to a portal popup (Radix dropdown/popover, editor popup
    // like calendar or dropdown, context menu) that belongs to this table —
    // keep selection.
    if (relatedTarget.closest('[data-radix-popper-content-wrapper]') ||
        relatedTarget.closest('.hot-editor-popup') ||
        relatedTarget.closest('.hot-context-menu')) return;
    // Focus moved to a modal dialog (delete confirmation, form, etc.)
    // that does NOT contain this table — keep selection; the dialog will
    // return focus on close via onCloseAutoFocus.
    if (isInsideExternalDialog(relatedTarget)) return;

    store.clearEditing();
    store.setSelection({ type: null, anchor: null, focus: null });
  }, [store, tableRef, isInsideExternalDialog]);

  // -------------------- FULLSCREEN HANDLERS --------------------
  const handleEnterFullscreen = () => {
    // Save current widths
    setSavedColumnWidths(store.getColumnWidths());

    // Calculate and apply scaled widths
    const padding = 48; // 24px padding each side
    const availableWidth = window.innerWidth - padding;
    const currentTotal = cols.reduce((sum, _, idx) => sum + store.getColumnWidth(idx), 0) +
      (rowHeaders ? 50 : 0) +
      (showActionsColumn ? actionsColumnWidth : 0);

    if (availableWidth > currentTotal) {
      const scaleFactor = availableWidth / currentTotal;
      cols.forEach((_, idx) => {
        const originalWidth = store.getColumnWidth(idx);
        const scaledWidth = Math.max(Math.round(originalWidth * scaleFactor), 60);
        store.setColumnWidth(idx, scaledWidth);
      });
    }

    setIsFullscreen(true);
    onFullscreenChange?.(true);
  };

  const handleExitFullscreen = () => {
    // Restore original widths
    if (savedColumnWidths) {
      savedColumnWidths.forEach((width, idx) => {
        store.setColumnWidth(idx, width);
      });
    }
    setSavedColumnWidths(null);
    setIsFullscreen(false);
    onFullscreenChange?.(false);
  };

  // -------------------- EFFECTS --------------------
  // Register table container ref with store for focus management
  useEffect(() => {
    store.setTableRef(tableRef);
  }, [store, tableRef]);

  // Sync data to store.
  // Skip when the store contains unsaved new rows to prevent wiping
  // in-progress edits (e.g., dropdown selections in insert mode).
  useEffect(() => {
    if (store.hasNewRows()) return;
    store.setData(data);
  }, [data, store]);

  // Subscribe to store-level changes (row add/remove, column resize)
  useEffect(() => {
    return store.subscribeToStore(() => {
      setRowCount(store.getRowCount());
      setStoreRevision(prev => prev + 1);
    });
  }, [store]);

  // Keyboard navigation is now handled via onKeyDown prop on the table container
  // This ensures React synthetic events fire before the handler, allowing editors to save first

  // Copy handler
  useEffect(() => {
    document.addEventListener('copy', handleCopy);
    return () => document.removeEventListener('copy', handleCopy);
  }, [handleCopy]);

  // Global mouse up for drag end
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (dragStateRef.current.isDragging) {
        dragHandlers.handleDragEnd();
      }
    };

    document.addEventListener('mouseup', handleGlobalMouseUp);
    return () => document.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [dragHandlers]);

  // Click outside handler to clear selection.
  // When multiple DynamicTables coexist inside a dialog/drawer, clicking on
  // another table must clear THIS table's selection.  Portal-rendered popups
  // (date pickers, dropdowns, context menus) are excluded so interacting with
  // them doesn't accidentally clear the selection.
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Click is inside our own table container — keep selection.
      if (tableRef?.current?.contains(target)) {
        return;
      }

      // Click is inside a Radix portal popup, context menu, or there's an active
      // editor popup anywhere in the DOM. For editor popups, we check existence
      // (not containment) because clicking OUTSIDE the popup to close it should
      // let the editor's own click-outside handler save the value first.
      if (target.closest('[data-radix-popper-content-wrapper]') ||
          target.closest('.hot-context-menu') ||
          document.querySelector('.hot-editor-popup')) {
        return;
      }

      // Click landed inside a modal dialog that does NOT contain this
      // table (e.g., delete confirmation overlay) — keep selection.
      // Drawers/Sheets also have `role="dialog"` but they *contain* the
      // table, so clicks inside the same drawer still clear selection.
      if (isInsideExternalDialog(target)) {
        return;
      }

      // If there's an active editing cell, defer clearing so the editor's blur
      // handler has a chance to save the value first. mousedown fires before blur,
      // so without this delay the editor unmounts before onBlur can call onSave.
      const editingCell = store.getEditingCell();
      if (editingCell) {
        setTimeout(() => {
          store.clearEditing();
          store.setSelection({ type: null, anchor: null, focus: null });
        }, 0);
      } else {
        store.clearEditing();
        store.setSelection({ type: null, anchor: null, focus: null });
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [store, tableRef, isInsideExternalDialog]);

  // Dispatch FILTER_CHANGE when filters change (backward compatibility)
  useEffect(() => {
    if (!tableRef?.current) return;
    dispatch<FilterChangeEvent>(
      tableRef.current,
      TableEvents.FILTER_CHANGE,
      { filters, savedFilterId: activePerspectiveId },
    );
  }, [filters, activePerspectiveId, tableRef]);

  /**
   * Sync controlled perspective props to internal table state.
   * 
   * PURPOSE:
   * When the parent component controls perspectives via `activePerspectiveId` and
   * `savedPerspectives` props, this effect ensures the table's internal state
   * (filters, sorting, column visibility) stays synchronized with the active perspective.
   * 
   * BEHAVIOR:
   * 1. When `activePerspectiveId` changes to a new value, looks up that perspective
   *    in `savedPerspectives` and applies its settings to the table.
   * 2. When `activePerspectiveId` is set to `null`, clears the internal active perspective
   *    but does NOT modify filters/sorting (allows parent to control that separately).
   * 3. Uses a ref to track the last applied perspective ID to prevent redundant updates
   *    when the same perspective is selected multiple times.
   * 
   * INFINITE LOOP PREVENTION:
   * - Does NOT depend on `filters` or `sortRules` in dependency array, as those are
   *   outputs that get set by this effect. Including them would create a circular dependency.
   * - Uses a ref (`lastAppliedPerspectiveIdRef`) instead of state to track applied ID,
   *   avoiding triggering this effect when internal state updates.
   * - Parent components should use their own refs to prevent re-setting `activePerspectiveId`
   *   after user manually clears it (see fms-quotes/page.tsx for example).
   * 
   * VIRTUAL PERSPECTIVES:
   * This effect treats virtual perspectives (ID starting with '__') the same as regular
   * perspectives. The hiding happens in PerspectiveTabs.tsx, not here.
   * 
   * PARENT COMPONENT REQUIREMENTS:
   * To avoid infinite loops when users clear filters:
   * ```tsx
   * const hasInitializedRef = useRef(false)
   * 
   * useEffect(() => {
   *   if (urlFilterPerspective && !hasInitializedRef.current) {
   *     setActivePerspectiveId('__url_filters__')
   *     hasInitializedRef.current = true
   *   }
   * }, [urlFilterPerspective])
   * 
   * // In FILTER_CHANGE handler:
   * if (filters.length === 0 && activePerspectiveId === '__url_filters__') {
   *   setActivePerspectiveId(null)
   * }
   * ```
   */
  const lastAppliedPerspectiveIdRef = React.useRef<string | null>(null);
  
  useEffect(() => {
    // Only apply if we have controlled props (parent is managing perspectives)
    if (controlledActiveId === undefined) return;
    
    // If perspective is being cleared (set to null/empty), just update the ref and internal state
    if (!controlledActiveId) {
      if (lastAppliedPerspectiveIdRef.current !== null) {
        lastAppliedPerspectiveIdRef.current = null;
        setInternalActivePerspectiveId(null);
      }
      return;
    }
    
    if (!savedPerspectives || savedPerspectives.length === 0) return;
    
    // Find the perspective
    const perspective = savedPerspectives.find(p => p.id === controlledActiveId);
    if (!perspective) {
      // Perspective ID provided but not found - might be intentional (cleared state)
      lastAppliedPerspectiveIdRef.current = null;
      return;
    }
    
    // Check if this exact perspective ID was already applied (using ref to avoid state dependency)
    if (lastAppliedPerspectiveIdRef.current === controlledActiveId) {
      return;
    }
    
    // Apply the perspective settings
    setVisibleColumns(perspective.columns.visible);
    setHiddenColumns(perspective.columns.hidden);
    setFilters(perspective.filters);
    setSortRules(perspective.sorting);
    setInternalActivePerspectiveId(controlledActiveId);
    
    // Remember that we applied this perspective
    lastAppliedPerspectiveIdRef.current = controlledActiveId;
  }, [controlledActiveId, savedPerspectives]);

  /**
   * Dispatch PERSPECTIVE_CHANGE event whenever table configuration changes.
   * 
   * PURPOSE:
   * Notifies parent components and event listeners when the table's perspective
   * settings change (filters, sorting, column visibility). This enables:
   * - Parent components to sync URL parameters with active filters
   * - External state management to track table configuration
   * - Analytics/logging of user interactions with the table
   * 
   * IMPORTANT:
   * Parent components handling this event should be careful not to create infinite
   * loops. Common patterns:
   * - Extract only sorting changes: `if (payload.config.sorting) { ... }`
   * - Use refs to track initialization state before updating controlled props
   * - Avoid re-setting `activePerspectiveId` in response to this event unless
   *   implementing specific logic like URL sync
   * 
   * This event fires for ALL config changes, not just user interactions. It will
   * fire when:
   * - User adds/removes filters via UI
   * - User clicks column headers to sort
   * - User shows/hides columns
   * - Parent component applies a perspective via `activePerspectiveId` prop
   *   (via the perspective sync effect above)
   * 
   * See fms-quotes/page.tsx PERSPECTIVE_CHANGE handler for an example of safe usage.
   */
  useEffect(() => {
    if (!tableRef?.current) return;
    dispatch<PerspectiveChangeEvent>(
      tableRef.current,
      TableEvents.PERSPECTIVE_CHANGE,
      {
        config: {
          columns: { visible: visibleColumns, hidden: hiddenColumns },
          filters,
          sorting: sortRules,
        },
      },
    );
  }, [visibleColumns, hiddenColumns, filters, sortRules, tableRef]);

  // -------------------- EVENT HANDLERS --------------------
  useEventHandlers({
    [TableEvents.CELL_SAVE_START]: (payload) => {
      store.setSaveState(payload.rowIndex, payload.colIndex, 'saving');
    },
    [TableEvents.CELL_SAVE_SUCCESS]: (payload) => {
      store.setSaveState(payload.rowIndex, payload.colIndex, 'success');
      setTimeout(() => store.setSaveState(payload.rowIndex, payload.colIndex, null), 2000);
    },
    [TableEvents.CELL_SAVE_ERROR]: (payload) => {
      store.setSaveState(payload.rowIndex, payload.colIndex, 'error');
      setTimeout(() => store.setSaveState(payload.rowIndex, payload.colIndex, null), 3000);
    },
    [TableEvents.NEW_ROW_SAVE_SUCCESS]: (payload) => {
      store.markRowAsSaved(payload.rowIndex, payload.savedRowData);
    },
    [TableEvents.NEW_ROW_SAVE_ERROR]: (payload) => {
      console.error('Failed to save new row:', payload.error);
    },
  }, tableRef);

  // -------------------- RENDER --------------------

  // Determine if we should fill available height
  const shouldFillHeight = height === '100%' || height === 'fill'

  // Table content shared between normal and fullscreen modes
  const tableContent = (
    <div
      className={`hot-container ${shouldFillHeight ? 'flex flex-col flex-1' : ''}`}
      style={{
        height: isFullscreen ? '100%' : (shouldFillHeight ? '100%' : height),
        width: isFullscreen ? '100%' : width,
        position: 'relative',
        ...(shouldFillHeight && { minHeight: 0 }),
      }}
    >
      {/* Combined Toolbar - Title, Perspective controls, Search, Add button */}
      {!hideToolbar && (
        <div className="hot-toolbar">
          {/* Custom slot: top bar start */}
          {topBarStart}

          {!hideTitle && (
            <h3 className="hot-toolbar-title">{displayTableName}</h3>
          )}

          {/* Perspective Toolbar - only show in top when position is 'top' */}
          {!hideFilterButton && toolbarPosition === 'top' && (
            <PerspectiveToolbar
              columns={baseColumns}
              visibleColumns={visibleColumns}
              hiddenColumns={hiddenColumns}
              filters={filters}
              sortRules={sortRules}
              onColumnVisibilityChange={handleColumnVisibilityChange}
              onColumnOrderChange={handleColumnOrderChange}
              onFiltersChange={handleFiltersChange}
              onSortRulesChange={handleSortRulesChange}
              onSavePerspective={handleSavePerspective}
              hideColumnsButton={hideColumnsButton}
              hideFilterPopover={hideFilterPopover}
              hideSortButton={hideSortButton}
              activePerspectiveId={activePerspectiveId}
              loadFilterSuggestions={loadFilterSuggestions}
            />
          )}

          {/* Spacer */}
          <div className="hot-toolbar-spacer" />

          {/* Search, Fullscreen, and Add Row */}
          <div className="hot-toolbar-actions">
            {!hideSearch && <SearchBar tableRef={tableRef} placeholder="Search..." />}
            {enableFullscreen && !isFullscreen && (
              <button
                onClick={handleEnterFullscreen}
                className="fullscreen-toggle-btn"
                title="Enter fullscreen"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            )}
            {!hideAddRowButton && (
              <button
                onClick={handleAddRow}
                className="hot-add-row-btn"
                title="Add new row"
              >
                +
              </button>
            )}
          </div>

          {/* Custom slot: top bar end */}
          {topBarEnd}
        </div>
      )}

      {/* Table Container */}
      <div
        ref={tableRef}
        tabIndex={0}
        className={`hot-virtual-container ${shouldFillHeight ? 'flex-1' : ''}`}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onMouseDown={(e) => {
          handleMouseDown(e);
          // Focus the table container so it can receive keyboard events (e.g., Escape)
          tableRef.current?.focus();
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
        style={{
          height: isFullscreen ? 'calc(100% - 90px)' : (shouldFillHeight ? undefined : (typeof height === 'string' && height !== 'auto' ? height : '600px')),
          overflow: 'auto',
          position: 'relative',
          outline: 'none',
          ...(shouldFillHeight && { minHeight: 0 }),
        }}
      >
        {/* Empty State Message */}
        {emptyMessage && rowCount === 0 ? (
          <div className="hot-empty-message">
            {emptyMessage}
          </div>
        ) : (
          <>
            {/* Column Headers */}
            {colHeaders && (
              <ColumnHeaders
                columns={cols}
                rowHeaders={rowHeaders}
                leftOffsets={leftOffsets}
                rightOffsets={rightOffsets}
                totalWidth={totalWidth}
                sortState={sortState}
                actionsColumnWidth={actionsColumnWidth}
                showActionsColumn={showActionsColumn}
                stretchColumns={stretchColumns}
                onSort={handleColumnSort}
                onResizeStart={handleResizeStart}
                onDoubleClick={handleColumnHeaderDoubleClick}
                onMouseDown={(e) => handleColumnHeaderMouseDown(e, dragHandlers.handleDragStart)}
                onMouseMove={handleMouseMove}
              />
            )}

            {/* Virtual Body */}
            <table className="hot-table" style={{ width: stretchColumns ? '100%' : `${totalWidth}px` }}>
              <tbody
                style={{
                  display: 'block',
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  position: 'relative',
                }}
              >
                {virtualRows.map((virtualRow) => (
                  <VirtualRow
                    key={virtualRow.index}
                    rowIndex={virtualRow.index}
                    columns={cols}
                    virtualRow={virtualRow}
                    rowHeaders={rowHeaders}
                    leftOffsets={leftOffsets}
                    rightOffsets={rightOffsets}
                    actionsColumnWidth={actionsColumnWidth}
                    showActionsColumn={showActionsColumn}
                    stretchColumns={stretchColumns}
                    totalWidth={totalWidth}
                    storeRevision={storeRevision}
                    onSaveNewRow={handleSaveNewRow}
                    onCancelNewRow={handleCancelNewRow}
                    onRowHeaderDoubleClick={handleRowHeaderDoubleClick}
                    onCellSave={handleCellSave}
                    actionsRenderer={actionsRenderer}
                  />
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* Perspective Tabs / Bottom Bar */}
      {!hideBottomBar && (
        <PerspectiveTabs
          savedPerspectives={savedPerspectives}
          activePerspectiveId={activePerspectiveId}
          onPerspectiveSelect={handlePerspectiveSelect}
          onPerspectiveRename={handlePerspectiveRename}
          onPerspectiveDelete={handlePerspectiveDelete}
          pagination={pagination}
          startContent={bottomBarStart}
          endContent={bottomBarEnd}
          toolbar={!hideFilterButton && toolbarPosition === 'bottom' ? (
            <PerspectiveToolbar
              columns={baseColumns}
              visibleColumns={visibleColumns}
              hiddenColumns={hiddenColumns}
              filters={filters}
              sortRules={sortRules}
              onColumnVisibilityChange={handleColumnVisibilityChange}
              onColumnOrderChange={handleColumnOrderChange}
              onFiltersChange={handleFiltersChange}
              onSortRulesChange={handleSortRulesChange}
              onSavePerspective={handleSavePerspective}
              hideColumnsButton={hideColumnsButton}
              hideFilterPopover={hideFilterPopover}
              hideSortButton={hideSortButton}
              activePerspectiveId={activePerspectiveId}
              loadFilterSuggestions={loadFilterSuggestions}
            />
          ) : undefined}
        />
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          isOpen={contextMenu.isOpen}
          position={contextMenu.position}
          actions={contextMenu.actions}
          onClose={handleContextMenuClose}
          onActionClick={handleContextMenuAction}
        />
      )}

      {/* Debugger */}
      {debug && <Debugger tableRef={tableRef} />}
    </div>
  );

  return (
    <CellStoreContext.Provider value={store}>
      {isFullscreen ? (
        <FullscreenOverlay
          isOpen={isFullscreen}
          onClose={handleExitFullscreen}
          tableName={displayTableName}
        >
          {tableContent}
        </FullscreenOverlay>
      ) : (
        tableContent
      )}
    </CellStoreContext.Provider>
  );
};

export default DynamicTable;
