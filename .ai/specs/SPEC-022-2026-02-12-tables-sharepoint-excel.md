# SPEC-022: Tables Module — SharePoint Excel Integration (POC)

## Overview

The `tables` module (`packages/core/src/modules/tables/`) integrates with Microsoft SharePoint Excel files via Microsoft Graph API. Users can browse SharePoint sites, select Excel files and worksheets, save configurations as "table definitions," and view/edit worksheet data in the existing DynamicTable component with 2-way cell sync back to Excel.

**Scope:** Proof of concept — minimal but functional end-to-end flow.

**Key design decisions:**
- Single Azure AD connection per deployment via environment variables (no per-tenant OAuth)
- Client credentials flow (`ConfidentialClientApplication`) — app-level access, not delegated
- Cell-level write-back only (no row/column insertion or deletion)
- Silent data refetch after successful cell save (no polling or push notifications)
- DynamicTable with toolbar/search/filter/add-row/bottom-bar hidden (read/edit only)

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Backend Pages                            │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────────────┐  │
│  │ Tables List   │  │ Create Wizard  │  │ Table Viewer        │  │
│  │ (DataTable)   │  │ (4-step)       │  │ (DynamicTable+edit) │  │
│  └──────┬───────┘  └──────┬─────────┘  └──────────┬──────────┘  │
│         │                 │                        │             │
├─────────┼─────────────────┼────────────────────────┼─────────────┤
│         ▼                 ▼                        ▼             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      API Routes                          │   │
│  │  definitions/  browse/{sites,drives,files,worksheets}/   │   │
│  │  data/{read,write}/  status/                             │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                             │                                   │
│  ┌──────────────────────────┼───────────────────────────────┐   │
│  │                   Service Layer                          │   │
│  │  ┌─────────────────────┐ ┌─────────────────────────────┐ │   │
│  │  │ MicrosoftGraphSvc   │ │ SharePointExcelService      │ │   │
│  │  │ (MSAL + token)      │ │ (sites,drives,files,sheets) │ │   │
│  │  └──────────┬──────────┘ └──────────────┬──────────────┘ │   │
│  └─────────────┼───────────────────────────┼────────────────┘   │
│                │                           │                    │
│                ▼                           ▼                    │
│         ┌──────────────────────────────────────┐                │
│         │     Microsoft Graph API               │                │
│         │     (SharePoint + Excel endpoints)    │                │
│         └──────────────────────────────────────┘                │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  TableDefinition Entity (PostgreSQL, tenant-scoped)      │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

**Creating a table definition:**
```
User → Create Wizard (4 steps) → Browse SharePoint (sites → drives → files → worksheets) → Save TableDefinition to DB
```

**Viewing and editing data:**
```
User → Table Viewer → GET /api/tables/data/read → SharePointExcelService.readWorksheetData() → Graph API GET usedRange → DynamicTable render
User edits cell → CELL_EDIT_SAVE event → POST /api/tables/data/write → SharePointExcelService.writeCell() → Graph API PATCH cell → CELL_SAVE_SUCCESS → silent refetch
```

### Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@azure/msal-node` | ^2.x | Azure AD client credentials authentication |
| `@microsoft/microsoft-graph-client` | ^3.x | Microsoft Graph API SDK |

### DI Registrations

| Name | Type | Lifetime |
|------|------|----------|
| `microsoftGraphService` | `MicrosoftGraphService` | Singleton (MSAL caches tokens internally) |
| `sharePointExcelService` | `SharePointExcelService` | Scoped (receives `microsoftGraphService` via injection) |

## Data Models

### `TableDefinition` Entity

**Table:** `table_definitions`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | uuid | no | `gen_random_uuid()` | Primary key |
| `organization_id` | uuid | no | — | Tenant scope (FK) |
| `tenant_id` | uuid | no | — | Tenant scope (FK) |
| `name` | text | no | — | User-given display name |
| `site_id` | text | no | — | Microsoft Graph site ID |
| `drive_id` | text | no | — | Microsoft Graph drive ID |
| `item_id` | text | no | — | Microsoft Graph driveItem ID (.xlsx file) |
| `file_path` | text | yes | `null` | Human-readable relative path in drive |
| `worksheet_name` | text | no | — | Target worksheet name |
| `data_range` | text | yes | `null` | Specific Excel range (null = usedRange) |
| `column_config` | jsonb | yes | `null` | Column overrides: `{ [header]: { title?, type?, width?, readOnly? } }` |
| `has_header_row` | boolean | no | `true` | Whether first data row contains headers |
| `is_active` | boolean | no | `true` | Active flag |
| `created_at` | timestamptz | no | `now()` | Creation timestamp |
| `updated_at` | timestamptz | no | `now()` | Last update timestamp |
| `deleted_at` | timestamptz | yes | `null` | Soft delete timestamp |

**Indexes:**
- `table_definitions_org_tenant_idx` on (`organization_id`, `tenant_id`)

**Relationships:** None (standalone entity). References Microsoft Graph resource IDs (site, drive, item) — not FK-linked.

### Zod Validators (`data/validators.ts`)

| Schema | Fields | Used by |
|--------|--------|---------|
| `tableDefinitionCreateSchema` | name, siteId, driveId, itemId, filePath?, worksheetName, dataRange?, columnConfig?, hasHeaderRow? | POST `/api/tables/definitions` |
| `tableDefinitionUpdateSchema` | id, name?, worksheetName?, dataRange?, columnConfig?, hasHeaderRow? | PUT `/api/tables/definitions` |
| `tableDefinitionListSchema` | page?, pageSize?, search?, sort? | GET `/api/tables/definitions` |
| `tableDefinitionDeleteSchema` | id | DELETE `/api/tables/definitions` |
| `cellWriteSchema` | definitionId, row (int>=0), col (int>=0), value (string\|number\|boolean\|null) | POST `/api/tables/data/write` |

## API Contracts

All routes export `metadata` (with `requireAuth` and `requireFeatures`) and `openApi`.

### `GET /api/tables/status`

Check whether Azure AD environment variables are configured and Graph API is reachable.

**Auth:** `requireAuth: true`, `requireFeatures: ['tables.view']`

**Response:**
```json
{
  "configured": true,
  "connected": true,
  "message": "Microsoft Graph connection verified"
}
```
```json
{
  "configured": false,
  "connected": false,
  "message": "Azure AD credentials not configured. Set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET."
}
```

### `GET/POST/PUT/DELETE /api/tables/definitions`

CRUD for TableDefinition records. All operations scoped by `organizationId` + `tenantId`.

**Auth:** GET requires `tables.view`; POST/PUT/DELETE require `tables.manage`.

**GET** — List definitions
- Query: `?page=1&pageSize=20&search=term&sort=name:asc`
- Response: `{ items: TableDefinition[], total: number, page: number, pageSize: number }`
- Search: case-insensitive `ILIKE` on `name`

**POST** — Create definition
- Body: `tableDefinitionCreateSchema`
- Response: `{ ok: true, id: string }`

**PUT** — Update definition
- Body: `tableDefinitionUpdateSchema`
- Response: `{ ok: true }`

**DELETE** — Soft delete
- Body: `{ id: string }`
- Response: `{ ok: true }`

### Browse Endpoints

All browse routes require `requireAuth: true`, `requireFeatures: ['tables.manage']`.

#### `GET /api/tables/browse/sites`

**Query:** `search` (optional; defaults to `*` wildcard to list all accessible sites)

**Response:**
```json
{
  "items": [
    { "id": "site-graph-id", "name": "MySite", "displayName": "My Site", "webUrl": "https://tenant.sharepoint.com/sites/MySite" }
  ]
}
```

**Implementation note:** Uses raw Graph URL `/sites?search=<query>` because the SDK's `.query()` chainable method returned empty results during development.

#### `GET /api/tables/browse/drives`

**Query:** `siteId` (required)

**Response:**
```json
{
  "items": [
    { "id": "drive-id", "name": "Documents", "driveType": "documentLibrary", "webUrl": "..." }
  ]
}
```

#### `GET /api/tables/browse/files`

**Query:** `driveId` (required), `path` (optional folder path, default `/`)

**Response:**
```json
{
  "items": [
    { "id": "item-id", "name": "Report.xlsx", "webUrl": "...", "size": 12345, "isFolder": false, "lastModifiedDateTime": "2026-02-12T10:00:00Z" }
  ]
}
```

Filters to `.xlsx` files and folders only.

#### `GET /api/tables/browse/worksheets`

**Query:** `driveId` (required), `itemId` (required)

**Response:**
```json
{
  "items": [
    { "id": "worksheet-id", "name": "Sheet1", "position": 0 }
  ]
}
```

### Data Endpoints

#### `GET /api/tables/data/read`

**Auth:** `requireAuth: true`, `requireFeatures: ['tables.view']`

**Query:** `definitionId` (required), `page` (default 1), `pageSize` (default 100, max 100)

**Response:**
```json
{
  "headers": ["Name", "Quantity", "Price"],
  "rows": [["Widget A", 100, 9.99], ["Widget B", 50, 19.99]],
  "total": 2,
  "page": 1,
  "pageSize": 100,
  "totalPages": 1,
  "definition": {
    "id": "uuid",
    "name": "My Table",
    "worksheetName": "Sheet1",
    "hasHeaderRow": true,
    "columnConfig": null
  }
}
```

Fetches the TableDefinition (tenant-scoped), then calls `SharePointExcelService.readWorksheetData()` which reads the worksheet's `usedRange` via Graph API.

#### `POST /api/tables/data/write`

**Auth:** `requireAuth: true`, `requireFeatures: ['tables.manage']`

**Body:**
```json
{
  "definitionId": "uuid",
  "row": 0,
  "col": 1,
  "value": "new value"
}
```

**Response:** `{ "ok": true }`

Converts 0-indexed (row, col) to Excel cell address (e.g., `B2` if hasHeaderRow), then PATCHes via Graph API.

### Cell Address Mapping

The `SharePointExcelService.writeCell()` method converts coordinates:
- Column index → Excel letter via `columnIndexToLetter()` (0→A, 1→B, 25→Z, 26→AA)
- Row index → Excel row number, offset by +2 if `hasHeaderRow` (row 0 in UI = row 2 in Excel)
- Result: cell address like `B3`
- Graph API call: `PATCH /drives/{driveId}/items/{itemId}/workbook/worksheets/{name}/range(address='{cellAddress}')`

## UI/UX

### Navigation

- **Group:** "Tables" (`tables.nav.group`)
- **Icon:** `Table2` (Lucide)
- **Priority:** 65

### Pages

#### Tables List — `/backend/tables`

| Feature | Detail |
|---------|--------|
| Component | Custom page with manual DataTable-like layout |
| Columns | Name (link), File path, Worksheet, Created date |
| Search | Case-insensitive name search |
| Pagination | 20 rows per page |
| Actions | Delete (with confirmation), row click opens viewer |
| Buttons | "Create New Table" (top right), Refresh |
| Requires | `tables.view` |

#### Create Wizard — `/backend/tables/create`

Client-side multi-step state machine (single page component).

| Step | Title | API Call | User Action |
|------|-------|----------|-------------|
| 1 | Select Site | `GET /api/tables/browse/sites` (auto-loads on mount) | Click a site |
| 2 | Browse Files | `GET /api/tables/browse/drives`, `GET /api/tables/browse/files` | Navigate folders, click .xlsx file |
| 3 | Select Worksheet | `GET /api/tables/browse/worksheets` | Click a worksheet |
| 4 | Configure & Save | `POST /api/tables/definitions` | Enter name, toggle hasHeaderRow, submit |

Features:
- Step indicator badges showing current progress
- Back/Next navigation between steps
- Breadcrumb navigation within file browser
- Directory-up navigation (click parent path segment)
- Loading spinners per step
- Error handling with flash messages
- `Cmd/Ctrl+Enter` to save, `Escape` to cancel
- Redirects to viewer page on success

**Note:** Search was removed from Step 1 — all accessible sites load automatically via `*` wildcard search. SharePoint search indexing can have delays for newly created sites.

#### Table Viewer — `/backend/tables/[id]`

| Feature | Detail |
|---------|--------|
| Component | DynamicTable (Handsontable-based) |
| Data source | `GET /api/tables/data/read?definitionId={id}&page=1&pageSize=100` |
| Columns | Auto-generated from Excel headers + optional columnConfig overrides |
| Cell editing | Inline edit → `POST /api/tables/data/write` → Graph API PATCH → silent refetch |
| Event pattern | `CELL_EDIT_SAVE` → `CELL_SAVE_START` → API call → `CELL_SAVE_SUCCESS` or `CELL_SAVE_ERROR` |
| Refresh | Manual button + automatic silent refetch after successful save |
| Height | `calc(100vh - 250px)` |
| UI config | Toolbar, search, filter, add-row, and bottom bar all hidden |
| Requires | `tables.view` |

**Critical implementation detail:** The page receives `params` as a component prop (`{ params }: { params?: { id?: string } }`), NOT via Next.js `useParams()` hook. This is required by the project's custom routing system.

**DynamicTable event handling pattern** (follows `OfferLinesTable.tsx`):
```typescript
useEventHandlers({
  [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
    dispatch(tableRef.current, TableEvents.CELL_SAVE_START, { rowIndex, colIndex })
    // POST to write API
    // On success: dispatch CELL_SAVE_SUCCESS + loadData(true) for silent refetch
    // On error: flash message + dispatch CELL_SAVE_ERROR
  },
}, tableRef)
```

## Services

### `MicrosoftGraphService` — `services/microsoftGraphService.ts`

Manages Azure AD authentication via MSAL client credentials flow.

| Method | Returns | Purpose |
|--------|---------|---------|
| `getConfig()` | `{ tenantId, clientId, clientSecret }` | Reads from env vars |
| `isConfigured()` | `boolean` | Checks all 3 env vars present |
| `getAccessToken()` | `string` | Acquires token via `acquireTokenByClientCredential` with scope `https://graph.microsoft.com/.default` |
| `getClient()` | `Client` | Returns Graph SDK `Client` with bearer token auth provider |
| `verifyConnection()` | `boolean` | Tests connectivity via `GET /sites/root` |

Token caching is handled internally by MSAL's `ConfidentialClientApplication`.

### `SharePointExcelService` — `services/sharePointExcelService.ts`

Wraps Microsoft Graph API calls for SharePoint and Excel operations.

| Method | Signature | Graph API Call |
|--------|-----------|----------------|
| `listSites` | `(search?: string) → SharePointSite[]` | `GET /sites?search={query}` |
| `listDrives` | `(siteId: string) → SharePointDrive[]` | `GET /sites/{siteId}/drives` |
| `listItems` | `(driveId: string, path?: string) → SharePointItem[]` | `GET /drives/{driveId}/root/children` or `/root:/{path}:/children` |
| `listWorksheets` | `(driveId: string, itemId: string) → WorksheetInfo[]` | `GET /drives/{driveId}/items/{itemId}/workbook/worksheets` |
| `readWorksheetData` | `(driveId, itemId, worksheet, range?, page, pageSize, hasHeaderRow) → WorksheetData` | `GET .../worksheets/{name}/usedRange` or `.../range(address='{range}')` |
| `writeCell` | `(driveId, itemId, worksheet, row, col, value, hasHeaderRow) → void` | `PATCH .../worksheets/{name}/range(address='{cell}')` with `{ values: [[value]] }` |

**Helper:** `columnIndexToLetter(index: number): string` — converts 0-based column index to Excel column letter (0→A, 25→Z, 26→AA, etc.)

**Type interfaces:**
- `SharePointSite`: `{ id, name, displayName, webUrl }`
- `SharePointDrive`: `{ id, name, driveType, webUrl }`
- `SharePointItem`: `{ id, name, webUrl, size, isFolder, lastModifiedDateTime }`
- `WorksheetInfo`: `{ id, name, position }`
- `WorksheetData`: `{ headers: string[], rows: (string|number|boolean|null)[][], totalRows: number }`

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AZURE_TENANT_ID` | Yes | Azure AD directory (tenant) ID |
| `AZURE_CLIENT_ID` | Yes | Azure AD app registration client ID |
| `AZURE_CLIENT_SECRET` | Yes | Azure AD app registration client secret |
| `SHAREPOINT_SITE_URL` | No | Default SharePoint site URL (currently unused in POC) |

### Azure AD App Registration Requirements

The app registration must have the following **Application permissions** (not Delegated) with admin consent granted:

| Permission | Type | Purpose |
|------------|------|---------|
| `Sites.Read.All` | Application | Browse SharePoint sites |
| `Files.ReadWrite.All` | Application | Read/write Excel files |
| `Sites.ReadWrite.All` | Application | Access site document libraries |

### ACL Features

| Feature | Description | Default Roles |
|---------|-------------|---------------|
| `tables.view` | View table definitions and read Excel data | admin, employee |
| `tables.manage` | Create/update/delete definitions, browse SharePoint, write cells | admin |

### Module Events

| Event ID | Label | Category |
|----------|-------|----------|
| `tables.definition.created` | Table Definition Created | crud |
| `tables.definition.updated` | Table Definition Updated | crud |
| `tables.definition.deleted` | Table Definition Deleted | crud |

### Custom Entity

- Type: `tables:table_definition`
- `showInSidebar: false`
- Empty field definitions (no custom fields in POC)

## File Structure

```
packages/core/src/modules/tables/
├── index.ts                              # ModuleInfo metadata
├── acl.ts                                # features: tables.view, tables.manage
├── setup.ts                              # defaultRoleFeatures
├── di.ts                                 # Register services (microsoftGraphService, sharePointExcelService)
├── events.ts                             # CRUD events for definitions
├── ce.ts                                 # Custom entity: tables:table_definition
├── data/
│   ├── entities.ts                       # TableDefinition MikroORM entity
│   └── validators.ts                     # Zod schemas for all operations
├── services/
│   ├── microsoftGraphService.ts          # MSAL token + Graph client
│   └── sharePointExcelService.ts         # SharePoint/Excel API operations
├── api/
│   ├── openapi.ts                        # OpenAPI factory
│   ├── status/
│   │   └── route.ts                      # GET: connection status check
│   ├── definitions/
│   │   └── route.ts                      # CRUD: TableDefinition
│   ├── browse/
│   │   ├── sites/
│   │   │   └── route.ts                  # GET: list sites (wildcard search)
│   │   ├── drives/
│   │   │   └── route.ts                  # GET: list drives
│   │   ├── files/
│   │   │   └── route.ts                  # GET: list files/folders
│   │   └── worksheets/
│   │       └── route.ts                  # GET: list worksheets
│   └── data/
│       ├── read/
│       │   └── route.ts                  # GET: read Excel data
│       └── write/
│           └── route.ts                  # POST: write cell
├── backend/
│   └── tables/
│       ├── page.tsx                      # Definitions list
│       ├── page.meta.ts                  # Nav: "Tables" group, Table2 icon, priority 65
│       ├── create/
│       │   ├── page.tsx                  # 4-step creation wizard
│       │   └── page.meta.ts             # navHidden: true
│       └── [id]/
│           ├── page.tsx                  # Table viewer (DynamicTable + cell editing)
│           └── page.meta.ts             # navHidden: true
├── migrations/
│   └── Migration20260212214856.ts        # Initial migration
└── i18n/
    └── en.json                           # English translations (58 keys)
```

**Total: 28 files**

## Risks & Impact Review

### POC Scope — Accepted Limitations

This is a proof of concept. The following are known limitations explicitly excluded from POC scope:

- No retry/exponential backoff for Graph API calls
- No multi-user conflict resolution (last write wins)
- No workbook session management for concurrent reads
- No formula-aware editing (writes raw values)
- No row/column insertion or deletion
- No search indexing, notifications, analytics, vector search, or widgets
- No commands/undo support for cell writes (writes go directly to Excel)
- No cache layer (all reads hit Graph API directly)

#### Graph API Unavailability
- **Scenario**: Microsoft Graph API is down, returns 5xx, or token acquisition fails
- **Severity**: Medium
- **Affected area**: All browse and data endpoints; UI shows loading or error states
- **Mitigation**: API routes catch errors and return clear messages; UI renders `ErrorMessage` component with actionable text; status endpoint allows pre-flight checks
- **Residual risk**: No retry logic — transient failures require manual refresh. Acceptable for POC.

#### Tenant Data Isolation — TableDefinition
- **Scenario**: User from Tenant A accesses TableDefinition belonging to Tenant B
- **Severity**: Critical
- **Affected area**: All definition CRUD and data read/write endpoints
- **Mitigation**: Every database query filters by `organization_id` AND `tenant_id` from the authenticated request scope. The data read/write endpoints fetch the definition first and verify tenant match before calling Graph API.
- **Residual risk**: None — standard tenant scoping applied consistently.

#### Shared Azure AD Credentials
- **Scenario**: All tenants share the same Azure AD app credentials (env vars). One tenant's admin could potentially craft requests to browse sites they shouldn't access.
- **Severity**: High
- **Affected area**: Browse endpoints (sites, drives, files)
- **Mitigation**: The Azure AD app has `Sites.Read.All` which grants access to all sites the app registration can see. There is no per-tenant SharePoint permission boundary in POC scope.
- **Residual risk**: Accepted for POC. Production should implement per-tenant OAuth or restrict which sites are accessible via configuration.

#### Excel Data Not Validated
- **Scenario**: User writes invalid data to Excel (wrong type in a typed column, value exceeding limits)
- **Severity**: Low
- **Affected area**: Write endpoint; Excel file integrity
- **Mitigation**: Zod validates the write payload structure. Excel itself may reject invalid values via Graph API error response, which is surfaced to the UI.
- **Residual risk**: No application-level type enforcement beyond what Excel provides.

#### Large Worksheet Performance
- **Scenario**: Worksheet has thousands of rows; `usedRange` returns massive payload from Graph API
- **Severity**: Medium
- **Affected area**: Data read endpoint; browser memory
- **Mitigation**: Server-side pagination (max 100 rows per page). The `readWorksheetData` method slices the full `usedRange` response.
- **Residual risk**: The Graph API call still fetches the full `usedRange` before slicing. For very large worksheets (>10K rows), this could be slow or hit Graph API response limits. Acceptable for POC.

#### Cell Address Mapping Error
- **Scenario**: Off-by-one error in row/col to Excel address conversion causes writes to wrong cell
- **Severity**: High
- **Affected area**: Write endpoint; data integrity in Excel file
- **Mitigation**: `columnIndexToLetter()` is tested. Row offset logic accounts for `hasHeaderRow` flag (+2 for header row, +1 without). Silent refetch after save allows user to verify the change landed correctly.
- **Residual risk**: Edge cases with very wide sheets (>702 columns / 3-letter columns) not tested.

#### Migration Safety
- **Scenario**: Migration creates new table `table_definitions` — no existing data affected
- **Severity**: Low
- **Affected area**: Database schema only
- **Mitigation**: Additive migration (CREATE TABLE). Includes `down()` method for rollback. No existing tables modified.
- **Residual risk**: None.

## Known Implementation Notes

### Graph SDK Quirk
The Microsoft Graph JavaScript SDK's `.query()` chainable method with `.select()` and `.top()` returned empty results for site search during development. The workaround is using raw URL strings: `client.api('/sites?search=...')`. This is a known behavior with the SDK's query parameter handling for the `/sites` endpoint.

### Custom Routing System
This project uses a custom routing system where dynamic route pages receive `params` as a React component prop, NOT via Next.js `useParams()` hook. The table viewer page MUST use `({ params }: { params?: { id?: string } })` — using `useParams()` will result in `undefined` and a perpetual loading state.

### SharePoint Search Indexing Delay
Newly created SharePoint sites may not appear in Graph API search results immediately. The site search index can take minutes to hours to update. The UI works around this by loading all sites via `*` wildcard search on mount, which returns all accessible sites regardless of search index state.

## Changelog

### 2026-02-12
- Initial specification for POC
- Full implementation completed: entity, services, 8 API routes, 3 backend pages, i18n
- Discovered and documented Graph SDK `.query()` quirk — using raw URL strings
- Discovered and documented custom routing `params` prop requirement
- Removed SharePoint site search UI — replaced with auto-load all sites
- Added silent data refetch after successful cell save
- Removed auto-polling (rejected by stakeholder)
