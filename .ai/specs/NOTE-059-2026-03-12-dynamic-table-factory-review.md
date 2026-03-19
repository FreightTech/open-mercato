# NOTE-059 — DynamicTable Full-Stack Factory: Implementation Review

| Field | Value |
|-------|-------|
| **Related Spec** | SPEC-059 |
| **Date** | 2026-03-12 |
| **Branch** | `feat/dynamic-table-refactor` |
| **Purpose** | Code review & gap analysis of the completed Phase 1-3 implementation |

## Summary

Phases 1-3 are implemented. The code is functional and the `fms_products` migration demonstrates the pattern works end-to-end. This note documents findings, issues, and recommendations before proceeding with Phase 4 (remaining page migrations).

---

## What Was Built

### Files Created

| File | LOC | Purpose |
|------|-----|---------|
| `dynamic-table/hooks/useDynamicTablePage.tsx` | 707 | Main frontend hook — state, queries, event handlers, delete dialog |
| `dynamic-table/server/filterParser.ts` | 73 | Shared `parseFilterRow` / `parseDynamicTableFilters` replacing 7+ copies |
| `dynamic-table/server/makeDynamicTableRoute.ts` | 387 | Server-side route factory for simple CRUD backends |
| `dynamic-table/server/index.ts` | 17 | Barrel exports |
| `dynamic-table/utils/perspectiveTransforms.ts` | 51 | Extracted `apiToDynamicTable` / `dynamicTableToApi` |
| `dynamic-table/components/TableDeleteDialog.tsx` | 73 | Reusable delete confirmation dialog |

### Files Modified

| File | Change |
|------|--------|
| `dynamic-table/index.ts` | Added re-exports for hook, transforms, dialog, types |
| `fms_products/backend/fms-products/page.tsx` | Migrated 601 → 195 lines using `useDynamicTablePage` |

### Proof of Concept: fms_products Migration

The migrated page is clean. The page now contains only:
- Type definition (`ProductRow`)
- Column definitions with custom renderers (`PillRenderer`)
- Hook config (~30 lines)
- `actionsRenderer` + `handleRowAction` callbacks
- JSX return

All boilerplate (useState x8, useQuery x2, perspective sync, 10+ event handlers, delete dialog, pagination) is eliminated.

---

## Issues Found

### 1. `DeleteDialog` as `useCallback` — Anti-pattern (Medium)

**File:** `useDynamicTablePage.tsx:675`

```typescript
const DeleteDialogComponent: React.FC = useCallback(() => {
  // ...renders TableDeleteDialog
}, [deleteConfig, pendingDelete, isDeleting, handleConfirmDelete])
```

Using `useCallback` to define a React component is an anti-pattern. When dependencies change, React sees a new component type, causing unmount/remount of the Dialog (flash of closing/opening). This breaks the dialog animation and can lose focus state.

**Fix:** Use a stable component wrapper that receives props:

```typescript
// Define once outside the hook, or use React.memo
const StableDeleteDialog = React.memo(function StableDeleteDialog(props: { ... }) {
  return <TableDeleteDialog {...props} />
})

// In the hook return:
const deleteDialogProps = useMemo(() => ({
  row: pendingDelete,
  isDeleting,
  onConfirm: handleConfirmDelete,
  onCancel: () => setPendingDelete(null),
  restoreFocusRef: tableRef,
  ...dialogConfig,
}), [pendingDelete, isDeleting, handleConfirmDelete, dialogConfig])

// Option A: Return props, let consumer render
DeleteDialog: () => deleteConfig ? <StableDeleteDialog {...deleteDialogProps} /> : null

// Option B: Return a stable component ref (preferred)
// Create component identity once via useRef
```

**Impact:** Dialog flickers when any dependency changes. Currently minor since `pendingDelete` change is the main trigger, but `handleConfirmDelete` changes on every `pendingDelete` change too, creating double-render risk.

### 2. `new orm.entity()` for field detection — Fragile (Low)

**File:** `makeDynamicTableRoute.ts:261`

```typescript
if ('createdBy' in (new orm.entity() as any)) {
  entityData.createdBy = ...
}
```

Constructing a MikroORM entity with `new` outside of `em.create()` may fail if the entity has required constructor args or decorators that depend on the ORM context. This works today because current entities have parameterless constructors, but it's brittle.

**Fix:** Check the entity metadata instead:

```typescript
const entityMeta = ctx.em.getMetadata().find(orm.entity.name)
if (entityMeta?.properties.createdBy) {
  entityData.createdBy = ...
}
```

Or simply always set `createdBy` and let MikroORM ignore unknown properties.

### 3. `mapApiItem` silently filters rows (Low)

**File:** `useDynamicTablePage.tsx:238`

```typescript
return items.map(config.mapApiItem).filter(Boolean)
```

When `mapApiItem` returns `null`, the row is silently dropped. The type signature `(item: any) => TRow | null` allows this, but it's not documented and could confuse consumers who expect item counts to match the API response total.

**Recommendation:** Document this behavior in the type's JSDoc. The `filter(Boolean)` is useful (e.g., filtering out soft-deleted items client-side), but should be explicit.

### 4. Missing `searchParamKey` from config (Low)

The spec defines `searchParamKey?: string` (default `'q'`), but the implementation hardcodes `'q'`:

```typescript
if (search) params.set('q', search)  // line 207
```

Most FMS routes use `'q'`, so this isn't blocking, but the spec promised it as configurable.

### 5. Missing `hooks.afterMutation` typing (Low)

The `afterMutation` hook receives `context: any`. The spec proposed typed contexts per mutation type. Current implementation passes:
- Cell edit: `{ payload, rowData }`
- Create: `{ payload, result }`
- Delete: `{ row }`

These should be typed as a discriminated union for better DX.

---

## Deviations from Spec (Intentional, Good)

These additions go beyond the spec and are improvements:

| Addition | Where | Why It's Good |
|----------|-------|---------------|
| `queryKeyDeps: unknown[]` | Config | Supports `scopeVersion` and other reactive cache deps |
| `initialFilters: FilterRow[]` | Config | URL-driven filter state (fms_offers needs this) |
| `create.handler` | Config | Full escape hatch for complex create flows (contractors REGON lookup) |
| `cellEdit.method` supports `'POST'` | Config | Some backends use POST for updates |
| `delete.url` as function | Config | Per-row dynamic delete URLs |
| `hooks.beforeCellEdit` returns `method` | Hooks | Override HTTP method per-field |

---

## Server-Side Factory Assessment

`makeDynamicTableRoute` is well-structured and mirrors `makeCrudRoute`'s patterns:

| Feature | `makeCrudRoute` | `makeDynamicTableRoute` |
|---------|-----------------|------------------------|
| Auth resolution | Cookies + middleware | `getAuthFromRequest` |
| Org/tenant scoping | `buildScopedWhere()` | `buildScopeFilters()` |
| Soft delete | Auto-filter | Auto-filter |
| Filter parsing | `buildFilters` callback | `parseDynamicTableFilters` + `buildFilters` |
| Sort mapping | `sortFieldMap` | `fieldMap` |
| Pagination | Auto | Auto |
| Event emission | Built-in | Not included (add later if needed) |
| Cache | Built-in | Not included |
| Custom fields | Built-in | Not included |

**Key limitation:** No event emission, no caching, no custom field support. This is by design — modules needing those features use `makeCrudRoute` or hand-written routes. The factory is for simple CRUD-only backends.

**Recommendation:** Consider adding a `hooks` object to `makeDynamicTableRoute` (like `makeCrudRoute`'s `afterCreate`, `beforeDelete`) for common side effects without needing to abandon the factory entirely.

---

## Recommendations for Phase 4 Migrations

### Migration Priority Adjustment

Based on code analysis, reorder slightly:

| # | Page | Reason for ordering |
|---|------|-------------------|
| 1 | `fms_products/carriers` | Nearly identical to products — fastest migration |
| 2 | `fms_teams` | Read-only, simplest hook config (no create/edit/delete) |
| 3 | `fms_documents` | Standard pattern, already has shared helpers |
| 4 | `fms_projects` | Standard pattern with detail navigation |
| 5 | `transports` | Standard pattern |
| 6 | `fms_locations` | Needs `hooks.beforeCellEdit` for type-based endpoint routing |
| 7 | `fms_offers` | Needs `initialFilters` from URL params, `hooks.beforeDelete` for status check |
| 8 | `contractors` | Most complex — `create.handler` for REGON, `hooks.beforeCellEdit` for contact sub-entity, custom MultiSelectEditor |

### Pre-Migration Fixes

Before migrating more pages, fix the `DeleteDialog` anti-pattern (Issue #1). It will affect all migrated pages.

### Per-Page Migration Checklist

For each page:

1. Identify all `useState` calls — map to hook config or `hooks.*`
2. Identify `useQuery` calls — should become `source` + `queryKey`
3. Identify event handlers — map to `cellEdit`, `create`, `delete`, or `hooks.*`
4. Identify page-specific code that stays: column defs, custom renderers, drawers, modals, keyboard shortcuts
5. Verify the API route's query param names match hook defaults (`page`, `limit`, `sortField`, `sortDir`, `q`, `filters`)
6. Test: cell edit, new row, delete, perspective save/select/delete, search, filter, sort, pagination

### Backend Filter Parser Adoption

Independent of frontend migrations. For each FMS API route that has a copy-pasted `parseFilterRow`:

```diff
- import { parseFilterRow, FIELD_MAP } from './helpers'
+ import { parseDynamicTableFilters } from '@open-mercato/ui/backend/dynamic-table/server'
+ const FIELD_MAP = { ... }  // keep as local constant
```

Routes eligible: `fms_products`, `fms_projects`, `fms_offers`, `contractors`. Routes NOT eligible: `fms_teams` (Knex), `fms_locations` (raw SQL), `transports` (multi-entity custom query).

---

## Test Plan

### Manual Testing (per migrated page)

- [ ] Table loads with data, pagination works (page change, limit change)
- [ ] Sort by clicking column header (asc/desc toggle)
- [ ] Search works (type in search bar, results filter)
- [ ] Column filters work (add filter, apply, remove)
- [ ] Cell edit: click cell → edit → Tab/Enter → saves (check network call)
- [ ] Cell edit error: edit → invalid value → error flash + red cell indicator
- [ ] New row: click "+" → fill fields → Tab → saves (check network call)
- [ ] Delete: click trash icon → dialog appears → confirm → row deleted
- [ ] Delete: keyboard Cmd+D → dialog appears
- [ ] Delete cancel: dialog → Cancel → dialog closes, no delete
- [ ] Perspectives: save → rename → select → delete (full lifecycle)
- [ ] Perspective select: sort/filter state updates to match perspective
- [ ] Perspective reset: select "All" → returns to default sort/filter
- [ ] Loading state: skeleton shown on initial load
- [ ] Filter suggestions: type in filter dropdown → suggestions from server (if configured)

### Regression Checks

- [ ] Existing non-migrated pages still work (no shared state leaks)
- [ ] `DynamicTable` component unchanged — existing props still accepted
- [ ] Perspectives API responses unchanged
- [ ] Flash messages show for success/error on all CRUD operations
