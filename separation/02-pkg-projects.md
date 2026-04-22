# SPEC — `@freighttech/projects`

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Phase** | Migration Phase 1, Step 1.4 (see [`MIGRATION-TO-FREIGHTTECH.md`](./MIGRATION-TO-FREIGHTTECH.md)) |
| **Modules hosted** | `projects` (formerly `fms_projects`), `folders` (formerly `fms_files`) |
| **Depends on** | `@freighttech/logistics`, `@freighttech/facilities`, `@freighttech/products`, `@freighttech/contractors`, `@freighttech/offers` (compile-time, UUID FKs only) |

## 1. What's inside

```
packages/projects/
├── package.json
├── build.mjs, watch.mjs
├── tsconfig.json
├── src/
│   └── modules/
│       ├── projects/                  # formerly fms_projects
│       │   ├── acl.ts                 # feature ids: projects.view, projects.manage, … (illustrative list — actual count TBD from original fms_projects/acl.ts)
│       │   ├── api/
│       │   ├── backend/
│       │   ├── cli.ts
│       │   ├── commands/              # command ids: projects.<entity>.<action> (was fms_projects.*)
│       │   ├── components/
│       │   ├── data/
│       │   │   ├── entities.ts        # Project, ProjectLine, ProjectLeg, SeaContainer, AirUnit, RoadUnit, ProjectCargo, ProjectInvoice, ProjectNote
│       │   │   └── types.ts
│       │   ├── hooks/
│       │   ├── i18n/
│       │   ├── index.ts               # metadata.name === 'projects' (field name is `name`, not `id`)
│       │   ├── commands/              # create-from-offer.ts (NEW in Step 1.3 — registers 'projects.create_from_offer' handler invoked by offers/conversion.ts via commandBus; sync, in-process)
│       │   ├── lib/                   # booking-data-extractor, carrier-lookup, seeds, financials (deprecated shim after E2)
│       │   ├── migrations/
│       │   ├── search.ts              # entity types: projects:project, projects:project_line, … (colon + snake_case)
│       │   ├── setup.ts
│       │   ├── subscribers/           # auto-create-from-booking (listens freight_documents.document.processed), shipment-updated-sync (listens shipment_tracking.shipment.*)
│       │   ├── widgets/
│       │   └── workflows/
│       │   (no events.ts — projects emits no declared events today)
│       └── folders/                   # formerly fms_files
│           ├── acl.ts                 # feature ids: folders.*
│           ├── api/
│           ├── backend/
│           ├── components/
│           ├── data/
│           │   └── entities.ts        # Folder, FolderUnit, FolderLeg, FolderNote, FolderUnitLeg, FolderLine, FolderInvoice
│           ├── hooks/
│           ├── index.ts               # metadata.name === 'folders'
│           ├── lib/                   # facility-sync (renamed from location-sync), tracking-integration
│           ├── migrations/
│           ├── search.ts              # entity types: folders:folder, folders:folder_unit, …
│           ├── setup.ts
│           └── subscribers/           # auto-link-to-folder, create-invoice-from-document, auto-create-leg-from-booking (all listen freight_documents.document.processed), shipment-updated-sync, shipment-deleted-sync (both listen shipment_tracking.shipment.*)
│           (no events.ts — folders emits no declared events today)
└── generated/
```

DB tables after rename: `projects`, `project_lines`, `project_legs`, `sea_containers`, `air_units`, `road_units`, `project_cargos`, `project_invoices`, `project_notes`, `folders`, `folder_units`, `folder_legs`, `folder_notes`, `folder_unit_legs`, `folder_lines`, `folder_invoices`.

Column renames inside these tables (the ones where the old name becomes misleading):

| Table | Old column | New column |
|---|---|---|
| `projects` | `origin_location_id`, `destination_location_id`, `place_of_loading_id`, `place_of_discharge_id` | `origin_facility_id`, `destination_facility_id`, `place_of_loading_facility_id`, `place_of_discharge_facility_id` |
| `folders` (any FK to `fms_locations`) | `*_location_id` | `*_facility_id` |

FK columns referencing still-unrenamed external tables (`rfq_id`, `offer_id`, `carrier_id`, `contractor_id`, `client_id`, `notify_party_id`, `controlling_agent_id`, `controlling_customer_id`, `sending_agent_id`, `receiving_agent_id`) stay as-is.

## 2. Why the two modules belong together

- `Folder` (case-file) always scopes to a project — `Folder.project_id` FK.
- Shared booking-auto-creation pipeline: `folders/subscribers/auto-create-leg-from-booking.ts` imports from `projects/lib/booking-data-extractor` + `projects/lib/carrier-lookup`.
- Shared i18n bundles, shared activity-panel integration.
- Splitting would force a mutual workspace dep and lock-step releases.

## 3. External dependencies

```jsonc
{
  "name": "@freighttech/projects",
  "dependencies": {
    "@freighttech/contractors": "workspace:*",
    "@freighttech/facilities": "workspace:*",
    "@freighttech/logistics": "workspace:*",
    "@freighttech/offers": "workspace:*",
    "@freighttech/products": "workspace:*",
    "@freighttech/shipment-tracking": "workspace:*",
    "@freighttech/annotations": "workspace:*",
    "@dnd-kit/core": "...",
    "@dnd-kit/sortable": "...",
    "handlebars": "...",
    "uuid": "...",
    "xlsx": "..."
  },
  "peerDependencies": {
    "@mikro-orm/postgresql": "^6.5.9",
    "@open-mercato/core": "^0.5.0",
    "@open-mercato/shared": "^0.5.0",
    "@open-mercato/ui": "^0.5.0",
    "react": "^19.0.0"
  }
}
```

`@freighttech/shipment-tracking` is a Tier 2 workspace sibling — declared as a regular dependency (not peer). Only `@open-mercato/*` platform packages are peerDeps.

Drops vs the monolith: LLM stack, PDF stack (offers+documents), 3D stack (`truck_loading`), KSeF XML.

## 4. Cross-module boundary to `offers` (E1 remediation)

Post-remediation `Project` entity:

```ts
// packages/projects/src/modules/projects/data/entities.ts (excerpt)
@Entity({ tableName: 'projects' })
export class Project {
  // ...
  @Property({ fieldName: 'rfq_id', type: 'uuid', nullable: true })
  rfqId?: string | null

  @Property({ fieldName: 'offer_id', type: 'uuid', nullable: true })
  offerId?: string | null

  // Removed: @ManyToOne(() => Rfq, …) and @ManyToOne(() => Offer, …)
}
```

Consumers fetch the `Rfq` / `Offer` by id when needed:

```ts
import { Offer } from '@freighttech/offers/modules/offers/data/entities'
const offer = project.offerId ? await em.findOne(Offer, project.offerId) : null
```

Or via the data engine:

```ts
const rows = await dataEngine.query({
  entityType: 'offers:offer',          // colon + snake_case per §1.5 of the overview
  fields: ['id', 'subject', 'status'],
  where: { id: project.offerId },
})
```

## 5. New command handler introduced in Step 1.3

`packages/projects/src/modules/projects/commands/create-from-offer.ts` — registers command id `projects.create_from_offer`. Receives `{offerId, tenantId, organizationId}`; runs the project-creation logic that previously lived inline in `fms_offers/commands/conversion.ts`. Synchronous — completes inside the caller's transaction. Invoked by `@freighttech/offers/commands/conversion.ts` via `commandBus.execute(...)`, which is how we break the old source-level dep from offers into projects without introducing an eventual-consistency window.

```ts
// packages/projects/src/modules/projects/commands/create-from-offer.ts
import { registerCommand } from '@open-mercato/shared/lib/commands'

registerCommand({
  id: 'projects.create_from_offer',
  handler: async (input: { offerId: string; tenantId: string; organizationId: string }, ctx) => {
    // Read offer via data-engine (runtime entityType string — no source-level dep on offers package).
    const offer = await ctx.dataEngine.findOne({
      entityType: 'offers:offer',
      fields: ['id', 'rfqId', 'subject', 'direction', 'lines', /* … */],
      where: { id: input.offerId, tenantId: input.tenantId, organizationId: input.organizationId },
    })
    if (!offer) throw new Error(`Offer ${input.offerId} not found`)

    // Create Project + children using projects' own entity classes — same logic as today's conversion.ts.
    const project = ctx.em.create(Project, { /* fields derived from offer */ })
    // … create ProjectLine[], ProjectLeg[], SeaContainer[] / AirUnit[] / RoadUnit[] per offer lines …
    await ctx.em.flush()
    return { projectId: project.id }
  },
})
```

No new subscriber. No `events.ts` change. No `persistent: true` retry machinery. The handler runs inside the same transaction as the caller's offer-accept command, so if anything fails, both offer-status change and project creation roll back together — identical semantics to today's monolithic `conversion.ts`.

## 6. Imports that change on the move

```ts
// before
import { logger } from '../../../../lib/logger'
import { convertCurrency } from '../lib/financials'
import { FmsLocation } from '../../fms_locations/data/entities'
import { Contractor } from '../../contractors/data/entities'

// after
import { logger } from '@freighttech/logistics/lib/logger'
import { convertCurrency } from '@freighttech/logistics/lib/financials'
import { Facility } from '@freighttech/facilities/modules/facilities/data/entities'
import { Contractor } from '@freighttech/contractors/modules/contractors/data/entities'
```

`folders` and `projects` subscribers listen to `freight_documents.document.processed` (renamed from `fms_documents.document.processed`). Payload types live in `@freighttech/logistics/types/freight-document-events.ts` (moved there during Phase 1 so consumers don't compile-depend on `@freighttech/freight-documents`). The `freight_documents` event emitter lives in `@freighttech/freight-documents` — see [08-pkg-freight-documents.md](./08-pkg-freight-documents.md).

## 7. `apps/web/src/modules.ts` diff (Step 1.4; in Tier 2)

```diff
- { id: 'fms_projects', from: '@open-mercato/fms' },
- { id: 'fms_files', from: '@open-mercato/fms' },
+ { id: 'projects', from: '@freighttech/projects' },
+ { id: 'folders', from: '@freighttech/projects' },
```

Note: these entries already reflect the Step 1.x module-id rename — `modules.ts` gets updated twice (once in Step 1.x keeping `from: '@open-mercato/fms'`, again in Step 1.4 flipping `from`).

## 8. Acceptance

- `yarn workspace @freighttech/projects typecheck && yarn workspace @freighttech/projects build` green.
- `rg -n "Fms(Project|File|Location|Offer|Rfq|Product|Carrier)\b" packages/projects/src/` returns zero.
- `rg -n "fms_(projects|files|offers|locations|products|invoicing|documents)\b" ../fms/packages/projects/src/` returns zero. (No `fms_documents.*` allow-list — event IDs are renamed to `freight_documents.*` in this step.)
- `rg -n "@ManyToOne\(\(\) => (Rfq|Offer)\b" packages/projects/` returns zero.
- Integration suites (originally `fms_projects/__integration__/`, `fms_files/__integration__/`) pass with updated selectors/strings.
- Project detail page renders including RFQ / offer summary fetched by id; folder (file) pages render; booking auto-creation fires; offer-accepted subscriber creates project.
