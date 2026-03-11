# SPEC-059 — DynamicTable Full-Stack Factory

| Field | Value |
|-------|-------|
| **ID** | SPEC-059 |
| **Date** | 2026-03-11 |
| **Branch** | `feat/dynamic-table-refactor` |
| **Status** | In Progress |
| **Depends On** | DynamicTable, Perspectives API, `makeCrudRoute` (reference pattern) |

## Overview

### Problem

FMS modules have massive boilerplate on **both sides** of DynamicTable:

- **Backend** (~180-220 lines per route): auth, org scoping, query param parsing, `parseFilterRow` (identical 50-line function copy-pasted in 7+ modules), FIELD_MAP, sort mapping, pagination response formatting
- **Frontend** (~340-400 lines per page): 8 useState, 2 useQuery, perspective transforms (copy-pasted), 10+ event handlers, delete dialog

Across **14 frontend pages totaling 7053 lines** and **7+ backend routes**, each independently implements:

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

Everything DynamicTable-related lives in one place — `packages/ui/src/backend/dynamic-table/`. A matched **server-side factory** + **frontend hook**, like how `makeCrudRoute` is the one place to go for CRUD API routes.

**Two complementary pieces:**

1. **`useDynamicTablePage` hook** (frontend) — the frontend analog of `makeCrudRoute`. Describe WHAT your table shows and WHAT is editable. The hook handles HOW.
2. **`parseDynamicTableFilters` + `makeDynamicTableRoute`** (server) — shared filter parser that eliminates 7 copy-pasted `parseFilterRow` functions, plus an optional route factory for simple CRUD backends.

**Design principles (mirroring `makeCrudRoute`):**

1. **Declare data, not plumbing** — `source` URL + `columns` → working table
2. **Sensible defaults for everything** — queryKey derived from URL, CRUD URLs derived from source, editing enabled if columns have editors
3. **Hooks wrap behavior, never replace it** — `beforeCellEdit` transforms payload, then default dispatch/save/invalidate still runs
4. **Progressive complexity** — simplest page is ~15 lines; complex page (contractors) is ~30 lines
5. **Backend stays independent** — modules using CommandBus (undo/redo, audit logs) keep their existing routes; they just swap in the shared filter parser. The route factory is only for simple CRUD without commands.

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

**Frontend:**

- **`useDynamicTablePage`** — the main hook; manages all state, queries, event handlers, delete dialog
- **`perspectiveTransforms`** — extracted utility for `apiToDynamicTable`/`dynamicTableToApi` (used internally by hook)
- **`TableDeleteDialog`** — reusable delete confirmation dialog; used internally by hook, also exportable
- **`DynamicTable`** — unchanged; receives `table.props` spread
- **`useEventHandlers`** — used internally by the hook (consumers never touch it)

**Server (optional):**

- **`parseDynamicTableFilters`** / **`parseFilterRow`** — shared filter parser replacing 7+ copy-pasted implementations. Converts DynamicTable `FilterRow[]` → MikroORM `Where` clauses. Pure function, no server deps.
- **`makeDynamicTableRoute`** — optional route factory for simple CRUD backends without CommandBus. Wraps auth, scoping, filter parsing, sort mapping, pagination into a single config object. Returns `{ GET, POST, PUT, DELETE, metadata }`.

### File Structure

```
packages/ui/src/backend/dynamic-table/
├── server/                              ← Server-side utilities
│   ├── index.ts                         ← exports
│   ├── makeDynamicTableRoute.ts         ← route factory
│   └── filterParser.ts                  ← DynamicTable FilterRow → ORM Where
├── hooks/
│   ├── index.ts                         ← existing hooks
│   ├── useAnnotations.ts               ← existing
│   └── useDynamicTablePage.tsx          ← frontend hook
├── utils/
│   └── perspectiveTransforms.ts         ← extracted perspective transforms
├── components/
│   ├── TableDeleteDialog.tsx            ← reusable delete dialog
│   └── ... (existing components)
├── index.ts                             ← add re-exports
└── ... (existing files)
```

**Import paths:**
- Frontend: `import { useDynamicTablePage } from '@open-mercato/ui/backend/dynamic-table'`
- Server: `import { parseDynamicTableFilters } from '@open-mercato/ui/backend/dynamic-table/server'`
- Server (full factory): `import { makeDynamicTableRoute } from '@open-mercato/ui/backend/dynamic-table/server'`

### Backend Migration Strategy

Not all backends can use `makeDynamicTableRoute`. Modules using CommandBus for undo/redo and audit logs (fms_products, fms_projects, etc.) keep their existing route handlers — they just swap in `parseDynamicTableFilters` to replace their copy-pasted `parseFilterRow`.

| Backend pattern | Migration approach |
|----------------|-------------------|
| Direct ORM operations | Full migration to `makeDynamicTableRoute` |
| CommandBus (undo/redo/audit) | Keep routes, swap in `parseDynamicTableFilters` |
| Raw SQL / Knex | Keep routes, `parseDynamicTableFilters` not applicable |

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
   * - string: DELETE to that URL + `/{id}`
   * - object: enable with dialog customization (title, description, nameColumn)
   * - false/omitted: no deletion
   * @default false
   */
  delete?: boolean | string | {
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

  /**
   * Trigger the delete dialog for a given row.
   * Use from actionsRenderer or onRowAction callbacks:
   *   table.setRowToDelete(row)
   * Pass null to dismiss the dialog.
   */
  setRowToDelete: (row: TRow | null) => void

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

### 2. Standard CRUD Page (actual fms_products migration)

```typescript
export default function ProductsPage() {
  const table = useDynamicTablePage<ProductRow>({
    source: '/api/fms_products/products',
    columns: PRODUCT_COLUMNS,
    tableName: 'Products',
    perspectives: 'fms_products',
    defaultSort: { field: 'name', direction: 'asc' },
    delete: { title: 'Delete Product', nameColumn: 'name' },
    create: {
      mapPayload: (rowData) => ({
        name: rowData.name || 'New Product',
        chargeCode: rowData.chargeCode || null,
        chargeUnit: rowData.chargeUnit || null,
        transportMode: rowData.transportMode || null,
        isActive: rowData.isActive !== false,
      }),
    },
    queryKey: 'fms_products',
    tableProps: {
      height: 'calc(100vh - 110px)',
      keyboardShortcuts: { rowActions: [
        { id: 'delete', label: 'Delete product', key: 'd', ctrlOrCmd: true },
      ]},
      uiConfig: { enableFullscreen: true },
    },
  })

  // actionsRenderer and onRowAction use table.setRowToDelete
  const actionsRenderer = useCallback((_rowData: unknown) => {
    const row = _rowData as ProductRow
    if (!row.id) return null
    return (
      <button onClick={(e) => { e.stopPropagation(); table.setRowToDelete(row) }}
        className="p-1 text-gray-400 hover:text-red-600 transition-colors" title="Delete Product">
        <Trash2 className="h-4 w-4" />
      </button>
    )
  }, [table.setRowToDelete])

  if (table.isLoading) return <TableSkeleton rows={10} columns={5} />

  return (
    <Page><PageBody>
      <DynamicTable {...table.props} actionsRenderer={actionsRenderer}
        onRowAction={(id, row) => id === 'delete' && table.setRowToDelete(row)} />
      <table.DeleteDialog />
    </PageBody></Page>
  )
}
```

601 → 165 lines. Full CRUD: cell editing, row creation, deletion with dialog, perspectives, keyboard shortcuts.

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

Pages trigger the dialog via `table.setRowToDelete(row)` — typically from `actionsRenderer` or `onRowAction` callbacks.

Pages that need a fully custom delete dialog can ignore `table.DeleteDialog` and use `table.setRowToDelete` + manual delete logic instead (escape hatch).

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

### Phase 1: Server-side — filter parser + route factory ✅

**Created:** `packages/ui/src/backend/dynamic-table/server/filterParser.ts`

Shared `parseFilterRow(row, fieldMap)` and `parseDynamicTableFilters(rows, fieldMap)` replacing 7+ identical copy-pasted implementations. Pure functions — accept a `fieldMap` argument instead of closing over a module-local `FIELD_MAP`. Supports all 12 DynamicTable operators.

**Created:** `packages/ui/src/backend/dynamic-table/server/makeDynamicTableRoute.ts`

Optional route factory for simple CRUD backends. Wraps auth resolution, org/tenant scoping, filter parsing, sort mapping, pagination, and standard CRUD responses into a single config. Returns `{ GET, POST, PUT, DELETE, metadata }`.

**Note:** Modules using CommandBus (fms_products, fms_projects, etc.) keep their existing routes — they just swap in `parseDynamicTableFilters`. The route factory is for backends that do direct ORM operations only.

**Created:** `packages/ui/src/backend/dynamic-table/server/index.ts` — barrel exports.

**Modified:** `packages/ui/package.json` — added `./backend/dynamic-table/server` export path.

### Phase 2: Frontend — perspective transforms + hook + delete dialog ✅

**Created:** `packages/ui/src/backend/dynamic-table/utils/perspectiveTransforms.ts`

Extracted `apiToDynamicTable` and `dynamicTableToApi` — currently copy-pasted identically in 14 FMS pages.

**Created:** `packages/ui/src/backend/dynamic-table/hooks/useDynamicTablePage.tsx`

Implementation:

1. **State**: 10 `useState` calls (page, limit, sortField, sortDir, search, filters, savedPerspectives, activePerspectiveId, pendingDelete, isDeleting)
2. **Query params**: `useMemo` building `URLSearchParams` from state + `extraParams`
3. **Data query**: `useQuery` with `[queryKey, params]`, calling `apiCall(source?params)`, applying `mapApiItem`, `placeholderData: prev => prev`
4. **Perspectives query**: `useQuery` for `/api/perspectives/{perspectivesId}` (when configured), `useEffect` syncing via `apiToDynamicTable`
5. **Filter suggestions**: inline `useMemo` building the async loader when `filterSuggestions` is configured
6. **Event handlers**: all built internally, using hooks for customization:
   - `CELL_EDIT_SAVE`: dispatch START → call `hooks.beforeCellEdit` → apiCall → dispatch SUCCESS/ERROR → flash → invalidate
   - `NEW_ROW_SAVE`: call `hooks.validateCreate` → call `hooks.beforeCreate` → apiCall POST → dispatch SUCCESS/ERROR → flash → invalidate
   - `COLUMN_SORT/SEARCH/FILTER_CHANGE`: update state, reset page
   - `PERSPECTIVE_*`: full lifecycle using `dynamicTableToApi`/`apiToDynamicTable`
7. **useEventHandlers**: wire all handlers to `tableRef` — consumers never touch this
8. **DeleteDialog**: rendered via `TableDeleteDialog`, driven by `pendingDelete` state
9. **Return**: `{ props, DeleteDialog, setRowToDelete, query, isLoading, refresh, state }`

**Key design decision:** `setRowToDelete` is exposed directly on the result instead of a ref-based `triggerDeleteFromRef`. This is cleaner — `actionsRenderer` and `onRowAction` callbacks call `table.setRowToDelete(row)` directly, avoiding circular reference issues with the hook config.

**Created:** `packages/ui/src/backend/dynamic-table/components/TableDeleteDialog.tsx`

**Modified:** `packages/ui/src/backend/dynamic-table/index.ts` — re-exports for hook, transforms, dialog.

### Phase 3: Migrate fms_products (proof of concept) ✅

Migrated both sides of `fms_products/products`:

- **Backend** (`api/products/route.ts`): Replaced inline `parseFilterRow` with `parseDynamicTableFilters` from shared server module. Kept CommandBus-based POST since it provides undo/audit. ~10 lines saved.
- **Frontend** (`backend/fms-products/page.tsx`): Full migration from 601 lines → ~165 lines. Replaced 8 useState, 2 useQuery, perspective useEffect, 10 event handlers, delete dialog with single `useDynamicTablePage` call. Module-specific code preserved: column definitions, PillRenderer, keyboard shortcuts.

### Phase 4: Migrate remaining FMS pages (incremental)

Migration order (simplest → most complex):

| # | Page File | LOC | Frontend hook | Backend filter parser |
|---|-----------|-----|---------------|----------------------|
| 1 | `fms_products/products` | 601 → 165 | ✅ Done | ✅ Done |
| 2 | `fms_products/carriers` | 565 | Pending | Pending |
| 3 | `fms_teams` | 288 | Pending | Custom Knex — skip |
| 4 | `fms_documents` | 645 | Pending | Has shared helpers already |
| 5 | `fms_projects` | 606 | Pending | Pending |
| 6 | `transports` | 615 | Pending | Multi-entity — skip |
| 7 | `fms_locations` | 676 | Pending | Raw SQL — skip |
| 8 | `fms_offers` | 751 | Pending | Pending |
| 9 | `contractors` | 1147 | Pending | Pending |

Per-page migration:
1. Replace 8+ `useState`, 2 `useQuery`, perspective `useEffect`, all event handlers with single `useDynamicTablePage` call
2. Move module-specific logic into `hooks` (beforeCellEdit, beforeCreate, validateCreate, beforeDelete)
3. Keep truly page-specific code: column definitions, custom renderers/editors, keyboard shortcuts, drawers, modals
4. Replace inline delete dialog with `<table.DeleteDialog />`
5. On backend: swap copy-pasted `parseFilterRow` with `parseDynamicTableFilters` import (where applicable)

---

## Files Touched

| Action | File | Phase |
|--------|------|-------|
| CREATE | `packages/ui/src/backend/dynamic-table/server/index.ts` | 1 |
| CREATE | `packages/ui/src/backend/dynamic-table/server/filterParser.ts` | 1 |
| CREATE | `packages/ui/src/backend/dynamic-table/server/makeDynamicTableRoute.ts` | 1 |
| CREATE | `packages/ui/src/backend/dynamic-table/utils/perspectiveTransforms.ts` | 2 |
| CREATE | `packages/ui/src/backend/dynamic-table/hooks/useDynamicTablePage.tsx` | 2 |
| CREATE | `packages/ui/src/backend/dynamic-table/components/TableDeleteDialog.tsx` | 2 |
| MODIFY | `packages/ui/src/backend/dynamic-table/index.ts` | 2 |
| MODIFY | `packages/ui/package.json` (add server export path) | 1 |
| MODIFY | `packages/fms/.../fms_products/api/products/route.ts` | 3 |
| MODIFY | `packages/fms/.../fms_products/backend/fms-products/page.tsx` | 3 |
| MODIFY | 8 more FMS page files (see Phase 4 table) | 4 |

---

## Server-Side: Filter Parser

### `parseDynamicTableFilters(filterRows, fieldMap)`

The canonical implementation for converting DynamicTable `FilterRow[]` into MikroORM `Where` clauses. Replaces 7+ copy-pasted `parseFilterRow` functions across FMS modules.

```typescript
import { parseDynamicTableFilters } from '@open-mercato/ui/backend/dynamic-table/server'

const FIELD_MAP = {
  name: 'name', chargeCode: 'chargeCode', chargeUnit: 'chargeUnit',
  transportMode: 'transportMode', isActive: 'isActive', createdAt: 'createdAt',
}

// In a GET handler, after parsing the `filters` query param:
const dynamicFilters = JSON.parse(filtersParam)
const parsedFilters = parseDynamicTableFilters(dynamicFilters, FIELD_MAP)
if (parsedFilters.length > 0) {
  filters.$and = [...(filters.$and || []), ...parsedFilters]
}
```

**Supported operators (12):** `is_any_of`, `is_not_any_of`, `contains` (with `escapeLikePattern`), `is_empty`, `is_not_empty`, `equals`, `not_equals`, `is_true`, `is_false`, `greater_than`, `less_than`.

**Key difference from copy-pasted versions:** The shared parser accepts `fieldMap` as an argument rather than closing over a module-local constant. This makes it reusable across all modules. The `contains` operator uses `escapeLikePattern` from `@open-mercato/shared/lib/db/escapeLikePattern` for SQL injection safety.

### `makeDynamicTableRoute(config)` (optional)

For backends that do **direct ORM operations** (no CommandBus, no undo/redo, no audit logs), the full route factory eliminates ~200 lines of boilerplate. It handles auth, org/tenant scoping, filter parsing, sort mapping, pagination, and standard CRUD responses.

Most FMS modules currently use CommandBus and should **not** use this factory — they keep their existing routes and just swap in `parseDynamicTableFilters`.

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

### 2026-03-11 (rev 2) — Implementation update
- Renamed spec to "DynamicTable Full-Stack Factory" to reflect both server and frontend
- Added server-side filter parser (`parseDynamicTableFilters`) — eliminates 7+ copy-pasted `parseFilterRow`
- Added optional server-side route factory (`makeDynamicTableRoute`) for simple CRUD backends
- Added `setRowToDelete` to result type — replaces ref-based `triggerDeleteFromRef` approach
- Merged `delete` and `deleteDialog` config into single `delete` field accepting `boolean | string | object`
- Added `./backend/dynamic-table/server` export path to `packages/ui/package.json`
- Added file structure diagram and import paths
- Added backend migration strategy table (CommandBus vs direct ORM vs raw SQL)
- Updated implementation plan with ✅ status markers for completed phases
- Updated standard CRUD example to match actual fms_products migration
- Completed Phase 1-3: all new files created, fms_products migrated as proof of concept

### 2026-03-11
- Initial specification
- Revised from `useDynamicTableState` to `useDynamicTablePage`
- Replaced `eventOverrides` with `hooks` pattern (mirroring `makeCrudRoute`)
- Added column-driven auto-detection for editing/creation
- Added built-in `DeleteDialog` component
- Added auto-derivation of queryKey, CRUD URLs from `source`
- Added `tableProps` passthrough for DynamicTable extras
- Documented future data source extensibility
