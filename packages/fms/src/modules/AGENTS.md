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

---

## Commands with Search Indexing

When writing custom command handlers (not using `makeCrudRoute`), you must manually trigger search indexing via `emitCrudSideEffects`. This section covers the correct patterns to avoid common pitfalls.

### Basic Pattern

```typescript
import { emitCrudSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'

const createEntityCommand: CommandHandler<Input, Result> = {
  id: 'module.entity.create',
  async execute(input, ctx) {
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const entity = em.create(Entity, { ... })
    em.persist(entity)
    await em.flush()  // ID is now available

    // Trigger search indexing
    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',  // 'created' | 'updated' | 'deleted'
      entity: entity,
      identifiers: {
        id: entity.id,
        tenantId: entity.tenantId,
        organizationId: entity.organizationId
      },
      indexer: { entityType: 'module:entity' },  // Must match E.module.entity
    })

    return { id: entity.id }
  },
}
```

### Transaction Pattern - CRITICAL

When using `em.transactional()`, MikroORM does NOT generate IDs until the transaction commits (auto-flushes after callback returns). This causes a common bug where `entity.id` is `undefined` inside the callback.

#### ❌ WRONG - ID is undefined

```typescript
const result = await em.transactional(async (tem) => {
  const entity = tem.create(Entity, { ... })
  tem.persist(entity)

  return {
    entityId: entity.id,  // ❌ UNDEFINED - flush hasn't happened yet!
  }
})

// result.entityId is undefined
const entity = await em.findOne(Entity, { id: result.entityId })  // finds nothing
// emitCrudSideEffects is never called because entity is null
```

#### ✅ CORRECT - Pattern 1: Explicit flush inside transaction

Add `await tem.flush()` before returning to force ID generation while maintaining atomicity:

```typescript
const result = await em.transactional(async (tem) => {
  const entity = tem.create(Entity, { ... })
  tem.persist(entity)

  // Create related entities...
  const related = tem.create(RelatedEntity, { parent: entity, ... })
  tem.persist(related)

  // Force ID generation before returning
  await tem.flush()  // ✅ IDs are now generated

  return {
    entityId: entity.id,  // ✅ Now defined!
  }
})

// Trigger indexing after transaction
const entity = await em.findOne(Entity, { id: result.entityId })
if (entity) {
  await emitCrudSideEffects({
    dataEngine: de,
    action: 'created',
    entity,
    identifiers: { id: entity.id, tenantId, organizationId },
    indexer: { entityType: 'module:entity' },
  })
}
```

#### ✅ CORRECT - Pattern 2: Pre-generate UUIDs

Generate IDs before creating entities. This avoids relying on database-generated IDs:

```typescript
import { randomUUID } from 'crypto'

const result = await em.transactional(async (tem) => {
  const entityId = randomUUID()  // ✅ ID known before persist
  const relatedId = randomUUID()

  const entity = tem.create(Entity, {
    id: entityId,  // ✅ Explicitly set ID
    ...
  })

  const related = tem.create(RelatedEntity, {
    id: relatedId,
    parentId: entityId,  // ✅ Can reference before flush
    ...
  })

  await tem.persist([entity, related])

  return { entity, related }  // ✅ IDs are already known
})

// entity.id is guaranteed to be defined
await emitCrudSideEffects({
  dataEngine: de,
  action: 'created',
  entity: result.entity,
  identifiers: { id: result.entity.id, tenantId, organizationId },
  indexer: { entityType: 'module:entity' },
})
```

### When to Use Each Pattern

| Pattern | Use When |
|---------|----------|
| Explicit flush | Creating entities with auto-generated IDs, simple transactions |
| Pre-generate UUIDs | Complex transactions, circular references, need ID before persist |
| No transaction | Simple CRUD without relations, no atomicity needed |

### Checklist for Command Indexing

- [ ] Command calls `emitCrudSideEffects` after entity is persisted
- [ ] If using `transactional()`, either:
  - [ ] Add `await tem.flush()` before returning IDs, OR
  - [ ] Pre-generate IDs with `randomUUID()`
- [ ] Verify `entity.id` is defined before calling `emitCrudSideEffects`
- [ ] Use correct action: `'created'`, `'updated'`, or `'deleted'`
- [ ] `indexer.entityType` matches the entity's `E.module.entity` constant
- [ ] Test by creating a record and searching for it immediately

### Example Files

| File | Pattern |
|------|---------|
| `contractors/commands/contractors.ts` | Explicit flush (createWithRelations) |
| `fms_documents/api/upload/route.ts` | Pre-generate UUIDs |
| `fms_quotes/commands/offer-operations.ts` | Pre-generate UUIDs (generatePdf) |
| `fms_quotes/commands/offer-operations.ts` | No transaction (createVersion) |

---

## RBAC and Multi-Tenant Access Patterns

This section covers critical patterns for handling superadmin access and multi-tenant entity operations.

### Superadmin Detection - Raw SQL Pattern

The `isGlobalSuperAdmin()` method in RbacService must check if a user has superadmin privileges across ALL tenants. Using MikroORM's ORM queries can cause inconsistent results due to filter/context issues.

#### ❌ WRONG - ORM queries with filters

```typescript
// MikroORM filters can interfere with cross-tenant queries
const links = await em.find(UserRole, { user: userId }, { filters: false })
const roleSuper = await em.findOne(RoleAcl, { isSuperAdmin: true, role: { $in: roleIds } }, { filters: false })
```

Even with `{ filters: false }`, MikroORM's EntityManager context can cause inconsistent results across concurrent requests.

#### ✅ CORRECT - Raw SQL queries

```typescript
const conn = em.getConnection()

// Get user's role IDs
const linksResult = await conn.execute<Array<{ role_id: string }>>(
  `SELECT ur.role_id FROM user_roles ur WHERE ur.user_id = ? AND ur.deleted_at IS NULL`,
  [userId]
)
const roleIds = linksResult.map((row) => row.role_id).filter(Boolean)

// Check if any role has superadmin privileges
const placeholders = roleIds.map(() => '?').join(', ')
const aclResult = await conn.execute<Array<{ id: string; is_super_admin: boolean }>>(
  `SELECT id, is_super_admin FROM role_acls WHERE role_id IN (${placeholders}) AND is_super_admin = true AND deleted_at IS NULL LIMIT 1`,
  roleIds
)
const isSuperAdmin = aclResult.length > 0 && aclResult[0].is_super_admin === true
```

### DataEngine Entity Isolation

When using `DataEngine.createOrmEntity()`, `updateOrmEntity()`, or `deleteOrmEntity()`, these methods use `persistAndFlush()` which flushes ALL entities in the EntityManager's identity map - not just the target entity.

#### Problem: Accidental Entity Persistence

If other entities are loaded into the EntityManager and marked as "new" or "dirty" (e.g., through relation loading or reference assignment), they will be persisted alongside the intended entity. This can cause:
- Duplicate key errors
- Unintended data modifications
- Data corruption

#### Solution: Forked EntityManager with Clear Identity Map

```typescript
async createOrmEntity<T extends object>(opts: { entity: EntityName<T>; data: EntityData<T> }): Promise<T> {
  // Fork EM with clear identity map to isolate this operation
  const forkedEm = this.em.fork({ clear: true })
  const entity = forkedEm.create(opts.entity, opts.data)
  await forkedEm.persistAndFlush(entity)
  return entity
}
```

This ensures only the specific entity is persisted, regardless of what other entities might be in the parent EntityManager.

### Superadmin Bypass in Page/API Authorization

When checking `requireRoles` or `requireFeatures` on pages/API routes, superadmins must bypass these checks to access any tenant.

#### Problem: JWT Roles Are Tenant-Scoped

The `auth.roles` from JWT tokens only contain roles for the user's original tenant. When a superadmin switches to a different tenant, their JWT doesn't have roles for that tenant.

```typescript
// ❌ WRONG - Fails for superadmins in different tenants
const roles = auth.roles || []
const ok = requiredRoles.some(r => roles.includes(r))
if (!ok) redirect('/login?requireRole=...')
```

#### Solution: Check Superadmin Before Role/Feature Checks

```typescript
// ✅ CORRECT - Superadmin bypass
const acl = await rbac.loadAcl(auth.sub, { tenantId, organizationId })
const isSuperAdmin = acl.isSuperAdmin

// Superadmins bypass role checks
if (requiredRoles.length && !isSuperAdmin) {
  const roles = auth.roles || []
  const ok = requiredRoles.some(r => roles.includes(r))
  if (!ok) redirect('/login?requireRole=...')
}

// Superadmins bypass feature checks
if (requiredFeatures.length && !isSuperAdmin) {
  const ok = await rbac.userHasAllFeatures(auth.sub, requiredFeatures, { tenantId, organizationId })
  if (!ok) redirect('/login?requireFeature=...')
}
```

### Tenant Context from Cookies

When superadmins switch tenants, the selected tenant is stored in `om_selected_tenant` cookie. Authorization checks must read this cookie to use the correct tenant context.

```typescript
const cookieStore = await cookies()
const cookieSelectedTenant = cookieStore.get('om_selected_tenant')?.value ?? null
const tenantIdForCheck = cookieSelectedTenant ?? auth.tenantId ?? null
```

### Checklist for Multi-Tenant Authorization

- [ ] Superadmin detection uses raw SQL queries, not ORM
- [ ] DataEngine CRUD methods use forked EntityManager with `{ clear: true }`
- [ ] Page authorization checks superadmin BEFORE role/feature checks
- [ ] API authorization checks superadmin BEFORE role/feature checks
- [ ] Authorization reads `om_selected_tenant` cookie for tenant context
- [ ] `loadAcl()` is called with the correct tenant/organization scope

### Related Files

| File | Purpose |
|------|---------|
| `packages/core/src/modules/auth/services/rbacService.ts` | Superadmin detection, ACL loading |
| `packages/shared/src/lib/data/engine.ts` | DataEngine with forked EM |
| `src/app/(backend)/backend/[...slug]/page.tsx` | Page authorization |
| `src/app/api/[...slug]/route.ts` | API authorization |

---

## User Display Name - Email Fallback Pattern

The `User` entity has `name` as a **nullable field**. Many users authenticate via OAuth/SSO and only have an email address, with `name` set to `NULL`. This causes display issues throughout the application when code assumes `name` is always populated.

### The Problem

When displaying user names (e.g., "Assigned To" columns), if the code directly uses `user.name` without a fallback, the UI shows empty/blank values for users without names.

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Database: users table                                                      │
├──────────────────────────┬──────────────────────┬──────────────────────────┤
│  id                      │  name                │  email                   │
├──────────────────────────┼──────────────────────┼──────────────────────────┤
│  abc-123                 │  NULL                │  john@example.com        │  ← No name!
│  def-456                 │  "Jane Doe"          │  jane@example.com        │  ← Has name
└──────────────────────────┴──────────────────────┴──────────────────────────┘
```

### Why This Happens

#### ❌ WRONG - No fallback

```typescript
// API route returning user data
assignedTo: quote.assignedTo
  ? {
      id: quote.assignedTo.id,
      name: quote.assignedTo.name,        // ❌ NULL if user has no name
      email: quote.assignedTo.email,
    }
  : null,

// afterList hook populating display names
const users = await knex('users')
  .select('id', 'name')                   // ❌ Only fetching name
  .whereIn('id', userIds)
for (const u of users) {
  userMap.set(u.id, u.name)               // ❌ Storing NULL
}
```

The frontend then shows empty cells because:
1. `assignedTo.name` is `null`
2. `assignedToName` is `null`
3. Display logic falls through to empty string

### The Solution

Always use email as fallback when displaying user identifiers.

#### ✅ CORRECT - With email fallback

```typescript
// API route returning user data
assignedTo: quote.assignedTo
  ? {
      id: quote.assignedTo.id,
      name: quote.assignedTo.name || quote.assignedTo.email,  // ✅ Fallback to email
      email: quote.assignedTo.email,
    }
  : null,

// Flat field for forms
assignedToName: quote.assignedTo?.name ?? quote.assignedTo?.email ?? null,  // ✅ Fallback

// afterList hook populating display names
const users = await knex('users')
  .select('id', 'name', 'email')          // ✅ Fetch email too
  .whereIn('id', userIds)
for (const u of users) {
  const displayName = u.name || u.email   // ✅ Fallback to email
  userMap.set(u.id, displayName)
}
```

### Places to Check

When adding user display fields to new features, ensure these locations have the fallback:

| Location | Pattern |
|----------|---------|
| API GET response | `name: user.name \|\| user.email` |
| API PUT response | `name: user.name \|\| user.email` |
| Flat fields | `assignedToName: user?.name ?? user?.email ?? null` |
| `afterList` hooks | Fetch `email` column, use `name \|\| email` |
| Search `buildSource` | Use `name \|\| email` for presenter title |

### Example: FMS Quotes Fix

The "Assigned To" column was showing empty in the Quotes table because:

1. **List API** (`/api/fms_quotes/route.ts`) - `afterList` hook only fetched `name`:
   ```typescript
   // Before (wrong)
   const users = await knex('users').select('id', 'name')
   userMap.set(u.id, u.name)

   // After (correct)
   const users = await knex('users').select('id', 'name', 'email')
   userMap.set(u.id, u.name || u.email)
   ```

2. **Single Quote API** (`/api/fms_quotes/[id]/route.ts`) - No fallback in response:
   ```typescript
   // Before (wrong)
   assignedToName: quote.assignedTo?.name ?? null,
   assignedTo: { name: quote.assignedTo.name, ... }

   // After (correct)
   assignedToName: quote.assignedTo?.name ?? quote.assignedTo?.email ?? null,
   assignedTo: { name: quote.assignedTo.name || quote.assignedTo.email, ... }
   ```

### Checklist for User Display Fields

- [ ] API responses use `name || email` for user name fields
- [ ] Flat fields use `name ?? email ?? null` pattern
- [ ] `afterList` hooks fetch both `name` AND `email` columns
- [ ] `afterList` hooks use `name || email` when building display maps
- [ ] Search presenters use `name || email` for title
- [ ] Test with a user that has NULL name (only email)

---

## DynamicTable in FMS

For comprehensive DynamicTable documentation (keyboard navigation, Escape behavior, cross-table arrow navigation, drawer focus management, editable relation columns, filter suggestions), see:

**`packages/ui/src/backend/dynamic-table/AGENTS.md`**

The sections below cover FMS-specific configuration only.

### FMS Table Shortcut Configuration

| Table | Shift+Enter | Ctrl/Cmd+D | Notes |
|-------|------------|------------|-------|
| **Offers** | Open preview drawer | Delete (draft only, flash warning otherwise) | |
| **Quotes** | Open wizard (edit mode) | Delete | |
| **Projects** | Navigate to `/backend/fms-projects/{id}` | None | All columns read-only |
| **Contractors** | Open contractor drawer | Delete | Table inside `<div inert>` wrapper |
| **Documents** | Open detail drawer | Delete | |
| **Financials** | Open detail panel | None | Shortcuts only on detail perspectives (`all`, `pending`) |

### FMS Modules with Filter Suggestions

| Module | Page File | Entity Type |
|--------|-----------|-------------|
| Quotes | `fms_quotes/backend/fms-quotes/page.tsx` | `fms_quotes:fms_quote` |
| Offers | `fms_quotes/backend/fms-offers/page.tsx` | `fms_quotes:fms_offer` |
| Files (Projects) | `fms_projects/backend/fms-projects/page.tsx` | `fms_projects:fms_project` |
| Contractors | `contractors/backend/contractors/page.tsx` | `contractors:contractor` |
| Documents | `fms_documents/backend/fms-documents/page.tsx` | `fms_documents:fms_document` |
| Financials | `fms_financials/backend/fms-financials/page.tsx` | `fms_financials:fms_invoice` |

### FMS Modules Without Filter Suggestions

| Module | Reason |
|--------|--------|
| Shipments | Aggregate view combining multiple entities (FmsSeaContainer, FmsRoadUnit, FmsAirUnit) - no single entity type to query |
| Teams | Displays users with team assignments - module not fully established |

### FMS Drawer Focus Management Files

| File | Purpose |
|------|---------|
| `packages/fms/src/hooks/useDrawerTableFocus.ts` | Reusable hook for Radix Sheet drawers |
| `packages/fms/src/modules/contractors/components/ContractorDrawer.tsx` | Drawer using the hook |
| `packages/fms/src/modules/fms_quotes/components/OfferDetailDrawer.tsx` | Custom div drawer with Escape handling |
| `packages/fms/src/modules/fms_financials/components/InvoiceDetailPanel.tsx` | Radix Sheet with 5 tables + cross-table arrows |

### FMS Editable Relation Column Examples

| Module | Pattern Example |
|--------|-----------------|
| `fms_quotes` | Client + Assigned To in quotes table |
| `fms_quotes/QuoteWizardHeader` | Client + Assigned To + Ports |
