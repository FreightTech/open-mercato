# SPEC — FMS Package Split + Full Rename (Overview)

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Created** | 2026-04-21 |
| **Scope** | **Split** `@open-mercato/fms` into independently versioned packages AND **rename** every surface to drop `fms`/`Fms` AND **relocate** to Tier 2 `../fms/` under `@freighttech/*` scope. This overview owns the rename tables; `MIGRATION-TO-FREIGHTTECH.md` owns the sequencing + location plan. |
| **Related** | `MIGRATION-TO-FREIGHTTECH.md` (sequencing), `02-pkg-projects.md`, `03-pkg-offers.md`, `04-pkg-invoicing.md`, `05-master-data-overview.md`, `05a/b/c-*`, `06-pkg-logistics.md`, `07-cross-boundary-remediation.md`, `08-pkg-freight-documents.md`, `09-pkg-teams.md` |

## TLDR

Today `@open-mercato/fms` is **one monolithic package** in the fork containing ~14 modules. This migration **splits it into 9 renamed packages + moves 5 related as-is packages**, all relocated to a new Tier 2 monorepo at `../fms/` under `@freighttech/*` scope. Every `fms`/`Fms` identifier is stripped from the renamed set (packages, modules, classes, DB tables, entity-type strings, event IDs, DI keys, feature IDs, command IDs). The datamodel shape is preserved; DB data is not migrated — a greenfield `yarn db:migrate` produces the renamed schema.

Target Tier 2 layout (all `@freighttech/*`):

**Renamed domain packages** (split + full rename):

- `@freighttech/logistics` — no modules; common libs + types + event payload contracts.
- `@freighttech/facilities` — module `facilities` (from `fms_locations`; class `FmsLocation` → `Facility`).
- `@freighttech/products` — module `products` (from `fms_products`).
- `@freighttech/contractors` — module `contractors` (depends on `@freighttech/facilities`; module id + class names unchanged — already prefix-free).
- `@freighttech/teams` — module `teams` (from `fms_teams`).
- `@freighttech/offers` — modules `offers` + `rfq_board` (from `fms_offers` + `tasks_board`).
- `@freighttech/projects` — modules `projects` + `folders` (from `fms_projects` + `fms_files`; class `FmsFile` → `Folder`). Depends on `@freighttech/offers` at compile time only via plain UUID FKs.
- `@freighttech/invoicing` — module `invoicing` (from `fms_invoicing`). Depends on `@freighttech/ksef` as peer dep.
- `@freighttech/freight-documents` — module `freight_documents` (from `fms_documents`). `FmsDocument` → `FreightDocument` (avoids DOM global collision); `FmsInvoice` → `ExtractedInvoice` (disambiguates from `Invoice` in invoicing). No compile-time deps on other domain packages after E5 remediation.

**As-is moves** (no rename; internal class names and module ids preserved):

- `@freighttech/shipment-tracking` — from `packages/shipment-tracking/` (was a platform package; moves to Tier 2 because fms packages are its only consumers). Module id `shipment_tracking` preserved.
- `@freighttech/annotations` — from `packages/annotations/` (was an `@open-mercato/*`-scoped package; moves to Tier 2 because only 3 fms files import it). Module id `annotations` preserved.
- **`packages/fms_tracking/` — NOT migrated. Deleted outright in Phase 2** (zero in-repo consumers).
- `@freighttech/airfreight-4rcargo` — from `packages/fms_4rcargo/`. Imports of `FmsLocation`/`Contractor*` get rewritten to the new `@freighttech/facilities`/`@freighttech/contractors` package paths during the move.
- `@freighttech/ksef` — from `packages/ksef/`.
- `@freighttech/transports`, `@freighttech/truck-loading` — from `packages/fms/src/modules/{transports,truck_loading}/`.
- `@freighttech/templates` — bundles `packages/fms/src/modules/{email,pdf}_templates/`. Neither module uses `@open-mercato/templating` today (36 + 39 files each with their own entities/migrations/api/components), so bundling — not deletion — is the path.

**Fork post-migration**: zero fms-related packages. `packages/fms/`, `packages/fms_tracking/`, `packages/fms_4rcargo/`, `packages/ksef/`, `packages/shipment-tracking/`, `packages/annotations/` all deleted entirely in MIGRATION Phase 2 (fms_tracking is dropped outright; the rest moved to Tier 2). The fork retains platform packages only (`@open-mercato/{core,shared,ui,cli,events,queue,cache,logger,search,ai-assistant,onboarding,content,documents,messaging,templating,webhooks,scheduler,create-app,example,enterprise,gateway-stripe,sync-akeneo,checkout,vector}`). **No stub retained**.

---

## 0. Scale + strategy — this is a scripted rewrite, not a hand-edit

Verified string-literal scope across in-scope fms modules (not counting TypeScript identifiers / imports, which are handled by the class-level rename sweeps in §1.3):

| Surface | Count | Source of count |
|---|---|---|
| `i18n/*.json` `fms_*.` key references | ~1,560 | `rg -c '"fms_' packages/fms/src/modules/*/i18n/*.json` aggregated |
| `tasks_board.*` i18n keys (subset of above) | 992 | 248 keys × 4 locales (§1.9.5) |
| `api/*/route.ts` feature-guard string literals | ~351 | `rg -c "'fms_" packages/fms/src/modules/*/api/*/route.ts` aggregated |
| `commands/*.ts` registerCommand ids + translate keys | ~205 | `rg -c "'fms_" packages/fms/src/modules/*/commands/*.ts` aggregated |
| `page.meta.ts` requireFeatures + labelKeys | ~65 | `rg -c "'fms_" packages/fms/src/modules/**/page.meta.ts` aggregated |
| `requireFeatures(['fms_…'])` specifically | ~261 | `rg "requireFeatures.*fms_" packages/fms/` |
| `@Index({ name: 'fms_…' })` literals | 88 | §1.4.1 |
| `/backend/fms-…` URL path literals | ~126 | §1.9.1 |
| `/api/fms_…/` URL path literals | **652** | §1.9.1 |
| `entityType: 'fms_…:…'` + `E.fms_*.…` callsites | ~92 (raw + E.*) | §1.5 |

**Total: ~2,450+ individual string-literal edits** across the in-scope rename packages (up from the previous ~1,800 estimate — `/api/fms_*` was missed in earlier passes). This is a **scripted find-replace job**, not a per-file manual rewrite. `/api/fms_*` alone is the single largest literal surface after i18n.

**Strategy.** Each surface in §§1.2–1.9 below has a grep pattern identifying it. Translate each pattern into a `sed` / `perl -pi` / `ruby -i` one-liner (or a small Node script) that applies the rewrite atomically across all matching files. Run the greps BEFORE to count expected edits, run the script, then run the greps AFTER and assert zero matches in the renamed set. Keep the script in `../fms/scripts/rename-sweep.sh` (or similar) so re-runs are deterministic — the rename is too large to track by PR diff alone.

**Suggested rewrite order** (safest — each step's output is the next step's input):

1. **Module folder renames** (directory-level `git mv`, one commit per module).
2. **i18n key rewrites** — JSON-only, no TypeScript touched (`sed -i "s/\"tasks_board\\./\"rfq_board./g" …/i18n/*.json` + equivalents per module).
3. **Class + entity-type + table names** (the Fms* → * rewrite; touches `data/entities.ts` + every importer).
4. **`@Index` name literals** (§1.4.1 — 88 string-literal edits).
5. **Event ids** (§1.6 — 16 events across `events.ts` + every `emit()` + every subscriber `metadata.event`).
6. **DI keys** (§1.8 — 7 keys across `di.ts` + every `container.resolve()`).
7. **Feature ids + command ids** (§§1.7, 1.9 — touches `acl.ts`, `setup.ts`, every `registerCommand()`, every `requireFeatures()`).
8. **URL paths** (§1.9.1 — **778 literals total**: ~126 kebab-cased `/backend/fms-*` + 652 snake-cased `/api/fms_*/`. Two separate sed patterns — different casing rules). Includes Next.js folder renames that the filesystem router picks up automatically; the string-literal fetch/apiCall/router.push sites must be rewritten explicitly.
9. **Snapshot + migration wipe** (§1.4, see also NEW-29 below) — delete `migrations/` directory AND `migrations/.snapshot-open-mercato.json` for each renamed module; `yarn db:generate` on a fresh DB regenerates both.
10. **Grep verification** — every pattern in §§1.2–1.9 returns zero matches inside renamed packages (allow-list from §7 still applies to as-is carry-overs).

**Why list this explicitly**: the spec's table-per-surface format makes each rename look like a small change. In aggregate it's ~1,800 edits. Implementer who treats this as a file-by-file hand edit will burn days and will miss the literal forms that grep-derived scripts catch automatically. The §§1.2–1.9 rename tables are reference data for the scripts, not a checklist for manual edits.

---

## 1. The rename — every affected surface

### 1.1 Packages (split + rename + relocate)

Today there is **one** package: `@open-mercato/fms`, containing ~14 modules. This migration splits it into 9 renamed packages under `@freighttech/*` scope + relocates 4 sibling packages (`fms_4rcargo`, `ksef`, `shipment-tracking`, `annotations`) to the same scope. `packages/fms_tracking/` is dropped outright, not migrated. The "Before" column below shows the module or folder inside today's `@open-mercato/fms` package (or the adjacent sibling package), not a separate package name.

**Renamed packages (created from modules inside today's `@open-mercato/fms`):**

| Source (today) | Target Tier 2 package |
|---|---|
| `@open-mercato/fms` — `src/lib/{activity,inline-edit,logger,financials}/` + `src/hooks/` | `@freighttech/logistics` |
| `@open-mercato/fms` — module `fms_locations` | `@freighttech/facilities` |
| `@open-mercato/fms` — module `fms_products` | `@freighttech/products` |
| `@open-mercato/fms` — module `contractors` | `@freighttech/contractors` |
| `@open-mercato/fms` — module `fms_teams` | `@freighttech/teams` |
| `@open-mercato/fms` — modules `fms_offers` + `tasks_board` | `@freighttech/offers` |
| `@open-mercato/fms` — modules `fms_projects` + `fms_files` | `@freighttech/projects` |
| `@open-mercato/fms` — module `fms_invoicing` | `@freighttech/invoicing` |
| `@open-mercato/fms` — module `fms_documents` | `@freighttech/freight-documents` |

**As-is package relocations (no split, no internal rename):**

| Source (today) | Target Tier 2 package |
|---|---|
| `@open-mercato/ksef` (already its own package) | `@freighttech/ksef` |
| `@open-mercato/shipment-tracking` (was a platform package) | `@freighttech/shipment-tracking` |
| `@open-mercato/annotations` (was an @open-mercato-scoped package) | `@freighttech/annotations` |
| `@open-mercato/fms_tracking` (already its own package) | **n/a — deleted in Phase 2** (zero in-repo consumers) |
| `@open-mercato/fms_4rcargo` (already its own package) | `@freighttech/airfreight-4rcargo` |
| `@open-mercato/fms` — modules `transports`, `truck_loading` | `@freighttech/transports`, `@freighttech/truck-loading` (separate packages) |
| `@open-mercato/fms` — modules `email_templates`, `pdf_templates` | `@freighttech/templates` (bundled — neither imports from `@open-mercato/templating`, so deletion is not viable) |

**Platform packages that stay in the fork under `@open-mercato/*` scope**: `core`, `shared`, `ui`, `cli`, `events`, `queue`, `cache`, `logger`, `search`, `ai-assistant`, `onboarding`, `content`, `documents`, `messaging`, `templating`, `webhooks`, `scheduler`, `create-app`, `example`, `enterprise`, `gateway-stripe`, `sync-akeneo`, `checkout`, `vector`. (`shipment-tracking` and `annotations` used to be in this list but moved to Tier 2 as `@freighttech/shipment-tracking` + `@freighttech/annotations` — their only consumers are fms packages.) Consumed by Tier 2 packages as `peerDependencies` (pinned exact versions in `apps/web/package.json`).

### 1.2 Module IDs

| Before | After | Notes |
|---|---|---|
| `fms_locations` | `facilities` | matches the domain word |
| `fms_products` | `products` | |
| `contractors` | `contractors` | unchanged — already prefix-free |
| `fms_teams` | `teams` | |
| `fms_offers` | `offers` | |
| `tasks_board` | `rfq_board` | renamed to match what it actually is (the RFQ kanban) |
| `fms_projects` | `projects` | |
| `fms_files` | `folders` | `folder` = case-file / shipment folder |
| `fms_invoicing` | `invoicing` | |
| `fms_documents` | `freight_documents` | bare `documents` is taken by `@open-mercato/documents` |

### 1.3 Entity classes

**Domain-word renames (resolves browser-global collisions + cross-module Invoice collision):**

| Before | After | Reason |
|---|---|---|
| `FmsFile` | `Folder` | bare `File` collides with browser global `File` |
| `FmsFileUnit`, `FmsFileLeg`, `FmsFileNote`, `FmsFileUnitLeg`, `FmsFileLine`, `FmsFileInvoice` | `FolderUnit`, `FolderLeg`, `FolderNote`, `FolderUnitLeg`, `FolderLine`, `FolderInvoice` | follows `Folder` |
| `FmsLocation` | `Facility` | bare `Location` collides with browser global `Location` |
| `FmsDocument` | `FreightDocument` | bare `Document` collides with browser global `Document` |
| `FmsDocumentPage` | `FreightDocumentPage` | follows `FreightDocument` |
| `FmsInvoice` (in `fms_documents`) | `ExtractedInvoice` | disambiguates from `Invoice` in `invoicing` (`ExtractedInvoice` = OCR-parsed; `Invoice` = billing-issued) |
| `FmsInvoiceLineItem` (in `fms_documents`) | `ExtractedLineItem` | same |
| `FmsInvoiceCostAllocation` (in `fms_documents`) | `ExtractedCostAllocation` | same |
| `FmsInvoicePage` (in `fms_documents`) | `ExtractedInvoicePage` | same |

**Simple prefix strip:**

| Module | Before | After |
|---|---|---|
| `offers` | `FmsRfq`, `FmsRfqItem`, `FmsOffer`, `FmsOfferCalculation`, `FmsOfferLine`, `FmsNote` | `Rfq`, `RfqItem`, `Offer`, `OfferCalculation`, `OfferLine`, `Note` |
| `projects` | `FmsProject`, `FmsProjectLine`, `FmsProjectLeg`, `FmsSeaContainer`, `FmsAirUnit`, `FmsRoadUnit`, `FmsProjectCargo`, `FmsProjectInvoice`, `FmsProjectNote` | `Project`, `ProjectLine`, `ProjectLeg`, `SeaContainer`, `AirUnit`, `RoadUnit`, `ProjectCargo`, `ProjectInvoice`, `ProjectNote` |
| `products` | `FmsProduct`, `FmsCarrier` | `Product`, `Carrier` |
| `invoicing` | `FmsInvoicingInvoice`, `FmsInvoicingLineItem`, `FmsInvoicingSettings` | `Invoice`, `InvoiceLineItem`, `InvoicingSettings` |
| `invoicing` (services) | `FmsInvoiceImportService`, `FmsInvoicingService` | `InvoiceImportService`, `InvoicingService` |
| `teams` | `FmsTeam`, `FmsUserTeam`, `FmsUserContractorAssignment`, `FmsTeamContractorAssignment` | `Team`, `UserTeam`, `UserContractorAssignment`, `TeamContractorAssignment` |
| `contractors` | `Contractor`, `ContractorAddress`, `ContractorContact` | unchanged (already prefix-free) |

### 1.4 DB tables (plural, snake_case, per AGENTS.md)

| Module | Before | After |
|---|---|---|
| `projects` | `fms_projects`, `fms_project_lines`, `fms_project_legs`, `fms_sea_containers`, `fms_air_units`, `fms_road_units`, `fms_project_cargos`, `fms_project_invoices`, `fms_project_notes` | `projects`, `project_lines`, `project_legs`, `sea_containers`, `air_units`, `road_units`, `project_cargos`, `project_invoices`, `project_notes` |
| `folders` | `fms_files`, `fms_file_units`, `fms_file_legs`, `fms_file_notes`, `fms_file_unit_legs`, `fms_file_lines`, `fms_file_invoices` | `folders`, `folder_units`, `folder_legs`, `folder_notes`, `folder_unit_legs`, `folder_lines`, `folder_invoices` |
| `facilities` | `fms_locations` | `facilities` |
| `products` | `fms_products`, `fms_carriers` | `products`, `carriers` |
| `offers` | `fms_rfqs`, `fms_rfq_items`, `fms_offers`, `fms_offer_calculations`, `fms_offer_lines`, `fms_notes` | `rfqs`, `rfq_items`, `offers`, `offer_calculations`, `offer_lines`, `notes` |
| `invoicing` | `fms_invoicing_invoices`, `fms_invoicing_line_items`, `fms_invoicing_settings` | `invoices`, `invoice_line_items`, `invoicing_settings` |
| `teams` | `fms_teams`, `fms_user_teams`, `fms_user_contractor_assignments`, `fms_team_contractor_assignments` | `teams`, `user_teams`, `user_contractor_assignments`, `team_contractor_assignments` |
| `freight_documents` | `fms_documents`, `fms_document_pages`, `fms_invoices`, `fms_invoice_line_items`, `fms_invoice_cost_allocations`, `fms_invoice_pages` | `freight_documents`, `freight_document_pages`, `extracted_invoices`, `extracted_line_items`, `extracted_cost_allocations`, `extracted_invoice_pages` |

Column names stay as-is (snake_case, FK columns like `rfq_id`, `offer_id`, `client_id`, `contractor_id`, `origin_location_id`). **Exception**: FK columns that reference renamed tables can be renamed if natural (`origin_location_id` → `origin_facility_id`), but this is optional. The spec assumes column-name-level rename happens only where the new entity name makes the old column name misleading. Projects and folders: rename `origin_location_id` → `origin_facility_id`, `destination_location_id` → `destination_facility_id`, etc. Per-module specs call out the exact list.

### 1.4.1 `@Index({ name: 'fms_…' })` decorator literals

MikroORM `@Index` decorators on entities in the renamed set embed the OLD table name as a string literal in the index `name:` field. These are used to produce stable database-level index names during `yarn db:generate` — and they **do not follow the `@Entity({ tableName })` rename automatically**. Each literal must be rewritten to match the new table name.

**Verified count today: 88 literals needing rename across 6 entity files in the renamed set:**

| File | Count | Literal pattern today | Renames to |
|---|---|---|---|
| `fms_projects/data/entities.ts` | 27 | `fms_projects_*`, `fms_project_lines_*`, `fms_project_legs_*`, `fms_sea_containers_*`, `fms_air_units_*`, `fms_road_units_*`, `fms_project_cargos_*`, `fms_project_invoices_*`, `fms_project_notes_*` | `projects_*`, `project_lines_*`, `project_legs_*`, `sea_containers_*`, `air_units_*`, `road_units_*`, `project_cargos_*`, `project_invoices_*`, `project_notes_*` |
| `fms_files/data/entities.ts` | 18 | `fms_files_*`, `fms_file_units_*`, `fms_file_legs_*`, `fms_file_notes_*`, `fms_file_unit_legs_*`, `fms_file_lines_*`, `fms_file_invoices_*` | `folders_*`, `folder_units_*`, `folder_legs_*`, `folder_notes_*`, `folder_unit_legs_*`, `folder_lines_*`, `folder_invoices_*` |
| `fms_offers/data/entities.ts` | 12 | `fms_rfqs_*`, `fms_rfq_items_*`, `fms_offers_*`, `fms_offer_calculations_*`, `fms_offer_lines_*`, `fms_notes_*` | `rfqs_*`, `rfq_items_*`, `offers_*`, `offer_calculations_*`, `offer_lines_*`, `notes_*` |
| `fms_documents/data/entities.ts` | 11 | `fms_documents_*`, `fms_document_pages_*`, `fms_invoices_*`, `fms_invoice_line_items_*`, `fms_invoice_cost_allocations_*`, `fms_invoice_pages_*` | `freight_documents_*`, `freight_document_pages_*`, `extracted_invoices_*`, `extracted_line_items_*`, `extracted_cost_allocations_*`, `extracted_invoice_pages_*` |
| `fms_invoicing/data/entities.ts` | 10 | `fms_invoicing_invoices_*`, `fms_invoicing_line_items_*`, `fms_invoicing_settings_*` | `invoices_*`, `invoice_line_items_*`, `invoicing_settings_*` |
| `fms_teams/data/entities.ts` | 10 | `fms_teams_*`, `fms_user_teams_*`, `fms_user_contractor_assignments_*`, `fms_team_contractor_assignments_*` | `teams_*`, `user_teams_*`, `user_contractor_assignments_*`, `team_contractor_assignments_*` |

Example: `@Index({ name: 'fms_projects_org_tenant_idx', properties: ['organizationId', 'tenantId'] })` → `@Index({ name: 'projects_org_tenant_idx', properties: ['organizationId', 'tenantId'] })`. Each table rename fans out to multiple index name literals (composite idx, FK idx, status idx, …).

**Pre-existing drift — already unprefixed (no rename needed):** `contractors/data/entities.ts`, `fms_products/data/entities.ts`, `fms_locations/data/entities.ts` already use unprefixed `@Index` names (`contractors_org_tenant_idx`, `products_*`, `locations_*`). This inconsistency existed in the fork and carries forward unchanged — these files are out of the @Index-literal rename sweep.

**Out-of-scope carry-overs (2 literals — stay as `fms_*`):** `pdf_templates/data/entities.ts` (1 literal) and `email_templates/data/entities.ts` (1 literal) bundle into `@freighttech/templates` without internal rename per `01` §1.10, so these `@Index({ name: 'fms_*' })` literals stay. The acceptance grep in §8 is scoped to renamed packages only (`logistics|facilities|products|contractors|teams|offers|projects|invoicing|freight-documents|shipment-tracking|annotations`), explicitly excluding `templates`, so they won't surface as violations.

**Grep audit during Step 1.x:**

```bash
# Before rename, in the fork:
rg "@Index\(\{\s*name:\s*'fms_" packages/fms/src/modules/ -c
# Expected: 90 literals across 8 files (88 in renamed set + 2 in templates carry-over).

# After rename, in Tier 2 (renamed packages only):
rg "@Index\(\{\s*name:\s*'fms_" ../fms/packages/{projects,offers,invoicing,freight-documents,teams}/src/
# Expected: zero.
```

**Why this matters**: if a literal is missed, the next `yarn db:generate` emits a DDL containing both the renamed table and an index with the old name (`CREATE INDEX fms_projects_org_tenant_idx ON projects (...)`). Greenfield migration still succeeds — the DB doesn't care what the index is named — but the drift shows up forever in `db:generate` diffs and breaks any tooling that greps by index prefix. It's a silent hazard; only caught by the grep sweep.

### 1.5 Entity-type strings

Actual format (per `packages/fms/generated/entities.ids.generated.ts` and every callsite): **`<module_id>:<snake_case_entity>`** — colon-separated, snake_case on both sides. Earlier drafts of this spec used a dotted camelCase format; that was wrong. The rename keeps the colon+snake_case convention, just drops the `fms_` prefix.

| Before | After |
|---|---|
| `fms_projects:fms_project` | `projects:project` |
| `fms_projects:fms_project_line` | `projects:project_line` |
| `fms_projects:fms_project_leg`, `fms_projects:fms_sea_container`, `fms_projects:fms_air_unit`, `fms_projects:fms_road_unit`, `fms_projects:fms_project_cargo`, `fms_projects:fms_project_invoice`, `fms_projects:fms_project_note` | `projects:project_leg`, `projects:sea_container`, `projects:air_unit`, `projects:road_unit`, `projects:project_cargo`, `projects:project_invoice`, `projects:project_note` |
| `fms_files:fms_file`, `fms_files:fms_file_unit`, `fms_files:fms_file_leg`, `fms_files:fms_file_note`, `fms_files:fms_file_unit_leg`, `fms_files:fms_file_line`, `fms_files:fms_file_invoice` | `folders:folder`, `folders:folder_unit`, `folders:folder_leg`, `folders:folder_note`, `folders:folder_unit_leg`, `folders:folder_line`, `folders:folder_invoice` |
| `fms_offers:fms_rfq`, `fms_offers:fms_rfq_item`, `fms_offers:fms_offer`, `fms_offers:fms_offer_calculation`, `fms_offers:fms_offer_line`, `fms_offers:fms_note` | `offers:rfq`, `offers:rfq_item`, `offers:offer`, `offers:offer_calculation`, `offers:offer_line`, `offers:note` |
| `fms_locations:fms_location` | `facilities:facility` |
| `fms_products:fms_product`, `fms_products:fms_carrier` | `products:product`, `products:carrier` |
| `fms_invoicing:fms_invoicing_invoice`, `fms_invoicing:fms_invoicing_line_item`, `fms_invoicing:fms_invoicing_settings` | `invoicing:invoice`, `invoicing:invoice_line_item`, `invoicing:invoicing_settings` |
| `fms_teams:fms_team`, `fms_teams:fms_user_team`, `fms_teams:fms_user_contractor_assignment`, `fms_teams:fms_team_contractor_assignment` | `teams:team`, `teams:user_team`, `teams:user_contractor_assignment`, `teams:team_contractor_assignment` |
| `fms_documents:fms_document`, `fms_documents:fms_document_page` | `freight_documents:freight_document`, `freight_documents:freight_document_page` |
| `fms_documents:fms_invoice`, `fms_documents:fms_invoice_line_item`, `fms_documents:fms_invoice_cost_allocation`, `fms_documents:fms_invoice_page` | `freight_documents:extracted_invoice`, `freight_documents:extracted_line_item`, `freight_documents:extracted_cost_allocation`, `freight_documents:extracted_invoice_page` |
| `contractors:contractor`, `contractors:contractor_address`, `contractors:contractor_contact`, `contractors:contractor_role_type`, `contractors:contractor_payment_terms`, `contractors:contractor_bank_account`, `contractors:contractor_credit_limit`, `contractors:contractor_sop_comment`, `contractors:contractor_comment` | unchanged (module id already prefix-free) |

Every `dataEngine.query({ entityType: '…' })` / `dataEngine.findOne({ entityType: '…' })` callsite uses the new strings; `packages/fms/generated/entities.ids.generated.ts` regenerates from renamed `@Entity({ tableName })` decorators + module ids on the next `yarn generate`.

**`search.generated.ts` auto-regenerates.** Each renamed package's `search.generated.ts` is produced by the generator from that module's `search.ts` (which uses `E.<module>.<entity>` constants, not raw strings — the generator re-derives `entityId` from the renamed `E.*` identifiers). Implementer must run `yarn generate` inside `../fms/` after every batch of renames in Step 1.x before typecheck will pass — stale `search.generated.ts` referencing pre-rename `E.fms_*` paths is the most common post-rename typecheck breakage. No manual edits to `search.generated.ts` files — they regenerate in place.

**Two field names reference the same string.** Different sites use different field names but both point at the entity-type identifier:
- **`dataEngine.query({ entityType: '…' })`** — runtime data-engine queries use the field name `entityType`.
- **`searchConfig.entities[].entityId: E.<module>.<entity>`** — `search.ts` uses the field name `entityId`, and the value is an `E.*` generated-constant reference (not a raw string).

**Two callsite forms to audit separately.** A naive grep for raw string literals misses the E.* indirection:

1. **Raw string form** — `rg "(entityType|entityId):\s*['\"](fms_[a-z_]+):([a-z_]+)['\"]"` — catches `entityType: 'fms_projects:fms_project'` etc.
2. **Constant form** — `rg "E\.(fms_[a-z_]+)\.([a-z_]+)"` — catches `entityId: E.fms_projects.fms_project`. Verified **33 callsites today** use this form.

After the rename, the generated `E.*` constants regenerate automatically (new keys `E.projects.project`, `E.offers.rfq`, etc.). But callsites that reference the OLD keys (`E.fms_projects.fms_project`) need their key paths flipped to the new ones (`E.projects.project`). Neither grep pattern alone catches both — run both during Step 1.x's acceptance sweep.

### 1.6 Event IDs

Only two in-scope modules declare events today (`events.ts` present): `fms_invoicing` and `fms_documents`. The rest (`fms_offers`, `fms_projects`, `fms_files`, `fms_teams`) have **no `events.ts`** — their user-facing `module.entity.action` strings are **command IDs** (registered via `registerCommand`) and **feature IDs** (in `acl.ts`), not events. See §1.7 (commands) and §1.9 (features).

**`entity:` field in the renamed event declarations.** Today `fms_invoicing/events.ts` uses the DB table name (`entity: 'fms_invoicing_invoice'`). After the rename, use the **short logical name** matching the entity class (lowercased, no `_invoicing_` prefix): `entity: 'invoice'` for `invoicing.invoice.*`, `entity: 'document'` / `entity: 'extracted_invoice'` for `freight_documents.*`. This matches the convention used elsewhere (e.g. `entity: 'people'` in `customers`). The event-id's second segment (`.invoice.`, `.document.`) already carries the entity context; duplicating the module prefix in `entity:` adds no information and breaks workflow-trigger entity-filters that expect the short name. Acceptance grep: `rg "entity: 'fms_" ../fms/packages/` returns zero.

| Before | After | Declared in |
|---|---|---|
| `fms_invoicing.invoice.created`, `fms_invoicing.invoice.updated`, `fms_invoicing.invoice.deleted`, `fms_invoicing.invoice.approved`, `fms_invoicing.invoice.rejected`, `fms_invoicing.import.completed`, `fms_invoicing.import.failed` | `invoicing.invoice.created`, `invoicing.invoice.updated`, `invoicing.invoice.deleted`, `invoicing.invoice.approved`, `invoicing.invoice.rejected`, `invoicing.import.completed`, `invoicing.import.failed` | `fms_invoicing/events.ts` |
| `fms_documents.document.processed`, `fms_documents.document.identifiers_updated`, `fms_documents.document.created`, `fms_documents.document.updated`, `fms_documents.document.deleted`, `fms_documents.invoice.confirmed`, `fms_documents.invoice.created`, `fms_documents.invoice.updated`, `fms_documents.invoice.deleted` (**9 events total** — earlier drafts listed only 4) | `freight_documents.document.*`, `freight_documents.invoice.*` (all 9 renamed) | `fms_documents/events.ts` |

**Pre-existing bug to fix during Step 1.6 — decision locked in.** `fms_invoicing/commands/invoices.ts` emits `invoicing.invoice.approved` twice: the declared emit at line 513 (no subscribers, minimal payload) and the bridge emit at line 525 (KSeF subscriber, augmented payload with `sourceModule`/`sourceTable`/`sourceLineItemsTable`). Post-rename the two strings collide at the same id with different payloads. **Fix: keep the bridge emit (line 525), delete the declared emit (line 513); rewrite `events.ts` to declare `invoicing.invoice.approved` with the full bridge-payload type so the remaining emit stays typed.** See `04-pkg-invoicing.md` §2 for details.

**No new event.** `offers/commands/conversion.ts` stays atomic — same single-transaction semantics as today. Its direct cross-package imports get replaced with a `commandBus.execute('projects.create_from_offer', {offerId})` call so offers no longer compile-depends on projects. `@freighttech/projects` registers the `projects.create_from_offer` command handler (sync, in-process). No `offers/events.ts` created in Step 1.3; the offers module continues to have no declared events.

### 1.7 Command IDs

Registered via `registerCommand()` from `@open-mercato/shared/lib/commands`. Stable IDs — stored in undo/redo state, referenced by `commandBus.execute()` callsites and by CLI + integration tests.

| Module | Before | After |
|---|---|---|
| `fms_offers/commands/rfq.ts` | `fms_offers.rfq.create`, `fms_offers.rfq.update`, `fms_offers.rfq.delete` | `offers.rfq.create`, `offers.rfq.update`, `offers.rfq.delete` |
| `fms_offers/commands/offers.ts` | `fms_offers.offer.create`, `fms_offers.offer.update`, `fms_offers.offer.delete` | `offers.offer.create`, `offers.offer.update`, `offers.offer.delete` |
| `fms_offers/commands/offer-lines.ts` | `fms_offers.offer_lines.create`, `fms_offers.offer_lines.update`, `fms_offers.offer_lines.delete` (note: plural `offer_lines`) | `offers.offer_lines.create`, `offers.offer_lines.update`, `offers.offer_lines.delete` |
| `fms_offers/commands/offer-operations.ts` | `fms_offers.offer.send`, `fms_offers.offer.generate_pdf`, `fms_offers.offer.create_version` | `offers.offer.send`, `offers.offer.generate_pdf`, `offers.offer.create_version` |
| `fms_offers/commands/calculations.ts` | `fms_offers.calculation.*` | `offers.calculation.*` |
| `fms_offers/commands/conversion.ts` | `fms_offers.offers.convert_to_project` (singular outlier — `offers.` middle segment; command id doesn't match file name) | `offers.offers.convert_to_project` — kept. File is rewritten in Step 1.3 to delegate to `commandBus.execute('projects.create_from_offer', …)` instead of directly creating project entities (see §1.6 and `03-pkg-offers.md` §6). |
| **New command in `@freighttech/projects`** (Step 1.3) | n/a — did not exist | `projects.create_from_offer` — receives `{offerId}`, reads offer via data-engine, creates `Project` + children synchronously. Called by `offers/commands/conversion.ts`. |
| `fms_invoicing/commands/*` | `fms_invoicing.*` | `invoicing.*` |
| `fms_documents/commands/*` | `fms_documents.*` | `freight_documents.*` |
| `fms_projects/commands/*`, `fms_files/commands/*`, `fms_teams/commands/*`, `fms_products/commands/*`, `fms_locations/commands/*`, `contractors/commands/*` | `<old_id>.…` | `<new_id>.…` per §1.2 |

Every `registerCommand({ id: 'fms_<x>.…' })` and every `commandBus.execute('fms_<x>.…')` callsite gets rewritten in Step 1.x. Grep pattern for the audit: `(registerCommand|commandBus\.execute|commandBus\.canExecute)\(\s*\{?\s*id:\s*['"]fms_`. Expected count in fms_offers today: 14 registrations (3 rfq + 3 offers + 3 offer_lines + 3 offer-operations + 2 calculations + 1 conversion — re-verify during Step 1.3 since the count is author-maintained).

### 1.8 DI keys

Container registration keys live in each module's `di.ts`. Only two in-scope modules have a `di.ts` today: `fms_invoicing` (2 keys) and `fms_documents` (5 keys).

| Before | After |
|---|---|
| `fmsInvoicingService` | `invoicingService` |
| `fmsInvoicingImportService` *(actual key — not `fmsInvoiceImportService` as earlier drafts claimed)* | `invoicingImportService` |
| `fmsSchemaRegistry` | `freightDocumentSchemaRegistry` (qualified to match the package domain; avoids future collision with any generic `schemaRegistry` that might appear in core) |
| `fmsDocumentDetector` | `documentDetector` |
| `fmsTransportationExtractor` | `transportationExtractor` |
| `fmsMistralOcrService` | `mistralOcrService` |
| `pageImageService` | unchanged (already prefix-free) |
| `em`, `dataEngine`, `storageDriver` | unchanged (core infrastructure) |

**Pre-existing bug to fix during Step 1.x.** Two API routes in `fms_invoicing` — `api/invoices/import-from-sales/route.ts:42` and `api/invoices/import-from-document/route.ts:42` — call `container.resolve('fmsFmsInvoicingService')` (duplicated prefix). No such key is registered anywhere. These callsites are currently broken / relying on a runtime fallback. Step 1.x rewrites them to `container.resolve('invoicingService')`.

### 1.9 Feature IDs (ACL)

Classified as frozen surface #10 in `BACKWARD_COMPATIBILITY.md`. User has waived BC for this rename — feature rows get reseeded from `setup.ts` on fresh initialization.

| Before pattern | After pattern | Example |
|---|---|---|
| `fms_offers.<permission>` | `offers.<permission>` | `fms_offers.rfq.view` → `offers.rfq.view` |
| `fms_projects.<permission>` | `projects.<permission>` | |
| `fms_files.<permission>` | `folders.<permission>` | |
| `fms_locations.<permission>` | `facilities.<permission>` | |
| `fms_products.<permission>` | `products.<permission>` | |
| `fms_invoicing.<permission>` | `invoicing.<permission>` | |
| `fms_documents.<permission>` | `freight_documents.<permission>` | |
| `fms_teams.<permission>` | `teams.<permission>` | |
| `tasks_board.<permission>` | `rfq_board.<permission>` | `tasks_board.view` → `rfq_board.view` |
| `contractors.<permission>` | unchanged | `contractors.view`, `contractors.create`, `contractors.edit`, `contractors.delete`, `contractors.manage_financial`, `contractors.admin`, `contractors.view_sop`, `contractors.manage_sop`, `contractors.view_projects`, `contractors.view_offers` (10 features — illustrative list elsewhere in the spec set is not exhaustive) |

Update **three** surfaces per feature row:

1. **`id:`** — the feature identifier itself (per the table above).
2. **`module:`** — every acl.ts feature row has a `module:` field pointing at the owning module id. Example today: `{ id: 'fms_invoicing.invoices.view', title: 'View invoices', module: 'fms_invoicing' }`. After rename: `{ id: 'invoicing.invoices.view', title: '…', module: 'invoicing' }`. Both fields flip together.
3. **`setup.ts` `defaultRoleFeatures`** — the seed array references feature ids by string; rewrite each entry.

Grep for the audit (covers all three):

- `rg "id:\s*['\"](fms_[a-z_]+|tasks_board)\." packages/fms/src/modules/` — finds feature-id declarations.
- `rg "module:\s*['\"](fms_[a-z_]+|tasks_board)['\"]" packages/fms/src/modules/` — finds `module:` field references.
- `rg "defaultRoleFeatures.*(fms_[a-z_]+|tasks_board)\." packages/fms/src/modules/` — finds setup.ts seed lists.

All three must return zero inside renamed modules after Step 1.x.

### 1.9.1 Route URL literals (`/backend/fms-*` + `/api/fms_*`)

Route URLs are hardcoded as string literals in client-side `apiCall()` / `fetch()` / `router.push()` / `href=` / breadcrumb / `page.meta.ts` sites. The Next.js filesystem router picks up the renamed folder names automatically, but **string-literal URLs don't auto-follow**. Two separate surfaces, each with its own casing convention:

**Backend page URLs — kebab-cased** (tracks the module folder name as Next.js serves it). Verified: **~126 callsites today** across `.tsx`, `.ts`, `page.meta.ts`.

| Old backend path | New backend path |
|---|---|
| `/backend/fms-projects/...` | `/backend/projects/...` |
| `/backend/fms-files/...` | `/backend/folders/...` |
| `/backend/fms-offers/...` | `/backend/offers/...` |
| `/backend/tasks-board/...` | `/backend/rfq-board/...` |
| `/backend/fms-invoicing/...` | `/backend/invoicing/...` |
| `/backend/fms-locations/...` | `/backend/facilities/...` |
| `/backend/fms-products/...` | `/backend/products/...` |
| `/backend/fms-teams/...` | `/backend/teams/...` |
| `/backend/fms-documents/...` | `/backend/freight-documents/...` |
| `/backend/contractors/...` | unchanged |

**API route URLs — snake_cased** (tracks the module folder name verbatim, no kebab conversion). Verified: **652 callsites today** — this is the single largest URL-literal surface in the migration.

| Module | `/api/fms_*` callsites | New path |
|---|---|---|
| `fms_files` | 194 | `/api/folders/...` |
| `fms_documents` | 134 | `/api/freight_documents/...` |
| `fms_offers` | 112 | `/api/offers/...` |
| `fms_projects` | 87 | `/api/projects/...` |
| `fms_locations` | 51 | `/api/facilities/...` |
| `fms_invoicing` | 37 | `/api/invoicing/...` |
| `fms_products` | 24 | `/api/products/...` |
| `fms_teams` | 12 | `/api/teams/...` |
| `fms_4rcargo` (cross-package) | 1 | rewrites to one of the renamed paths above; caught by the 4rcargo sweep in `01` §8 risks-table row |
| **Total** | **652** | |

Plus the 126 backend URLs = **~778 route-URL literal edits across the renamed set**. This is scripted-rewrite territory (per §0); one of the single biggest literal surfaces after i18n.

**API route path note.** API paths use snake_case (no kebab conversion): `api/fms_projects/[id]/route.ts` serves `/api/fms_projects/{id}`. Post-rename the folder is `api/projects/[id]/route.ts` serving `/api/projects/{id}`. Do not kebab-convert (`/api/projects-lines/…` would be wrong).

**Grep audit** at end of Step 1.x — both must return zero inside renamed packages:

```bash
rg "/backend/fms-|/backend/tasks-board" ../fms/packages/*/src/
rg "/api/fms_[a-z_]+/" ../fms/packages/*/src/
```

**Failure mode.** Backend-URL misses show up fast (browser 404 / sidebar nav link breaks) — caught by smoke tests. API-URL misses are nastier: the `fetch('/api/fms_projects/…')` call lands on a now-nonexistent route and returns 404 at runtime only when the caller-component actually loads. Cross the entire renamed set with the grep before declaring the rename "done"; don't rely on catch-via-use.

### 1.9.2 Subscriber and component file names

Some file names embed the old module's semantic term (`file`, `tasks`, `fms`) and need renaming to track the new module id. Enumerated per module:

| Old file | New file | In |
|---|---|---|
| `fms_files/subscribers/auto-link-to-file.ts` | `folders/subscribers/auto-link-to-folder.ts` | `@freighttech/projects` |
| `tasks_board/components/TaskBoardPage.tsx`, `TaskBoardToolbar.tsx` | `rfq_board/components/RfqBoardPage.tsx`, `RfqBoardToolbar.tsx` | `@freighttech/offers` |
| `backend/fms-projects/` folder | `backend/projects/` | `@freighttech/projects` (Next.js route folder) |
| `backend/fms-files/` folder | `backend/folders/` | `@freighttech/projects` |
| `backend/fms-offers/` folder | `backend/offers/` | `@freighttech/offers` |
| `backend/tasks-board/` folder | `backend/rfq-board/` | `@freighttech/offers` |
| `backend/fms-invoicing/` folder | `backend/invoicing/` | `@freighttech/invoicing` |
| `backend/fms-locations/` folder | `backend/facilities/` | `@freighttech/facilities` |
| `backend/fms-products/` folder | `backend/products/` | `@freighttech/products` |
| `backend/fms-teams/` folder | `backend/teams/` | `@freighttech/teams` |
| `backend/fms-documents/` folder | `backend/freight-documents/` | `@freighttech/freight-documents` |

Other subscriber/command/service files keep their names unchanged (they reference domain concepts independent of the old module id — e.g. `shipment-updated-sync.ts`, `auto-create-invoice.ts`).

Rule of thumb: if the file name contains `fms_*` / `tasks_board` / `file` (where the term specifically means "fms_files"), rename. If it describes a generic verb-noun (e.g. `auto-create-from-booking`), leave it.

### 1.9.3 Brand registry `hiddenModules`

`apps/mercato/src/brands/registry.ts` contains `hiddenModules` arrays that use kebab-cased module paths matching the URL path segments, not the snake_cased module ids. Example (line 270–272 today):

```
'fms-locations', 'fms-offers', 'fms-quotes', 'fms-projects',
'contractors', 'fms-products', 'fms-financials', 'fms-documents',
'shipments', 'fms-tracking',
```

Two classes of entries here:
- **Live mappings to current modules** — `fms-locations` / `fms-offers` / `fms-projects` / `fms-products` / `fms-documents` / `fms-tracking` → rename to the new kebab forms (`facilities`, `offers`, `projects`, `products`, `freight-documents`, plus note that `fms-tracking` becomes `shipment-tracking` since the migration consolidates).
- **Pre-existing stale entries** — `fms-quotes` and `fms-financials` don't correspond to any existing module today; they're leftover from earlier module reorganizations. Delete them during the sweep.

This is a fork-side file that gets cleaned during Phase 2 (or, if the brand config also needs to exist in Tier 2's `../fms/apps/web/src/brands/`, port it with the renamed entries). The Phase 1 → Phase 2 handoff is: Tier 2's brand registry uses the new kebab forms (`facilities`, `offers`, `projects`, …); fork's entry list stays untouched until Phase 2 deletes it along with `apps/mercato/src/modules.ts` entries.

### 1.9.4 Tailwind `@source` declarations in `globals.css`

`apps/mercato/src/app/globals.css` has Tailwind `@source` lines that point at node_modules package paths for content-scanning (so utility classes in those packages get emitted into the final CSS bundle). Today lines 23–25 point at fms packages:

```css
@source "../../../../node_modules/@open-mercato/fms/src/**/*.{ts,tsx}";
@source "../../../../node_modules/@open-mercato/fms_tracking/src/**/*.{ts,tsx}";
@source "../../../../node_modules/@open-mercato/shipment-tracking/src/**/*.{ts,tsx}";
```

Plus a similar line for `@open-mercato/fms_4rcargo` if enabled (grep to confirm).

**Phase 2 — fork cleanup.** Delete these three/four `@source` lines from `apps/mercato/src/app/globals.css`. They point at deleted packages; Tailwind would warn or silently miss classes if left. The fork's apps/mercato no longer consumes any fms utility classes.

**Step 1.8 — Tier 2 apps/web globals.css.** Add equivalent `@source` lines pointing at the Tier 2 workspace paths (since `@freighttech/*` packages are workspaces, not node_modules; the path is `../packages/<name>/src/**/*.{ts,tsx}` from `apps/web/src/app/globals.css`):

```css
@source "../../../packages/logistics/src/**/*.{ts,tsx}";
@source "../../../packages/facilities/src/**/*.{ts,tsx}";
@source "../../../packages/products/src/**/*.{ts,tsx}";
@source "../../../packages/contractors/src/**/*.{ts,tsx}";
@source "../../../packages/teams/src/**/*.{ts,tsx}";
@source "../../../packages/offers/src/**/*.{ts,tsx}";
@source "../../../packages/projects/src/**/*.{ts,tsx}";
@source "../../../packages/invoicing/src/**/*.{ts,tsx}";
@source "../../../packages/freight-documents/src/**/*.{ts,tsx}";
@source "../../../packages/shipment-tracking/src/**/*.{ts,tsx}";
@source "../../../packages/annotations/src/**/*.{ts,tsx}";
@source "../../../packages/airfreight-4rcargo/src/**/*.{ts,tsx}";
@source "../../../packages/transports/src/**/*.{ts,tsx}";
@source "../../../packages/truck-loading/src/**/*.{ts,tsx}";
@source "../../../packages/templates/src/**/*.{ts,tsx}";
@source "../../../packages/ksef/src/**/*.{ts,tsx}";
```

Better: auto-generate the list from `workspaces.packages` in `package.json` (a small `scripts/update-globals-css.mjs`) so new packages get Tailwind-scanned without manual edits. Document this in the Step 1.8 acceptance.

### 1.9.5 i18n key rewrites (`tasks_board.*` → `rfq_board.*`)

The `tasks_board` module folder renames to `rfq_board` (per §1.2), and its i18n key prefixes must track the new module id. Verified today:

| Locale file | `tasks_board.*` keys | Total lines |
|---|---|---|
| `tasks_board/i18n/en.json` | 248 | 250 |
| `tasks_board/i18n/de.json` | 248 | 250 |
| `tasks_board/i18n/es.json` | 248 | 250 |
| `tasks_board/i18n/pl.json` | 248 | 250 |
| **Totals** | **992** | 1000 |

**992 key references** need rewriting from `tasks_board.*` to `rfq_board.*` across the 4 locale JSONs during Step 1.3 (the offers package move). The JSON structure today is flat — each key is a dotted string literal like `"tasks_board.nav.title": "RFQ Board"`. A single `sed -i "s/tasks_board\\./rfq_board./g" …/i18n/*.json` rewrites all four locales in place.

**Also rewrite the callsite references.** `useT('tasks_board.…')` / `resolveTranslations(['tasks_board.…'])` callsites in components + server handlers resolve keys by literal string match — they do NOT regenerate from module id. Grep audit: `rg "['\"]tasks_board\\." packages/fms/src/modules/tasks_board/` before rename; `rg "['\"]tasks_board\\." ../fms/packages/offers/src/modules/rfq_board/` after rename must return zero.

Other in-scope modules do NOT need i18n key rewrites — only `tasks_board` embeds the module id in its i18n keys. `fms_invoicing/i18n/*.json` already uses `invoicing.*` keys today (pre-rename drift documented in `04-pkg-invoicing.md` §2), and the remaining modules use generic keys that don't carry the module prefix.

### 1.9.6 `.ai/qa/` test artifacts (fork-side only)

The fork has **1 Playwright spec + 12 markdown scenarios** referencing fms concepts that live outside `packages/` and are therefore not caught by the `packages/`-scoped acceptance greps in §7:

| Path | Type | Notes |
|---|---|---|
| `.ai/qa/tests/integration/TC-INT-FMS-OFFER-FLOW.spec.ts` | Playwright spec | End-to-end offer-flow integration; references fork backend URLs + selectors that will change (`/backend/fms-offers/` → `/backend/offers/`, CSS selectors keyed off old module classes) |
| `.ai/qa/scenarios/TC-FMS-FILE-001…005-*.md` | 5 markdown scenarios | File/folder auto-link scenarios |
| `.ai/qa/scenarios/TC-FMS-DOC-001,004-007,008,009,011,013-*.md` | 7 markdown scenarios | Document upload/extract/delete/metadata scenarios |

**Disposition during Phase 1/Phase 2.** The offer flow and document scenarios are still live business behaviors in Tier 2, so they migrate to Tier 2's CI (not archived). Copy `TC-INT-FMS-OFFER-FLOW.spec.ts` to `../fms/apps/web/.ai/qa/tests/integration/TC-INT-OFFER-FLOW.spec.ts` (drop the `FMS-` infix). Rewrite URL literals (`/backend/fms-offers/` → `/backend/offers/`), selectors, and assertions to match the renamed event ids / entity-type strings / feature ids. Same for the 12 markdown scenarios (rename file prefixes `TC-FMS-FILE-*` → `TC-FOLDER-*`, `TC-FMS-DOC-*` → `TC-FREIGHT-DOC-*`). Step 1.3 (offers) owns the Playwright spec rewrite; Step 1.5 (freight-documents) + Step 1.3 (projects/folders) together own the markdown scenario rewrites. Fork-side `.ai/qa/` entries for these files get deleted in Phase 2 along with the rest of the fork fms footprint.

**Phase 2 acceptance — extend the grep.** The `packages/`-scoped grep from §7 misses `.ai/qa/`. Add: `rg -l "fms|FMS|TC-FMS" .ai/qa/` in the fork must return zero after Phase 2 (i.e., the fork has no lingering fms QA references).

### 1.9.7 Module-level AGENTS.md / CLAUDE.md doc files

**6 agent-guide doc files** live inside `packages/fms/src/modules/` today (verified). Each contains prose that references current module ids, entity names, and (in some cases) class names — so they need updating during the move:

| Path | Scope | Disposition during Step 1.x |
|---|---|---|
| `packages/fms/src/modules/AGENTS.md` | Family-level (all fms modules) | **Delete in Phase 2** — no longer meaningful once every child module has moved to its own Tier 2 package. The guidance lives per-package in Tier 2. |
| `packages/fms/src/modules/fms_projects/AGENTS.md` | In-scope — moves to `@freighttech/projects` | Rewrite during Step 1.3 (projects): rename "fms_projects" → "projects", class names (`FmsProject` → `Project`, etc.), entity-type strings, feature ids. File moves with the code to `../fms/packages/projects/src/modules/projects/AGENTS.md`. |
| `packages/fms/src/modules/fms_locations/AGENTS.md` | In-scope — moves to `@freighttech/facilities` | Rewrite during Step 1.2 (master-data): rename "fms_locations" → "facilities", `FmsLocation` → `Facility`, entity-type strings, feature ids. File moves to `../fms/packages/facilities/src/modules/facilities/AGENTS.md`. |
| `packages/fms/src/modules/tasks_board/CLAUDE.md` | In-scope — moves to `@freighttech/offers` (module renamed to `rfq_board`) | Already called out in `03-pkg-offers.md` §2 with banner update ("module renamed from tasks_board to rfq_board"). File moves to `../fms/packages/offers/src/modules/rfq_board/CLAUDE.md`. **Note: file is `CLAUDE.md` not `AGENTS.md`** — per-module convention inconsistency, carry forward as-is. |
| `packages/fms/src/modules/pdf_templates/AGENTS.md` | Out-of-scope carry-over — bundles into `@freighttech/templates` | Moves untouched to `../fms/packages/templates/src/modules/pdf_templates/AGENTS.md`. Internal references to `pdf_templates` module id stay unchanged. |
| `packages/fms/src/modules/truck_loading/AGENTS.md` | Out-of-scope carry-over — moves to `@freighttech/truck-loading` as-is | Moves untouched to `../fms/packages/truck-loading/src/modules/truck_loading/AGENTS.md`. |

**Why this matters**: AGENTS.md files are loaded into every Claude Code / agent session working inside those module directories. Stale guidance post-rename actively misleads agents ("rename projects to freight_documents" … but the module is already renamed) — worse than no guidance. The doc files are prose, not code, so the grep-driven rewrite script needs a prose-friendly pass: either hand-edit each (6 files) or extend the sed script to cover `*.md` within the renamed modules.

**Grep audit** after Step 1.x: `rg -l "fms_|Fms[A-Z]" ../fms/packages/{projects,facilities,offers}/src/modules/*/AGENTS.md ../fms/packages/offers/src/modules/rfq_board/CLAUDE.md` returns zero. Out-of-scope carry-overs (templates, truck-loading) may retain internal prose references — allow-list per §7.

### 1.10 What's left with `fms` / `Fms` after the rename

**Nothing remains inside the fork with `fms` / `Fms` identifiers** after Phase 2. The fork retains platform packages only (`@open-mercato/{core,shared,ui,…}` — see MIGRATION Part B).

Inside Tier 2 (`../fms/packages/`), `fms` / `Fms` identifiers survive only in packages that are **out of scope of the rename sweep** but still move to Tier 2:

- **`@freighttech/shipment-tracking`** (formerly `packages/shipment-tracking/`, a platform package in the fork) — module id stays `shipment_tracking`. Internal class names unchanged.
- **`@freighttech/airfreight-4rcargo`** (formerly `packages/fms_4rcargo/`) — module ids `frc_*` stay. Internal class names (`Frc*`) unchanged.
- **`@freighttech/transports`** (formerly `packages/fms/src/modules/transports/`) — module id `transports`. Classes like `FmsTransport*` stay prefixed; transports rename is a follow-up initiative (`fms-transport`).
- **`@freighttech/truck-loading`** (formerly `packages/fms/src/modules/truck_loading/`) — same carry-over.
- **`@freighttech/templates`** (formerly `packages/fms/src/modules/{email,pdf}_templates/`) — internal class names stay. Bundles the two modules as-is; `@open-mercato/templating` does not cover their behavior (verified: neither imports from templating; each carries its own entities/migrations/api/components — 36 + 39 files).

These are **intentional carry-overs** — future renames are separate work. Nothing else carries `Fms` / `fms_` prefix after Phase 2.

---

## 2. Current state — the facts the split + rename has to respect

The split remediations from the earlier version of this spec still apply. Same code, new names.

### 2.1 Module inventory (in-scope, post-rename)

| New module id | Old module id | Subscribers | `events.ts` | `di.ts` | Notable entity FKs outbound |
|---|---|---|---|---|---|
| `projects` | `fms_projects` | `auto-create-from-booking` (listens `fms_documents.document.processed`), `shipment-updated-sync` (listens `shipment_tracking.shipment.*` from `@freighttech/shipment-tracking`) | no | none | ORM-typed `@ManyToOne` to `Rfq` + `Offer` — **removed in E1**; registers `projects.create_from_offer` command (Step 1.3, sync handler called by offers/conversion.ts) |
| `folders` | `fms_files` | `auto-link-to-folder`, `create-invoice-from-document`, `auto-create-leg-from-booking` (all listen `fms_documents.document.processed`), `shipment-updated-sync`, `shipment-deleted-sync` (listen `shipment_tracking.shipment.*`) | no | none | `offer_id`, `rfq_id` as plain UUID columns (already the good pattern) |
| `rfq_board` | `tasks_board` | — | no | none | — (no entities) |
| `offers` | `fms_offers` | — | **no** (stays undeclared — offers.ts does not create events.ts) | none | `Rfq`/`Offer` self-links; `conversion.ts` delegates to `commandBus.execute('projects.create_from_offer', …)` |
| `invoicing` | `fms_invoicing` | `auto-import-from-documents`, `auto-create-from-extraction` (both listen `fms_documents.invoice.*`) | **yes** (7 event ids) | yes (2 services — renamed DI keys) | no ORM FK to Contractor; seller/buyer fields are denormalized strings. Runtime contractor lookup from backend page (see §2.4 note). |
| `facilities` | `fms_locations` | — | no | none | `contractor_id` (plain UUID) |
| `products` | `fms_products` | — | no | none | — |
| `contractors` | `contractors` | — | no | none | — |
| `teams` | `fms_teams` | — | no | none | plain UUID column to contractor; no ORM-typed refs |
| `freight_documents` | `fms_documents` | `auto-create-invoice`, `auto-link-on-identifiers-update`, `auto-link-to-project` | **yes** (4 event ids) | yes (5+ services — renamed DI keys) | **source-level imports of `Product`, `Project`, `ProjectLine`, `SeaContainer`, `Contractor` — removed by E5** |

### 2.4 `invoicing ↔ contractors` is a runtime lookup, not an ORM FK

`Invoice` entities store party information as denormalized strings (`seller_name`, `seller_tax_id`, `seller_address`, `buyer_name`, `buyer_tax_id`, `buyer_address`, …). There is **no `contractor_id` column** and **no ORM-typed relation** to `Contractor` in `fms_invoicing/data/entities.ts`. But `@freighttech/invoicing` **directly imports `Contractor` + `ContractorAddress` from `@freighttech/contractors`** for runtime use — backend invoice-creation pages resolve seller/buyer names against the contractor directory, pre-fill party fields, and render contractor pickers.

The `@freighttech/contractors` workspace dep is therefore **a required, load-bearing dependency** — declared as `"@freighttech/contractors": "workspace:*"` in `dependencies` (not `peerDependencies`). It is not optional, not replaceable with an HTTP call to the contractors API, and not subject to lazy wiring. See `04-pkg-invoicing.md` §3 for the package.json entry.

### 2.2 Entanglements that block a clean split

Unchanged from the earlier version (the rename doesn't fix them, the remediations do). Summary:

- **E1** — Drop `@ManyToOne(() => Rfq)` / `@ManyToOne(() => Offer)` on `Project` (post-rename names). Keep `rfqId` / `offerId` as plain UUID columns.
- **E2** — Move `convertCurrency` + `ExchangeRateSnapshot` into `@freighttech/logistics/lib/financials`. Offers and projects both import from there.
- **E3** — The bidirectional coupling between `offers` and `rfq_board` stays inside the offers package. Nothing leaks to other packages.
- **E4** — Replace the `Contractor` activity route's hard import of `Project` with a data-engine query against entity-type `projects:project`.
- **E5** — Decouple `freight_documents` from `projects`, `products`, `contractors`. Seven service/command files today hard-import `FmsProject`, `FmsSeaContainer`, `FmsProduct`, `FmsProjectLine`, `Contractor`. Replace with data-engine queries by entity-type string. Event payload types move into `@freighttech/logistics` so subscribers don't need to import from `@freighttech/freight-documents`.

Full detail in [07-cross-boundary-remediation.md](./07-cross-boundary-remediation.md).

### 2.3 Event subscriber graph (post-rename)

Cross-package event coupling from **two emitters**: `@freighttech/freight-documents` (renamed from `fms_documents` in Step 1.5) and `@freighttech/shipment-tracking` (moved from fork's `packages/shipment-tracking/` in Step 1.7, module id unchanged).

| Subscriber (new path) | Event ID | Emitter package |
|---|---|---|
| `folders/subscribers/auto-link-to-folder` | `freight_documents.document.processed` | `@freighttech/freight-documents` (was `fms_documents`) |
| `folders/subscribers/create-invoice-from-document` | `freight_documents.document.processed` | `@freighttech/freight-documents` |
| `folders/subscribers/auto-create-leg-from-booking` | `freight_documents.document.processed` | `@freighttech/freight-documents` |
| `folders/subscribers/shipment-updated-sync` | `shipment_tracking.shipment.updated` | `@freighttech/shipment-tracking` |
| `folders/subscribers/shipment-deleted-sync` | `shipment_tracking.shipment.deleted` | `@freighttech/shipment-tracking` |
| `invoicing/subscribers/auto-import-from-documents` | `freight_documents.invoice.updated` | `@freighttech/freight-documents` |
| `invoicing/subscribers/auto-create-from-extraction` | `freight_documents.invoice.created` | `@freighttech/freight-documents` |
| `projects/subscribers/auto-create-from-booking` | `freight_documents.document.processed` | `@freighttech/freight-documents` |
| `projects/subscribers/shipment-updated-sync` | `shipment_tracking.shipment.updated` | `@freighttech/shipment-tracking` |

`freight_documents` payload types moved to `@freighttech/logistics/types/freight-document-events` (E5) so subscriber packages don't compile-depend on `@freighttech/freight-documents`. `shipment_tracking.*` payload types come from `@freighttech/shipment-tracking` as a regular `workspace:*` dep (per the "only `@open-mercato/*` are peer deps; `@freighttech/*` siblings are regular deps" rule).

---

## 3. Target topology

```
        ┌──────────────────────────────────┐
        │  @open-mercato/core, shared, ui  │
        └───────────────┬──────────────────┘
                        │
          ┌─────────────▼───────────┐
          │  @freighttech/logistics │  ← no modules, only libs + types
          └──┬───┬────┬─────┬───────┘
             │   │    │     │
   ┌─────────▼┐ ┌▼───┐ ┌────▼──────┐
   │facilities│ │prod│ │contractors│ ──► facilities (Google Places, address types)
   │  (leaf)  │ │(lf)│ │           │
   └────┬─────┘ └─┬──┘ └─────┬─────┘
        │         │          │
        └─────────┼──────────┤
                  │          │
          ┌───────▼──────────▼──────┐        ┌─────────────┐
          │         offers          │        │  invoicing  │
          │ (modules: offers +      │        └──────┬──────┘
          │  rfq_board)             │               │
          └───────────┬─────────────┘        ┌──────▼──────┐
                      │                      │contractors  │
                      │                      │ (invoice    │
                      │                      │  party FK)  │
                      │                      └─────────────┘
           ┌──────────▼─────────────┐
           │        projects        │ ──► offers (compile-time, UUID FKs only)
           │ (modules: projects +   │     facilities, products, contractors
           │  folders)              │
           └────────────────────────┘
```

**Dependency rules (enforced by `package.json` + ESLint `no-restricted-imports`):**

| From → To | Allowed? |
|---|---|
| any domain pkg → `@freighttech/logistics` | ✅ |
| `contractors` → `facilities` | ✅ |
| `offers` → `facilities`, `products`, `contractors` | ✅ |
| `projects` → `offers` | ✅ (compile-time, plain UUID FKs, no ORM-typed relations) |
| `projects` → `facilities`, `products`, `contractors` | ✅ |
| `invoicing` → `contractors` | ✅ (runtime lookup from backend pages, not an ORM FK — see §2.4) |
| `invoicing` → other fms domain pkgs | ❌ |
| `offers` → `projects` | ❌ (E2 moves currency helpers out) |
| `facilities` → any other domain pkg | ❌ (leaf) |
| `products` → any other domain pkg | ❌ (leaf) |
| `contractors` → any pkg other than `facilities` | ❌ |

---

## 4. Phased rollout

**Owned by [`MIGRATION-TO-FREIGHTTECH.md`](./MIGRATION-TO-FREIGHTTECH.md).** Three phases: Phase 0 scaffold Tier 2 → Phase 1 bulk migration (steps 1.1–1.8 covering every package in dep-resolution order) → Phase 2 retire fork FMS. The rename tables in §§1.1–1.9 above apply verbatim inside each Step 1.x; the remediations in [`07-cross-boundary-remediation.md`](./07-cross-boundary-remediation.md) ride inside their owning Step 1.x (not a standalone phase).

Earlier drafts of this overview described a six-phase fork-side rollout with its own Phase 0–6 numbering. That numbering is obsolete — MIGRATION consolidated it into a single move. If you see "Phase 0 / 1 / 2 / 3 / 4 / 5 / 6" references elsewhere, map them to MIGRATION Step 1.1 / 1.2 / 1.3 / 1.4 / 1.5 / 1.6 / 1.7 respectively.

---

## 5. Generator + build pipeline

Unchanged in shape — the generator discovers modules via the app's `modules.ts` + node resolution. Each new package can follow `packages/shipment-tracking/package.json` (or any other small extracted package) as a template.

Commands to run per phase:

```bash
yarn install
yarn generate
yarn db:generate        # on a fresh DB — greenfield migration, data is disposable
yarn db:migrate
yarn mercato configs cache structural --all-tenants
yarn typecheck
yarn test:integration
```

---

## 6. Backward compatibility policy (relaxed)

The user's directive: **names can change, data in the DB is disposable, datamodel shape stays the same**. So:

- **Not preserved**: module IDs (stored in DB feature rows — rows get reseeded), entity-type strings (search reindex), DB table names (fresh schema), event IDs (new strings), DI keys (coordinated rename), class names.
- **Preserved**: column structure, FK relationships, indexes, the logical shape of the datamodel, public module contracts at the file-convention level (`src/modules/<id>/{data,api,backend,…}/*` layout).

**Module metadata field name.** Every module's `index.ts` exports `metadata.name` (not `metadata.id`). Earlier drafts of these specs showed `metadata.id === 'projects'`; the correct form is:

```ts
// packages/fms/src/modules/projects/index.ts
export const metadata = {
  name: 'projects',
  title: 'Projects',
  version: '0.2.0',
  description: '…',
  requires: [],
}
```

The module id is the value of `metadata.name` (and matches the folder name). Step 1.x updates `metadata.name` in every renamed module's `index.ts`.

Deprecation shims under `packages/fms/` remain useful ONLY for consumers inside this monorepo that haven't caught up to the new names yet. They're explicitly NOT a permanent compatibility promise and can be deleted once internal consumers migrate.

Downstream apps that have persisted data with the old module ids / entity types: that's on them — this rename assumes fresh initialization. Document in release notes.

---

## 7. Acceptance criteria (overall)

1. **Rename complete.** Grep for `Fms[A-Z]` under `../fms/packages/(logistics|facilities|products|contractors|teams|offers|projects|invoicing|freight-documents|shipment-tracking|annotations)/src/` returns zero. Grep for `fms_(offers|projects|files|invoicing|locations|products|tasks_board|teams|documents)\b` under the same paths returns zero. Seven supplementary greps catch string-literal and doc-file forms the main `Fms[A-Z]` pattern misses:
   - **`@Index` literal sweep** (§1.4.1): `rg "@Index\(\{\s*name:\s*'fms_" ../fms/packages/{projects,offers,invoicing,freight-documents,teams}/src/` returns zero.
   - **MikroORM snapshot sweep** (07 step 4): `rg -l "fms_" ../fms/packages/*/src/modules/*/migrations/.snapshot-open-mercato.json` returns zero (out-of-scope templates carry-overs excluded).
   - **API URL literal sweep** (§1.9.1): `rg "/api/fms_[a-z_]+/" ../fms/packages/*/src/` returns zero. (This is the 652-callsite surface — single largest literal sweep after i18n.)
   - **i18n key sweep** (§1.9.5): `rg "['\"]tasks_board\\." ../fms/packages/offers/src/modules/rfq_board/` returns zero.
   - **`.ai/qa/` fork residue** (§1.9.6): `rg -l "fms|FMS|TC-FMS" .ai/qa/` inside the fork returns zero after Phase 2.
   - **AGENTS.md/CLAUDE.md doc sweep** (§1.9.7): `rg -l "fms_|Fms[A-Z]" ../fms/packages/{projects,facilities,offers}/src/modules/*/AGENTS.md ../fms/packages/offers/src/modules/rfq_board/CLAUDE.md` returns zero.
   - **`package.json` workspace-dep sweep** (MIGRATION Step 1.7 airfreight-4rcargo): `rg '"@open-mercato/fms"' ../fms/packages/*/package.json` returns zero.

   Allow-list (intentional carry-overs — as-is moves that retain internal class names): `@freighttech/airfreight-4rcargo` (keeps `frc_*` + `air_cargo` modules), `@freighttech/transports`, `@freighttech/truck-loading`, `@freighttech/templates`.
2. **Split complete.** After MIGRATION Phase 1, every in-scope module is hosted in its new `@freighttech/*` package; `../fms/apps/web/src/modules.ts` references each module with the renamed id + `from: '@freighttech/<pkg>'`.
3. **No cross-package deep relative imports** inside the new packages. Every cross-package reference uses `@freighttech/<pkg>/modules/<id>/...` or a peer dep.
4. **Build + typecheck green per package** (`yarn workspace @freighttech/<pkg> build`).
5. **`yarn generate` idempotent** in `../fms/`.
6. **`yarn db:generate` + `yarn db:migrate` on a fresh DB produce the renamed schema** with the same column/FK shape as today (tables renamed, columns preserved).
7. **All integration tests pass** against the renamed schema. Per-module test matrix:
   - **Existing `__integration__/` to rewrite** (update string literals for renamed events/entity-types/DI-keys/feature-ids/class imports): `contractors`, `fms_documents`, `fms_files` (→ `folders`), `fms_invoicing` (→ `invoicing`), `fms_products` (→ `products`), `fms_projects` (→ `projects`).
   - **No `__integration__/` today — add from scratch if desired (otherwise test gate is typecheck + build + manual CRUD)**: `fms_offers` (→ `offers`), `fms_locations` (→ `facilities`), `fms_teams` (→ `teams`), `tasks_board` (→ `rfq_board`), `truck_loading`.
   - **Unit tests** (`lib/__tests__/`, `api/**/__tests__/`) move with the code and get string updates — applies to whichever modules have them (e.g. `fms_offers/lib/__tests__/`, `fms_offers/api/rfq/from-email/__tests__/`).
8. **Remediations landed**: E1, E2, E3, E4, E5 per [07-cross-boundary-remediation.md](./07-cross-boundary-remediation.md); pre-existing `fmsFmsInvoicingService` + duplicate-emit bugs fixed per `04-pkg-invoicing.md` §2.
9. **Fork retired** per MIGRATION Phase 2: `packages/{fms,fms_tracking,fms_4rcargo,ksef,shipment-tracking,annotations}/` deleted (`fms_tracking` dropped outright; `shipment-tracking` + `annotations` moved to Tier 2; the rest migrated); fork's `apps/mercato/src/modules.ts` has zero fms-related entries.

---

## 8. Risks + how we mitigate

| Risk | Mitigation |
|---|---|
| **`conversion.ts` cross-package coupling under the split.** Today `fms_offers/commands/conversion.ts` hard-imports `FmsProject`, `FmsProjectLine`, `FmsSeaContainer` from `fms_projects` to create the project synchronously with offer accept. Post-split, a direct import would make `@freighttech/offers` compile-depend on `@freighttech/projects` — violating the dep graph (projects → offers, not the reverse). | Step 1.3 adds a `projects.create_from_offer` command handler in `@freighttech/projects`. `conversion.ts` stays atomic (same single transaction) but replaces the direct entity construction with `commandBus.execute('projects.create_from_offer', {offerId})`. commandBus is in-process + synchronous → identical atomicity semantics; handler ownership moves to the module that owns the entities being created. Zero compile-time dep `offers → projects`. |
| Rename sweep misses a string reference (event id, entity type, DI key, module id) | Each category has a single grep pattern (§1 tables). Run grep in CI-style assertion at end of Step 1.x: zero matches of the old forms in the renamed modules. |
| ORM `@ManyToOne` removal breaks callsites | Step 1.x grep audit (`project\.rfq\.`, `project\.offer\.`) + replace with explicit fetches. |
| Tests rely on old event IDs / entity types / DI keys | Rewrite tests in Step 1.x. Fresh DB + fresh fixtures — no migration of existing test data needed. |
| Downstream apps outside this monorepo are on old module IDs | Not a concern for this repo. Release notes call out the breaking change. |
| A later decision re-introduces an `fms`-prefixed class because it's copy-pasted from old code | ESLint `no-restricted-syntax` rule rejecting identifiers matching `/^Fms[A-Z]/` inside the new packages. Rule added in Step 1.x. |
| Browser-global collisions with `File` and `Location` | Resolved by the domain-word renames (`Folder`, `Facility`). Simple prefix-strip names (`Offer`, `Project`, `Product`, `Carrier`, `Invoice`, `Note`) were grep-audited in `packages/core` and `packages/shared`; no runtime class collisions today. |
| `projects:project` entity-type collides with another module | Verified against `packages/fms/generated/entities.ids.generated.ts` + core generated ids: no existing `projects:*` namespace. The new `projects` module owns it. |
| **`fms_4rcargo` lockstep coupling.** Today `fms_4rcargo` imports `FmsLocation`, `Contractor`, `ContractorContact`, `ContractorAddress` from `@open-mercato/fms/modules/…`, plus email-template helpers. Verified: **23 files with 28 import statements** (earlier drafts said "16+"). After Step 1.2 the renamed classes live in `@freighttech/facilities` + `@freighttech/contractors`; the fork's `packages/fms` is untouched through Phase 1. | Step 1.7 (same PR as the package move) rewrites `fms_4rcargo` imports directly — no intermediate shim in the fork. `FmsLocation` → `Facility` from `@freighttech/facilities/modules/facilities/data/entities`; `Contractor`/`ContractorContact`/`ContractorAddress` from `@freighttech/contractors/modules/contractors/data/entities`; email-template imports → `@freighttech/templates/modules/email_templates/*`. Note: `fms_4rcargo` includes a non-`frc_*`-prefixed module `air_cargo` — its id is preserved during the move alongside the `frc_*` modules. |
| **Pre-existing `fmsFmsInvoicingService` bug** in `fms_invoicing/api/invoices/import-from-sales/route.ts:42` and `import-from-document/route.ts:42` — `container.resolve('fmsFmsInvoicingService')` resolves a non-existent DI key (duplicated `fms` prefix) | Step 1.6 rewrites these to `container.resolve('invoicingService')` (renamed key). Indicate in the PR that these callsites were broken pre-rename. |
| **Double emit** at `fms_invoicing/commands/invoices.ts:513` (declared, no subscribers) + `:525` (bridge, KSeF subscriber) | **Decision: keep bridge, delete declared.** Line 525 carries the full payload KSeF needs; line 513's minimal-payload declared emit has no subscribers. Delete line 513; rewrite `events.ts` to declare `invoicing.invoice.approved` with the bridge's augmented payload so the surviving emit stays typed. Step 1.6 owns this. |

---

## 9. What's NOT in this spec

- **Internal class-level renames** inside `@freighttech/shipment-tracking`, `@freighttech/annotations`, `@freighttech/airfreight-4rcargo`, `@freighttech/transports`, `@freighttech/truck-loading`, `@freighttech/templates`. These packages MOVE to Tier 2 per MIGRATION Step 1.7 but their internal class names stay unchanged (`Shipment*`, annotation classes, `FmsTransport*`, `FmsTruckLoading*`, `Frc*`, etc.). Future renames are separate initiatives.
- **Renaming `@open-mercato/fms`** as a lingering package — the fork's `packages/fms/` folder is deleted entirely in MIGRATION Phase 2. No stub retained.
- **Versioning policy** for the new packages — inherits from the monorepo release tooling + Verdaccio pinning pattern documented in MIGRATION Parts C/D.
- **Execution sequence + file locations** — owned by `MIGRATION-TO-FREIGHTTECH.md`. Three phases: Phase 0 (scaffold) → Phase 1 (bulk migration in dep-resolution order, Steps 1.1–1.8) → Phase 2 (retire fork). Remediations E1–E5 ride inside their owning Step 1.x per §4 above.
