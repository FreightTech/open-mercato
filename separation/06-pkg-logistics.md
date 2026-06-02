# SPEC — `@freighttech/logistics`

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Phase** | Migration Phase 1, Step 1.1 (see [`MIGRATION-TO-FREIGHTTECH.md`](./MIGRATION-TO-FREIGHTTECH.md)) |
| **Modules hosted** | None (library-only package) |
| **Depends on** | `@open-mercato/core`, `@open-mercato/ui`, `@open-mercato/shared` |

## 1. Why this package exists

Five kinds of code need a home that every domain package (`projects`, `offers`, `invoicing`, `facilities`, `products`, `contractors`, `teams`, `freight-documents`) can depend on without creating a dep cycle:

1. **Observability + logging** — `lib/logger.ts`.
2. **Cross-cutting UI primitives** — `lib/activity/**`, `lib/inline-edit/**`, `hooks/useDrawerTableFocus.ts`.
3. **Financial helpers (from E2)** — `lib/financials/**` (`convertCurrency`, `formatCurrency`, `ExchangeRateSnapshot`, `FinancialSummary`).
4. **Cross-boundary type contracts** — enums + small types used by more than one domain package.
5. **Event payload types (from E5)** — `types/freight-document-events.ts`. Interfaces for the events emitted by `@freighttech/freight-documents`, placed here so consumers (`folders`, `invoicing`, `projects` subscribers) can type-reference them without compile-depending on `freight-documents` (which would create a cycle).

Package name `@freighttech/logistics` — a single word, matches the domain, acts as the base package every logistics-domain package depends on. It deliberately hosts **no modules** (no `setup.ts`, no `acl.ts`, no pages, no routes) — libs + types only. Cheap to depend on.

## 2. What moves into it

```
packages/logistics/
├── package.json
├── build.mjs, watch.mjs
├── tsconfig.json
├── src/
│   ├── lib/
│   │   ├── activity/
│   │   │   ├── components/
│   │   │   │   ├── ActivityAvatar.tsx
│   │   │   │   ├── ActivityItem.tsx
│   │   │   │   ├── ActivityPanel.tsx
│   │   │   │   └── CommentComposer.tsx
│   │   │   ├── index.ts
│   │   │   ├── mention-notifications.ts
│   │   │   ├── types.ts
│   │   │   └── utils.ts
│   │   ├── inline-edit/
│   │   │   ├── InlineDateField.tsx
│   │   │   ├── InlineEditField.tsx
│   │   │   ├── InlineEntitySearchField.tsx
│   │   │   ├── InlineSelectField.tsx
│   │   │   └── index.ts
│   │   ├── logger.ts
│   │   └── financials/
│   │       ├── convert-currency.ts  # convertCurrency, formatCurrency
│   │       ├── summary.ts           # FinancialSummary type + computeSummary
│   │       └── index.ts
│   ├── hooks/
│   │   └── useDrawerTableFocus.ts
│   └── types/
│       ├── charges.ts                  # ChargeRow, CHARGE_UNITS, ChargeUnit (was FMS_CHARGE_UNITS)
│       ├── exchange-rate.ts            # ExchangeRateSnapshot
│       ├── rfq-enums.ts                # RfqStatus, DIRECTIONS, TRANSPORT_MODES (was FmsRfqStatus, FMS_DIRECTIONS, FMS_TRANSPORT_MODES)
│       ├── wizard.ts                   # WizardItem, ProductItem, makeEmptyItem
│       └── freight-document-events.ts  # DocumentProcessedPayload, InvoiceCreatedPayload, InvoiceUpdatedPayload, DocumentIdentifiersUpdatedPayload (moved from fms_documents/events to break subscriber reverse-dep cycle — see E5)
└── tsconfig.json
```

### Source of truth for each file after the move

| New path | Old path | Owning module before move |
|---|---|---|
| `src/lib/activity/` | `packages/fms/src/lib/activity/` | intra-package shared |
| `src/lib/inline-edit/` | `packages/fms/src/lib/inline-edit/` | intra-package shared |
| `src/lib/logger.ts` | `packages/fms/src/lib/logger.ts` | intra-package shared |
| `src/lib/financials/convert-currency.ts` | `packages/fms/src/modules/fms_projects/lib/financials.ts` — `convertCurrency`, `formatCurrency` | `fms_projects` |
| `src/lib/financials/summary.ts` | `packages/fms/src/modules/fms_projects/lib/financials.ts` — `FinancialSummary`, `ProjectLineForFinancials` | `fms_projects` |
| `src/hooks/useDrawerTableFocus.ts` | `packages/fms/src/hooks/useDrawerTableFocus.ts` | intra-package |
| `src/types/exchange-rate.ts` | `packages/fms/src/modules/fms_offers/data/types.ts` — `ExchangeRateSnapshot` | `fms_offers` |
| `src/types/charges.ts` | `packages/fms/src/modules/fms_offers/data/types.ts` (`FMS_CHARGE_UNITS` → `CHARGE_UNITS`) + `packages/fms/src/modules/tasks_board/components/ChargesTable.tsx` (`ChargeRow`) | split |
| `src/types/rfq-enums.ts` | `packages/fms/src/modules/fms_offers/data/types.ts` — `FmsRfqStatus` → `RfqStatus`, `FMS_DIRECTIONS` → `DIRECTIONS`, `FMS_TRANSPORT_MODES` → `TRANSPORT_MODES` | `fms_offers` |
| `src/types/wizard.ts` | `packages/fms/src/modules/tasks_board/lib/wizard-types.ts` | `tasks_board` |

### What does NOT move here

- **Entity classes** (`Rfq`, `Offer`, `Project`, `Folder`, `Facility`, `Contractor`, …) — domain-owned, stay in their domain packages.
- **Business-logic utilities** (`useChargeSync`, `buildDefaultChargeRows`, `resolveItemFacilities`, `saveItemFieldsToServer`) — offers-domain behavior, stay in `offers/rfq_board`.
- **Seeds, migrations, CLI commands, setup hooks** — module-scoped.

## 3. External dependencies

```jsonc
{
  "name": "@freighttech/logistics",
  "dependencies": {
    "@freighttech/annotations": "workspace:*"
    // `lib/activity/mention-notifications.ts` (moved here from fms) imports annotation types.
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

**Platform packages (`@open-mercato/*`) are peerDependencies, not dependencies** — enforced across every `@freighttech/*` package per MIGRATION Part C invariants. Prevents duplicate copies in Tier 3 customer apps. `@freighttech/annotations` is a Tier 2 workspace sibling (moved from fork in Step 1.7), so it's a regular workspace dep.

## 4. Deprecation shims in `packages/fms`

Remain useful only for consumers inside this monorepo that haven't caught up to the new names yet. Example:

```ts
// packages/fms/src/lib/activity/index.ts (post-Phase-1, shim)
/** @deprecated import from '@freighttech/logistics/lib/activity' instead. Removal target: after internal migration complete. */
export * from '@freighttech/logistics/lib/activity'
```

```ts
// (If internal fork consumers need a bridge during migration; not required under MIGRATION's bulk-move strategy)
/** @deprecated import from '@freighttech/logistics/lib/financials'. */
export { convertCurrency, formatCurrency } from '@freighttech/logistics/lib/financials'
export type { ExchangeRateSnapshot, FinancialSummary, ProjectLineForFinancials } from '@freighttech/logistics'
```

These do NOT provide a long-term BC guarantee — the user has relaxed the BC policy; the shims buy migration time, not permanence.

## 5. What callers end up writing

```ts
// anywhere in offers, projects, invoicing, facilities, products, contractors
import { logger } from '@freighttech/logistics/lib/logger'
import { ActivityPanel, CommentComposer } from '@freighttech/logistics/lib/activity'
import { InlineEditField, InlineDateField } from '@freighttech/logistics/lib/inline-edit'
import { convertCurrency, formatCurrency } from '@freighttech/logistics/lib/financials'
import type { ExchangeRateSnapshot, ChargeRow, RfqStatus, WizardItem } from '@freighttech/logistics'
```

## 6. `apps/web/src/modules.ts` diff (Step 1.1; in Tier 2)

None — this package hosts no modules.

## 7. Unit tests

Small suite added during Phase 1:

- `src/lib/financials/__tests__/convert-currency.test.ts` — direct rate, reverse rate, missing rate fallback.
- `src/lib/activity/__tests__/utils.test.ts` — `avatarColor(hash)`, `formatMentionText()`.

Lift-out coverage, not new requirements — the functions already exist, they just didn't have direct unit coverage.

## 8. Acceptance

- `yarn workspace @freighttech/logistics typecheck && yarn workspace @freighttech/logistics build && yarn workspace @freighttech/logistics test` green.
- All eight domain packages (`facilities`, `products`, `contractors`, `teams`, `offers`, `projects`, `invoicing`, `freight-documents`) import `logger`, activity components, inline-edit, `convertCurrency` from `@freighttech/logistics` only. No duplicates copied; no direct `packages/fms/src/lib/...` path survives inside the new packages.
- `grep '"@freighttech/logistics"' packages/*/package.json` returns all nine package.jsons (eight domain + logistics itself as the `name` field).
- `rg -n "Fms" packages/logistics/src/` returns zero.
- `packages/logistics/src/types/freight-document-events.ts` exports the four payload interfaces; subscribers in `folders`/`invoicing`/`projects` import from there.
