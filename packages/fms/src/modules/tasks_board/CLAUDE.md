# Tasks Board Module (`tasks_board`)

Kanban board for managing RFQ (Request for Quotation) lifecycle in the FMS. Cards represent real `FmsRfq` records; dragging between columns updates the RFQ status. Supports RFQ creation and offer creation directly from the board.

## Status

**Phase 2** — Connected to real `FmsRfq` data via REST API. RFQ CRUD, offer creation form, optimistic drag-and-drop with status persistence.

## Route

`/backend/tasks-board` — appears in the FMS sidebar group.

## File Structure

```
tasks_board/
├── backend/tasks-board/
│   ├── page.tsx            # 'use client' wrapper
│   └── page.meta.ts        # Nav metadata (pageOrder: 120, FMS group)
├── components/
│   ├── TaskBoardPage.tsx    # State orchestrator with React Query data fetching
│   ├── KanbanBoard.tsx      # DndContext + DragOverlay + onStatusChange callback
│   ├── KanbanColumn.tsx     # useDroppable + SortableContext per column
│   ├── KanbanCard.tsx       # useSortable draggable RFQ card with offer count
│   ├── TaskDetailSheet.tsx  # RFQ detail popup with action buttons
│   ├── RfqCreateDialog.tsx  # Dialog for creating new RFQs
│   ├── OfferCreationForm.tsx # Full offer creation: shipment details + calculation + charges
│   ├── ChipSelector.tsx     # Reusable chip-based option selector
│   ├── ChargesTable.tsx     # Editable charges/lines table with checkboxes
│   └── UserAvatar.tsx       # Initials-based avatar with tooltip
├── lib/
│   ├── types.ts             # RfqBoardCard, BoardColumn, ChipVariant, TaskAssignee
│   └── board-config.ts      # Column definitions, getTimeAgo(), deriveChip()
├── i18n/
│   ├── en.json, pl.json, de.json, es.json
├── acl.ts                   # tasks_board.view, tasks_board.manage
├── index.ts                 # Module metadata
└── CLAUDE.md                # This file
```

## API Endpoints (in `fms_offers` module)

| Endpoint | Methods | Purpose |
|----------|---------|---------|
| `/api/fms_offers/rfq` | GET, POST | List/create RFQs |
| `/api/fms_offers/rfq/[id]` | GET, PUT, DELETE | RFQ detail/update/delete |
| `/api/fms_offers/rfq/board` | GET | Board-optimized RFQ data with offer counts and assignee info |

## Data Model

Board cards map directly to `FmsRfq` entities with two Phase 2 fields:
- `status: FmsRfqStatus` — `incoming | in_progress | waiting_for_client | approved | declined` (determines board column)
- `assignedToId: string | null` — UUID reference to a user

## Architecture

### Data Flow

1. `TaskBoardPage` fetches from `/api/fms_offers/rfq/board` via React Query
2. API returns RFQ records enriched with offer counts, latest offer status, and assignee info
3. Client derives chip variants from offer state via `deriveChip()`
4. Drag-and-drop updates local state optimistically, then PATCHes the RFQ status

### Drag-and-Drop

Uses `@dnd-kit/core` + `@dnd-kit/sortable` (deps in `packages/fms/package.json`).

- **KanbanBoard** wraps everything in `DndContext` with `closestCorners` collision detection.
- On `onDragEnd`, calls `onStatusChange(taskId, newStatus)` which PUTs to `/api/fms_offers/rfq/[id]`.
- If the PUT fails, the board query is invalidated to revert to server state.

### RFQ Creation

`RfqCreateDialog` opens from the header "Create RFQ" button. Fields: title, company, contact, origin/destination, direction/transport/cargo chips, container count, context. POSTs to `/api/fms_offers/rfq`.

### Offer Creation

`OfferCreationForm` opens from the detail sheet "Create Offer" button. Three sections:

1. **Shipment Details** — Chip selectors for direction, transport mode, cargo type, containers (multi-select)
2. **Calculation** — Location selects using `SearchableSelect` from `fms_offers`
3. **Charges** — Editable table with product rows, checkboxes, buy/sell prices, computed margin

Submit flow: Create offer → update calculation → create enabled lines → transition RFQ to `in_progress`.

### Board Columns

| Column ID | Title | Color |
|-----------|-------|-------|
| `incoming` | Incoming RFQ | Indigo |
| `in_progress` | In Progress | Amber |
| `waiting_for_client` | Waiting for Client | Purple |
| `approved` | Approved | Emerald |
| `declined` | Declined | Red |

### Chip Derivation

Chips are derived from offer state:
- No offers → `New` (high/red)
- Has offers, latest accepted → `Accepted` (chance-high/green)
- Has offers, latest sent → `Offer sent` (chance-medium/amber)
- Has offers, latest declined → `Declined` (chance-low/red)
- Has offers, other → `N offer(s)` (medium/amber)

## Key Patterns

- `TooltipProvider` wraps the entire page.
- React Query with `['rfq-board']` query key; invalidated after mutations.
- `apiCall` from `@open-mercato/ui/backend/utils/apiCall` for all HTTP calls.
- `SearchableSelect` from `fms_offers` reused for location selects.
- All dialogs support `Cmd/Ctrl + Enter` submit and `Escape` cancel.

## Future Phases

- Phase 3: Filters, search, assignee management, and board configuration.
- Phase 4: Workflow integration — auto-create tasks from events.
