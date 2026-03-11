# SPEC-059 — DynamicTable Data Provider (`useDynamicTablePage`)

| Field | Value |
|-------|-------|
| **ID** | SPEC-059 |
| **Date** | 2026-03-11 |
| **Branch** | `feat/dynamic-table-refactor` |
| **Status** | Draft |
| **Depends On** | DynamicTable, Perspectives API, `makeCrudRoute` (reference pattern) |

## Overview

### Problem

FMS backend pages that use `DynamicTable` contain massive, near-identical boilerplate. Across **14 pages totaling 7053 lines**, each page independently implements:

- 8-10 `useState` calls for table state (page, limit, sortField, sortDir, search, filters, savedPerspectives, activePerspectiveId)
- `apiToDynamicTable()` / `dynamicTableToApi()` perspective transforms (~40 lines, **copy-pasted identically** in every page)
- `useQuery` for data fetching with `apiCall` + `URLSearchParams` building
- `useQuery` for perspectives fetching + `useEffect` to sync perspective state
- Event handlers for `CELL_EDIT_SAVE` (~50 lines), `NEW_ROW_SAVE` (~40 lines), `COLUMN_SORT`, `SEARCH`, `FILTER_CHANGE`
- Perspective event handlers: `PERSPECTIVE_SAVE/SELECT/RENAME/DELETE/CHANGE` (~100 lines, differ only by table ID and default sort)
- Delete confirmation state + handler + dialog UI (~40 lines)
- Pagination prop construction

**Lines of boilerplate per page:** ~340 out of 500-600 (simple pages), ~400 out of 1100+ (complex pages).

### Solution

A `useDynamicTablePage` hook — the frontend analog of `makeCrudRoute`. Describe WHAT your table shows and WHAT is editable. The hook handles HOW.

**Design principles (mirroring `makeCrudRoute`):**

1. **Declare data, not plumbing** — `source` URL + `columns` → working table
2. **Sensible defaults for everything** — queryKey derived from URL, CRUD URLs derived from source, editing enabled if columns have editors
3. **Hooks wrap behavior, never replace it** — `beforeCellEdit` transforms payload, then default dispatch/save/invalidate still runs
4. **Progressive complexity** — simplest page is ~15 lines; complex page (contractors) is ~30 lines

### Impact

| Page | Current LOC | Estimated LOC | Reduction |
|------|-------------|---------------|-----------|
| `fms_products/products` | 601 | ~80 | -87% |
| `fms_products/carriers` | 565 | ~80 | -86% |
| `fms_documents` | 645 | ~100 | -85% |
| `fms_teams` | 288 | ~50 | -83% |
| `fms_projects` | 606 | ~100 | -83% |
| `transports` | 615 | ~100 | -84% |
| `fms_locations` | 676 | ~120 | -82% |
| `fms_offers` | 751 | ~150 | -80% |
| `contractors` | 1147 | ~250 | -78% |

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│ Backend Page (e.g. fms_products/page.tsx)  ~15-30 lines     │
│                                                             │
│  const table = useDynamicTablePage({                        │
│    source: '/api/fms_products/products',                    │
│    columns,                                                 │
│    tableName: 'Products',                                   │
│  })                                                         │
│                                                             │
│  return (                                                   │
│    <>                                                       │
│      <DynamicTable {...table.props} />                      │
│      <table.DeleteDialog />                                 │
│    </>                                                      │
│  )                                                          │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ useDynamicTablePage (hook)                                  │
│                                                             │
│ Derives from config:                                        │
│ ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│ │ queryKey     │  │ cellEdit URL │  │ create URL         │  │
│ │ (from URL)   │  │ (source/{id})│  │ (source)           │  │
│ └─────────────┘  └──────────────┘  └────────────────────┘  │
│                                                             │
│ Auto-handles:                                               │
│ ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│ │ useState x8  │  │ useQuery x2  │  │ perspectives full  │  │
│ │ pagination   │  │ data + persp │  │ lifecycle (CRUD)   │  │
│ │ sort/search  │  │ invalidation │  │ transforms         │  │
│ │ filters      │  │ flash msgs   │  │ sync to state      │  │
│ └─────────────┘  └──────────────┘  └────────────────────┘  │
│                                                             │
│ ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│ │ cell edit    │  │ new row save │  │ delete flow +      │  │
│ │ dispatch     │  │ dispatch     │  │ DeleteDialog       │  │
│ │ start/ok/err │  │ start/ok/err │  │ component          │  │
│ └─────────────┘  └──────────────┘  └────────────────────┘  │
│                                                             │
│ Returns:                                                    │
│  table.props      → spread on <DynamicTable>                │
│  table.DeleteDialog → render as component                   │
│  table.query      → react-query result for advanced use     │
│  table.refresh()  → manual refetch                          │
└─────────────────────────────────────────────────────────────┘
         │                          │
         ▼                          ▼
┌─────────────────┐    ┌────────────────────────┐
│ DynamicTable    │    │ Perspective Transforms  │
│ (unchanged)     │    │ (extracted utility)     │
│                 │    │                         │
│ Receives props  │    │ apiToDynamicTable()     │
│ like today      │    │ dynamicTableToApi()     │
└─────────────────┘    └────────────────────────┘
```

### Component Relationships

- **`useDynamicTablePage`** — the main hook; manages all state, queries, event handlers, delete dialog
- **`perspectiveTransforms`** — extracted utility for `apiToDynamicTable`/`dynamicTableToApi` (used internally by hook)
- **`DynamicTable`** — unchanged; receives `table.props` spread
- **`useEventHandlers`** — used internally by the hook (consumers never touch it)
- **`useFilterSuggestions`** — used internally by the hook when `filterSuggestions` is configured
- **`createPerspectiveHandlers`** — existing utility, used internally by the hook

---

## Data Models

### Config Type (`DynamicTablePageConfig`)

```typescript
interface DynamicTablePageConfig<TRow = any> {
  // ─── Required ───────────────────────────────────────────

  /** API endpoint for listing data. Example: '/api/fms_products/products' */
  source: string

  /** Column definitions. Columns with `editor` auto-enable cell editing. */
  columns: ColumnDef[]

  /** Display name shown in table header. */
  tableName: string

  // ─── Optional: Perspectives ─────────────────────────────

  /**
   * Table ID for perspectives API. Enables full perspective lifecycle
   * (fetch, save, rename, delete, select, change).
   * When set, perspectives are fetched from /api/perspectives/{perspectivesId}
   */
  perspectives?: string

  // ─── Optional: Filter Suggestions ───────────────────────

  /**
   * Entity type for server-side filter suggestions.
   * Example: 'contractors:contractor'
   * When set, loadFilterSuggestions is auto-provided to DynamicTable.
   */
  filterSuggestions?: string

  // ─── Optional: Defaults ─────────────────────────────────

  /** Default sort. @default { field: first column's data, direction: 'asc' } */
  defaultSort?: { field: string; direction: 'asc' | 'desc' }

  /** Default page size. @default 50 */
  defaultPageSize?: number

  // ─── Optional: Row Identity ─────────────────────────────

  /** ID column name. Used for PUT/DELETE URL interpolation. @default 'id' */
  idColumn?: string

  // ─── Optional: CRUD ─────────────────────────────────────

  /**
   * Enable row deletion.
   * - true: DELETE to `{source}/{id}`
   * - string: DELETE to that URL ('{id}' is replaced)
   * - false/omitted: no deletion
   * @default false
   */
  delete?: boolean | string

  /**
   * Delete dialog customization.
   * Only relevant when `delete` is enabled.
   */
  deleteDialog?: {
    title?: string | ((row: TRow) => string)
    description?: string | ((row: TRow) => string)
    /** Column to use for "delete {name}?" message. @default 'name' */
    nameColumn?: string
  }

  /**
   * Enable new row creation.
   * - true: POST to `{source}`, payload = all editor columns' values
   * - object: custom URL and/or payload mapping
   * - false/omitted: no creation (hideAddRowButton set automatically)
   *
   * When not explicitly set, auto-enabled if any column has `editor`.
   */
  create?: boolean | {
    url?: string
    mapPayload?: (rowData: any) => Record<string, unknown>
    validate?: (rowData: any) => string | null
  }

  /**
   * Cell edit configuration.
   * - Enabled by default when any column has `editor`
   * - false: explicitly disable cell editing even if columns have editors
   * - object: customize URL or payload mapping
   */
  cellEdit?: false | {
    /** Custom URL. '{id}' is replaced with row ID. @default '{source}/{id}' */
    url?: string | ((payload: CellEditSaveEvent, rowData: any) => string)
    method?: 'PUT' | 'PATCH'
    /** Map cell edit to API payload. @default { [prop]: newValue } */
    mapPayload?: (payload: CellEditSaveEvent, rowData: any) => Record<string, unknown>
  }

  // ─── Optional: Query ────────────────────────────────────

  /** Override auto-derived query key. @default derived from source URL */
  queryKey?: string

  /** Extra query params appended to every request. */
  extraParams?: Record<string, string> | (() => Record<string, string>)

  /** Query param key for search. @default 'q' */
  searchParamKey?: string

  /** Transform API response items before passing to DynamicTable. */
  mapApiItem?: (item: any) => TRow

  // ─── Optional: Hooks ────────────────────────────────────

  /**
   * Lifecycle hooks. Like makeCrudRoute hooks — they wrap default behavior.
   * Return a modified value to transform; return undefined to use defaults.
   * Throw to abort with an error message.
   */
  hooks?: {
    /**
     * Before cell edit save. Return modified url/payload, or undefined for defaults.
     * The default dispatch (CELL_SAVE_START/SUCCESS/ERROR), flash, and query
     * invalidation always run — you only control WHAT is sent.
     */
    beforeCellEdit?: (
      payload: CellEditSaveEvent,
      rowData: any
    ) => { url?: string; payload?: Record<string, unknown>; method?: 'PUT' | 'PATCH' } | undefined | void

    /**
     * Before new row save. Return modified data, or undefined for defaults.
     * Can be async (e.g. for REGON lookup, geocoding).
     */
    beforeCreate?: (
      rowData: any
    ) => Record<string, unknown> | Promise<Record<string, unknown>> | undefined | void

    /** Validate new row before save. Return error string or null. */
    validateCreate?: (rowData: any) => string | null

    /** After any successful mutation (cell edit, create, delete). */
    afterMutation?: (type: 'cellEdit' | 'create' | 'delete', context: any) => void | Promise<void>

    /** Before delete. Return false to cancel. */
    beforeDelete?: (row: TRow) => boolean | Promise<boolean>
  }

  // ─── Optional: DynamicTable Props Passthrough ───────────

  /** Extra props passed directly to DynamicTable. */
  tableProps?: Partial<Omit<DynamicTableProps,
    'data' | 'columns' | 'tableRef' | 'pagination' |
    'savedPerspectives' | 'activePerspectiveId' |
    'loadFilterSuggestions' | 'tableName'
  >>
}
```

### Result Type (`DynamicTablePageResult`)

```typescript
interface DynamicTablePageResult<TRow = any> {
  /**
   * Spread directly onto <DynamicTable>.
   * Contains: tableRef, data, columns, tableName, pagination,
   * savedPerspectives, activePerspectiveId, loadFilterSuggestions,
   * idColumnName, uiConfig, and any tableProps overrides.
   */
  props: DynamicTableProps

  /**
   * Delete confirmation dialog component. Render as <table.DeleteDialog />.
   * Only renders when a deletion is pending. Returns null otherwise.
   * Uses standard Dialog with destructive variant.
   */
  DeleteDialog: React.FC

  /** React-query result for the data query. For advanced use (loading states, error handling). */
  query: UseQueryResult<{ items: TRow[]; total: number; totalPages: number }>

  /** Whether the initial data load is in progress (no previous data). */
  isLoading: boolean

  /** Manual refetch. */
  refresh: () => void

  /** Current state accessors (rarely needed). */
  state: {
    page: number
    limit: number
    search: string
    filters: FilterRow[]
    sortField: string
    sortDir: 'asc' | 'desc'
  }
}
```

---

## How Defaults Work

### Derivation Rules

| Value | Derived From | Example |
|-------|-------------|---------|
| `queryKey` | `source` URL, strip `/api/` prefix and slashes | `/api/fms_products/products` → `'fms_products/products'` |
| Cell edit URL | `source` + `/{id}` | `/api/fms_products/products/{id}` |
| Create URL | `source` | `/api/fms_products/products` |
| Delete URL | `source` + `/{id}` | `/api/fms_products/products/{id}` |
| Cell editing enabled | Any column has `editor` AND `cellEdit !== false` | Auto |
| Create enabled | Any column has `editor` AND `create !== false` | Auto |
| `hideAddRowButton` | `create === false` OR no columns have `editor` | Auto |
| Default sort field | First column's `data` | `'name'` |
| Default sort direction | `'asc'` | |
| Default page size | `50` | |
| ID column | `'id'` | |
| Search param key | `'q'` | |
| Delete dialog title | `'Delete ' + tableName (singular)` | `'Delete Product'` |
| Delete dialog description | `'Are you sure you want to delete "{nameColumn}"?'` | Uses row's `name` field |

### Column-Driven Behavior

```typescript
// Column with editor → cell is editable, row creation includes this field
{ data: 'name', title: 'Name', type: 'text', editor: 'text' }

// Column without editor → read-only cell, excluded from create payload
{ data: 'createdAt', title: 'Created', type: 'date' }

// Column with editor but explicitly read-only → editor shown in create mode only
{ data: 'sku', title: 'SKU', type: 'text', editor: 'text', readOnly: true }
```

### What the Hook Handles Internally

| Concern | Implementation |
|---------|---------------|
| **8 useState calls** | page, limit, sortField, sortDir, search, filters, savedPerspectives, activePerspectiveId |
| **Data query** | `useQuery([queryKey, params])` with `apiCall(source?params)`, `placeholderData: prev => prev` |
| **Perspectives query** | `useQuery(['perspectives', perspectivesId])` when configured |
| **Perspective sync** | `useEffect` transforming API perspectives via `apiToDynamicTable` |
| **COLUMN_SORT handler** | Update sortField/sortDir, reset page to 1 |
| **SEARCH handler** | Update search, reset page to 1 |
| **FILTER_CHANGE handler** | Update filters, reset page to 1 |
| **CELL_EDIT_SAVE handler** | dispatch START → run hooks.beforeCellEdit → apiCall PUT → dispatch SUCCESS/ERROR → flash → invalidate |
| **NEW_ROW_SAVE handler** | run hooks.validateCreate → run hooks.beforeCreate → apiCall POST → dispatch SUCCESS/ERROR → flash → invalidate |
| **PERSPECTIVE_SAVE** | `dynamicTableToApi` → apiCall POST `/api/perspectives/{id}` → update state |
| **PERSPECTIVE_SELECT** | Apply perspective config to sort/filter/columns state, or reset to defaults |
| **PERSPECTIVE_RENAME** | apiCall PUT → update state |
| **PERSPECTIVE_DELETE** | apiCall DELETE → update state, reset if active |
| **PERSPECTIVE_CHANGE** | Track unsaved perspective changes |
| **Delete flow** | pendingDelete state → DeleteDialog renders → apiCall DELETE → flash → invalidate → close |
| **Pagination** | Computed from state + query result, passed as DynamicTable `pagination` prop |
| **Filter suggestions** | `useFilterSuggestions({ entityType })` when configured |
| **Event handler wiring** | `useEventHandlers(handlers, tableRef)` — consumers never call this |

---

## Usage Examples

### 1. Simplest Page (read-only table)

```typescript
export default function TeamsPage() {
  const columns = useMemo<ColumnDef[]>(() => [
    { data: 'userName', title: 'User', type: 'text' },
    { data: 'teamName', title: 'Team', type: 'text' },
    { data: 'role', title: 'Role', type: 'text' },
  ], [])

  const table = useDynamicTablePage({
    source: '/api/fms_teams/members',
    columns,
    tableName: 'Team Members',
  })

  return <DynamicTable {...table.props} />
}
```

~15 lines. No editing, no creation, no deletion, no perspectives. Just data + sort + search + filter + pagination.

### 2. Standard CRUD Page

```typescript
export default function ProductsPage() {
  const columns = useMemo<ColumnDef[]>(() => [
    { data: 'name', title: 'Name', type: 'text', editor: 'text' },
    { data: 'sku', title: 'SKU', type: 'text', editor: 'text' },
    { data: 'price', title: 'Price', type: 'numeric', editor: 'numeric' },
    { data: 'createdAt', title: 'Created', type: 'date' },
  ], [])

  const table = useDynamicTablePage({
    source: '/api/fms_products/products',
    columns,
    tableName: 'Products',
    perspectives: 'fms_products',
    delete: true,
    defaultSort: { field: 'name', direction: 'asc' },
  })

  return (
    <>
      <DynamicTable {...table.props} />
      <table.DeleteDialog />
    </>
  )
}
```

~25 lines. Full CRUD: cell editing (auto from `editor` columns), row creation (auto from `editor` columns), deletion (built-in dialog), perspectives, pagination, sort, search, filters.

### 3. Complex Page (contractors)

```typescript
export default function ContractorsPage() {
  const { t } = useT()
  const columns = useMemo<ColumnDef[]>(() => [...], [])

  const table = useDynamicTablePage({
    source: '/api/contractors/contractors',
    columns,
    tableName: t('contractors.title', 'Contractors'),
    perspectives: 'contractors',
    filterSuggestions: 'contractors:contractor',
    delete: true,
    defaultSort: { field: 'createdAt', direction: 'desc' },

    hooks: {
      beforeCellEdit: (payload, rowData) => {
        // Route contact fields to different API
        if (payload.prop === 'contactEmail' || payload.prop === 'contactPhone') {
          return {
            url: `/api/contractors/${rowData.id}/contacts`,
            payload: { [payload.prop.replace('contact', '').toLowerCase()]: payload.newValue },
          }
        }
        // undefined → default behavior (PUT to source/{id})
      },

      beforeCreate: async (rowData) => {
        // REGON lookup for Polish companies
        if (rowData.nip) {
          const regonData = await lookupREGON(rowData.nip)
          return { ...rowData, ...regonData }
        }
        return rowData
      },

      validateCreate: (rowData) => {
        if (!rowData.name?.trim()) return 'Company name is required'
        return null
      },
    },

    deleteDialog: {
      description: t('contractors.delete.warning', 'This will also delete all contacts and documents.'),
    },

    tableProps: {
      enableComments: true,
      commentsTableId: 'contractors',
      actionsRenderer: (row, idx) => <ContractorActions row={row} />,
      keyboardShortcuts: [...],
      onRowAction: handleRowAction,
      uiConfig: { layout: 'modern' },
    },
  })

  return (
    <>
      <DynamicTable {...table.props} />
      <table.DeleteDialog />
      {/* Page-specific drawers, modals, etc. */}
    </>
  )
}
```

~50 lines for what is currently 1147 lines.

### 4. Page with Custom Data Transform

```typescript
const table = useDynamicTablePage({
  source: '/api/fms_offers/offers',
  columns,
  tableName: 'Offers',
  perspectives: 'fms_offers',
  // Transform API response items before display
  mapApiItem: (item) => ({
    ...item,
    statusLabel: STATUS_MAP[item.status] ?? item.status,
    totalFormatted: formatCurrency(item.total, item.currency),
  }),
  // Only draft offers can be deleted
  delete: true,
  hooks: {
    beforeDelete: (row) => row.status === 'draft',
  },
})
```

---

## Built-in DeleteDialog

The hook provides a `DeleteDialog` component that follows the existing codebase pattern:

```typescript
// Internal implementation (simplified)
const DeleteDialog: React.FC = () => {
  if (!pendingDelete) return null

  const name = pendingDelete[config.deleteDialog?.nameColumn ?? 'name'] ?? ''
  const title = resolveValue(config.deleteDialog?.title, pendingDelete) ?? `Delete ${singularize(config.tableName)}`
  const description = resolveValue(config.deleteDialog?.description, pendingDelete)
    ?? `Are you sure you want to delete "${name}"? This action cannot be undone.`

  return (
    <Dialog open onOpenChange={(open) => !open && setPendingDelete(null)}
            onCloseAutoFocus={(e) => { e.preventDefault(); tableRef.current?.focus() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPendingDelete(null)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={executeDelete} disabled={isDeleting}>
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

Pages that need a fully custom delete dialog can ignore `table.DeleteDialog` and use `table.state` + manual delete logic instead (escape hatch).

---

## Future: Multiple Data Sources

The `source` field is designed for future extensibility. Today it's a string URL. The type will be extended:

```typescript
// Phase 1 (this spec): string only
type DataSource = string

// Future phase: union type
type DataSource =
  | string                                                     // Single API endpoint
  | { primary: string; joins: JoinDescriptor[] }               // Declarative join
  | ((params: URLSearchParams) => Promise<ListResponse>)       // Function escape hatch
```

The recommended approach for joins is **server-side** (create a view endpoint that joins tables), matching how `makeCrudRoute` handles `list.joins` on the server. The function escape hatch would be for rare client-side join scenarios.

No code changes are needed for this — the hook's internal data fetching logic just needs to check `typeof source === 'string'` (which it already does). The extension point is clean.

---

## API Contracts

No new API endpoints. The hook consumes existing APIs:

| API | Method | Used For |
|-----|--------|----------|
| `{source}` | GET | List data (with pagination, sort, filter params) |
| `{source}/{id}` | PUT | Cell edit save (default) |
| `{source}` | POST | New row save (default) |
| `{source}/{id}` | DELETE | Row deletion (default) |
| `/api/perspectives/{perspectivesId}` | GET | Fetch saved perspectives |
| `/api/perspectives/{perspectivesId}` | POST | Save/update perspective |
| `/api/perspectives/{perspectivesId}/{id}` | DELETE | Delete perspective |
| `/api/entities/filter-suggestions` | GET | Filter value suggestions |

### Query Parameter Contract (GET list)

Standard parameters built by the hook:

```
?page=1&limit=50&sortField=name&sortDir=asc&q=search&filters=[{...}]
```

Plus any `extraParams` from config.

---

## Implementation Plan

### Phase 1: Extract perspective transforms (pure addition)

**Create:** `packages/ui/src/backend/dynamic-table/utils/perspectiveTransforms.ts`

Extract `apiToDynamicTable` and `dynamicTableToApi` from any FMS page (they're identical). These are currently copy-pasted in all 14 pages.

**Modify:** `packages/ui/src/backend/dynamic-table/index.ts` — re-export transforms.

### Phase 2: Build `useDynamicTablePage` hook

**Create:** `packages/ui/src/backend/dynamic-table/hooks/useDynamicTablePage.ts`

Implementation:

1. **Derive defaults** from config: queryKey from URL, CRUD URLs from source, editing from columns
2. **State**: 8 `useState` calls (page, limit, sortField, sortDir, search, filters, savedPerspectives, activePerspectiveId) + delete state (pendingDelete, isDeleting)
3. **Query params**: `useMemo` building `URLSearchParams` from state + `extraParams`
4. **Data query**: `useQuery` with `[queryKey, params]`, calling `apiCall(source?params)`, applying `mapApiItem`, `placeholderData: prev => prev`
5. **Perspectives query**: `useQuery` for `/api/perspectives/{perspectivesId}` (when configured), `useEffect` syncing via `apiToDynamicTable`
6. **Filter suggestions**: `useFilterSuggestions({ entityType })` when configured
7. **Event handlers**: all built internally, using hooks for customization:
   - `CELL_EDIT_SAVE`: dispatch START → call `hooks.beforeCellEdit` → apiCall → dispatch SUCCESS/ERROR → flash → invalidate
   - `NEW_ROW_SAVE`: call `hooks.validateCreate` → call `hooks.beforeCreate` → apiCall POST → dispatch SUCCESS/ERROR → flash → invalidate
   - `COLUMN_SORT/SEARCH/FILTER_CHANGE`: update state, reset page
   - `PERSPECTIVE_*`: full lifecycle using `dynamicTableToApi`/`apiToDynamicTable`
8. **useEventHandlers**: wire all handlers to `tableRef` — consumers never touch this
9. **DeleteDialog**: component using Dialog primitives, `pendingDelete` state, `hooks.beforeDelete`
10. **Return**: `{ props, DeleteDialog, query, isLoading, refresh, state }`

**Create:** `packages/ui/src/backend/dynamic-table/components/TableDeleteDialog.tsx`

Reusable delete dialog component used internally by the hook.

**Modify:** `packages/ui/src/backend/dynamic-table/index.ts` — re-export hook.

### Phase 3: Migrate FMS pages (incremental, one page per commit)

Migration order (simplest → most complex):

| # | Page File | LOC | Complexity |
|---|-----------|-----|------------|
| 1 | `fms_teams/backend/fms-teams/page.tsx` | 288 | Read-only, no editing |
| 2 | `fms_products/backend/fms-products/page.tsx` | 601 | Standard CRUD |
| 3 | `fms_products/backend/carriers/page.tsx` | 565 | Standard CRUD |
| 4 | `fms_documents/backend/fms-documents/page.tsx` | 645 | Standard with table config |
| 5 | `fms_projects/backend/fms-projects/page.tsx` | 606 | Standard with detail nav |
| 6 | `transports/backend/transports/page.tsx` | 615 | Standard |
| 7 | `fms_locations/backend/fms-locations/page.tsx` | 676 | `beforeCellEdit` hook (type-based endpoints) |
| 8 | `fms_offers/backend/fms-offers/page.tsx` | 751 | URL filter sync, `beforeDelete` hook |
| 9 | `contractors/backend/contractors/page.tsx` | 1147 | REGON lookup, contacts sub-entity, multi-select. Uses multiple hooks. |

Per-page migration:
1. Replace 8+ `useState`, 2 `useQuery`, perspective `useEffect`, all event handlers with single `useDynamicTablePage` call
2. Move module-specific logic into `hooks` (beforeCellEdit, beforeCreate, validateCreate, beforeDelete)
3. Keep truly page-specific code: column definitions, custom renderers/editors, keyboard shortcuts, drawers, modals
4. Replace inline delete dialog with `<table.DeleteDialog />`

### Phase 4 (optional, separate PR): Server-side filter parser

**Create:** `packages/shared/src/lib/crud/dynamic-table-filter-parser.ts`

Extract the `parseFilterRow` + operator mapping pattern from FMS API routes into a shared utility. Independent of frontend work.

---

## Files Touched

| Action | File | Phase |
|--------|------|-------|
| CREATE | `packages/ui/src/backend/dynamic-table/utils/perspectiveTransforms.ts` | 1 |
| CREATE | `packages/ui/src/backend/dynamic-table/hooks/useDynamicTablePage.ts` | 2 |
| CREATE | `packages/ui/src/backend/dynamic-table/components/TableDeleteDialog.tsx` | 2 |
| MODIFY | `packages/ui/src/backend/dynamic-table/index.ts` | 1-2 |
| MODIFY | 9 FMS page files (see Phase 3 table) | 3 |

---

## Backward Compatibility

- **No breaking changes.** The hook is a new addition; existing pages are unaffected until migrated.
- **DynamicTable props unchanged.** `table.props` produces the same prop shapes that pages currently construct manually.
- **Event system unchanged.** `useEventHandlers` + `dispatch` work exactly as before, just called internally.
- **API contracts unchanged.** Same endpoints, same query parameters, same response shapes.
- **Incremental migration.** Each page can be migrated independently in a separate commit.
- **Escape hatches exist.** Pages can ignore `table.DeleteDialog` and handle delete manually. `hooks.beforeCellEdit` can redirect any cell edit to a different API. `tableProps` passes anything through to DynamicTable.

---

## Risks & Impact Review

### Event Override Safety (eliminated)

The `hooks` pattern (wrapping) replaces the original spec's `eventOverrides` pattern (replacing). This eliminates the #1 risk from the original spec: consumers forgetting to dispatch `CELL_SAVE_START/SUCCESS/ERROR`. The hook **always** dispatches these events — hooks only transform WHAT is sent, not WHETHER the lifecycle runs.

### Centralization Risk

**Scenario**: Bug in `useDynamicTablePage` affects all migrated pages.
**Severity**: Medium
**Mitigation**: Phase 3 migrates incrementally (one page per commit, simplest first). The hook is straightforward state management — same code that currently exists in each page, just centralized. Each migration is functionally equivalent to the original page.

### Column-Driven Auto-Detection

**Scenario**: A column has `editor` but the page author doesn't want cell editing.
**Severity**: Low
**Mitigation**: Set `cellEdit: false` explicitly. The auto-detection is a sensible default that reduces config for the common case.

### Perspective API Failure

**Scenario**: Perspectives endpoint returns 404/500.
**Severity**: Low
**Mitigation**: Hook handles perspective query failure gracefully — empty perspectives array, table renders normally without perspective UI. Same behavior as current pages.

### Data Isolation

**Scenario**: Hook constructs query params but doesn't include `organization_id`.
**Severity**: N/A
**Mitigation**: Organization scoping is handled server-side by API middleware. The hook never needs to pass `organization_id`.

---

## Changelog

### 2026-03-11
- Initial specification
- Revised from `useDynamicTableState` to `useDynamicTablePage`
- Replaced `eventOverrides` with `hooks` pattern (mirroring `makeCrudRoute`)
- Added column-driven auto-detection for editing/creation
- Added built-in `DeleteDialog` component
- Added auto-derivation of queryKey, CRUD URLs from `source`
- Added `tableProps` passthrough for DynamicTable extras
- Documented future data source extensibility
