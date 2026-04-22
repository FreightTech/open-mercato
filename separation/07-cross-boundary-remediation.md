# SPEC — Cross-Boundary Remediations (E1–E5) + Pre-existing Bug Fixes

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owned by** | The Tier 2 bulk-migration in [`MIGRATION-TO-FREIGHTTECH.md`](./MIGRATION-TO-FREIGHTTECH.md). This spec is the detail sheet for remediations that ride inside MIGRATION's Phase 1 steps. |
| **Not a standalone phase** | Earlier drafts treated these remediations as a "Phase 0" sweep inside `packages/fms` in the fork. Under the bulk-migration strategy the fork stays untouched; each remediation lands in the Tier 2 package where it naturally belongs, as part of that package's Step 1.x PR. |

## Purpose

Five cross-boundary entanglements in today's `@open-mercato/fms` would break the target topology if moved verbatim. Two pre-existing bugs in `fms_invoicing` are reachable while we are already editing those files. This spec enumerates all seven items, their location in the Tier 2 migration timeline, and the acceptance checks.

**Where each remediation runs** (MIGRATION Step 1.x numbering):

| Item | Lands in | Package it touches |
|---|---|---|
| E1 — drop `@ManyToOne(() => Rfq/Offer)` on `Project` | Step 1.4 | `@freighttech/projects` |
| E2 — move `convertCurrency` + `ExchangeRateSnapshot` | Step 1.1 | `@freighttech/logistics` (origin); also touches `@freighttech/offers` + `@freighttech/projects` callsites in 1.3 + 1.4 |
| E3 — keep `rfq_board` → `offers` coupling tight; push shared enums to logistics | Step 1.1 (types move) + Step 1.3 (enforce boundary) | `@freighttech/logistics` + `@freighttech/offers` |
| E4 — replace `contractors → FmsProject` hard import with data-engine query | Step 1.2 (contractors sub-step) | `@freighttech/contractors` |
| E5 — decouple `freight_documents` from `Project`/`Product`/`Contractor`/`SeaContainer`/`ProjectLine`; move event payload types to logistics | Step 1.1 (payload types) + Step 1.5 (service rewrites) | `@freighttech/logistics` + `@freighttech/freight-documents` |
| Bug fix #1 — `fmsFmsInvoicingService` broken `container.resolve()` | Step 1.6 | `@freighttech/invoicing` |
| Bug fix #2 — duplicate `invoicing.invoice.approved` emit | Step 1.6 | `@freighttech/invoicing` |

## Acceptance gate (checked at end of MIGRATION Step 1.8)

- `yarn typecheck && yarn test && yarn test:integration` green inside `../fms/`.
- `yarn db:generate && yarn db:migrate` against a fresh DB succeeds and produces the renamed schema.
- `rg -n "Fms[A-Z]" ../fms/packages/(logistics|facilities|products|contractors|teams|offers|projects|invoicing|freight-documents)/src/` returns zero.
- `rg -n "fms_(offers|projects|files|invoicing|locations|products|tasks_board|teams|documents)\b" ../fms/packages/(logistics|facilities|products|contractors|teams|offers|projects|invoicing|freight-documents)/src/` returns zero.

---

## the Step 1.x package PR — Cross-boundary remediations

Five entanglements, enumerated as E1–E5 (plus two pre-existing bug fixes, not counted as "entanglements" but landed alongside).

| # | Summary | Why it's a blocker |
|---|---|---|
| E1 | Drop `@ManyToOne` ORM-typed back-refs on `Project` → `Rfq`/`Offer` | Would force `@freighttech/projects` to import `@freighttech/offers` entity classes to compile. |
| E2 | Move `convertCurrency` + `ExchangeRateSnapshot` to shared leaf | Circular source dep between offers and projects. |
| E3 | Ensure `rfq_board` only couples to `offers` | `rfq_board` ships inside `@freighttech/offers` post-split; leaks to other packages forbidden. |
| E4 | Replace `contractors → Project` hard import with data-engine query | Would make `@freighttech/contractors` depend on `@freighttech/projects`. |
| E5 | Decouple `freight_documents` from `Project` / `Product` / `Contractor` / `SeaContainer` / `ProjectLine` imports; move event payload types to `@freighttech/logistics` | Would force `@freighttech/freight-documents` to depend on four other domain packages and create a subscriber-side reverse dep cycle (projects subscribes to freight-documents events). |

### §1 — E1: Detype the `projects → offers` ORM back-refs

**Today (pre-rename):**

```ts
// packages/fms/src/modules/fms_projects/data/entities.ts
import { FmsRfq, FmsOffer } from '../../fms_offers/data/entities'

@ManyToOne(() => FmsRfq, { fieldName: 'rfq_id', nullable: true })
rfq?: FmsRfq | null

@ManyToOne(() => FmsOffer, { fieldName: 'offer_id', nullable: true })
offer?: FmsOffer | null
```

**Fix:**

```ts
@Property({ fieldName: 'rfq_id', type: 'uuid', nullable: true })
rfqId?: string | null

@Property({ fieldName: 'offer_id', type: 'uuid', nullable: true })
offerId?: string | null

// removed imports + @ManyToOne decorators
```

Audit callsites with `project.rfq.*` / `project.offer.*` and replace with explicit `em.findOne(…)` or data-engine queries. After Step 1.4 the entity-type string is `offers:rfq` / `offers:offer` (colon + snake_case per `01` §1.5) and the column names stay as `rfq_id` / `offer_id`.

**Acceptance:**
- `rg "@ManyToOne\(\(\) => (Fms)?(Rfq|Offer)" ../fms/packages/projects/src/` returns zero.
- `yarn db:generate` produces a schema that has `rfq_id` / `offer_id` as plain UUID columns (no FK-constraint migration required if the fresh schema matches).

### §2 — E2: Move `convertCurrency` + `ExchangeRateSnapshot`

Both currently sit at the `offers` ↔ `projects` boundary. `projects/lib/financials.ts` owns `convertCurrency` and imports `ExchangeRateSnapshot` from offers; offers imports `convertCurrency` back at **four callsites** (earlier drafts listed three):

- `fms_offers/lib/offer-pdf.service.tsx:10`
- `fms_offers/commands/offer-operations.ts:11`
- `fms_offers/api/offers/route.ts:10`  ← missed in earlier drafts
- `fms_offers/api/offers/[id]/email-preview/route.ts:8`

**Destination under the bulk-migration strategy:** `../fms/packages/logistics/src/lib/financials/` — code goes directly to `@freighttech/logistics` in Step 1.1. No in-fork intermediate staging (earlier drafts described a `packages/fms/src/lib/financials/` staging step; retired under the bulk-move approach).

```
../fms/packages/logistics/src/lib/financials/
├── index.ts
├── convert-currency.ts   # convertCurrency, formatCurrency, ProjectLineForFinancials
├── summary.ts            # FinancialSummary + computeSummary
└── exchange-rate.ts      # ExchangeRateSnapshot
```

Update every callsite in both offers (Step 1.3) and projects (Step 1.4) to import from `@freighttech/logistics/lib/financials`.

### §3 — E3: Tighten the offers ↔ rfq_board boundary

Step 1.3 keeps `rfq_board` in the same package as `offers` — they ship together in `@freighttech/offers`. E3's job inside Step 1.3:

- Verify no NEW cross-imports leak from `rfq_board` into anything other than `offers`.
- Move shared enums/types directly into `@freighttech/logistics/src/types/` during Step 1.1 (no in-fork staging).

```
../fms/packages/logistics/src/types/
├── charges.ts         # CHARGE_UNITS (was FMS_CHARGE_UNITS), ChargeUnit, ChargeRow
├── rfq-enums.ts       # RfqStatus, DIRECTIONS, TRANSPORT_MODES
└── index.ts
```

Defer the offer→project event-boundary conversion to Step 1.3 (it's a feature change best batched with offers extraction).

### §4 — E4: Cut the `contractors → Project` hard import (+ flip `FmsLocation` to the new package path)

Detail in [05c-pkg-contractors.md](./05c-pkg-contractors.md) §4. `contractors/api/contractors/[id]/activity/route.ts` crosses TWO module boundaries today — lines 17 + 18:

```ts
// before (pre-rename — TWO cross-boundary imports)
import { FmsProject } from '../../../fms_projects/data/entities'   // line 17
import { FmsLocation } from '../../../fms_locations/data/entities' // line 18 — earlier drafts missed this
const projects = await em.find(FmsProject, { /* … */ })
const facilities = await em.find(FmsLocation, { contractorId })

// after (post-rename + E4)
// - FmsProject → data-engine query (contractors cannot depend on projects)
// - FmsLocation → direct import from @freighttech/facilities (already a declared dep for Google Places editor; class is now Facility)
import { Facility } from '@freighttech/facilities/modules/facilities/data/entities'
const dataEngine = container.resolve<DataEngine>('dataEngine')
const projects = await dataEngine.query({
  entityType: 'projects:project',
  fields: ['id', 'referenceNumber', 'status', 'createdAt'],
  where: { clientId: contractorId /* + other party FKs */ },
  limit: 50,
})
const facilities = await em.find(Facility, { contractorId })
```

**Acceptance:**
- `rg -n "import .*\b(FmsProject|Project)\b" ../fms/packages/contractors/src/` returns zero (no ORM-typed import of the projects-side entity class).
- `rg -n "em\.find(One)?\s*\(\s*(FmsProject|Project)\b" ../fms/packages/contractors/src/` returns zero.
- `rg -n "import .*\bFmsLocation\b" ../fms/packages/contractors/src/` returns zero (`Facility` from `@freighttech/facilities` replaces it).
- `rg -n "from '\.\./\.\./\.\./fms_locations/" ../fms/packages/contractors/src/` returns zero.
- Contractor activity tab still lists projects AND facilities linked to the contractor.

---

### §5 — E5: Decouple `freight_documents` from other domain modules

### The problem

Seven files in `fms_documents` today hard-import entities from in-scope modules:

| File | Imported symbol | Source module |
|---|---|---|
| `services/contractor-matcher.service.ts` | `Contractor` | contractors |
| `services/charge-code-matcher.service.ts` | `FmsProduct` | fms_products |
| `services/project-matcher.service.ts` | `FmsProject`, `FmsSeaContainer` | fms_projects |
| `commands/invoice-shared.ts` | `FmsProduct` | fms_products |
| `commands/invoices.ts` | `FmsProduct` | fms_products |
| `commands/cost-allocations.ts` | `FmsProjectLine` | fms_projects |
| `data/entities.ts` | `FmsProduct` (type reference) | fms_products |

Leaving these in place would mean `@freighttech/freight-documents` compile-depends on four other domain packages. Combined with the fact that `projects`, `folders`, `invoicing` subscribe to `freight_documents.*` events, the reverse-dep risk (subscribers wanting payload types) creates a cycle.

### The fix — two parts

**Part 1 — Replace entity imports with data-engine queries.** Same pattern as E4.

```ts
// before (services/project-matcher.service.ts)
import { FmsProject, FmsSeaContainer } from '../../fms_projects/data/entities'
const projects = await em.find(FmsProject, { /* … */ })

// after
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
const dataEngine = container.resolve<DataEngine>('dataEngine')
const rows = await dataEngine.query({
  entityType: 'projects:project',
  fields: ['id', 'referenceNumber', 'status', 'clientId'],
  where: { /* … */ },
  limit: 50,
})
```

Apply to all seven files. Entity-type targets:
- `Contractor` → `'contractors:contractor'`
- `FmsProduct` → `'products:product'`
- `FmsProject` → `'projects:project'`
- `FmsProjectLine` → `'projects:project_line'`
- `FmsSeaContainer` → `'projects:sea_container'`

**Part 2 — Move event payload types to `@freighttech/logistics`.** Currently the payload shapes for `fms_documents.document.processed` / `fms_documents.invoice.*` live inside `fms_documents/events.ts`. Move the TypeScript interfaces (not the event declarations themselves — those stay in the emitter module) to:

```
../fms/packages/logistics/src/types/freight-document-events.ts
  (created directly in Step 1.1; no in-fork staging under the bulk-migration strategy)
```

Subscribers in `folders`, `invoicing`, `projects` then import payload types from `@freighttech/logistics/types/freight-document-events` — no dep on `@freighttech/freight-documents`.

### Scope

- **Files to change**: the seven listed above + `events.ts` payload type relocation.
- **Services renamed**: none at this step — E5 is a decoupling, not a rename. The rename of `freight_documents` identifiers happens in the Step 1.x package PR.

### Acceptance

- `rg -n "from '@freighttech/(products|projects|contractors)'" ../fms/packages/freight-documents/src/` returns zero (no source-level import from sibling packages).
- `rg -n "import .*\b(FmsProduct|Product|FmsProject|Project|FmsProjectLine|ProjectLine|FmsSeaContainer|SeaContainer|Contractor)\b" ../fms/packages/freight-documents/src/` returns zero.
- Document upload → OCR → invoice matching → project matching → cost allocation pipeline still produces the expected records (now via data-engine queries for cross-module reads).
- Payload-type interfaces live in `@freighttech/logistics/types/freight-document-events`; subscribers in `folders`/`invoicing`/`projects` import from there.

### Why this needs to ride inside Step 1.5 (not deferred)

Landing E5 in the Step 1.x package PR keeps the refactor mechanical and reviewable before the package move. Deferring to Step 1.7 would mix two concerns (decoupling + package move), and the broken dep graph would have to be kept in working order via temporary shims — not worth the cost.

---

## the Step 1.x package PR — The rename sweep

Apply the master rename tables from [01-split-overview.md](./01-split-overview.md) §1 to every file inside `packages/fms/src/modules/` (in-scope modules only).

### Ordered sub-tasks

**1. Rename module folders** (inside `packages/fms/src/modules/`):

```
fms_locations/ → facilities/
fms_products/  → products/
fms_offers/    → offers/
tasks_board/   → rfq_board/
fms_projects/  → projects/
fms_files/     → folders/
fms_invoicing/ → invoicing/
fms_teams/     → teams/
fms_documents/ → freight_documents/
(contractors stays)
```

**2. Update `index.ts` metadata in each module** to the new module id:

```ts
// packages/fms/src/modules/offers/index.ts
export const metadata = { name: 'offers', /* … */ }  // field is `name`, not `id`
```

**3. Rename entity classes** per §1.3 of the overview:

- Entity `@Entity({ tableName: '…' })` decorators get the new table names (`rfqs`, `offers`, `projects`, etc.).
- Every TypeScript class rename applies.
- Every TypeScript import of the old class name gets updated.
- Every populate-clause / `em.find(OldClass, …)` callsite rewritten.

**4. Rename DB tables** per §1.4:

- Column renames where natural: `origin_location_id` → `origin_facility_id` etc.
- **Rename `@Index({ name: 'fms_…' })` literals** per §1.4.1 — these string literals live on entity `@Index` decorators and do NOT follow the `@Entity({ tableName })` rename automatically. **88 literals across 6 files** need rewriting (`fms_projects_*_idx` → `projects_*_idx`, `fms_rfqs_*_idx` → `rfqs_*_idx`, etc.). Grep audit: `rg "@Index\(\{\s*name:\s*'fms_" ../fms/packages/{projects,offers,invoicing,freight-documents,teams}/src/` returns zero after the sweep. Acceptance applied separately from the entity class rename because the literal form doesn't match `Fms[A-Z]` grep.
- **Wipe the migration directory AND the MikroORM snapshot.** Delete both `migrations/Migration*.ts` and `migrations/.snapshot-open-mercato.json` for each renamed module. The `.snapshot-open-mercato.json` is MikroORM's "last-known schema" file that `yarn db:generate` diffs against — if it survives the migration wipe, the next `db:generate` diffs against the OLD fms-prefixed schema and emits a destructive `DROP fms_*` + `CREATE new_name` migration chain. Verified: **9 `.snapshot-open-mercato.json` files** reference `fms_*` literals today — seven in the renamed set (`fms_products`, `fms_projects`, `fms_files`, `fms_teams`, `fms_locations`, `fms_offers`, `fms_documents`) that must be wiped + regenerated, plus two in `@freighttech/templates` (`pdf_templates` / `email_templates`) that **stay as-is** since the templates bundle preserves internal module ids and table names. Grep audit pre-wipe: `rg -l "fms_" ../fms/packages/*/src/modules/*/migrations/.snapshot-open-mercato.json` — then delete; post-wipe that grep returns zero; then `yarn db:generate` regenerates both the migration file and the snapshot.
- Run `yarn db:generate` on a fresh DB. Since data is disposable, emit a greenfield migration under `migrations/` for each module with the new table names. The regenerated snapshot reflects the new schema.

**5. Rename entity-type strings** per §1.5:

```ts
// search.ts
export const searchConfig = {
  entities: [
    { entityType: 'projects:project', /* … */ },
    { entityType: 'projects:project_line', /* … */ },
    // …
  ],
}
```

Also updates every `dataEngine.query({ entityType: '…' })` / `dataEngine.findOne({ entityType: '…' })` callsite.

**6. Rename event IDs** per §1.6:

- `events.ts` declarations flipped (including `fms_documents.*` → `freight_documents.*`).
- Every `emit(…)` callsite updated.
- Every `subscribers/*.ts` `metadata.event` updated.
- Subscribers in `folders`, `invoicing`, `projects` switch from `fms_documents.*` to `freight_documents.*` event IDs AND update their payload-type imports to `@freighttech/logistics/types/freight-document-events` (created by E5).

**7. Rename DI keys** per §1.7:

- `di.ts` registration keys updated (`fmsInvoicingService` → `invoicingService`, `fmsSchemaRegistry` → `schemaRegistry`, `fmsDocumentDetector` → `documentDetector`, `fmsTransportationExtractor` → `transportationExtractor`, `fmsMistralOcrService` → `mistralOcrService`, etc.).
- Every `container.resolve('…')` callsite switched.

**8. Populate Tier 2's `../fms/apps/web/src/modules.ts`** with the new module ids pointing at the new `@freighttech/*` packages. This file is **created fresh in Tier 2** during Step 1.8 (the apps/web wire-up step) — it's not an in-fork edit. The fork's `apps/mercato/src/modules.ts` stays untouched during Phase 1 and gets cleaned (fms entries deleted outright) in Phase 2.

Example Tier 2 `modules.ts` entries:

```ts
// ../fms/apps/web/src/modules.ts
export const enabledModules: ModuleEntry[] = [
  // ... platform modules consumed via @open-mercato/* peer deps ...
  { id: 'facilities', from: '@freighttech/facilities' },
  { id: 'products', from: '@freighttech/products' },
  { id: 'contractors', from: '@freighttech/contractors' },
  { id: 'teams', from: '@freighttech/teams' },
  { id: 'offers', from: '@freighttech/offers' },
  { id: 'rfq_board', from: '@freighttech/offers' },
  { id: 'projects', from: '@freighttech/projects' },
  { id: 'folders', from: '@freighttech/projects' },
  { id: 'invoicing', from: '@freighttech/invoicing' },
  { id: 'freight_documents', from: '@freighttech/freight-documents' },
  { id: 'shipment_tracking', from: '@freighttech/shipment-tracking' },
  { id: 'annotations', from: '@freighttech/annotations' },
  // ... plus as-is moves: ksef, airfreight-4rcargo (frc_* + air_cargo), transports, truck_loading, templates ...
]
```

If brand configuration files under `../fms/apps/web/src/brands/` reference module ids in `hiddenModules` / `hiddenGroups`, use the new ids from §1.2. The fork's `src/brands/` stays as-is during Phase 1.

**9. Update translations & i18n keys.** If i18n keys embed the old module id (e.g. `fms_offers.rfq.title`), rename them to match the new module id. Update every `useT()` / `resolveTranslations()` key reference.

**10. Update tests.** Two cases (see `01` §7 item 7 for the matrix):
- **Modules that have an `__integration__/` directory today** (`contractors`, `fms_documents`, `fms_files`, `fms_invoicing`, `fms_products`, `fms_projects`): rewrite existing suites with renamed event IDs, entity-type strings, DI keys, feature IDs, class imports. Test fixtures recreated from the rewritten setups (data is disposable).
- **Modules without `__integration__/` today** (`fms_offers`, `fms_locations`, `fms_teams`, `tasks_board`): adding integration coverage is optional during the migration. If deferred, the acceptance gate for that package is typecheck + build + manual CRUD smoke; full integration coverage follows in a later PR.
Unit tests (`lib/__tests__/`, `api/**/__tests__/`) move with the code and get string updates — applies to whichever modules have them.

**11. Rename command IDs.** Every `registerCommand({ id: 'fms_<x>.…' })` in `commands/*.ts` flipped to the new module id. Every `commandBus.execute('fms_<x>.…')` and `commandBus.canExecute('fms_<x>.…')` callsite rewritten. See §1.7 of [01-split-overview.md](./01-split-overview.md) for the mapping. Grep audit: `(registerCommand|commandBus\.execute|commandBus\.canExecute)\(['"\{]` must only surface new ids inside renamed modules.

**12. Rename feature IDs.** `acl.ts` + `setup.ts` updated per §1.9 of the overview. Grep audit: `'(fms_[a-z_]+|tasks_board)\.` must return zero matches inside renamed modules. `contractors.*` features stay as-is (module id unchanged; 10 features per current `contractors/acl.ts` — the illustrative feature lists elsewhere in the spec set are not exhaustive).

**13. Fix pre-existing `fms_invoicing` bugs (inline with the rename):**

- `fms_invoicing/api/invoices/import-from-sales/route.ts:42` and `api/invoices/import-from-document/route.ts:42` — replace `container.resolve('fmsFmsInvoicingService')` (non-existent key) with `container.resolve('invoicingService')`.
- `fms_invoicing/commands/invoices.ts` — **collapse the double emit onto the bridge emit.** Delete line 513's `emitFmsInvoicingEvent('invoice.approved', ...)` (declared emit, no subscribers — dead code). Keep line 525's `eventBus.emit('invoicing.invoice.approved', ...)` (bridge emit consumed by `@freighttech/ksef`'s `bridge-invoice-approved` subscriber at `packages/ksef/src/modules/ksef/subscribers/bridge-invoice-approved.ts:47`). Rewrite `events.ts` so `invoicing.invoice.approved`'s declared payload matches the bridge's (`{id, tenantId, organizationId, invoiceNumber, direction, sourceType, sourceModule, sourceTable, sourceLineItemsTable}`); flip the three payload values from `fms_invoicing`/`fms_invoicing_invoices`/`fms_invoicing_line_items` to `invoicing`/`invoices`/`invoice_line_items` to match the renamed tables.

**14. Update `fms_4rcargo` imports during its Step 1.7 move.** Actual breakage surface (verified: **23 files with 28 cross-package import statements**):

```
packages/fms_4rcargo/src/modules/frc_rfqs/api/rfqs/**         — imports FmsLocation
packages/fms_4rcargo/src/modules/frc_settings/lib/**          — imports FmsLocation + references email_templates paths
packages/fms_4rcargo/src/modules/frc_offers/api/**            — imports FmsLocation, Contractor, ContractorContact
packages/fms_4rcargo/src/modules/frc_offers/components/SendOfferDialog.tsx  — imports email_templates helpers
```

**Single-step rewrite in Step 1.7.** When `@freighttech/airfreight-4rcargo` moves to Tier 2, its imports are rewritten in the same PR against the already-landed renamed packages (facilities, contractors land in Step 1.2; templates in Step 1.7 itself — order sub-steps so templates lands first if airfreight depends on it):

- `@open-mercato/fms/modules/fms_locations/data/entities` → `@freighttech/facilities/modules/facilities/data/entities` (class is now `Facility`).
- `@open-mercato/fms/modules/contractors/data/entities` → `@freighttech/contractors/modules/contractors/data/entities` (classes unchanged: `Contractor`, `ContractorContact`, `ContractorAddress`).
- `@open-mercato/fms/modules/email_templates/lib/*` → `@freighttech/templates/modules/email_templates/lib/*`.

No shims in the fork. The fork's `packages/fms/` stays intact during Phase 1 but is not consumed by the Tier 2 `airfreight-4rcargo` after its move.

**15. Regenerate.** Run:

```bash
yarn generate
yarn db:generate
yarn db:migrate   # on a fresh DB (data is disposable per the relaxed BC policy)
yarn mercato configs cache structural --all-tenants
```

Clarification on the migration wipe: for every **renamed** module, delete the existing `migrations/` folder contents (they reference the old table names) and emit a greenfield migration. For modules whose schema is untouched and whose tables aren't renamed (none of the in-scope modules fall here, but the rule matters for out-of-scope modules like `transports`/`truck_loading`/`email_templates`/`pdf_templates`), **leave the existing migration history intact**.

### Guard rails added during the Step 1.x package PR

Add ESLint `no-restricted-syntax` rule rejecting class identifiers matching `/^Fms[A-Z]/` inside the renamed module folders. Prevents regressions from copy-paste.

Add a CI grep check:

```bash
# must return zero
rg -n "Fms" packages/fms/src/modules/(facilities|products|contractors|teams|offers|projects|folders|rfq_board|invoicing|freight_documents)/
rg -n "fms_(offers|projects|files|invoicing|locations|products|tasks_board|teams|documents)\b" packages/fms/src/modules/(facilities|products|contractors|teams|offers|projects|folders|rfq_board|invoicing|freight_documents)/
```

### Allow-listed `fms` mentions after the Step 1.x package PR

These remain and are expected:

- References to the `@open-mercato/fms` package name in `package.json` dep blocks during Phase 1 steps — the fork keeps it intact until Phase 2 deletes it.
- Internal class names inside the as-is-moved packages (`@freighttech/shipment-tracking`, `@freighttech/annotations`, `@freighttech/airfreight-4rcargo`, `@freighttech/transports`, `@freighttech/truck-loading`, `@freighttech/templates`) stay unchanged.
- `packages/fms_tracking/` is dropped in Phase 2 (not migrated) — any references to `@open-mercato/fms_tracking` in the fork are deleted along with the package.

---

## §5 — DI and events audit (sanity check only)

After the rename, run:

```bash
rg -n "container\.resolve\(['\"]" packages/fms/src/modules/(facilities|products|contractors|teams|offers|projects|folders|rfq_board|invoicing|freight_documents)/
rg -n "event:\s*['\"]" packages/fms/src/modules/(facilities|products|contractors|teams|offers|projects|folders|rfq_board|invoicing|freight_documents)/**/subscribers/**
```

Expected: DI resolves hit infrastructure keys (`em`, `dataEngine`, `storageDriver`) plus module-owned keys (`invoicingService`, `invoicingImportService`, `freightDocumentSchemaRegistry`, `documentDetector`, `transportationExtractor`, `mistralOcrService`, `pageImageService`). Subscribers reference the new `offers.*` / `projects.*` / `folders.*` / `invoicing.*` / `freight_documents.*` ids declared during the Step 1.x package PR, plus `shipment_tracking.*` events from `@freighttech/shipment-tracking` (moved from fork's `packages/shipment-tracking/` in Step 1.7).

If the grep surfaces anything unexpected, document the extra edge and decide whether it blocks a later phase.

---

## §6 — What the migration leaves behind

After the migration lands:

- Every in-scope module renamed to its new id; every entity class renamed; every DB table renamed; every event ID, entity-type string, and DI key renamed. Fresh DB reflects the new schema.
- E1: `projects/data/entities.ts` has plain UUID FKs for `rfq_id` / `offer_id`; no ORM-typed back-refs.
- E2: `packages/fms/src/lib/financials/` exists with `convertCurrency` + `ExchangeRateSnapshot` + `FinancialSummary`. Both offers and projects import from it.
- E3: `packages/fms/src/lib/types/` exists with `CHARGE_UNITS`, `ChargeRow`, `RfqStatus`, `DIRECTIONS`, `TRANSPORT_MODES`, `WizardItem`, etc.
- E4: `contractors/api/contractors/[id]/activity/route.ts` uses the data engine.
- E5: `freight_documents` has no source-level imports from `projects`, `products`, `contractors`; payload types live in `packages/fms/src/lib/types/freight-document-events.ts`.
- `offers/commands/conversion.ts` stops directly importing projects entities — rewritten in Step 1.3 to delegate via `commandBus.execute('projects.create_from_offer', …)`. The handler lives in `@freighttech/projects/commands/create-from-offer.ts` (registered in Step 1.4). Atomicity preserved; no compile-time dep `offers → projects`.
- `packages/fms` typechecks + builds + tests green.

Each Step 1.x PR proceeds as a focused file-move + package.json wiring + the associated remediation (E1–E5) where applicable.

---

## §7 — Risks specific to the remediations

| Risk | Mitigation |
|---|---|
| Rename sweep misses a string reference (event id, entity type, DI key, module id) | Single grep pattern per category from [01-split-overview.md](./01-split-overview.md) §1. CI check at the end of the Step 1.x package PR. |
| ORM `@ManyToOne` removal breaks callsites | Audit grep + replace with explicit fetches. Typecheck is the gate. |
| Tests rely on old event IDs / entity types / DI keys | Rewritten in the Step 1.x package PR. Fresh DB + fresh fixtures. |
| DB migration history retains old table names | Disposable — user has relaxed BC for data. Delete old migration files for the renamed modules and emit greenfield ones. |
| `projects:project` entity-type collides with other module | Verified: no `projects:*` namespace exists in core today. The new id owns the namespace. |
| Browser globals `File` + `Location` shadowed by imports | Resolved by domain-word renames: `FmsFile` → `Folder`, `FmsLocation` → `Facility`. |
| A later PR reintroduces an `fms`-prefixed class from copy-paste | ESLint `no-restricted-syntax` rule rejecting `/^Fms[A-Z]/` in renamed modules. |
| Nav/brand config references old module ids | Part of the §1–11 sweep — `src/brands/*.ts` updated in lockstep. |
