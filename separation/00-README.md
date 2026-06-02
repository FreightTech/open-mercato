# FMS Package Separation + Migration — Spec Set

This folder contains the specs for:

1. **Migrating every fms-related package out of the fork** into a new Tier 2 monorepo at `~/Projects/freighttech/fms/` under the `@freighttech/*` scope.
2. **Splitting the monolithic `packages/fms`** into independently versioned packages during the move.
3. **Renaming every surface to drop the `fms` / `Fms` prefix** (packages, modules, classes, DB tables, entity-type strings, event IDs, DI keys, feature IDs, command IDs).

The datamodel shape is preserved; DB data is disposable (fresh `db:generate && db:migrate` produces the renamed schema). Two registries: fork publishes `@open-mercato/*` platform packages to Verdaccio, Tier 2 publishes `@freighttech/*` domain packages to the same Verdaccio; Tier 2's `apps/web` pins `@open-mercato/*` at exact versions.

## Read order

Start with MIGRATION (sequencing authority), then 01 (rename tables), then drill into per-package specs as needed.

1. **[MIGRATION-TO-FREIGHTTECH.md](./MIGRATION-TO-FREIGHTTECH.md)** — **the sequencing plan.** Three phases: Phase 0 scaffold Tier 2 → Phase 1 bulk migration (steps 1.1–1.8, all packages in dep-resolution order) → Phase 2 retire fork FMS. Covers fork/Tier-2 boundary, Verdaccio wiring, event-namespace lockstep. Every step cites rename tables in 01 or per-package specs.
2. **[01-split-overview.md](./01-split-overview.md)** — **the rename tables.** Every surface (§§1.1–1.9: packages, module IDs, entity classes, DB tables, entity-type strings, event IDs, command IDs, DI keys, feature IDs). MIGRATION's phases defer to these tables.
3. **[02-pkg-projects.md](./02-pkg-projects.md)** — `@freighttech/projects` (modules `projects` + `folders`). Migration Phase 1, Step 1.4.
4. **[03-pkg-offers.md](./03-pkg-offers.md)** — `@freighttech/offers` (modules `offers` + `rfq_board`, formerly `tasks_board`). Step 1.3.
5. **[04-pkg-invoicing.md](./04-pkg-invoicing.md)** — `@freighttech/invoicing` (module `invoicing`, KSeF wiring). Step 1.6.
6. **[05-master-data-overview.md](./05-master-data-overview.md)** — four master-data packages, all land in Step 1.2:
   - **[05a-pkg-facilities.md](./05a-pkg-facilities.md)** — `@freighttech/facilities`.
   - **[05b-pkg-products.md](./05b-pkg-products.md)** — `@freighttech/products`.
   - **[05c-pkg-contractors.md](./05c-pkg-contractors.md)** — `@freighttech/contractors`.
   - **[09-pkg-teams.md](./09-pkg-teams.md)** — `@freighttech/teams`.
7. **[06-pkg-logistics.md](./06-pkg-logistics.md)** — `@freighttech/logistics` library-only shared leaf. Step 1.1.
8. **[07-cross-boundary-remediation.md](./07-cross-boundary-remediation.md)** — the five remediations (E1–E5) + two pre-existing bug fixes that ride inside their owning Step 1.x. Not a standalone phase.
9. **[08-pkg-freight-documents.md](./08-pkg-freight-documents.md)** — `@freighttech/freight-documents` (module `freight_documents`, formerly `fms_documents`). Step 1.5.

## Scope summary

**Every fms-related package moves out of the fork in a single migration** per `MIGRATION-TO-FREIGHTTECH.md`. Three phases: Phase 0 scaffold `../fms/` → Phase 1 bulk move + rename + remediate + test everything at once → Phase 2 delete the fork's fms packages. Packages that get renamed apply the rename tables in 01 §§1.1–1.9; packages that move as-is keep their internal class + module ids. The fork retains only platform packages after Phase 2.

| Fork today | Tier 2 package (`@freighttech/*`) | Rename? | MIGRATION Phase 1 step |
|---|---|---|---|
| `packages/fms/src/lib/{activity,inline-edit,logger,financials,hooks}/` | `@freighttech/logistics` | n/a (library-only, no classes) | 1.1 |
| `packages/fms/src/modules/fms_products/` | `@freighttech/products` | yes, full | 1.2 |
| `packages/fms/src/modules/fms_locations/` | `@freighttech/facilities` | yes, full (`FmsLocation` → `Facility`) | 1.2 |
| `packages/fms/src/modules/contractors/` | `@freighttech/contractors` | no (already prefix-free); + E4 | 1.2 |
| `packages/fms/src/modules/fms_teams/` | `@freighttech/teams` | yes, full | 1.2 |
| `packages/fms/src/modules/fms_offers/` + `tasks_board/` | `@freighttech/offers` | yes, full (`tasks_board` → `rfq_board`) | 1.3 |
| `packages/fms/src/modules/fms_projects/` + `fms_files/` | `@freighttech/projects` | yes, full (`FmsFile` → `Folder`) + E1 | 1.4 |
| `packages/fms/src/modules/fms_documents/` | `@freighttech/freight-documents` | yes, full (`FmsDocument` → `FreightDocument`, `FmsInvoice` → `ExtractedInvoice`) + E5 | 1.5 |
| `packages/ksef/` | `@freighttech/ksef` | no (as-is) | 1.6 |
| `packages/fms/src/modules/fms_invoicing/` | `@freighttech/invoicing` | yes, full + pre-existing bug fixes | 1.6 |
| `packages/shipment-tracking/` | `@freighttech/shipment-tracking` | no (as-is; module id stays `shipment_tracking`) | 1.7 |
| `packages/annotations/` | `@freighttech/annotations` | no (as-is; only fms consumers today) | 1.7 |
| `packages/fms_tracking/` | **DELETED — not migrated** (zero in-repo consumers) | n/a | Phase 2 |
| `packages/fms_4rcargo/` | `@freighttech/airfreight-4rcargo` | no (as-is; imports of `FmsLocation`/`Contractor` flip to `@freighttech/*`). Published publicly to shared Verdaccio (no `restricted` access). | 1.7 |
| `packages/fms/src/modules/transports/` | `@freighttech/transports` | no (as-is) | 1.7 |
| `packages/fms/src/modules/truck_loading/` | `@freighttech/truck-loading` | no (as-is) | 1.7 |
| `packages/fms/src/modules/email_templates/` + `pdf_templates/` | `@freighttech/templates` (bundled; neither module uses `@open-mercato/templating` today, so bundling — not deletion — is the correct path) | no (as-is) | 1.7 |
| `apps/web` wire-up + integration test gate | — | — | 1.8 |

Post-Phase-2 fork content: zero fms-related packages. Platform only (`@open-mercato/{core,shared,ui,cli,events,queue,cache,logger,search,ai-assistant,onboarding,content,documents,messaging,templating,webhooks,scheduler,create-app,example,enterprise,gateway-stripe,sync-akeneo,checkout,vector}`). Note `shipment-tracking` and `annotations` are **no longer in the fork** — both moved to Tier 2 since their only consumers are fms packages.

## Three critical findings that shape the plan

1. **`tasks_board` is the RFQ board, not a generic task board.** It owns `useChargeSync`, `wizard-utils`, the RFQ kanban, and the wizard UI. It ships inside `@freighttech/offers` — and the rename makes this explicit: module id `tasks_board` → `rfq_board`. See [03-pkg-offers.md](./03-pkg-offers.md) and [07-cross-boundary-remediation.md](./07-cross-boundary-remediation.md) §3.
2. **`FmsProject` entities hard-import `FmsRfq` and `FmsOffer`.** `@ManyToOne` decorators across the projected package boundary. Remediation: drop the ORM-typed relations; keep the columns as plain UUIDs. See [07-cross-boundary-remediation.md](./07-cross-boundary-remediation.md) §1.
3. **Circular source-level dep via `convertCurrency` + `ExchangeRateSnapshot`.** Offers calls projects' currency helpers; projects imports offers' exchange-rate type. Fix: move both into `@freighttech/logistics`. See [06-pkg-logistics.md](./06-pkg-logistics.md) and [07-cross-boundary-remediation.md](./07-cross-boundary-remediation.md) §2.

## Target package graph after the split

```
       FORK (Tier 1)                    TIER 2 (../fms/)
       ─────────────                    ────────────────
                                                          (all @freighttech/*)

    @open-mercato/core          ─peerDep─►   @freighttech/logistics   (leaf — libs + types + event payload contracts)
    @open-mercato/shared                             │
    @open-mercato/ui                                 │
    @open-mercato/templating                ┌────────┼─────────┬────────────┬────────────────┐
    @open-mercato/documents                 ▼        ▼         ▼            ▼                ▼
    @open-mercato/core               facilities  products  contractors   teams          freight-documents
      modules + CLI                    (leaf)    (leaf)   (→facilities) (→contr.UUID)    (post-E5: leaf;
                                         │         │         │             │               all cross-module
                                         └────┬────┴────┬────┘             │               reads via data engine)
                                              │         │                  │
                                              ▼         ▼                  │
                                           offers (offers+rfq_board)       │
                                              │                            │
                                              ▼                            │
                                           projects (projects+folders)     │ subscribes to
                                              │                            │  freight_documents.*
                                              │◄───────────────────────────┘    (payload types in
                                              │                                  @freighttech/logistics)
                                              ▼
                                           invoicing  ──peerDep──► @freighttech/ksef
                                              (→contractors runtime lookup)

                                           Tracking:
                                           @freighttech/shipment-tracking
                                              (moved from fork — emits shipment_tracking.*
                                               consumed by folders+projects subscribers)

                                           Plus other as-is packages:
                                           @freighttech/{airfreight-4rcargo,
                                                          transports, truck-loading, templates}
```

**Platform boundary** — every `@freighttech/*` package declares `@open-mercato/*` deps as `peerDependencies` (not `dependencies`). Tier 2's `apps/web/package.json` is the one place that pins exact `@open-mercato/*` versions from the fork's Verdaccio. Single registry at `https://dev.registry.freighttech.org/` serves both `@open-mercato/*` (published by fork) and `@freighttech/*` (published by Tier 2).

**Dep arrows** (all packages are `@freighttech/*`; every one declares `@open-mercato/*` platform deps as `peerDependencies`):
- `contractors` → `facilities` (Google Places editor, address types)
- `offers` → `facilities`, `products`, `contractors`
- `projects` → `offers` (UUID FKs only, no ORM-typed relations), `facilities`, `products`, `contractors`
- `invoicing` → `contractors` (**required workspace dep — direct import of `Contractor` + `ContractorAddress` for backend-page party lookups**; not an ORM FK — `Invoice` entities hold party data as denormalized strings; see overview §2.4), `ksef` (workspace dep)
- `teams` → no domain deps (UUID-only FKs to contractors)
- `freight-documents` → no domain deps (all cross-module reads via data engine after E5; event payload types live in `logistics`)
- every domain package → `logistics`
- `airfreight-4rcargo` → `facilities`, `contractors`, `templates` (imports rewritten during Step 1.7)

## Quick acceptance checklist

- [ ] Every `@freighttech/*` package lives under `../fms/packages/*` and builds standalone: `logistics`, `facilities`, `products`, `contractors`, `teams`, `offers`, `projects`, `freight-documents`, `ksef`, `invoicing`, `shipment-tracking`, `annotations`, `airfreight-4rcargo`, `transports`, `truck-loading`, `templates`.
- [ ] No source file under the new packages imports via a relative path that crosses a package boundary.
- [ ] `../fms/apps/web/src/modules.ts` references each module via its new package name with the renamed module id (Tier 2, not fork).
- [ ] `yarn generate` + `yarn db:generate` produce a clean migration against a fresh DB: renamed tables, same column structure.
- [ ] No `Fms` / `fms_` identifier survives in the renamed domain packages under `../fms/packages/{logistics,facilities,products,contractors,teams,offers,projects,freight-documents,invoicing,shipment-tracking}/`. Allow-list: `@freighttech/airfreight-4rcargo` (keeps `frc_*` + `air_cargo` modules), `@freighttech/transports`/`truck-loading`/`templates` (as-is moves retain internal class names).
- [ ] Grep for `Fms(Rfq|Offer|Project|File|Location|Product|Carrier|Invoicing|Document|Team|UserTeam)` under new packages returns zero matches.
- [ ] `@freighttech/airfreight-4rcargo` (formerly `packages/fms_4rcargo`) imports of `FmsLocation`/`Contractor*`/email-template helpers rewritten to `@freighttech/facilities`/`@freighttech/contractors`/`@freighttech/templates` paths during its Step 1.7 move.
- [ ] Fork's `packages/{fms,fms_tracking,fms_4rcargo,ksef,shipment-tracking,annotations}/` deleted in Phase 2. `rg -l "fms|Fms|ksef|shipment-tracking|annotations" ~/Projects/freighttech/open-mercato/packages/` returns zero (docs/changelog permitted).
