# DynamicTable - Agent Guidelines

The DynamicTable component (`packages/ui/src/backend/dynamic-table/`) is a spreadsheet-like table with keyboard navigation, cell editing, sorting, filtering, perspectives, and row-action shortcuts. It is used across the platform for both editable and read-only data grids.

**Package**: `@open-mercato/ui`
**Import**: `import { DynamicTable } from '@open-mercato/ui/backend/dynamic-table'`

---

## Keyboard Navigation

### Navigation Behavior

| Key | Behavior |
|-----|----------|
| **Tab** | Move to the next editable cell, skipping read-only cells. Wraps to the next row. When all editable cells are exhausted (or table is fully read-only) and `siblingTableRefs.next` is set, moves focus to the next table. Without `siblingTableRefs`, Tab is trapped in read-only tables. |
| **Shift+Tab** | Move to the previous editable cell (reverse of Tab). When no previous editable cell exists and `siblingTableRefs.prev` is set, moves focus to the previous table. |
| **Arrow keys** | Move selection to the adjacent cell in any direction, **including read-only cells**. Read-only skipping only applies to Tab. |
| **ArrowUp at first row** | If `siblingTableRefs.prev` is set, moves focus to the previous table (selects last row). |
| **ArrowDown at last row** | If `siblingTableRefs.next` is set, moves focus to the next table (selects first row). |
| **Escape** | Three-step: (1) exit edit mode, keep selection; (2) clear selection, keep table focused; (3) event bubbles to parent (e.g., drawer closes). |
| **Enter** | While editing, commits the value and moves selection down one row. When a cell is selected but not editing, starts editing. |
| **Shift+Enter** | Reserved for row-action shortcuts (e.g., open detail view). Does not start editing. |

### Tab in Read-Only Tables

When all columns are read-only, Tab has no editable cell to move to. The behavior depends on whether `siblingTableRefs` is configured:

- **With `siblingTableRefs`**: Tab forwards focus to `siblingTableRefs.next` (or `siblingTableRefs.prev` for Shift+Tab). This enables Tab to navigate through a chain of tables, including read-only ones.
- **Without `siblingTableRefs`**: Tab is **trapped** — it calls `preventDefault()` and does nothing. The user must press **Escape** to leave the table, then Tab to move focus to the next element.

For empty tables (0 rows) **without** `siblingTableRefs`, Tab escapes normally to the next focusable element. For empty tables **with** `siblingTableRefs`, Tab-triggered focus is transparently forwarded to the next sibling in the chain (using the `data-focus-trigger` attribute mechanism).

### Sort Buttons

Column header sort buttons (`tabIndex={-1}`) are excluded from the Tab order. They remain clickable with the mouse but do not receive keyboard focus during Tab navigation.

### Key Files

| File | Purpose |
|------|---------|
| `hooks/index.ts` | `useKeyboardNavigation` — Tab, Arrow, Escape, Enter handlers; `useCopyHandler` — clipboard copy |
| `DynamicTable.tsx` | Main component — `handleFocus`, `handleKeyDown`, `autoSelectOnFocus` |
| `store/index.ts` | `CellStore` — selection state, `focusTable()`, `blurTable()` |
| `components/ColumnHeaders.tsx` | Column header rendering with sort buttons |

### Copy Behavior (Ctrl+C / Cmd+C)

When cells are selected in the table, pressing Ctrl+C (or Cmd+C on Mac) copies the selected cell values to the clipboard. The copy handler:

1. **Only intercepts copy events originating inside the table** — If the copy event target is outside the table container (e.g., in a drawer or dialog opened from the page), the copy works normally on the selected text.

2. **Copies cell values as tab-separated text** — For multi-cell selections, values are formatted as a grid with tabs between columns and newlines between rows (Excel-compatible format).

3. **Requires active selection** — If no cells are selected, the copy event is not intercepted.

This design allows users to:
- Copy cell data when focused on the table
- Copy arbitrary text from drawers/dialogs without interference from the table's copy handler

---

## Escape Behavior in Drawers

When DynamicTables are used inside drawers (Sheet or custom div overlays), Escape must be handled carefully to avoid closing the drawer prematurely.

### Three-Step Escape Flow

```
Step 1: Escape while editing
  → Exit edit mode, keep cell selected
  → preventDefault() called — drawer stays open

Step 2: Escape with selection, not editing
  → Clear selection, table keeps focus (NO blurTable)
  → preventDefault() called — drawer stays open

Step 3: Escape with no selection, no editing
  → Table does NOT call preventDefault()
  → Event bubbles to parent drawer handler
  → Drawer closes
```

### Drawer Escape Handler Pattern

For custom drawers (non-Radix `<div>` overlays like `OfferDetailDrawer`), the drawer's `onKeyDown` must check `event.nativeEvent.defaultPrevented` to respect the table's Escape handling:

```typescript
const handleKeyDown = useCallback(
  (event: React.KeyboardEvent) => {
    // Skip if a DynamicTable already handled Escape (clearing selection / exiting edit).
    // Use nativeEvent.defaultPrevented to read directly from the native KeyboardEvent.
    if (event.key !== 'Escape' || event.nativeEvent.defaultPrevented) return

    event.preventDefault()
    onClose()
  },
  [onClose]
)
```

**Important**: Use `event.nativeEvent.defaultPrevented` (not `event.defaultPrevented`). The table's keyboard handler calls `preventDefault()` on the native `KeyboardEvent` via `e.nativeEvent`. Reading from the React `SyntheticEvent` wrapper may not reliably reflect this in all React versions.

### Drawer Container Must Be Focusable

The drawer's outer `<div>` must have `tabIndex={-1}` so it can receive keyboard events when the user clicks on non-interactive areas inside the drawer (e.g., empty space, labels). Without this, clicking outside a table moves focus to `document.body`, and subsequent Escape keypresses won't reach the drawer's `onKeyDown`.

```tsx
<div
  className="fixed inset-y-0 right-0 w-[750px] ..."
  tabIndex={-1}
  onKeyDown={handleKeyDown}
>
  {/* drawer content with DynamicTables */}
</div>
```

### Radix Sheet Drawers

For Radix-based `<Sheet>` / `<SheetContent>` drawers, Escape is handled natively by Radix Dialog. No custom `onKeyDown` handler is needed for closing — Radix respects `event.defaultPrevented` from child handlers automatically.

---

## Cross-Table Navigation

The `siblingTableRefs` prop enables keyboard navigation between adjacent DynamicTables (e.g., multiple tables stacked vertically in a drawer or detail page).

### Props

```typescript
siblingTableRefs?: {
  prev?: React.RefObject<HTMLDivElement | null>;  // Table above
  next?: React.RefObject<HTMLDivElement | null>;  // Table below
}
```

### Arrow Key Behavior

- **ArrowDown at last row**: Clears selection, sets `data-focus-direction="down"` on the next table's container, then calls `.focus()`. The next table's `handleFocus` reads the attribute and selects row 0.
- **ArrowUp at first row**: Clears selection, sets `data-focus-direction="up"` on the previous table's container, then calls `.focus()`. The previous table's `handleFocus` reads the attribute and selects the last row.
- At boundaries without a sibling ref, the arrow key does nothing (selection stays on the current cell).

### Tab Key Behavior

- **Tab with no remaining editable cells**: When Tab exhausts all editable cells within a table (or the table is fully read-only), it checks for `siblingTableRefs.next`. If present, focus moves to the next table (selects first row).
- **Shift+Tab with no previous editable cells**: Same behavior in reverse — checks `siblingTableRefs.prev` and moves to the previous table (selects last row).
- Both Tab and Shift+Tab use the same `data-focus-direction` attribute mechanism as arrow keys.

### Empty Table Forwarding

When an empty table (0 rows) receives Tab-triggered focus via `siblingTableRefs`, the `handleFocus` callback detects this via the `data-focus-trigger="tab"` attribute and transparently forwards focus to the next sibling in the same direction. This prevents Tab from getting stuck on empty tables in the navigation chain.

The `data-focus-trigger` attribute is set alongside `data-focus-direction` when Tab initiates cross-table navigation, and is removed immediately after reading.

### Direction-Aware Auto-Select

When `autoSelectOnFocus={true}`, the `handleFocus` callback reads an optional `data-focus-direction` attribute from the table container:

| Attribute value | Row selected |
|----------------|--------------|
| `"down"` (or absent) | First row (0) |
| `"up"` | Last row |

The attribute is set by the cross-table arrow/Tab handler and removed immediately after reading.

### Wiring Example

For a drawer with 3 tables stacked vertically (static chain):

```tsx
const headerRef = useRef<HTMLDivElement>(null)
const detailsRef = useRef<HTMLDivElement>(null)
const linesRef = useRef<HTMLDivElement>(null)

<DynamicTable
  tableRef={headerRef}
  siblingTableRefs={{ next: detailsRef }}
  autoSelectOnFocus={true}
  ...
/>
<DynamicTable
  tableRef={detailsRef}
  siblingTableRefs={{ prev: headerRef, next: linesRef }}
  autoSelectOnFocus={true}
  ...
/>
<DynamicTable
  tableRef={linesRef}
  siblingTableRefs={{ prev: detailsRef }}
  autoSelectOnFocus={true}
  ...
/>
```

### Dynamic Navigation Chains

When some tables may be empty, hidden, or conditionally rendered, build the navigation chain dynamically using `useMemo` instead of hardcoding `siblingTableRefs`:

```tsx
const headerRef = useRef<HTMLDivElement>(null)
const totalsRef = useRef<HTMLDivElement>(null)
const lineItemsRef = useRef<HTMLDivElement>(null)
const referencesRef = useRef<HTMLDivElement>(null)

const hasLineItems = lineItemsData.length > 0

// Build ordered chain, excluding empty/hidden tables
const tableNavChain = useMemo(() => {
  const chain: React.RefObject<HTMLDivElement | null>[] = [headerRef, totalsRef]
  if (hasLineItems) chain.push(lineItemsRef)
  chain.push(referencesRef)
  return chain
}, [hasLineItems])

// Derive { prev, next } for any ref from its position in the chain
const getSiblingRefs = useCallback(
  (ref: React.RefObject<HTMLDivElement | null>) => {
    const idx = tableNavChain.indexOf(ref)
    if (idx === -1) return undefined
    return {
      prev: idx > 0 ? tableNavChain[idx - 1] : undefined,
      next: idx < tableNavChain.length - 1 ? tableNavChain[idx + 1] : undefined,
    }
  },
  [tableNavChain]
)

// Usage: each table gets computed siblings
<DynamicTable tableRef={totalsRef} siblingTableRefs={getSiblingRefs(totalsRef)} ... />
<DynamicTable tableRef={referencesRef} siblingTableRefs={getSiblingRefs(referencesRef)} ... />
```

This pattern ensures empty tables are excluded from the chain entirely, so focus never gets stuck. See `InvoiceDetailPanel.tsx` and `fms-projects/[id]/page.tsx` for real implementations.

---

## autoSelectOnFocus Prop

```tsx
<DynamicTable
  autoSelectOnFocus={true}  // default: false
/>
```

When `true`, automatically selects the first cell (0,0) when the table receives focus and no selection exists. This enables immediate keyboard navigation (arrow keys, Enter to edit) without requiring the user to click a cell first.

Use this on:
- Tables inside drawers where focus is set programmatically
- Tables that are the primary interaction target on a page
- Any table where keyboard-first interaction is expected

---

## autoEditOnTab Prop

```tsx
<DynamicTable
  autoEditOnTab={true}  // default: true
/>
```

When `true`, Tab navigation enters edit mode on the target cell (Excel-like behavior). Set to `false` to only select the cell on Tab without opening the editor.

---

## highlightedRowId Prop

```tsx
<DynamicTable
  highlightedRowId={selectedItemId}  // string | null
  uiConfig={{ rowHoverStyle: 'default' }}
/>
```

When set, the row with the matching ID is visually highlighted (same style as hover) and scrolled into view if not already visible. This enables **two-way sync** between the table and external components (e.g., 3D visualizations, detail panels).

### Behavior

1. **Visual highlighting**: The row matching `highlightedRowId` gets a background color matching the hover style (`default`, `subtle`, or `accent` based on `uiConfig.rowHoverStyle`).
2. **Scroll into view**: When `highlightedRowId` changes, the table automatically scrolls (smooth animation) to make the row visible if it's currently outside the viewport.
3. **Works with virtualization**: The scroll uses `@tanstack/react-virtual`'s `scrollToIndex` which handles virtualized rows correctly.

### Use Cases

- **3D/visual sync**: When a user clicks an item in a 3D visualization, highlight the corresponding row in the table (e.g., Truck Loading tool)
- **List/detail sync**: When a detail panel shows an item, highlight that row in the master list
- **External selection**: Any scenario where selection state is managed outside the table but needs visual feedback

### Implementation Pattern

```tsx
const [selectedId, setSelectedId] = useState<string | null>(null)

// External component updates selection
const handleExternalSelect = (id: string) => setSelectedId(id)

// Table row click also updates selection
const handleRowClick = (rowIndex: number, rowData: any) => {
  setSelectedId(selectedId === rowData.id ? null : rowData.id)
}

<DynamicTable
  data={items}
  onRowClick={handleRowClick}
  highlightedRowId={selectedId}
  uiConfig={{ rowHoverStyle: 'default' }}
/>

<ExternalComponent
  selectedId={selectedId}
  onSelect={handleExternalSelect}
/>
```

### Styling

The highlighted row uses CSS selectors based on the `data-row-highlighted="true"` attribute. Styles are defined in `styles/DynamicTable.css` and respect the `rowHoverStyle` setting:

| `rowHoverStyle` | Color |
|-----------------|-------|
| `default` | Light blue (`--hot-row-hover-default`) |
| `subtle` | Light gray (`--hot-row-hover-subtle`) |
| `accent` | Theme accent (`--hot-row-hover-accent`) |

---

## Keyboard Shortcuts for Row Actions

Tables can define per-table keyboard shortcuts that trigger actions on the currently selected row. Shortcuts only fire when:
- A single cell is selected (not multi-select)
- The cell is not in edit mode
- No modifier conflicts with browser shortcuts

### Standard Shortcuts

| Shortcut | Action | Description |
|----------|--------|-------------|
| **Shift+Enter** | `view` | Open detail view (drawer, wizard, or navigate to detail page) |
| **Ctrl/Cmd+D** | `delete` | Open delete confirmation dialog |

### Implementation Pattern

```tsx
import type { KeyboardShortcutsConfig } from '@open-mercato/ui/backend/dynamic-table'

// 1. Define shortcuts
const keyboardShortcuts = useMemo((): KeyboardShortcutsConfig => ({
  rowActions: [
    { id: 'view', label: 'Open detail', key: 'Enter', shift: true },
    { id: 'delete', label: 'Delete', key: 'd', ctrlOrCmd: true },
  ],
}), [])

// 2. Define handler
const handleRowAction = useCallback((actionId: string, rowData: any) => {
  if (actionId === 'view') {
    // Open drawer, wizard, or navigate
  } else if (actionId === 'delete') {
    // Open delete dialog
  }
}, [])

// 3. Wire to DynamicTable
<DynamicTable
  keyboardShortcuts={keyboardShortcuts}
  onRowAction={handleRowAction}
  // ...other props
/>
```

### Shortcut Definition

```typescript
interface RowActionShortcut {
  id: string          // Action identifier passed to onRowAction
  label: string       // Human-readable description
  key: string         // Key name (e.g. 'Enter', 'd', 'Backspace')
  shift?: boolean     // Require Shift modifier
  ctrlOrCmd?: boolean // Require Ctrl (Windows/Linux) or Cmd (Mac)
  alt?: boolean       // Require Alt/Option modifier
}
```

### Conditional Shortcuts

For tables where shortcuts should only be active in certain states, return `undefined` instead of a config:

```tsx
const keyboardShortcuts = useMemo((): KeyboardShortcutsConfig | undefined => {
  if (activePerspectiveId !== 'all' && activePerspectiveId !== 'pending') {
    return undefined  // No shortcuts for aggregated views
  }
  return {
    rowActions: [
      { id: 'view', label: 'Open details', key: 'Enter', shift: true },
    ],
  }
}, [activePerspectiveId])
```

### Checklist for Adding Keyboard Shortcuts

- [ ] Import `KeyboardShortcutsConfig` type from `@open-mercato/ui/backend/dynamic-table`
- [ ] Define `keyboardShortcuts` config with `useMemo`
- [ ] Define `handleRowAction` callback with `useCallback`
- [ ] Wire `keyboardShortcuts` and `onRowAction` props to `<DynamicTable>`
- [ ] Use `Shift+Enter` for view/detail actions (standard pattern)
- [ ] Use `Ctrl/Cmd+D` for delete actions (where applicable)
- [ ] Add guard logic in handler for conditional actions (e.g., only delete drafts)
- [ ] Use `flash()` warnings for invalid shortcut actions
- [ ] Test: select a cell, press shortcut, verify action fires
- [ ] Test: ensure shortcuts do NOT fire during edit mode or multi-select

---

## Drawer and Table Focus Management

When using drawers (Sheet components) containing DynamicTables, proper focus management is critical for keyboard accessibility. Without it:

1. **Opening drawer**: Focus goes to the Close button instead of the table
2. **Closing drawer**: Focus is lost entirely, Tab starts from the beginning of the page

### The `useDrawerTableFocus` Hook

A reusable hook handles both scenarios using Radix Dialog's native focus callbacks (no setTimeout). The reference implementation is in `packages/fms/src/hooks/useDrawerTableFocus.ts`.

```typescript
import { useDrawerTableFocus } from '../../../hooks'

export function MyDrawer({ open, mainTableRef }: Props) {
  const drawerTableRef = React.useRef<HTMLDivElement>(null)

  const { handleOpenAutoFocus, handleCloseAutoFocus } = useDrawerTableFocus({
    isOpen: open,
    isContentReady: !isLoading && !!data,  // Wait for async data
    drawerTableRef,      // Table inside drawer to focus on open
    mainTableRef,        // Main table to restore focus on close
  })

  return (
    <Sheet open={open}>
      <SheetContent
        onOpenAutoFocus={handleOpenAutoFocus}
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        <MyTable tableRef={drawerTableRef} />
      </SheetContent>
    </Sheet>
  )
}
```

### Hook Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `isOpen` | `boolean` | required | Whether drawer is open |
| `isContentReady` | `boolean` | required | Whether async content is loaded |
| `drawerTableRef` | `RefObject<HTMLDivElement>` | required | Ref to table inside drawer |
| `mainTableRef` | `RefObject<HTMLDivElement>` | optional | Ref to main table for focus restoration |

### Hook Returns

| Return Value | Type | Description |
|--------------|------|-------------|
| `handleOpenAutoFocus` | `(event: Event) => void` | Pass to `SheetContent.onOpenAutoFocus` |
| `handleCloseAutoFocus` | `(event: Event) => void` | Pass to `SheetContent.onCloseAutoFocus` |

### Focus Flow

```
User clicks row in main table
  → Drawer opens
  → onOpenAutoFocus fires → event.preventDefault() stops Close button focus
  → Data loads (isContentReady = true)
  → useEffect: drawerTableRef.current.focus()
  → autoSelectOnFocus selects first cell (0,0)
  → User interacts with tables via keyboard
  → User closes drawer (Escape, click X, click overlay)
  → onCloseAutoFocus fires → event.preventDefault() + mainTableRef.focus()
  → Focus returns to main table
```

### Implementation Pattern

#### Step 1: Create table ref in drawer component

```typescript
const drawerTableRef = React.useRef<HTMLDivElement>(null)

const { handleOpenAutoFocus, handleCloseAutoFocus } = useDrawerTableFocus({
  isOpen: open,
  isContentReady: !isLoading && !!data,
  drawerTableRef,
  mainTableRef,
})
```

#### Step 2: Pass callbacks to SheetContent

```typescript
<SheetContent
  onOpenAutoFocus={handleOpenAutoFocus}
  onCloseAutoFocus={handleCloseAutoFocus}
>
```

#### Step 3: Pass ref to child table component

```typescript
<MyChildTableTab
  tableRef={drawerTableRef}  // Pass ref down
  data={data}
/>
```

#### Step 4: Accept optional ref in child component

```typescript
type Props = {
  data: Data[]
  tableRef?: React.RefObject<HTMLDivElement | null>  // Optional external ref
}

export function MyChildTableTab({ data, tableRef: externalRef }: Props) {
  const internalRef = React.useRef<HTMLDivElement>(null)
  const tableRef = externalRef ?? internalRef  // Use external if provided

  return (
    <DynamicTable
      tableRef={tableRef}
      data={data}
      // ...
    />
  )
}
```

#### Step 5: Pass main table ref from page

```typescript
const tableRef = useRef<HTMLDivElement>(null)

<DynamicTable tableRef={tableRef} ... />

<MyDrawer
  open={isDrawerOpen}
  mainTableRef={tableRef}  // For focus restoration
/>
```

### Why No setTimeout

The hook uses Radix Dialog's native `onOpenAutoFocus` and `onCloseAutoFocus` callbacks:

1. **Event-driven**: Focus changes happen in response to actual dialog events, not arbitrary delays
2. **Reliable**: No timing issues across different browsers or devices
3. **No core changes**: SheetContent already forwards these props to Radix Dialog

### Checklist for Drawer + Table Focus

- [ ] Create ref for the first table inside the drawer
- [ ] Call `useDrawerTableFocus` hook in drawer component (or equivalent for custom drawers)
- [ ] For Radix Sheet: pass `onOpenAutoFocus` and `onCloseAutoFocus` to `SheetContent`
- [ ] For custom div drawers: add `tabIndex={-1}` to the drawer container and use `event.nativeEvent.defaultPrevented` in the Escape handler
- [ ] Pass `tableRef` prop to child table component
- [ ] Child component accepts optional `tableRef` and falls back to internal ref
- [ ] Page passes main table ref to drawer's `mainTableRef` prop
- [ ] Add `autoSelectOnFocus={true}` to all drawer tables
- [ ] Wire `siblingTableRefs` for cross-table arrow navigation between drawer tables
- [ ] Test: Open drawer — first table should be focused with first cell selected
- [ ] Test: Arrow keys navigate cells immediately, including across tables
- [ ] Test: Escape clears selection — second Escape closes drawer
- [ ] Test: Click outside tables, then Escape — drawer closes
- [ ] Test: Close drawer — Tab navigates main table, not sidebar

---

## Editable Relation Columns

When displaying related entities in DynamicTable (e.g., Client name from `clientId`, User name from `assignedToId`), you need a special approach to make these columns editable with entity search.

### Architecture

**Key Insight:** Table-config generators only produce static column definitions (data, title, type, etc.). For editable relation columns, the page component must define columns programmatically with custom `editor` functions.

```
Table Config (static)                    Page Component (dynamic)
- Column definitions                     - Custom editors for relations
- Display hints                          - JSON parsing in save handler
- Read-only computed columns             - Query invalidation after save
- Dropdown sources
```

### Data Flow

```
1. User clicks relation cell → EntitySearchEditor opens
2. User types query → Search API returns matching entities
3. User selects entity → Editor returns JSON.stringify({ id, name })
4. Cell save handler parses JSON → Extracts the foreign key ID
5. PUT /api/{entity}/{id} with { foreignKeyId: "..." }
6. API updates record → afterList hook fetches new name on next refresh
7. Query invalidation → Table shows updated display name
```

### Implementation Pattern

#### Step 1: Table Config Route

Add computed display columns in `additionalColumns`. Do NOT mark them as `readOnly`:

```typescript
// api/table-config/route.ts
const DISPLAY_HINTS: DisplayHints = {
  hiddenFields: ['clientId', 'assignedToId'],  // Hide the raw IDs

  additionalColumns: [
    {
      data: 'clientName',        // Display column (populated by afterList hook)
      title: 'Client',
      width: 150,
      type: 'text',
      // readOnly: true,         // Do NOT set readOnly if editable
      insertAfter: 'someField',
    },
    {
      data: 'assignedToName',
      title: 'Assigned To',
      width: 150,
      type: 'text',
      insertAfter: 'clientName',
    },
  ],
}
```

#### Step 2: Page Component - Editor Configs

Create memoized editor configurations:

```typescript
import { createEntitySearchEditor } from '@open-mercato/ui/backend/dynamic-table/components/EntitySearchEditor'

const clientEditorConfig = useMemo(() => ({
  entityType: 'contractors:contractor',
  extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
    JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
  placeholder: 'Search clients...',
  minQueryLength: 2,
}), [])
```

#### Step 3: Page Component - Override Columns

Merge static table-config with custom editors:

```typescript
const columns = useMemo((): ColumnDef[] => {
  if (!tableConfig?.columns) return []

  return tableConfig.columns.map((col) => {
    const baseCol = {
      ...col,
      type: col.type === 'checkbox' ? 'boolean' : col.type,
      renderer: col.renderer ? RENDERERS[col.renderer] : undefined,
    }

    if (col.data === 'clientName') {
      return {
        ...baseCol,
        readOnly: false,
        editor: createEntitySearchEditor(clientEditorConfig),
      }
    }

    return baseCol
  }) as ColumnDef[]
}, [tableConfig, clientEditorConfig])
```

#### Step 4: Page Component - Cell Save Handler

Parse JSON values and extract foreign key IDs:

```typescript
useEventHandlers({
  [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
    dispatch(tableRef.current, TableEvents.CELL_SAVE_START, {
      rowIndex: payload.rowIndex,
      colIndex: payload.colIndex,
    })

    try {
      let updateData: Record<string, unknown> = {}

      if (payload.prop === 'clientName') {
        try {
          const parsed = JSON.parse(String(payload.newValue))
          updateData = { clientId: parsed.id }
        } catch {
          updateData = { clientId: null }
        }
      } else {
        updateData = { [payload.prop]: payload.newValue }
      }

      const response = await apiCall(`/api/entity/${payload.id}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
      })

      if (response.ok) {
        dispatch(tableRef.current, TableEvents.CELL_SAVE_SUCCESS, { ... })
        if (payload.prop === 'clientName') {
          queryClient.invalidateQueries({ queryKey: ['entity'] })
        }
      }
    } catch (error) { ... }
  },
}, tableRef)
```

### API Route - afterList Hook

Ensure the API route populates display names via `afterList`:

```typescript
const crud = makeCrudRoute({
  list: {
    afterList: async (items, ctx) => {
      const clientIds = items.map(i => i.clientId).filter(Boolean)

      const clients = clientIds.length
        ? await em.find(Contractor, { id: { $in: clientIds } })
        : []

      const clientMap = new Map(clients.map(c => [c.id, c]))

      return items.map(item => ({
        ...item,
        clientName: item.clientId ? clientMap.get(item.clientId)?.name : null,
      }))
    },
  },
})
```

### Checklist for Editable Relation Columns

- [ ] API route has `afterList` hook that populates display names (e.g., `clientName`)
- [ ] Table-config adds computed columns WITHOUT `readOnly: true`
- [ ] Table-config hides raw ID fields (e.g., `clientId`) in `hiddenFields`
- [ ] Page component creates editor configs with `createEntitySearchEditor`
- [ ] Page component overrides columns to attach custom editors
- [ ] Page component save handler parses JSON and extracts foreign key
- [ ] Page component invalidates query after relation column save
- [ ] Related entity has search config so EntitySearchEditor can find it

---

## Filter Suggestions

For tables with large datasets, client-side filtering becomes inefficient. The `useFilterSuggestions` hook enables server-side filter suggestions by querying the `/api/entities/filter-suggestions` endpoint.

### How It Works

```
User types in filter input
  → Debounced API call: GET /api/entities/filter-suggestions
    ?entityId=module:entity&field=fieldName&query=term
  → Server queries distinct values from entity_indexes table
  → Returns: { items: ["value1", "value2", ...] }
  → Dropdown shows suggestions while user types
  → Table only updates when user presses Enter or selects suggestion
```

### UX Behavior

1. **Suggestions load while typing** — Debounced API calls fetch matching values as user types
2. **Table updates only on confirmation** — The table does NOT reload on every keystroke
3. **Confirmation triggers**: Press **Enter**, click on a suggestion, or blur the input field

### Implementation Pattern

```typescript
import {
  DynamicTable,
  useFilterSuggestions,
} from '@open-mercato/ui/backend/dynamic-table'

export default function MyTablePage() {
  const tableRef = useRef<HTMLDivElement>(null)

  const loadFilterSuggestions = useFilterSuggestions({
    entityType: 'module:entity',  // Must match E.module.entity
  })

  return (
    <DynamicTable
      tableRef={tableRef}
      data={tableData}
      columns={columns}
      loadFilterSuggestions={loadFilterSuggestions}
      // ... other props
    />
  )
}
```

### Entity Type Format

The `entityType` must match the entity ID format: `<module_name>:<entity_name>`. Use the generated entity IDs from `E.<module>.<entity>` for consistency.

### Prerequisites

For filter suggestions to work, the entity must be:

1. **Indexed** — Has `indexer: { entityType }` configured in CRUD route
2. **Populated** — Records exist in `entity_indexes` table
3. **Searchable** — Has a `search.ts` configuration (optional but recommended)

### Checklist for Adding Filter Suggestions

- [ ] Import `useFilterSuggestions` from `@open-mercato/ui/backend/dynamic-table`
- [ ] Call hook with correct `entityType` matching `E.<module>.<entity>`
- [ ] Pass `loadFilterSuggestions` prop to `DynamicTable`
- [ ] Verify entity is indexed (has records in `entity_indexes`)
- [ ] Test by typing in filter input — suggestions should appear
- [ ] Test that table only updates on Enter/click/blur, not on each keystroke
