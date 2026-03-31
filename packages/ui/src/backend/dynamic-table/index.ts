// index.ts

export { default as DynamicTable } from './DynamicTable';
export { default as TableSkeleton } from './components/TableSkeleton';
export { default as Debugger } from './components/Debugger';

// Perspective components
export { default as PerspectiveToolbar } from './components/PerspectiveToolbar';
export { default as PerspectiveTabs } from './components/PerspectiveTabs';
export { default as ColumnsPopover } from './components/ColumnsPopover';
export { default as FilterPopover } from './components/FilterPopover';
export { default as SortPopover } from './components/SortPopover';
export { default as GroupPopover } from './components/GroupPopover';

// Modern layout components
export { default as CompactPagination } from './components/CompactPagination';
export { default as ColumnHeaderMenu } from './components/ColumnHeaderMenu';
export { default as ConfigureViewPanel } from './components/ConfigureViewPanel';
export { default as ConfigureViewFields } from './components/ConfigureViewFields';
export { default as ConfigureViewFilters } from './components/ConfigureViewFilters';
export { default as ConfigureViewSorting } from './components/ConfigureViewSorting';
export { default as ConfigureViewGrouping } from './components/ConfigureViewGrouping';
export { default as GroupHeaderRow } from './components/GroupHeaderRow';

// Grouping hook
export { useGrouping } from './hooks/useGrouping';
export type { UseGroupingResult } from './hooks/useGrouping';

// Cell comments
export { default as CellCommentDialog } from './components/CellCommentDialog';
export { useAnnotations } from './hooks/useAnnotations';
export type { CellAnnotationInfo, AnnotationMap } from './hooks/useAnnotations';

export { createCellStore } from './store/index';
export type { CellStore } from './store/index';
export {
  CellStoreContext,
  useCellStore,
  useCellState,
  useStoreRevision,
  useSelectionRevision,
  useSelection,
  useDragHandling,
  useKeyboardNavigation,
  useCopyHandler,
  useStickyOffsets,
  useFilterSuggestions,
  useRowActionShortcuts,
} from './hooks/index';
export type { UseFilterSuggestionsOptions } from './hooks/index';
export * from './types/index';
export * from './validators';
export { dispatch, useMediator, useListener, useEventHandlers } from './events/events';

// Perspective handlers
export {
  createPerspectiveHandlers,
  initializePerspectiveState,
} from './handlers/perspectiveHandlers';
export type { PerspectiveState, PerspectiveHandlersDeps } from './handlers/perspectiveHandlers';

// Entity search editor for connected entities
export {
  EntitySearchEditor,
  createEntitySearchEditor,
} from './components/EntitySearchEditor';
export type {
  EntitySearchEditorConfig,
  SearchResult as EntitySearchResult,
  DynamicTableEditorFn,
} from './components/EntitySearchEditor';

// DateTime editor for inline datetime editing with calendar + clock
export {
  createDateTimeEditor,
} from './components/editors';

// Multi-select entity search editor (new, follows DateEditor pattern)
export {
  MultiSelectEntitySearchEditor,
  createMultiSelectEntitySearchEditor,
} from './components/editors';
export type {
  EntitySearchEditorConfig as MultiSelectEntitySearchEditorConfig,
  SelectedItem as MultiSelectEntitySelectedItem,
  SelectedItem as MultiSelectSelectedItem,
} from './components/editors';

// DynamicTable page hook (frontend factory)
export { useDynamicTablePage } from './hooks/useDynamicTablePage';
export type {
  DynamicTablePageConfig,
  DynamicTablePageResult,
  DynamicTablePageDeleteConfig,
  DynamicTablePageCellEditConfig,
  DynamicTablePageCreateConfig,
  DynamicTableCreateHandlerContext,
  DynamicTablePageHooks,
} from './hooks/useDynamicTablePage';

// Perspective transforms
export { apiToDynamicTable, dynamicTableToApi } from './utils/perspectiveTransforms';

// Delete dialog
export { default as TableDeleteDialog } from './components/TableDeleteDialog';
export type { TableDeleteDialogProps } from './components/TableDeleteDialog';
