# SPEC — `@freighttech/offers`

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Phase** | Migration Phase 1, Step 1.3 (see [`MIGRATION-TO-FREIGHTTECH.md`](./MIGRATION-TO-FREIGHTTECH.md)) |
| **Modules hosted** | `offers` (formerly `fms_offers`), `rfq_board` (formerly `tasks_board`) |
| **Depends on** | `@freighttech/logistics`, `@freighttech/facilities`, `@freighttech/products`, `@freighttech/contractors` |

## 1. Why `rfq_board` (formerly `tasks_board`) lives here

The old module `tasks_board` never was a generic task board — it was the RFQ kanban. Component inventory post-rename:

| Path in `rfq_board` | What it does |
|---|---|
| `components/KanbanBoard.tsx`, `KanbanColumn.tsx`, `KanbanCard.tsx` | Draws the RFQ kanban (columns map to `RfqStatus`) |
| `components/RfqWizardSheet.tsx`, `RfqWizardStepper.tsx`, `WizardStep{Request,Pricing,Preview}.tsx` | Unified 3-step RFQ wizard |
| `components/RfqContextPanel.tsx`, `RfqCreateDialog.tsx`, `RfqTableView.tsx` | RFQ context panels + list |
| `components/ExchangeRateSection.tsx`, `ChargesTable.tsx`, `ChargesToolbar.tsx` | Charge-line editor shared by RFQ + offer wizards |
| `lib/useChargeSync.ts` | Syncs charge rows → offer lines. Imported by `offers/lib/useOfferWizardState.ts`. |
| `lib/wizard-utils.ts` | `buildDefaultChargeRows`, `resolveItemFacilities`, `saveItemFieldsToServer`, etc. Imported by `offers/lib/useOfferWizardState.ts`. |
| `lib/wizard-types.ts` | `WizardItem`, `ProductItem`, `makeEmptyItem`, `offerLineToChargeRow`. Imported by `offers/lib/useOfferWizardState.ts`. |

The rename from `tasks_board` to `rfq_board` is part of Step 1.3. Module id changes (feature rows get reseeded per the relaxed BC policy).

## 2. What's inside

```
packages/offers/
├── package.json
├── build.mjs, watch.mjs
├── tsconfig.json
├── src/
│   └── modules/
│       ├── offers/                    # formerly fms_offers
│       │   ├── acl.ts                 # feature ids: offers.view, offers.manage, offers.rfq.view, … (illustrative — see `fms_offers/acl.ts` for the actual complete list, renamed 1:1)
│       │   ├── api/
│       │   │   ├── offers/
│       │   │   └── rfq/               # RFQ REST — board/create/update/send
│       │   ├── backend/
│       │   ├── commands/              # command ids renamed fms_offers.rfq.* → offers.rfq.*, fms_offers.offer.* → offers.offer.* (rfq.ts, offers.ts, offer-operations.ts, calculations.ts). conversion.ts stays — rewritten in Step 1.3 to delegate cross-package work via commandBus.execute('projects.create_from_offer', …) instead of direct entity imports.
│       │   ├── components/            # OfferWizardSheet, OfferDetailView, SendOfferDialog, … — PLUS OfferCreationForm.tsx and OfferDetailView.tsx currently living under tasks_board/components/ (see §3.5 below for the decision to relocate them here during Step 1.3)
│       │   ├── constants.ts
│       │   ├── data/
│       │   │   ├── entities.ts        # Rfq, RfqItem, Offer, OfferCalculation, OfferLine, Note
│       │   │   ├── types.ts           # keeps offer-specific types — shared enums (RfqStatus, CHARGE_UNITS, DIRECTIONS, TRANSPORT_MODES) moved to @freighttech/logistics per §5
│       │   │   └── validators.ts
│       │   # no events.ts — fms_offers has none today and the migration does not introduce any (conversion.ts stays atomic via commandBus.execute).
│       │   ├── i18n/
│       │   ├── index.ts               # metadata.name === 'offers' (field name is `name`, not `id`)
│       │   ├── lib/                   # offer-pdf.service, rfq-extraction, rfq-email-intake
│       │   ├── migrations/
│       │   ├── search.ts              # entity types: offers:rfq, offers:offer, offers:offer_calculation, offers:offer_line, offers:rfq_item, offers:note (colon + snake_case)
│       │   ├── setup.ts
│       │   └── widgets/
│       └── rfq_board/                 # formerly tasks_board
│           ├── acl.ts                 # feature ids: rfq_board.view, rfq_board.manage
│           ├── CLAUDE.md              # update banner: module renamed from tasks_board to rfq_board
│           ├── backend/rfq-board/
│           ├── components/            # KanbanBoard, RfqWizardSheet, WizardStep*, ChargesTable, RfqContextPanel, RfqCreateDialog, RfqTableView, ExchangeRateSection, … (but NOT OfferCreationForm/OfferDetailView — those relocate to offers/components/ in Step 1.3, see §3.5)
│           ├── i18n/
│           ├── index.ts               # metadata.name === 'rfq_board'
│           ├── lib/                   # useChargeSync, wizard-utils, wizard-types, board-config
│           └── widgets/
└── generated/
```

DB tables after rename: `rfqs`, `rfq_items`, `offers`, `offer_calculations`, `offer_lines`, `notes`.

## 3. Boundary tightening (E3)

Intra-package edges between `offers` and `rfq_board` are allowed — they ship together. Only cross-PACKAGE leaks matter.

Known edges to fix during Step 1.3:

| Current | Fix |
|---|---|
| `offers/commands/conversion.ts` → `projects/data/entities` + `projects/commands/shared` + `projects/data/types` (direct entity construction) | Rewrite to delegate via `commandBus.execute('projects.create_from_offer', {offerId, tenantId, organizationId})`. `@freighttech/projects` registers the handler (sync, in-process — preserves single-transaction atomicity). No compile-time dep `offers → projects`. See [02-pkg-projects.md](./02-pkg-projects.md) §5. |
| `offers/lib/offer-pdf.service.tsx`, `offers/commands/offer-operations.ts`, `offers/api/offers/route.ts`, `offers/api/offers/[id]/email-preview/route.ts` → `projects/lib/financials` (`convertCurrency`) — **four callsites** (earlier drafts listed three; `offers/api/offers/route.ts:10` was missing) | Import from `@freighttech/logistics/lib/financials` (E2). |
| `offers/lib/rfq-email-intake.service.ts` → `facilities/data/entities` + `contractors/data/entities` | Import from `@freighttech/facilities/modules/facilities/data/entities` and `@freighttech/contractors/modules/contractors/data/entities`. |
| `offers/components/OfferBasicInfoPanel.tsx` → `rfq_board/components/ExchangeRateSection` | Intra-package after move. Keep as relative import. |

### 3.5 Delete re-export shims for `OfferCreationForm` + `OfferDetailView`

Earlier drafts called this a "relocate from tasks_board to offers." That overstates the work. Verified against actual files:

- `packages/fms/src/modules/tasks_board/components/OfferCreationForm.tsx` — **1-line re-export**: `export { OfferCreationForm } from '../../fms_offers/components/OfferCreationForm'`.
- `packages/fms/src/modules/tasks_board/components/OfferDetailView.tsx` — **1-line re-export**: `export { OfferDetailView } from '../../fms_offers/components/OfferDetailView'`.

The canonical implementations already live in `fms_offers/components/`. The tasks_board versions are thin leftover shims.

**Step 1.3 action:** delete both shim files from `rfq_board/components/`. Sweep callsites that import via the shim (`rg "from '[^']*(tasks_board|rfq_board)/components/(OfferCreationForm|OfferDetailView)'"`) and flip them to import from `offers/components/` directly. No component move, no class rename, no widget-injection adjustment — two-file delete + callsite sweep.

### No `events.ts` — conversion.ts stays atomic

`fms_offers` has no `events.ts` today and the migration does not create one. The cross-package call in `conversion.ts` flips from direct entity construction to `commandBus.execute('projects.create_from_offer', …)`:

```ts
// packages/offers/src/modules/offers/commands/conversion.ts (post-Step 1.3)
import { registerCommand } from '@open-mercato/shared/lib/commands'

registerCommand({
  id: 'offers.offers.convert_to_project',  // command id kept (singular outlier — note `offers.` middle segment, see 01 §1.7)
  handler: async (input, ctx) => {
    // … validate offer, mutate offer status …
    // Delegate project creation to projects package (sync, in-process).
    await ctx.commandBus.execute('projects.create_from_offer', {
      offerId: input.offerId,
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId,
    })
    // Everything runs in the caller's transaction — commandBus is synchronous.
  },
})
```

The `projects.create_from_offer` handler lives in `@freighttech/projects/commands/create-from-offer.ts` (created in Step 1.3). It reads the offer via data-engine (`entityType: 'offers:offer'`), constructs the `Project` + children using its own entity classes, and returns. commandBus is in-process and synchronous, so the whole chain — offer status mutation + project creation — completes in one transaction, identical to today.

**Why this shape** (vs. an `offers.offer.accepted` event): atomicity is preserved (no eventual-consistency window where offer is accepted but project is missing), no `persistent: true` subscriber + admin reconcile screen needed, no release-note behavior change. Cost: projects must register a command handler, and offers carries a runtime command-id string — but no compile-time dep. Net: one indirection, zero semantic change.

CRUD side effects on offers continue to flow through `emitCrudSideEffects` as today.

## 4. External dependencies

```jsonc
{
  "name": "@freighttech/offers",
  "dependencies": {
    "@ai-sdk/anthropic": "...",
    "@ai-sdk/google": "...",
    "@ai-sdk/openai": "...",
    "@anthropic-ai/sdk": "...",
    "@google/generative-ai": "...",
    "@mistralai/mistralai": "...",
    "ai": "...",
    "@dnd-kit/core": "...",
    "@dnd-kit/sortable": "...",
    "@dnd-kit/utilities": "...",
    "@freighttech/contractors": "workspace:*",
    "@freighttech/facilities": "workspace:*",
    "@freighttech/logistics": "workspace:*",
    "@freighttech/products": "workspace:*",
    "@pdfme/common": "...",
    "@pdfme/generator": "...",
    "@pdfme/schemas": "...",
    "@pdfme/ui": "...",
    "@react-pdf/renderer": "...",
    "handlebars": "...",
    "js-yaml": "...",
    "pdf-lib": "...",
    "uuid": "..."
  },
  "peerDependencies": {
    "@mikro-orm/postgresql": "^6.5.9",
    "@open-mercato/core": "^0.5.0",
    "@open-mercato/shared": "^0.5.0",
    "@open-mercato/templating": "^0.5.0",
    "@open-mercato/ui": "^0.5.0",
    "react": "^19.0.0"
  }
}
```

## 5. Shared types moved to `@freighttech/logistics`

Under the rename, the small enums / types cross module boundaries via the logistics shared leaf instead of being re-exported between offers and rfq_board:

| Type / enum | Source → Destination |
|---|---|
| `RfqStatus` | was `FmsRfqStatus` in `fms_offers/data/types` → `@freighttech/logistics/types/rfq-enums` |
| `CHARGE_UNITS`, `ChargeUnit` | was `FMS_CHARGE_UNITS` → `@freighttech/logistics/types/charges` |
| `DIRECTIONS`, `TRANSPORT_MODES` | was `FMS_DIRECTIONS`, `FMS_TRANSPORT_MODES` → `@freighttech/logistics/types/rfq-enums` |
| `ExchangeRateSnapshot` | was in `fms_offers/data/types` → `@freighttech/logistics/lib/financials` |
| `ChargeRow` | was in `tasks_board/components/ChargesTable` type → `@freighttech/logistics/types/charges` |
| `WizardItem`, `ProductItem`, `makeEmptyItem`, `offerLineToChargeRow` | was in `tasks_board/lib/wizard-types` → `@freighttech/logistics/types/wizard` |

## 6. Integration test coverage

**Neither `fms_offers` nor `tasks_board` has an `__integration__/` directory today.** Step 1.3 adds coverage from scratch — it's not a test rewrite. `fms_offers` has a couple of unit tests (`lib/__tests__/`, `api/rfq/from-email/__tests__/`) which carry over as-is with string updates, but no integration suite to inherit.

Minimum new coverage to add during Step 1.3:

- `offers/__integration__/offer-create.int.test.ts` — create RFQ, create offer, send offer (happy path end-to-end).
- `offers/__integration__/offer-acceptance.int.test.ts` — accept offer, verify `offers.offers.convert_to_project` runs and that a `Project` row is created synchronously in the same transaction (cross-package commandBus test — verifies `projects.create_from_offer` is invoked and completes before the outer command returns).
- `rfq_board/__integration__/board-crud.int.test.ts` — create RFQ via board, drag between columns, persist status.
- `rfq_board/__integration__/wizard-charge-sync.int.test.ts` — open wizard, add charge rows, close, reopen, charges persisted.

Existing unit tests (`lib/__tests__/*`, `api/rfq/from-email/__tests__/*`) move with the code and get string updates (renamed entities, event IDs, entity-type strings).

## 7. `apps/web/src/modules.ts` diff (Step 1.3; in Tier 2)

```diff
- { id: 'fms_offers', from: '@open-mercato/fms' },
- { id: 'tasks_board', from: '@open-mercato/fms' },
+ { id: 'offers', from: '@freighttech/offers' },
+ { id: 'rfq_board', from: '@freighttech/offers' },
```

## 8. Acceptance

- `yarn workspace @freighttech/offers typecheck && yarn workspace @freighttech/offers build` green.
- `rg -n "Fms" packages/offers/src/modules/` returns zero.
- `rg -n "fms_(offers|projects|files|invoicing|locations|products|tasks_board|documents)\b" ../fms/packages/offers/src/modules/` returns zero. (Offers has no `freight_documents.*` subscribers today; nothing from the documents namespace should appear.)
- `rg -n "@ManyToOne\(\(\) => (Project|Folder)\b" packages/offers/` returns zero.
- RFQ wizard opens from kanban + offers list; charge rows persist + reload; send-offer flow updates RFQ status → `in_progress`.
- Offer→project conversion runs atomically via `commandBus.execute('projects.create_from_offer', …)` (sync handler in `projects`).
- New integration tests (added in §6 — none pre-existed) pass.
