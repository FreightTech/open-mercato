# SPEC — Migrate FMS out of the fork into `@freighttech/*` Tier 2 monorepo

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Created** | 2026-04-22 |
| **Supersedes** | `01-split-overview.md` §1.1 — package scope is now `@freighttech/*`, not `@open-mercato/*` |
| **Defers to** | `02`–`09*.md` — rename tables (classes, DB tables, event ids, DI keys, module ids, feature ids, command ids) still apply verbatim; only the package scope and file location change |
| **Target repo** | `~/Projects/freighttech/fms/` (Tier 2 — a new monorepo) |
| **Source repo** | `~/Projects/freighttech/open-mercato/` (Tier 1 — fork, becomes platform-only) |

## TLDR

Every FMS-related package leaves the fork and is rebuilt in `../fms/packages/*` under a new `@freighttech/*` scope. **Single migration — all packages moved at once, not phased.** The fork keeps only platform packages (`@open-mercato/{core,shared,ui,cli,…}`). The three-tier workflow (fork = Tier 1, `fms` monorepo = Tier 2, customer apps = Tier 3) becomes the durable topology.

Execution strategy: **move everything, rename + remediate in place, test end-to-end, delete from fork**. The fork's `packages/fms*` and `packages/ksef` stay untouched on `main` throughout the migration work. When Tier 2 is green, a single cleanup PR deletes them from the fork.

Three work units, not seven:

| # | Work unit | What it produces |
|---|---|---|
| **0** | Scaffold Tier 2 | Empty monorepo at `../fms/` with `apps/web/`, workspaces, Verdaccio wiring, pre-push guards. |
| **1** | Bulk migration | Every `@freighttech/*` package created, renamed per `01`, remediated (E1–E5), bug-fixed, tested end-to-end. One work unit internally dep-ordered; not split across per-package PRs. |
| **2** | Retire fork FMS | Delete `packages/{fms,fms_tracking,fms_4rcargo,ksef,shipment-tracking,annotations}/` from fork (fms_tracking deleted outright — not migrated; shipment-tracking + annotations + the rest moved to Tier 2 in Phase 1). Clean `apps/mercato/src/modules.ts` + create-app templates; ship fork v0.5.0. |

Unit 1 is intentionally one work item. The rename + split + move is atomic from an external-consumer perspective: nobody sees intermediate "half FMS in fork, half in Tier 2" states. Internal ordering below is dep resolution so the code compiles during the work, not external milestones.

## Part A — Execution plan

Assume `../fms/` starts as the bare `create-mercato-app` scaffold (single Next app).

### Phase 0 — Convert `../fms` into a monorepo skeleton

The scaffold is app-shaped. Turn it into monorepo-shaped before any package moves.

Steps:
1. `rm -rf ../fms` and re-scaffold as an empty monorepo (bare `package.json` with `workspaces: ["apps/*", "packages/*"]`, `turbo.json`, `.yarnrc.yml`). Throwing away the scaffold is faster than retrofitting — the template is app-shaped by design.
2. Move the Next app under `apps/web/`. Copy files from `packages/create-app/template/` into `../fms/apps/web/` but strip the root-monorepo bits (the app's own `package.json.template` becomes an app-scoped, non-workspace-root manifest).
3. Add root scripts (`setup.mjs`, `use-local.mjs`, `guard-clean-pkg.mjs`, `release.sh`) per the dev-workflow note.
4. Point both scopes at the same FreightTech Verdaccio in `.yarnrc.yml` (one registry hosts both `@open-mercato/*` platform packages published by the fork AND `@freighttech/*` domain packages published by this repo):
   ```yaml
   nodeLinker: node-modules
   npmScopes:
     open-mercato:
       npmRegistryServer: "https://dev.registry.freighttech.org/"
     freighttech:
       npmRegistryServer: "https://dev.registry.freighttech.org/"
   ```
5. Pin exact platform versions in `apps/web/package.json` — `"@open-mercato/core": "0.4.10"` etc.
6. Add husky pre-push guard blocking `portal:|link:|file:\.\.` in `package.json`/`yarn.lock`.
7. Commit to a fresh git repo (`~/Projects/freighttech/fms/.git`).

Acceptance:
- `yarn install` in `../fms` succeeds with zero `@freighttech/*` packages and only platform deps from Verdaccio.
- `yarn workspaces list` prints `apps/web` and nothing else.
- Pre-push hook blocks a probe commit that manually inserts `portal:` into `package.json`.

### Phase 1 — Bulk migration

One work unit. Every `@freighttech/*` package is created in one pass; everything renamed per the `01` tables; every remediation applied; every pre-existing bug fixed; integration tests re-run end-to-end. No per-package external release between steps.

The fork is untouched throughout this phase. `packages/fms*` and `packages/ksef` on fork's `main` stay intact so nothing breaks for any consumer while Tier 2 is being built.

Internal step ordering is dep resolution — so the code compiles as you build it. It is not a PR boundary; expect this to land as one large PR or a short burst of merged-together PRs, not as 1.1→1.2→1.3 milestones.

#### Step 1.1 — Library leaf: `@freighttech/logistics`

Per `06-pkg-logistics.md`. Library-only package — no modules.

Contents:
- Copy `packages/fms/src/lib/{activity,inline-edit,logger.ts}/` + `hooks/useDrawerTableFocus.ts` → `../fms/packages/logistics/src/`.
- **Apply E2** in-place: consolidate `convertCurrency` + `formatCurrency` + `ExchangeRateSnapshot` + `FinancialSummary` into `../fms/packages/logistics/src/lib/financials/` (splits from today's `fms_projects/lib/financials.ts` + `fms_offers/data/types.ts`). No intermediate staging in the fork.
- **Apply E5 payload types**: create `../fms/packages/logistics/src/types/freight-document-events.ts` with `DocumentProcessedPayload`, `InvoiceCreatedPayload`, `InvoiceUpdatedPayload`, `DocumentIdentifiersUpdatedPayload`. Subscribers in domain packages import types from here, not from `@freighttech/freight-documents` — breaks the reverse-dep cycle.
- Create shared types folder: `charges.ts` (`CHARGE_UNITS`, `ChargeUnit`, `ChargeRow`), `rfq-enums.ts` (`RfqStatus`, `DIRECTIONS`, `TRANSPORT_MODES`), `wizard.ts` (`WizardItem`, `ProductItem`, `makeEmptyItem`).

`package.json`: name `@freighttech/logistics`, declare `@open-mercato/{core,shared,ui}` as **peerDependencies** (not dependencies).

#### Step 1.2 — Master-data leaves (parallel; dep-ordered)

Four packages, ordered by inter-package deps within the group:

1. **`@freighttech/products`** — module `products` (from `fms_products/`). Class renames per `01` §1.3: `FmsProduct`→`Product`, `FmsCarrier`→`Carrier`.
2. **`@freighttech/facilities`** — module `facilities` (from `fms_locations/`). Class rename: `FmsLocation`→`Facility`.
3. **`@freighttech/contractors`** — module `contractors` (unchanged, already prefix-free). Depends on `@freighttech/facilities` (Google Places editor). **Apply E4**: replace `contractors/api/contractors/[id]/activity/route.ts` hard import of `FmsProject` with `dataEngine.query({ entityType: 'projects:project' })`.
4. **`@freighttech/teams`** — module `teams` (from `fms_teams/`). Class renames: `FmsTeam`→`Team`, `FmsUserTeam`→`UserTeam`, `FmsUserContractorAssignment`→`UserContractorAssignment`, `FmsTeamContractorAssignment`→`TeamContractorAssignment`. Plain UUID FKs to contractors (no ORM-typed relations).

All four: apply full rename per `01` §§1.1–1.9 (modules, classes, DB tables, entity-type strings `<id>:<snake_case>`, event IDs, DI keys, feature IDs, command IDs). `package.json` declares `@open-mercato/*` as peerDependencies.

#### Step 1.3 — `@freighttech/offers`

Per `03-pkg-offers.md`. Modules `offers` + `rfq_board` (from `fms_offers` + `tasks_board`).

- Full rename: class names, tables, entity-type strings, command IDs, feature IDs per `01` §§1.1–1.9.
- **Apply E3**: shared enums (`RfqStatus`, `CHARGE_UNITS`, `DIRECTIONS`, `TRANSPORT_MODES`) imported from `@freighttech/logistics/types/*` (staged in 1.1).
- **Rewrite `offers/commands/conversion.ts`** to delegate project creation via `commandBus.execute('projects.create_from_offer', …)` (sync, in-process) instead of importing `fms_projects` entity classes directly. The command handler lands in `@freighttech/projects` during Step 1.4 (see below). `fms_offers` has no `events.ts` today and the migration does not create one — offer→project stays atomic (single transaction).
- Flip `convertCurrency` imports from `projects/lib/financials` to `@freighttech/logistics/lib/financials` — **four callsites** per `07` §2: `lib/offer-pdf.service.tsx`, `commands/offer-operations.ts`, `api/offers/route.ts`, `api/offers/[id]/email-preview/route.ts`.
- Entity imports of `Facility`/`Product`/`Contractor` flip to `@freighttech/facilities|products|contractors/modules/.../data/entities`.
- Relocate `OfferCreationForm.tsx` + `OfferDetailView.tsx` from `rfq_board/components/` to `offers/components/`.

#### Step 1.4 — `@freighttech/projects` (projects + folders)

Per `02-pkg-projects.md`. Modules `projects` + `folders` (from `fms_projects` + `fms_files`).

- Full rename: `FmsProject`→`Project`, `FmsFile`→`Folder` + all descendants per `01` §1.3.
- Column renames where natural: `*_location_id` → `*_facility_id`.
- **Apply E1**: drop `@ManyToOne(() => FmsRfq)` / `@ManyToOne(() => FmsOffer)` decorators on `Project`. Replace with plain UUID `@Property` columns. Rewrite every `project.rfq.*` / `project.offer.*` callsite to `em.findOne(…)` or `dataEngine.query({ entityType: 'offers:offer' })`.
- Add `projects/commands/create-from-offer.ts` registering command id `projects.create_from_offer`. Sync handler — invoked by `@freighttech/offers/commands/conversion.ts` via `commandBus.execute(...)`. Contains the project-creation logic previously inline in `fms_offers/commands/conversion.ts`. Runs inside the caller's transaction (preserves atomicity).
- Flip every `fms_documents.*` event-string listener to `freight_documents.*` in `folders/subscribers/{auto-link-to-folder, create-invoice-from-document, auto-create-leg-from-booking}` + `projects/subscribers/auto-create-from-booking`. Payload-type imports resolve from `@freighttech/logistics/types/freight-document-events`.
- `shipment_tracking.*` subscribers (`folders/subscribers/shipment-{updated,deleted}-sync`, `projects/subscribers/shipment-updated-sync`) consume `@freighttech/shipment-tracking` — the package moves to Tier 2 in Step 1.7 (see below). Declared as a regular `workspace:*` dependency of `@freighttech/projects` (not peer) per the "only `@open-mercato/*` platform packages are peerDeps; `@freighttech/*` siblings are regular workspace deps" rule.

#### Step 1.5 — `@freighttech/freight-documents`

Per `08-pkg-freight-documents.md`. Module `freight_documents` (from `fms_documents`).

- Full rename: module id `fms_documents` → `freight_documents`. Classes: `FmsDocument`→`FreightDocument` (avoids DOM `Document` collision), `FmsDocumentPage`→`FreightDocumentPage`, `FmsInvoice`→`ExtractedInvoice` (disambiguates from `Invoice` in invoicing), `FmsInvoiceLineItem`→`ExtractedLineItem`, `FmsInvoiceCostAllocation`→`ExtractedCostAllocation`, `FmsInvoicePage`→`ExtractedInvoicePage`.
- DB tables renamed per `01` §1.4.
- Event IDs renamed `fms_documents.*` → `freight_documents.*`. Subscribers in 1.4 + 1.6 already reference the new strings.
- DI keys renamed per `01` §1.8 (`schemaRegistry`, `documentDetector`, `transportationExtractor`, `mistralOcrService`).
- **Apply E5**: seven files (`services/{contractor,charge-code,project}-matcher.service.ts`, `commands/{invoice-shared,invoices,cost-allocations}.ts`, `data/entities.ts`) replace hard imports of `Contractor`/`Product`/`Project`/`ProjectLine`/`SeaContainer` with `dataEngine.query({ entityType: '<new>' })`. Result: `@freighttech/freight-documents` depends only on `@freighttech/logistics` + `@open-mercato/core`.

#### Step 1.6 — `@freighttech/ksef` + `@freighttech/invoicing`

Ksef moves as-is (no rename). Invoicing gets full rename + bug fixes.

- **`@freighttech/ksef`**: move `packages/ksef/` → `../fms/packages/ksef/`. Flip package name. **Not purely as-is** — ksef has one hardcoded cross-module entity-type string that must update in lockstep with the invoicing rename:
  - `packages/ksef/src/modules/ksef/data/extensions.ts` line 12: `base: 'fms_invoicing:fms_invoicing_invoice'` → `base: 'invoicing:invoice'` (this declares the bridge extension from KsefSubmission → the invoicing invoice record; silently breaks at runtime if not flipped — no compile error, just a missing join).

  The KSeF subscriber `bridge-invoice-approved.ts` also reads `isSourceModuleAvailable('fms_invoicing')` via the emit payload's `sourceModule` field — that's a generic module-registry check, so if the invoicing module id flips to `'invoicing'` and the emit payload flips its `sourceModule` value to `'invoicing'` (see Step 1.6 item 3 below), the check works transparently. No ksef code change needed for that half.

  Declared as a regular workspace dep by `@freighttech/invoicing` (not peer — see Step 1.6 item 2 below for the rule).
- **`@freighttech/invoicing`** (per `04-pkg-invoicing.md`):
  - Rename module id `fms_invoicing` → `invoicing`; classes `FmsInvoicingInvoice`→`Invoice`, `FmsInvoicingLineItem`→`InvoiceLineItem`, `FmsInvoicingSettings`→`InvoicingSettings`; service classes `FmsInvoicingService`→`InvoicingService`, `FmsInvoiceImportService`→`InvoiceImportService`.
  - DI keys: `fmsInvoicingService` → `invoicingService`, `fmsInvoicingImportService` → `invoicingImportService` (note the `-ing` in the source key).
  - **Fix pre-existing bugs**:
    1. `api/invoices/import-from-sales/route.ts:42` + `api/invoices/import-from-document/route.ts:42` — `container.resolve('fmsFmsInvoicingService')` resolves a non-existent key. Rewrite to `container.resolve('invoicingService')`.
    2. `commands/invoices.ts` emits `invoicing.invoice.approved` twice today: line 513 (declared, minimal payload, **zero subscribers** — dead code) and line 525 (bridge emit with `sourceModule`/`sourceTable`/`sourceLineItemsTable`, consumed by `@freighttech/ksef`'s `bridge-invoice-approved` subscriber at `packages/ksef/src/modules/ksef/subscribers/bridge-invoice-approved.ts:47`). Post-rename the two strings collide. **Decision: delete the declared emit at line 513 (dead code). Keep the bridge emit at line 525 and rewrite `events.ts` to declare `invoicing.invoice.approved` with the bridge's augmented payload** so the surviving emit stays typed. Flip the three payload values from `fms_invoicing`/`fms_invoicing_invoices`/`fms_invoicing_line_items` to `invoicing`/`invoices`/`invoice_line_items` in lockstep with the table renames (§1.4). See `04-pkg-invoicing.md` §2 point 2 for the step-by-step.
  - Rename the 7 declared events `fms_invoicing.*` → `invoicing.*`.
  - Flip `fms_documents.invoice.*` subscriber strings → `freight_documents.invoice.*` (per 1.4 pattern).
  - `@freighttech/contractors` is a required `workspace:*` dependency (regular, not peer) — invoicing directly imports `Contractor` + `ContractorAddress` for backend-page party lookups. No ORM FK; party data is denormalized on `Invoice`. See `04` §2 and overview §2.4.

#### Step 1.7 — As-is moves

Five packages move with no rename work. Order doesn't matter.

- **`@freighttech/shipment-tracking`** — `packages/shipment-tracking/` → `../fms/packages/shipment-tracking/`. Module id stays `shipment_tracking`. This is the tracking integration that fms packages (folders + projects subscribers) actually consume — the `shipment_tracking.shipment.*` events. Previously a platform package in the fork; moves to Tier 2 because its consumers are all in Tier 2 now.
- **`@freighttech/annotations`** — `packages/annotations/` → `../fms/packages/annotations/`. Module id stays `annotations`. Verified: only 3 importers today, all inside `packages/fms` (`lib/activity/mention-notifications.ts`, `fms_files/api/files/[id]/activity/route.ts`, `fms_projects/api/projects/[id]/activity/route.ts`). No platform or app consumers. Moves to Tier 2 as-is — effectively an fms-domain package despite being under `@open-mercato/*` scope today.
- **`packages/fms_tracking/` — DELETED in Phase 2 (not migrated).** Has zero cross-package importers; its only emit is `fms_tracking.tracking_updated` from a freighttech-specific webhook with no subscribers inside this repo. Drop entirely. If any downstream need for it surfaces later, resurrect as a standalone package.
- **`@freighttech/airfreight-4rcargo`** — `packages/fms_4rcargo/` → `../fms/packages/airfreight-4rcargo/`. **Drop `"private": true`** and publish publicly to the shared FreightTech Verdaccio alongside every other `@freighttech/*` package — no `publishConfig.access` restriction. **Nine modules preserved: `air_cargo` + `frc_airports` + `frc_console` + `frc_contractors` + `frc_offers` + `frc_projects` + `frc_rfqs` + `frc_settings` + `frc_trucks`** (note `air_cargo` is not `frc_`-prefixed).

  **Three surfaces to rewrite during the move, not two:**

  1. **Class-import rewrites — 23 files with 28 import statements** (verified): `FmsLocation`, `Contractor`, `ContractorContact`, `ContractorAddress` from `@open-mercato/fms/modules/…` flip to `@freighttech/facilities/modules/facilities/data/entities` (class is now `Facility`) and `@freighttech/contractors/modules/contractors/data/entities`. Email-template imports flip to `@freighttech/templates/modules/email_templates/…`.

  2. **Raw entity-type string literals — 10 callsites** (verified by grep). These are runtime strings passed to `dataEngine.query` / `useEntitySearch` / similar hooks; they don't show up in the class-import audit:
     ```
     packages/fms_4rcargo/src/lib/initialSuggestions.ts:81                                 entityId: 'fms_locations:fms_location'
     packages/fms_4rcargo/src/modules/frc_rfqs/components/AirRoutingEditTable.tsx:58       entityType: 'fms_locations:fms_location'
     packages/fms_4rcargo/src/modules/frc_rfqs/components/OpportunityWizard/OpportunityRouteTable.tsx:40
     packages/fms_4rcargo/src/modules/frc_offers/components/OfferRoutingEditTable.tsx:71
     packages/fms_4rcargo/src/modules/frc_projects/components/ProjectRoutingLegsTable.tsx:143
     packages/fms_4rcargo/src/modules/frc_projects/components/ProjectWizard/ProjectWizardRouteTable.tsx:39
     packages/fms_4rcargo/src/modules/frc_projects/components/ProjectDetailsEditTable.tsx:64
     packages/fms_4rcargo/src/modules/frc_console/backend/frc-console/page.tsx:148
     packages/fms_4rcargo/src/modules/frc_console/components/ConsoleWizard/ConsoleWizardRouteTable.tsx:38
     packages/fms_4rcargo/src/modules/frc_console/components/ConsoleDetailsEditTable.tsx:83
     ```
     All 10 flip from `'fms_locations:fms_location'` → `'facilities:facility'` during the Step 1.7 move. Runtime failure mode: location-search dropdowns return empty; no compile error. Grep audit: `rg "'fms_locations:fms_location'" ../fms/packages/airfreight-4rcargo/src/` must return zero.

  3. **`package.json` workspace dep rewrite.** Today `packages/fms_4rcargo/package.json` declares `"@open-mercato/fms": "workspace:*"` as its sole fms-domain dep (verified):

     ```diff
       "name": "@open-mercato/fms_4rcargo",
     + "name": "@freighttech/airfreight-4rcargo",
     - "private": true,
       "dependencies": {
         "@open-mercato/core": "workspace:*",
     -   "@open-mercato/fms": "workspace:*",
     +   "@freighttech/facilities": "workspace:*",
     +   "@freighttech/contractors": "workspace:*",
     +   "@freighttech/templates": "workspace:*",
         "@open-mercato/shared": "workspace:*",
         "@open-mercato/ui": "workspace:*",
         "@react-pdf/renderer": "^4.3.2"
       }
     ```

     After Phase 2 deletes `packages/fms/`, `"@open-mercato/fms": "workspace:*"` resolves to nothing → install fails. The rewrite above replaces it with three renamed sibling workspace deps (regular `workspace:*`, not peer, per the "only `@open-mercato/*` are peer deps" rule). `@open-mercato/{core,shared,ui}` stay as deps in Tier 2 — they're the platform deps consumed from Verdaccio (pinned exact versions in `apps/web/package.json`, `workspace:*` here since `airfreight-4rcargo` doesn't care which patch version as long as one is present). Follow the same pattern as every other `@freighttech/*` package's `package.json` for peer vs regular dep classification. Update `build.mjs` / `watch.mjs` / `tsconfig.json` path aliases accordingly.
- **`@freighttech/transports`** — `packages/fms/src/modules/transports/` → `../fms/packages/transports/src/modules/transports/`. Untouched internally.
- **`@freighttech/truck-loading`** — same pattern from `truck_loading/`.
- **`@freighttech/templates`** — bundle `email_templates/` + `pdf_templates/` under `../fms/packages/templates/src/modules/`. Verified: both modules have their own `data/entities/`, `migrations/`, `api/`, `components/`, `lib/` (36 + 39 files each), and neither imports from `@open-mercato/templating`. `@open-mercato/templating` does **not** cover their behavior → bundle.

#### Step 1.8 — Wire up `apps/web` + run integration tests

- Populate `../fms/apps/web/src/modules.ts` with every new module id + `from: '@freighttech/<pkg>'`.
- `apps/web/package.json`:
  - Pins every `@open-mercato/*` platform dep at the exact version from Verdaccio.
  - References `@freighttech/*` domain packages via `workspace:*`.
  - Zero `portal:|link:|file:\.\.` entries.
- `apps/web/next.config.ts` `transpilePackages` includes every `@freighttech/*` workspace + `@open-mercato/*` deps that need HMR. Auto-generate from `workspaces.packages` to prevent drift.
- `apps/web/src/app/globals.css` — add Tailwind `@source` lines pointing at every `@freighttech/*` workspace `src/**/*.{ts,tsx}` path (utility classes in Tier 2 packages get scanned into the final CSS bundle). See `01` §1.9.4 for the full list. Recommendation: auto-generate via `scripts/update-globals-css.mjs` off `workspaces.packages` so new packages don't require manual edits.
- Publish every `@freighttech/*` package to FreightTech Verdaccio via `scripts/release.sh`.
- Run `yarn db:generate && yarn db:migrate` against a fresh DB — emits the renamed schema.
- **Integration test gate**: `yarn test:integration` green end-to-end against:
  - Renamed entity classes and table names.
  - Renamed event IDs (emitters in freight-documents/invoicing/offers, subscribers in folders/invoicing/projects).
  - Renamed DI keys (invoicing services, freight-documents services).
  - Renamed entity-type strings in data-engine queries.
  - Renamed feature IDs in ACL gates.
  - Renamed command IDs in commandBus tests.

Acceptance (end of Phase 1):
- Every `@freighttech/*` package builds standalone (`yarn workspace @freighttech/<pkg> build`).
- `rg "Fms(Project|File|Location|Rfq|Offer|Product|Carrier|Invoicing|Document|Team|UserTeam)" ../fms/packages/` returns zero.
- `rg "fms_(offers|projects|files|invoicing|locations|products|tasks_board|teams|documents)\b" ../fms/packages/` returns zero (except inside `@freighttech/{tracking,airfreight-4rcargo,transports,truck-loading,templates}` which keep their original module ids intentionally).
- `../fms/apps/web/` boots against a fresh DB. `yarn test:integration` green.
- Every `@freighttech/*` package resolvable from Verdaccio at a pinnable version.
- Fork still builds (untouched throughout Phase 1).
### Phase 2 — Retire fork FMS packages

After Phase 1 is green (every `@freighttech/*` package builds, `apps/web` boots, `yarn test:integration` passes end-to-end). **Nothing of `packages/fms/` remains in the fork**; the entire folder is deleted alongside the standalone FMS packages.

1. Delete `packages/fms/`, `packages/fms_tracking/`, `packages/fms_4rcargo/`, `packages/ksef/`, `packages/shipment-tracking/` from the fork — entire folders, no stub retained. Every module migrated to Tier 2 in Phase 1 except `fms_tracking`, which is dropped outright (zero in-repo consumers). `shipment-tracking` is moved, not dropped.
2. Remove every fms-related entry from `apps/mercato/src/modules.ts` (all `fms_*`, `tasks_board`, `contractors`, `transports`, `truck_loading`, `email_templates`, `pdf_templates`, `ksef`, `frc_*`, `shipment_tracking`, `annotations` registrations).
2a. **Remove fms-related Tailwind `@source` lines from `apps/mercato/src/app/globals.css`** — the three lines pointing at `@open-mercato/fms/**`, `@open-mercato/fms_tracking/**`, `@open-mercato/shipment-tracking/**`, plus any `fms_4rcargo`/`annotations` line if present. Leaving them in produces Tailwind warnings (paths no longer exist) or silent class-scan misses.
3. Same cleanup in `packages/create-app/template/src/modules.ts` and `packages/create-app/template/package.json.template` (drop fms deps from template).
4. Rename `scripts/registry/publish-fms.sh` → `scripts/registry/publish.sh` (or merge into existing) — the remaining script publishes only `@open-mercato/*` platform packages to Verdaccio. The old `publish.sh` (local-only) either retires or becomes `publish-local.sh` for dev convenience.
5. Delete `FMS-rework.md` (top-level) — obsolete.
6. Archive `separation/` as `docs/archive/separation/` (or delete).
7. Update the fork's `CHANGELOG.md` + `RELEASE_NOTES.md`: breaking-change note for v0.5.0 — "drops `@open-mercato/fms*` and `@open-mercato/ksef`. Consumers install `@freighttech/*` from the FreightTech Verdaccio."

Acceptance:
- `rg -l "fms|Fms|ksef" ~/Projects/freighttech/open-mercato/packages/` returns zero (README-ish / changelog references permitted).
- `ls ~/Projects/freighttech/open-mercato/packages/ | grep -iE "^(fms|ksef)"` returns zero.
- `~/Projects/freighttech/open-mercato/apps/mercato/` still builds and boots against a fresh DB with **no FMS modules enabled** — platform-only sanity run.
- Fork v0.5.0 published to Verdaccio with only `@open-mercato/*` tarballs.

## Part B — What stays in the fork (the platform boundary)

After migration completes, the fork owns **platform only** — nothing domain-specific.

### Packages that stay

| Package | Why it stays |
|---|---|
| `@open-mercato/core` | Platform core modules: auth, customers, catalog, sales, directory, RBAC, etc. |
| `@open-mercato/shared` | DSL helpers, utilities, types, i18n runtime. |
| `@open-mercato/ui` | Primitives, backend components, CrudForm, DataTable. |
| `@open-mercato/cli` | `mercato` CLI. |
| `@open-mercato/events` | Event bus. |
| `@open-mercato/queue` | Worker runtime. |
| `@open-mercato/cache` | Cache abstractions. |
| `@open-mercato/logger` | Logging base (note: `packages/fms/src/lib/logger.ts` moves to `@freighttech/logistics` — these are separate things). |
| `@open-mercato/search` | Search indexing (fulltext/vector/tokens). |
| `@open-mercato/ai-assistant` | MCP server + AI tooling. |
| `@open-mercato/onboarding` | Tenant onboarding wizard runtime. |
| `@open-mercato/content` | Static content modules. |
| `@open-mercato/documents` | **Platform document primitives (NOT `fms_documents`).** |
| `@open-mercato/messaging` | Inbound/outbound messaging primitives. |
| `@open-mercato/templating` | Email + PDF template engine (platform primitive). The fms-specific `email_templates`+`pdf_templates` modules bundle into `@freighttech/templates` (Step 1.7) as-is — they do not consume `@open-mercato/templating` today and carry their own runtime. |
| `@open-mercato/webhooks` | Standard Webhooks primitives. |
| `@open-mercato/scheduler` | Scheduled job runtime. |
| `@open-mercato/create-app` | The Tier 2 scaffolder (becomes more important — see Part D). |
| `@open-mercato/example` | Reference module. |
| `@open-mercato/gateway-stripe`, `sync-akeneo`, `checkout`, `vector` | Integration adapters — platform-generic. |
| `@open-mercato/enterprise` | Commercial overlays. |

### Fork-level assets that stay

- `apps/mercato/` — reference app for platform development + integration tests.
- `apps/docs/` — public docs site.
- `scripts/registry/publish.sh` — platform publish (to `http://localhost:4873` for dev; after Phase 2 this script is renamed/merged with `publish-fms.sh` to publish `@open-mercato/*` to the hosted FreightTech Verdaccio at `https://dev.registry.freighttech.org/`).
- `scripts/test-create-app.ts`, `scripts/test-create-app-integration.ts` — scaffold smoke tests.
- `scripts/dev.mjs`, `scripts/dev-ephemeral.ts` — monorepo dev runtimes.
- `.ai/`, `AGENTS.md`, `CLAUDE.md`, `BACKWARD_COMPATIBILITY.md`, `separation/` (archived after Phase 2).
- Root configs: `turbo.json`, `tsconfig.base.json`, `eslint.config.mjs`, `docker-compose*.yml` (Verdaccio + ephemeral stack).

### Fork-level assets that leave

- `apps/mercato/src/modules.ts` — drop every `fms_*`/`ksef`/`contractors`/`tasks_board`/`transports`/`truck_loading`/`email_templates`/`pdf_templates`/`frc_*` entry.
- `packages/create-app/template/src/modules.ts` — same cleanup.
- `packages/create-app/template/package.json.template` — drop FMS + KSeF deps.
- `scripts/registry/publish-fms.sh` — renamed to `publish.sh` (the remaining script publishes `@open-mercato/*` to Verdaccio; see Part D).
- `FMS-rework.md` (top-level) — moves to `../fms/docs/` or retires.
- `separation/` — archives after Phase 2.

## Part C — What the Tier 2 `fms` repo contains

After migration, `../fms/` has:

### Shape

```
~/Projects/freighttech/fms/
├── apps/
│   └── web/                       # the Next app (former create-mercato-app scaffold)
│       ├── src/modules.ts         # references @freighttech/* + @open-mercato/* (platform)
│       ├── src/di.ts, src/bootstrap.ts
│       ├── scripts/, .mercato/generated/
│       └── package.json           # pins @open-mercato/* from Verdaccio
├── packages/
│   ├── logistics/                 # @freighttech/logistics
│   ├── facilities/                # @freighttech/facilities
│   ├── products/                  # @freighttech/products
│   ├── contractors/               # @freighttech/contractors
│   ├── offers/                    # @freighttech/offers
│   ├── projects/                  # @freighttech/projects
│   ├── invoicing/                 # @freighttech/invoicing
│   ├── shipment-tracking/         # @freighttech/shipment-tracking (was @open-mercato/shipment-tracking — moved to Tier 2)
│   ├── annotations/               # @freighttech/annotations (was @open-mercato/annotations — moved to Tier 2; only fms consumers)
│   ├── ksef/                      # @freighttech/ksef
│   ├── airfreight-4rcargo/        # @freighttech/airfreight-4rcargo
│   ├── freight-documents/         # @freighttech/freight-documents
│   ├── teams/                     # @freighttech/teams
│   ├── transports/                # @freighttech/transports
│   ├── truck-loading/             # @freighttech/truck-loading
│   └── templates/                 # @freighttech/templates (bundles email_templates + pdf_templates)
├── scripts/
│   ├── setup.mjs                  # one-command bootstrap (clones fork as sibling, installs)
│   ├── use-local.mjs              # portal overlay on/off
│   ├── guard-clean-pkg.mjs        # postinstall warning
│   └── release.sh                 # publish @freighttech/* to Verdaccio
├── .husky/pre-push                # block portal/link/file references in commits
├── package.json                   # workspaces, turbo, pre-push guard
├── package.local.json             # gitignored — portal overrides (optional)
├── turbo.json
├── .yarnrc.yml                    # @open-mercato scope → Verdaccio
└── .gitignore                     # includes package.local.json, package.json.prod-backup
```

### Invariants Tier 2 must preserve

- **Committed `package.json` is always portal-free.** Enforced by pre-push + postinstall guard.
- **`@open-mercato/*` pinned to exact versions.** No `^`. Predictable Dokploy builds.
- **`@open-mercato/*` declared as `peerDependencies`** in each `@freighttech/*` package (not `dependencies`). Prevents duplicate copies in customer apps.
- **`apps/web/next.config.ts` `transpilePackages`** lists every `@freighttech/*` workspace AND the `@open-mercato/*` packages that need HMR. Auto-generate from `workspaces.packages` to prevent drift.

### Event-namespace lockstep — the `freight_documents.*` rename

Step 1.5 renames every `fms_documents.*` event id to `freight_documents.*`. **Six subscriber files** (landed in earlier steps) reference these strings and must be updated in lockstep:

| Package (step) | Subscriber | Listening to |
|---|---|---|
| `@freighttech/projects` (Step 1.4) | `folders/subscribers/auto-link-to-folder` | `freight_documents.document.processed` |
| `@freighttech/projects` (Step 1.4) | `folders/subscribers/create-invoice-from-document` | `freight_documents.document.processed` |
| `@freighttech/projects` (Step 1.4) | `folders/subscribers/auto-create-leg-from-booking` | `freight_documents.document.processed` |
| `@freighttech/projects` (Step 1.4) | `projects/subscribers/auto-create-from-booking` | `freight_documents.document.processed` |
| `@freighttech/invoicing` (Step 1.6) | `invoicing/subscribers/auto-import-from-documents` | `freight_documents.invoice.updated` |
| `@freighttech/invoicing` (Step 1.6) | `invoicing/subscribers/auto-create-from-extraction` | `freight_documents.invoice.created` |

Execution sequence inside Phase 1 that avoids a live-event gap:
1. Step 1.4 lands four subscribers already using the renamed `freight_documents.*` strings. No emitter yet — subscribers register silently.
2. Step 1.5 lands the emitter with the matching new strings. The four subscribers from Step 1.4 start receiving events immediately.
3. Step 1.6 lands the remaining two subscribers (also using the renamed strings). They receive the next matching emission.

Payload-type imports in all six files resolve from `@freighttech/logistics/types/freight-document-events` (staged in Phase 1) so no subscriber package compile-depends on `@freighttech/freight-documents`.

## Part D — What the fork must expose so another Tier 2 repo can be built on top of it

This is the reusable part — the scaffolding surface the fork provides for any downstream "distribution" repo, not just `fms`.

### 1. Monorepo-shaped scaffolder

Today `create-mercato-app` produces an app-shaped scaffold. Other Tier 2 repos (besides `fms`) will want the same monorepo skeleton. Two options:

**Option A: `create-mercato-app --template distribution`.** Add a second template folder `packages/create-app/template-distribution/` alongside the existing `template/`. The distribution template is monorepo-shaped: root `package.json` with `workspaces: ["apps/*", "packages/*"]`, `apps/web/` holds the Next app (the current template becomes its body), `packages/` is empty, plus the dev-workflow scripts (`setup.mjs`, `use-local.mjs`, `guard-clean-pkg.mjs`, `release.sh`). Flag toggles which template gets copied.

**Option B: `create-mercato-distribution` separate CLI.** New package `packages/create-mercato-distribution/` with its own bin. Mirrors `create-mercato-app`'s structure.

Recommend **Option A** — less duplication, same build/release machinery, the flag is a one-line switch in `src/index.ts`. The distribution template is small: ~10 files (root package.json.template, turbo.json, scripts/, .husky/, .yarnrc.yml, a stub `apps/web/` that extends the existing app template).

### 2. Publishing script templates

- `scripts/registry/publish.sh` in the fork stays — publishes `@open-mercato/*` only (after Phase 2 drops FMS). Auto-discover non-private `packages/*` rather than hardcoding (currently already does).
- **Drop** `scripts/registry/publish-fms.sh` — FMS publishes from the Tier 2 repo, not the fork.
- Add a **template `release.sh`** under `packages/create-app/template-distribution/scripts/release.sh` — every new Tier 2 repo inherits the same publish pattern (unpublish-same-version → `yarn build` → `yarn pack` → `npm publish` per package, scope-agnostic).

### 3. AGENTS.md documentation

Add a new top-level section or page (e.g., `packages/create-app/AGENTS.md` gets a "Tier 2 distribution workflow" section, or a new `docs/distribution-workflow.md` on the docs site) covering:

- The three-tier model (fork / distribution monorepo / customer app).
- Portal escape hatch (`yarn dev:core` / `yarn dev:remote`).
- Commit-clean invariants + how to enforce.
- Version discipline (pin, peer deps, publish order).
- The `transpilePackages` requirement for HMR through portals/symlinks.

### 4. Stable platform contracts

Everything in `BACKWARD_COMPATIBILITY.md` already applies — but becomes load-bearing because Tier 2 repos are now external consumers in practice. Every breaking change in `@open-mercato/*` forces a coordinated `fms`/other-Tier-2 update. The deprecation protocol (`@deprecated` + bridge for ≥1 minor version) is the contract that makes this bearable.

### 5. Verdaccio pattern docs

Tier 2 repos need to know:
- Which Verdaccio to consume (`https://dev.registry.freighttech.org/` is FreightTech's; others may point elsewhere).
- How the fork publishes to it (`yarn registry:publish` variant).
- What happens if storage is nuked (pins disappear, republish required).

Document this once in the fork, Tier 2 repos copy the pattern.

## Acceptance criteria (overall)

After Phase 0 → Phase 1 → Phase 2 ship:

1. `rg -l "Fms|fms_|@open-mercato/fms|@open-mercato/ksef" ~/Projects/freighttech/open-mercato/packages/` returns zero (doc/changelog references permitted).
2. `~/Projects/freighttech/open-mercato/packages/{fms,fms_tracking,fms_4rcargo,ksef,shipment-tracking,annotations}/` do not exist (all deleted in Phase 2 — `fms_tracking` dropped outright; the rest migrated to Tier 2).
3. `~/Projects/freighttech/open-mercato/apps/mercato/src/modules.ts` references zero FMS/KSeF modules.
4. `~/Projects/freighttech/fms/packages/*` contains every `@freighttech/*` package: `logistics`, `facilities`, `products`, `contractors`, `teams`, `offers`, `projects`, `freight-documents`, `ksef`, `invoicing`, `tracking`, `airfreight-4rcargo`, `transports`, `truck-loading`, `templates`. Each builds standalone.
5. `~/Projects/freighttech/fms/apps/web` builds + boots against a fresh DB. **`yarn test:integration` passes end-to-end** against the renamed schema, event IDs, entity-type strings, DI keys, feature IDs, and class names (per the per-phase test-rewrite inventory).
6. `~/Projects/freighttech/fms/apps/web/package.json` pins every `@open-mercato/*` dep at an exact version from Verdaccio; every `@freighttech/*` dep resolves via `workspace:*`; zero `portal:|link:|file:` in committed `package.json` / `yarn.lock`.
7. Every `@freighttech/*` package declares `@open-mercato/*` deps in `peerDependencies` (not `dependencies`) so Tier 3 customer apps install one copy.
8. Pre-push hook in `../fms` blocks commits that introduce `portal:|link:|file:\.\.` references.
9. Fork Verdaccio serves every `@open-mercato/*` package; FreightTech Verdaccio serves every `@freighttech/*` package. In the default setup both scopes live on the same registry (`https://dev.registry.freighttech.org/`).
10. `create-mercato-app --template distribution my-next-tier-2` in a fresh directory produces a working monorepo skeleton equivalent to `../fms/` shape (minus the `@freighttech/*` packages).
11. Release notes in both repos describe the split + new consumption path. Fork CHANGELOG notes the v0.5.0 breaking change.

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Phase 1 scope is large (one PR, 15+ packages). Review is hard. | Split Phase 1 internally by the step order (1.1 logistics → 1.2 master-data → … → 1.8 apps/web wire-up). Land as a stack of PRs that merge in sequence WITHOUT intermediate releases. The fork stays untouched during the stack, so no external consumer sees half-done state. Reviewer uses `01` §§1.1–1.9 rename tables as the mechanical checklist per step. |
| Event-id string coupling: `freight_documents.*` subscribers in `folders`/`invoicing`/`projects` reference strings owned by `@freighttech/freight-documents`. | Payload types live in `@freighttech/logistics/types/freight-document-events.ts` (staged in step 1.1) so subscribers compile-depend only on logistics. Event strings are a runtime contract — treat as frozen per `BACKWARD_COMPATIBILITY.md` §5 once published. |
| Fork version drift: Tier 2's pinned `@open-mercato/core@0.4.10` goes stale while platform advances. | Bump pins on a cadence (monthly or per platform release) via a Tier 2 CI job that runs `yarn upgrade @open-mercato/*` and files a PR. |
| Verdaccio storage loss on the FreightTech dev registry makes old pins unresolvable. | Persistent volume mount for Verdaccio storage; append-only publish flows against shared dev registries (never `docker volume rm`). |
| Integration tests rely on old event IDs / entity types / DI keys and silently pass after the rename. | Step 1.8's test gate re-runs `yarn test:integration` against a fresh DB with the renamed schema — a passing run proves the test fixtures were also updated (fresh fixtures come from test setup, not DB seeds). Grep-acceptance checks (§§1.1–1.9 table patterns) guard against missed renames in the source. |
| Downstream customer apps (Tier 3) unknowingly install both `@open-mercato/fms` (old) and `@freighttech/*` (new) during the window between Phase 1 (Tier 2 published) and Phase 2 (fork retires). | Compress the window — Phase 2 runs immediately after Phase 1 is green. The fork's v0.5.0 release that drops `@open-mercato/fms*` gets a major version bump + prominent CHANGELOG entry. Tier 3 apps explicitly choose when to upgrade. |

## Open decisions to resolve before starting

**All resolved.**

- ~~**`email_templates` + `pdf_templates` fate.**~~ Resolved → Step 1.7 bundles both into `@freighttech/templates`. Grep verified: neither module imports from `@open-mercato/templating`; both have their own entities/migrations/api/components (36 + 39 files). `@open-mercato/templating` does **not** cover their behavior → bundle, don't delete.
- ~~**Rename `fms_documents` module id**~~ Resolved → yes, rename to `freight_documents` per spec `08-pkg-freight-documents.md`. Happens in Step 1.5 alongside the E5 remediation.
- ~~**What happens to `fms_teams`**~~ Resolved → renamed to `teams` per spec `09-pkg-teams.md`. Lands in Step 1.2 alongside master-data.
- ~~**`fms_4rcargo` registry placement.**~~ Resolved → publish publicly to the shared FreightTech Verdaccio (no `publishConfig.access: "restricted"`). Drop `"private": true` from its `package.json`. See Step 1.7.
- ~~**`@open-mercato/shipment-tracking` vs `@freighttech/tracking` overlap.**~~ Resolved → `packages/shipment-tracking/` moves to Tier 2 as `@freighttech/shipment-tracking` (Step 1.7). `packages/fms_tracking/` is **dropped entirely** in Phase 2 (zero in-repo consumers). Step 1.4 declares `@freighttech/shipment-tracking` as a regular `workspace:*` dep of `@freighttech/projects` (per the "only `@open-mercato/*` are peer deps; `@freighttech/*` siblings are regular deps" rule).
- ~~**Tier 2 Verdaccio URL.**~~ Confirmed: `https://dev.registry.freighttech.org/` serves both `@open-mercato/*` and `@freighttech/*` scopes. Single registry.
- ~~**Node version floor.**~~ Confirmed: Node 24 (matches fork).

No open decisions remain. Phase 0 can start.

## Next actions (in order)

- [ ] Decide the four remaining open decisions.
- [ ] **Phase 0** — scaffold `../fms/` as an empty monorepo skeleton (apps/web, workspaces, Verdaccio wiring, pre-push guards). Commit to a fresh git repo.
- [ ] **Phase 1** — bulk migration. One work unit covering every step 1.1–1.8 (logistics leaf → master-data → offers → projects → freight-documents → ksef+invoicing → as-is moves → apps/web wire-up + integration-test gate). Land as one PR or a tight burst of merged-together PRs. No external release between steps.
- [ ] **Phase 2** — retire fork FMS. Delete `packages/{fms,fms_tracking,fms_4rcargo,ksef,shipment-tracking,annotations}/` (fms_tracking is dropped outright; rest moved in Phase 1). Clean `apps/mercato/src/modules.ts` + `create-app` templates; rename publish scripts; archive `separation/`; ship fork v0.5.0 with breaking-change notes.
- [ ] Parallel to Phase 2 — add `--template distribution` to `@open-mercato/create-app` + the companion docs in the fork (Part D items 1–3).
