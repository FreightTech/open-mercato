# SPEC-058: FMS Activity Panels

**Plane tickets:** CHAME-54 (Project), CHAME-55 (Contractor)
**Date:** 2026-03-11
**Status:** Draft

## Overview

Add unified Activity panels to the FMS Project detail page and FMS Contractor detail page. Each panel is a sticky left sidebar showing a chronological timeline of comments (with file attachments), document events, tracking/field changes, and related entity events. A shared component library powers both panels.

### Goals

1. **Shared activity infrastructure** — reusable types, UI components, and API patterns across FMS entities
2. **FMS Project activity** — aggregates comments, documents, tracking events, customs changes
3. **FMS Contractor activity** — aggregates comments, documents, field changes, project creation events
4. **Comment attachments** — users can attach files to comments
5. **Sticky-on-scroll layout** — Activity panel stays fixed while main content scrolls

## Architecture

```
packages/fms/src/
├── lib/activity/                          # Shared activity infrastructure
│   ├── types.ts                           # ActivityEntry, ActivityEntryKind, etc.
│   ├── components/                        # Shared UI components
│   │   ├── ActivityPanel.tsx              # Main panel shell (tabs + composer + feed)
│   │   ├── ActivityItem.tsx               # Single timeline entry renderer
│   │   ├── ActivityAvatar.tsx             # User initials / system avatar
│   │   └── CommentComposer.tsx            # Textarea + attach + post
│   └── utils.ts                           # Helpers (avatar color, file size formatting)
│
├── modules/fms_projects/
│   ├── api/projects/[id]/activity/route.ts     # Project activity aggregation API
│   ├── components/ProjectWizard/
│   │   └── ProjectActivitySection.tsx          # Wires shared panel to project data
│   └── backend/fms-projects/[id]/page.tsx      # Layout change (add left sidebar)
│
└── modules/contractors/
    ├── data/entities.ts                        # New ContractorComment entity
    ├── data/validators.ts                      # New comment validators
    ├── api/comments/route.ts                   # Contractor comments CRUD
    ├── api/contractors/[id]/activity/route.ts   # Contractor activity aggregation API
    ├── components/
    │   └── ContractorActivitySection.tsx        # Wires shared panel to contractor data
    └── backend/contractors/[id]/page.tsx        # Layout change (add left sidebar)
```

### Component Hierarchy

```
ActivityPanel (shared)
├── TabBar (All | Comments | Docs | Changes)
├── CommentComposer
│   ├── Textarea ("Write a comment...")
│   ├── AttachButton (file picker)
│   ├── AttachmentPreview (when file selected)
│   └── PostButton
└── ActivityFeed (scrollable)
    └── ActivityItem (repeated)
        ├── ActivityAvatar (initials circle or "Sys")
        ├── Header (actor name + relative time)
        └── Body (per-kind rendering)
            ├── comment → text + optional attachment preview
            ├── document → document name + file size + category badge
            ├── tracking → event description + container + location
            ├── customs → container + status transition
            ├── field_change → field name + old → new values
            └── project_created → project number + route summary
```

## Data Models

### Shared ActivityEntry Type

```typescript
// packages/fms/src/lib/activity/types.ts

type ActivityEntryKind = 'comment' | 'document' | 'tracking' | 'customs' | 'field_change' | 'project_created'

type ActivityEntry = {
  id: string                         // Unique: prefixed source ID (e.g. "comment:{uuid}")
  kind: ActivityEntryKind
  occurredAt: string                 // ISO 8601
  title: string                      // Display title
  body?: string | null               // Comment text or event description
  actor: {
    id: string | null                // userId or null for system
    label: string                    // Display name or "System"
    isSystem: boolean
  }
  metadata?: {
    // Attachment (comment or document)
    attachmentId?: string
    attachmentUrl?: string
    fileName?: string
    fileSize?: number
    documentCategory?: string
    // Tracking
    containerNumber?: string
    eventType?: string
    eventCode?: string
    locationName?: string
    // Status/field change
    fieldName?: string
    statusFrom?: string | null
    statusTo?: string
    oldValue?: string | null
    newValue?: string | null
    // Project reference
    projectNumber?: string
    route?: string
  }
}

type ActivityFilter = 'all' | 'comments' | 'documents' | 'changes'
```

### FmsProjectNote Extension

**File:** `packages/fms/src/modules/fms_projects/data/entities.ts`

Add to existing `FmsProjectNote` entity (line ~1407):

```typescript
@Property({ name: 'attachment_id', type: 'uuid', nullable: true })
attachmentId?: string | null
```

**Migration:** Adds `attachment_id` column to `fms_project_notes` table. Nullable, no FK constraint (references `attachments.id` by convention). Zero-downtime deployment — new column is nullable with no default.

### New ContractorComment Entity

**File:** `packages/fms/src/modules/contractors/data/entities.ts`

```typescript
@Entity({ tableName: 'contractor_comments' })
@Index({ name: 'contractor_comments_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'contractor_comments_contractor_idx', properties: ['contractor'] })
export class ContractorComment {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @ManyToOne(() => Contractor, { fieldName: 'contractor_id' })
  contractor!: Contractor

  @Property({ name: 'body', type: 'text' })
  body!: string

  @Property({ name: 'author_user_id', type: 'uuid', nullable: true })
  authorUserId?: string | null

  @Property({ name: 'author_name', type: 'text', nullable: true })
  authorName?: string | null

  @Property({ name: 'attachment_id', type: 'uuid', nullable: true })
  attachmentId?: string | null

  @Property({ name: 'created_at', type: Date, defaultRaw: 'now()' })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, defaultRaw: 'now()', onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}
```

**Migration:** Creates `contractor_comments` table. Separate from `contractor_sop_comments` — SOP comments are structured operational notes with categories; activity comments are freeform timeline entries.

### Validators

**File:** `packages/fms/src/modules/contractors/data/validators.ts`

```typescript
export const contractorCommentCreateSchema = z.object({
  body: z.string().min(1).max(5000),
})

export const contractorCommentUpdateSchema = z.object({
  id: z.string().uuid(),
  body: z.string().min(1).max(5000).optional(),
})
```

**File:** `packages/fms/src/modules/fms_projects/data/validators.ts`

Update `fmsProjectNoteCreateSchema` to accept optional `attachmentId`:

```typescript
// Add to existing schema
attachmentId: z.string().uuid().optional().nullable(),
```

## API Contracts

### Comment APIs (shared pattern)

Both project notes and contractor comments follow the same pattern. The notes API already exists; the contractor comments API is new.

#### POST /api/contractors/comments (new)

Creates a contractor comment, optionally with file attachment.

**Content-Type:** `multipart/form-data` (when file attached) or `application/json` (text-only)

**Request (JSON):**
```json
{ "contractorId": "uuid", "body": "Comment text" }
```

**Request (multipart):**
```
contractorId: "uuid"
body: "Comment text"
file: <binary>
```

**Response (201):**
```json
{
  "id": "uuid",
  "contractorId": "uuid",
  "body": "Comment text",
  "authorUserId": "uuid",
  "authorName": "John Doe",
  "attachmentId": "uuid | null",
  "attachment": { "id": "uuid", "fileName": "doc.pdf", "fileSize": 245000 } | null,
  "createdAt": "2026-03-11T14:23:00Z"
}
```

**Auth:** `requireAuth: true, requireFeatures: ['contractors.edit']`

When file is provided:
1. Store file via `storePartitionFile({ partitionCode: 'contractorComments', ... })`
2. Create `Attachment` record
3. Store `attachmentId` on `ContractorComment`

Reference: `packages/fms/src/modules/fms_projects/api/projects/[id]/documents/route.ts` (file upload pattern)

#### POST /api/fms_projects/projects/{id}/notes (update existing)

**File:** `packages/fms/src/modules/fms_projects/api/projects/[id]/notes/route.ts`

Update to support multipart form data with optional file attachment. Same pattern as contractor comments above.

### Activity Aggregation APIs

#### GET /api/fms_projects/projects/{id}/activity

Aggregates project activity from multiple sources.

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `filter` | `'all'\|'comments'\|'documents'\|'changes'` | `'all'` | Filter by entry kind |

**Response:**
```json
{
  "items": [ActivityEntry],
  "total": 42
}
```

**Auth:** `requireAuth: true, requireFeatures: ['fms_projects.view']`

**Aggregation logic:**

| Filter | Sources |
|--------|---------|
| `comments` | `FmsProjectNote` |
| `documents` | `FmsDocument` where `relatedEntityType = 'fms_projects:fms_project'` |
| `changes` | `FmsSeaContainer.cargoEvents` (JSONB) + customs status |
| `all` | All of the above |

**Normalization rules:**

| Source | → kind | title | actor |
|--------|--------|-------|-------|
| `FmsProjectNote` | `comment` | "Comment" | authorName or "Unknown" |
| `FmsProjectNote` (with attachment) | `comment` | "Comment" | authorName, metadata.fileName/fileSize |
| `FmsDocument` | `document` | Category label (e.g. "Booking Confirmation uploaded") | createdBy user or "System" |
| `CargoEventEntry` (tracking) | `tracking` | Description or "Tracking Sync" | "System" |
| `CargoEventEntry` (customs-related) | `customs` | "Customs" | "System", metadata.containerNumber + statusTo |

**Implementation notes:**
- Query all sources filtered by projectId + scope
- For `FmsProjectNote`: join `Attachment` when `attachmentId` is not null
- For `FmsDocument`: join `Attachment` for fileName/fileSize
- For `FmsSeaContainer`: flatten `cargoEvents` JSONB array — each entry becomes an `ActivityEntry`
- Merge all, sort by `occurredAt` DESC
- In-memory pagination is acceptable (projects typically have <500 total events)

#### GET /api/contractors/contractors/{id}/activity

Aggregates contractor activity from multiple sources.

**Query params:** Same as project activity.

**Auth:** `requireAuth: true, requireFeatures: ['contractors.view']`

**Aggregation logic:**

| Filter | Sources |
|--------|---------|
| `comments` | `ContractorComment` |
| `documents` | `FmsDocument` where `relatedEntityType = 'contractors:contractor'` |
| `changes` | `ActionLog` where entity = contractor + `FmsProject` where `client = contractorId` |
| `all` | All of the above |

**Normalization rules:**

| Source | → kind | title | actor |
|--------|--------|-------|-------|
| `ContractorComment` | `comment` | "Comment" | authorName |
| `ContractorComment` (with attachment) | `comment` | "Comment" | authorName, metadata.fileName/fileSize |
| `FmsDocument` | `document` | Category label (e.g. "Commercial Invoice") | createdBy or "System" |
| `ActionLog` (field change) | `field_change` | "Field Updated" | actor from ActionLog, metadata.fieldName/oldValue/newValue |
| `FmsProject` (created with this client) | `project_created` | "Project Created" | createdBy, metadata.projectNumber/route |

**Field change tracking:**
- Use `ActionLog` from `packages/core/src/modules/audit_logs/` — query where `entityType` matches contractor entity and `entityId` matches contractorId
- Parse `snapshotBefore`/`snapshotAfter` to extract changed fields and values
- If ActionLog is not currently written for contractor updates, add `buildLog()` calls to contractor update commands

**Project creation events:**
- Query `FmsProject` where `client = contractorId`, ordered by `createdAt` DESC
- Map to `project_created` entries with project number and route info

## UI/UX

### Shared Components

**Location:** `packages/fms/src/lib/activity/components/`

#### ActivityPanel

Main container component. Props:

```typescript
type ActivityPanelProps = {
  entries: ActivityEntry[]
  isLoading: boolean
  activeFilter: ActivityFilter
  onFilterChange: (filter: ActivityFilter) => void
  onPostComment: (body: string, file?: File) => Promise<void>
  isPostingComment: boolean
}
```

- Renders TabBar, CommentComposer, and ActivityFeed
- Full height with internal scroll on the feed area
- Tabs are pill-style buttons (All highlighted, others outlined)

#### CommentComposer

```typescript
type CommentComposerProps = {
  onSubmit: (body: string, file?: File) => Promise<void>
  isSubmitting: boolean
}
```

- User avatar (current user initials) on the left
- Textarea with "Write a comment..." placeholder
- Below textarea: "Attach" button (paperclip icon) + "Post" button (right-aligned, primary)
- When file selected: show inline preview (file icon + name + size + remove "x" button)
- `Cmd/Ctrl+Enter` submits
- Post button disabled when both body is empty and no file attached
- Hidden file input triggered by Attach button click

#### ActivityItem

```typescript
type ActivityItemProps = {
  entry: ActivityEntry
  isLast: boolean
}
```

- No vertical connector lines (simpler than sales timeline — entries are card-like with spacing)
- Left: `ActivityAvatar`
- Right: actor name (bold) + relative timestamp (muted, right-aligned) on first line
- Second line: title or body based on kind
- For `document` kind: file preview card (gray background, file icon, name, size)
- For `field_change` kind: "Field changed from X to Y" with old/new values
- For `project_created` kind: project number as link + route summary

#### ActivityAvatar

```typescript
type ActivityAvatarProps = {
  actor: ActivityEntry['actor']
  size?: number  // default 32
}
```

- Circular div with initials (first letter of first + last name)
- Deterministic background color from userId hash (pick from preset palette)
- System events: "Sys" text in neutral gray circle
- Size: 32px default

### Page Layouts

#### FMS Project Detail Page

**File:** `packages/fms/src/modules/fms_projects/backend/fms-projects/[id]/page.tsx`

Change from single-column to two-column:

```tsx
<div className="flex h-full">
  {/* LEFT: Activity — sticky, own scroll */}
  <div className="w-[400px] min-w-[350px] shrink-0 border-r h-full overflow-hidden">
    <ProjectActivitySection projectId={projectId} />
  </div>
  {/* RIGHT: Main content — own scroll */}
  <div className="flex-1 overflow-auto p-4 space-y-4">
    {/* All existing DynamicTables */}
    {/* Documents table: now full-width (no longer side-by-side with notes) */}
  </div>
</div>
```

Remove `ProjectNotesSection` from the documents/notes grid. Remove `notesTableRef` from the `tableNavChain`. Documents table spans full width.

#### FMS Contractor Detail Page

**File:** `packages/fms/src/modules/contractors/backend/contractors/[id]/page.tsx`

Same two-column pattern:

```tsx
<div className="flex h-full">
  {/* LEFT: Activity — sticky, own scroll */}
  <div className="w-[400px] min-w-[350px] shrink-0 border-r h-full overflow-hidden">
    <ContractorActivitySection contractorId={contractorId} />
  </div>
  {/* RIGHT: Main content — own scroll */}
  <div className="flex-1 overflow-auto p-4 space-y-4">
    {/* People & Places (Locations, Contacts) */}
    {/* Standard Operating Procedures (SOP Notes — stays here) */}
    {/* Operations (Projects, Offers) */}
    {/* Financial (Credit Limit, Bank Accounts) */}
  </div>
</div>
```

SOP Notes section remains on the right side — it's categorized operational knowledge, separate from timeline activity.

### Wrapper Components

#### ProjectActivitySection

**File:** `packages/fms/src/modules/fms_projects/components/ProjectWizard/ProjectActivitySection.tsx`

```typescript
type Props = { projectId: string }
```

- `useQuery(['fms_project_activity', projectId, filter])` → `GET /api/fms_projects/projects/{projectId}/activity?filter={filter}`
- Comment post: `POST /api/fms_projects/projects/{projectId}/notes` (multipart when file attached)
- Invalidates activity query on successful post
- Renders `<ActivityPanel>` with wired props

#### ContractorActivitySection

**File:** `packages/fms/src/modules/contractors/components/ContractorActivitySection.tsx`

```typescript
type Props = { contractorId: string }
```

- `useQuery(['contractor_activity', contractorId, filter])` → `GET /api/contractors/contractors/{contractorId}/activity?filter={filter}`
- Comment post: `POST /api/contractors/comments` (multipart when file attached)
- Invalidates activity query on successful post
- Renders `<ActivityPanel>` with wired props

## Configuration

No new environment variables or feature flags required.

**ACL features (existing):**
- `fms_projects.view` — read project activity
- `fms_projects.edit` — post comments on projects
- `contractors.view` — read contractor activity
- `contractors.edit` — post comments on contractors

## Implementation Sequence

### Phase 1: Shared Infrastructure

1. Create `packages/fms/src/lib/activity/types.ts` — `ActivityEntry`, `ActivityFilter` types
2. Create `packages/fms/src/lib/activity/utils.ts` — avatar color helper, file size formatter
3. Create `packages/fms/src/lib/activity/components/ActivityAvatar.tsx`
4. Create `packages/fms/src/lib/activity/components/ActivityItem.tsx`
5. Create `packages/fms/src/lib/activity/components/CommentComposer.tsx`
6. Create `packages/fms/src/lib/activity/components/ActivityPanel.tsx`

### Phase 2: FMS Project Activity (CHAME-54)

1. Add `attachmentId` to `FmsProjectNote` entity
2. Run `yarn db:generate` + `yarn db:migrate`
3. Update `POST /api/.../notes` to support multipart file upload
4. Create `GET /api/.../activity` aggregation endpoint
5. Create `ProjectActivitySection.tsx` wrapper
6. Update project detail page layout (two-column + remove notes section)
7. Remove `notesTableRef` from navigation chain

### Phase 3: FMS Contractor Activity (CHAME-55)

1. Add `ContractorComment` entity + validators
2. Run `yarn db:generate` + `yarn db:migrate`
3. Create `POST/GET/PUT/DELETE /api/contractors/comments` CRUD
4. Create `GET /api/contractors/contractors/{id}/activity` aggregation endpoint
5. Create `ContractorActivitySection.tsx` wrapper
6. Update contractor detail page layout (two-column)

### Phase 4: Verification

1. `yarn build:packages && yarn generate` passes
2. Both activity panels render with correct data
3. Comments with attachments work end-to-end
4. Tab filtering works correctly
5. Sticky scroll behavior works (left panel fixed, right scrolls)

## Risks & Impact Review

#### In-memory sort of multi-source activity entries
- **Scenario**: A project with thousands of cargo events across many containers could cause slow API response
- **Severity**: Medium
- **Affected area**: `GET /api/.../activity` endpoints
- **Mitigation**: Cap cargo events to most recent 200 per project. Typical projects have <100 containers with <50 events each. Add `LIMIT` to each source query.
- **Residual risk**: Very large projects may not show oldest tracking events. Acceptable for V1.

#### No real-time updates
- **Scenario**: User A posts a comment but User B doesn't see it until page reload
- **Severity**: Low
- **Affected area**: Activity panel UI
- **Mitigation**: React Query `staleTime` of 30s provides near-real-time. Could add `refetchInterval` of 60s later.
- **Residual risk**: Acceptable for V1. SSE/websocket push is a future enhancement.

#### Attachment orphaning on failed comment creation
- **Scenario**: File is uploaded to storage but comment creation fails — orphaned file in storage
- **Severity**: Low
- **Affected area**: File storage
- **Mitigation**: Upload file and create comment in the same API handler. If comment persistence fails, the file is stored but unreferenced. A periodic cleanup job could purge orphaned attachments. For V1, orphaned files are acceptable (storage is cheap).
- **Residual risk**: Minor storage waste. Acceptable.

#### Cross-tenant data isolation
- **Scenario**: Activity API returns entries from a different tenant
- **Severity**: Critical
- **Affected area**: All activity endpoints
- **Mitigation**: All queries filter by `organizationId` and `tenantId` using the same `buildScopeFilters` helper used by existing routes. The pattern is established and proven.
- **Residual risk**: None — standard scoping pattern.

#### ContractorComment vs ContractorSopComment confusion
- **Scenario**: Developers confuse the two comment systems
- **Severity**: Low
- **Affected area**: Code maintainability
- **Mitigation**: Clear naming (SopComment = categorized operational notes, Comment = freeform timeline). Different tables, different APIs, different UI locations.
- **Residual risk**: None.

#### Field change tracking dependency on ActionLog
- **Scenario**: Contractor update commands don't currently write ActionLog entries, so "Field Updated" entries are empty
- **Severity**: Medium
- **Affected area**: Contractor activity "Changes" tab
- **Mitigation**: Verify if contractor commands use `buildLog()`. If not, add it. The audit_logs module infrastructure already exists.
- **Residual risk**: Retroactive — historical changes before this feature ships won't appear. Acceptable.

#### Migration backward compatibility
- **Scenario**: Adding nullable columns and new tables
- **Severity**: Low
- **Affected area**: Database schema
- **Mitigation**: All changes are additive — nullable column on existing table, new table. Zero downtime. No data backfill needed.
- **Residual risk**: None.

## Changelog

### 2026-03-11
- Initial specification covering shared activity infrastructure, FMS Project Activity Panel (CHAME-54), and FMS Contractor Activity Panel (CHAME-55)
