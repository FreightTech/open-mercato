# FMS Module - Agent Guidelines

This document describes how to configure search indexing for entities in the FMS module.

## Search Architecture Overview

The search system has two layers that must be kept in sync:

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│   Source Tables     │     │   entity_indexes    │     │    Meilisearch      │
│   (PostgreSQL)      │     │   (PostgreSQL)      │     │    (External)       │
├─────────────────────┤     ├─────────────────────┤     ├─────────────────────┤
│ fms_locations       │     │ Denormalized docs   │     │ Full-text search    │
│ fms_quotes          │ ──► │ + custom fields     │ ──► │ Typo-tolerant       │
│ contractors         │     │ + token search      │     │ Fast ranking        │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
        CRUD ops               indexer config            search.ts config
```

## Step 1: Configure Indexer in CRUD Routes

Every CRUD route that should be searchable **MUST** have an `indexer` config in `makeCrudRoute`:

```typescript
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { E } from '@open-mercato/fms/generated/entities.ids.generated'

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: FmsLocation,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  indexer: { entityType: E.fms_locations.fms_location },  // ← REQUIRED for search
  list: { ... },
  create: { ... },
  update: { ... },
  del: { ... },
})
```

### What the indexer does

When a CRUD operation (create/update/delete) occurs:

1. `makeCrudRoute` emits `query_index.upsert_one` event
2. Subscriber populates `entity_indexes` table with denormalized document
3. Subscriber emits `search.index_record` event
4. Search indexer updates Meilisearch

### For custom handlers (not using makeCrudRoute)

If you have custom POST/PUT/DELETE handlers, manually emit the event:

```typescript
export async function POST(req: Request) {
  // ... save to database ...

  // Trigger indexing
  const eventBus = container.resolve('eventBus')
  await eventBus.emitEvent('query_index.upsert_one', {
    entityType: 'fms_locations:fms_location',
    recordId: record.id,
    organizationId: record.organizationId,
    tenantId: record.tenantId,
  })

  return NextResponse.json({ id: record.id })
}
```

## Step 2: Create search.ts Configuration

Every module with searchable entities **MUST** provide a `search.ts` file at `src/modules/<module>/search.ts`.

### File Structure

```typescript
import type {
  SearchModuleConfig,
  SearchBuildContext,
  SearchResultPresenter,
  SearchIndexSource,
} from '@open-mercato/shared/modules/search'

// Helper functions
function pickString(...candidates: Array<unknown>): string | null {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const trimmed = candidate.trim()
    if (trimmed.length > 0) return trimmed
  }
  return null
}

function formatSubtitle(...parts: Array<unknown>): string | undefined {
  const text = parts
    .map((part) => (part === null || part === undefined ? '' : String(part)))
    .map((part) => part.trim())
    .filter(Boolean)
  if (text.length === 0) return undefined
  return text.join(' · ')
}

export const searchConfig: SearchModuleConfig = {
  entities: [
    {
      entityId: 'fms_locations:fms_location',  // Must match E.fms_locations.fms_location
      enabled: true,
      priority: 8,  // Higher = appears first in mixed results

      // Build searchable content for vector/fulltext indexing
      buildSource: async (ctx: SearchBuildContext): Promise<SearchIndexSource | null> => {
        const record = ctx.record
        const lines: string[] = []

        // Add searchable text
        if (record.name) lines.push(`Name: ${record.name}`)
        if (record.code) lines.push(`Code: ${record.code}`)
        if (record.city) lines.push(`City: ${record.city}`)

        if (!lines.length) return null

        return {
          text: lines,
          presenter: {
            title: pickString(record.name, record.code) ?? 'Location',
            subtitle: formatSubtitle(record.code, record.city, record.country),
            icon: 'map-pin',
            badge: 'Location',
          },
        }
      },

      // Format result for display in Cmd+K search
      formatResult: async (ctx: SearchBuildContext): Promise<SearchResultPresenter | null> => {
        return {
          title: pickString(ctx.record.name, ctx.record.code) ?? 'Location',
          subtitle: formatSubtitle(ctx.record.code, ctx.record.city),
          icon: 'map-pin',
          badge: 'Location',
        }
      },

      // URL when result is clicked
      resolveUrl: async (ctx: SearchBuildContext): Promise<string | null> => {
        const id = ctx.record.id as string | undefined
        if (!id) return null
        return `/backend/fms-locations?id=${encodeURIComponent(id)}`
      },

      // Control which fields are indexed
      fieldPolicy: {
        searchable: ['code', 'name', 'locode', 'city', 'country'],  // Full-text searchable
        hashOnly: [],      // Exact match only (sensitive data like tax_id)
        excluded: ['lat', 'lng'],  // Never indexed
      },
    },
  ],
}

export default searchConfig
export const config = searchConfig  // Alternative export name
```

### Entity Config Fields

| Field | Required | Description |
|-------|----------|-------------|
| `entityId` | Yes | Must match `E.<module>.<entity>` from generated IDs |
| `enabled` | No | Default `true` |
| `priority` | No | Higher values appear first (default: 0) |
| `buildSource` | For vector/fulltext | Generates searchable text and presenter |
| `formatResult` | For token search | Formats result at search time |
| `resolveUrl` | Recommended | URL when result is clicked |
| `fieldPolicy` | For fulltext | Controls which fields are indexed |

### Field Policy

```typescript
fieldPolicy: {
  searchable: ['name', 'description'],  // Indexed with typo tolerance
  hashOnly: ['email', 'tax_id'],        // Hashed for exact match only
  excluded: ['password', 'secret'],     // Never indexed
}
```

## Step 3: Reindexing

### When is reindexing needed?

1. **New search.ts config** - After adding/modifying search configuration
2. **Existing data** - Records created before indexer was configured
3. **Schema changes** - After adding new searchable fields

### Reindex Process (Two Steps)

**Step 1: Populate `entity_indexes` table**

```bash
# Reindex specific entity
yarn mercato reindex --entity fms_locations:fms_location --tenant <tenant-id> --force

# Reindex all entities for a tenant
yarn mercato reindex --tenant <tenant-id> --force
```

**Step 2: Populate Meilisearch**

```bash
# Via CLI
yarn mercato search reindex --tenant <tenant-id>

# Or via UI: Admin → Search → Full-Text Search → "Full Reindex" button
```

### Why two steps?

The search reindex worker reads from `entity_indexes`, not from source tables. If `entity_indexes` is empty, the search reindex will find nothing to index.

```
Source Table → (Step 1) → entity_indexes → (Step 2) → Meilisearch
```

### Verify indexing

```sql
-- Check entity_indexes population
SELECT entity_type, COUNT(*)
FROM entity_indexes
WHERE entity_type LIKE 'fms%'
GROUP BY entity_type;

-- Check specific entity
SELECT entity_id, doc
FROM entity_indexes
WHERE entity_type = 'fms_locations:fms_location'
LIMIT 5;
```

## Auto-Discovery

The search configuration is auto-discovered by generators:

1. Generator scans for `search.ts` files in module directories
2. Generates `generated/search.generated.ts` with all configs
3. Bootstrap loads configs via `registerSearchModule()`

Run `yarn modules:prepare` after adding new `search.ts` files.

## Event Flow Summary

```
┌────────────────────────────────────────────────────────────────────────────┐
│  CRUD Operation (POST /api/fms-locations/ports)                            │
└────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  makeCrudRoute with indexer: { entityType: E.fms_locations.fms_location }  │
└────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  eventBus.emitEvent('query_index.upsert_one', { entityType, recordId })    │
└────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  Subscriber: upsertIndexRow() → entity_indexes table populated             │
└────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  eventBus.emitEvent('search.index_record') → Meilisearch updated           │
│  (uses search.ts config: buildSource, fieldPolicy, formatResult)           │
└────────────────────────────────────────────────────────────────────────────┘
```

## Checklist for New Searchable Entities

- [ ] Add `indexer: { entityType: E.<module>.<entity> }` to makeCrudRoute
- [ ] Create or update `search.ts` with entity config
- [ ] Run `yarn modules:prepare` to regenerate search registry
- [ ] Run `yarn mercato reindex --entity <entity> --tenant <id> --force`
- [ ] Run `yarn mercato search reindex --tenant <id>` or use UI "Full Reindex"
- [ ] Verify in Cmd+K search that records appear

## Existing FMS Search Configurations

| Entity | File | Priority |
|--------|------|----------|
| `fms_locations:fms_location` | `fms_locations/search.ts` | 8 |
| `fms_products:fms_charge_code` | `fms_products/search.ts` | 7 |
| `fms_quotes:fms_quote` | `fms_quotes/search.ts` | 10 |
| `fms_quotes:fms_offer` | `fms_quotes/search.ts` | 9 |
| `contractors:contractor` | `contractors/search.ts` | 9 |

---

## Dynamic Table - Editable Relation Columns

When displaying related entities in DynamicTable (e.g., Client name from `clientId`, User name from `assignedToId`), you need a special approach to make these columns editable with entity search.

### Architecture Understanding

**Key Insight:** Table-config generators only produce static column definitions (data, title, type, etc.). For editable relation columns, the page component must define columns programmatically with custom `editor` functions.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  Table Config (static)                 │  Page Component (dynamic)              │
├────────────────────────────────────────┼────────────────────────────────────────┤
│  - Column definitions                  │  - Custom editors for relations        │
│  - Display hints                       │  - JSON parsing in save handler        │
│  - Read-only computed columns          │  - Query invalidation after save       │
│  - Dropdown sources                    │                                        │
└────────────────────────────────────────┴────────────────────────────────────────┘
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
      // readOnly: true,         // ← Do NOT set readOnly if editable
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

// Inside component:
const clientEditorConfig = useMemo(() => ({
  entityType: 'contractors:contractor',  // Entity type for search
  extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
    JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
  placeholder: 'Search clients...',
  minQueryLength: 2,
}), [])

const userEditorConfig = useMemo(() => ({
  entityType: 'auth:user',
  extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
    JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
  placeholder: 'Search users...',
  minQueryLength: 1,
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

    // Add custom editor for Client column
    if (col.data === 'clientName') {
      return {
        ...baseCol,
        readOnly: false,
        editor: createEntitySearchEditor(clientEditorConfig),
      }
    }

    // Add custom editor for Assigned To column
    if (col.data === 'assignedToName') {
      return {
        ...baseCol,
        readOnly: false,
        editor: createEntitySearchEditor(userEditorConfig),
      }
    }

    return baseCol
  }) as ColumnDef[]
}, [tableConfig, clientEditorConfig, userEditorConfig])
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
      // Handle relation columns - parse JSON to extract ID
      let updateData: Record<string, unknown> = {}

      if (payload.prop === 'clientName') {
        try {
          const parsed = JSON.parse(String(payload.newValue))
          updateData = { clientId: parsed.id }
        } catch {
          updateData = { clientId: null }  // Clear if invalid
        }
      } else if (payload.prop === 'assignedToName') {
        try {
          const parsed = JSON.parse(String(payload.newValue))
          updateData = { assignedToId: parsed.id }
        } catch {
          updateData = { assignedToId: null }
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

        // Refresh to get updated display name from afterList hook
        if (payload.prop === 'clientName' || payload.prop === 'assignedToName') {
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
// api/route.ts
const crud = makeCrudRoute({
  // ...
  list: {
    afterList: async (items, ctx) => {
      const clientIds = items.map(i => i.clientId).filter(Boolean)
      const userIds = items.map(i => i.assignedToId).filter(Boolean)

      // Batch fetch related entities
      const [clients, users] = await Promise.all([
        clientIds.length ? em.find(Contractor, { id: { $in: clientIds } }) : [],
        userIds.length ? em.find(User, { id: { $in: userIds } }) : [],
      ])

      const clientMap = new Map(clients.map(c => [c.id, c]))
      const userMap = new Map(users.map(u => [u.id, u]))

      // Attach display names
      return items.map(item => ({
        ...item,
        clientName: item.clientId ? clientMap.get(item.clientId)?.name : null,
        assignedToName: item.assignedToId ? userMap.get(item.assignedToId)?.name : null,
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

### Example Files

| Module | Pattern Example |
|--------|-----------------|
| `fms_quotes` | Client + Assigned To in quotes table |
| `fms_quotes/QuoteWizardHeader` | Client + Assigned To + Ports |
