# SPEC — `@freighttech/invoicing`

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Phase** | Migration Phase 1, Step 1.6 (see [`MIGRATION-TO-FREIGHTTECH.md`](./MIGRATION-TO-FREIGHTTECH.md)) |
| **Modules hosted** | `invoicing` (formerly `fms_invoicing`) + future financial reporting modules |
| **Depends on** | Regular `workspace:*` deps: `@freighttech/logistics`, `@freighttech/contractors` (**required — direct import of `Contractor` + `ContractorAddress` for backend party lookups; not an ORM FK**, see §2), `@freighttech/ksef` (moves in same Step 1.6). Peer deps: `@open-mercato/core`, `@open-mercato/shared`, `@open-mercato/templating`, `@open-mercato/ui`. |

## 1. What's inside

```
packages/invoicing/
├── package.json
├── build.mjs, watch.mjs
├── tsconfig.json
├── src/
│   └── modules/
│       └── invoicing/                # formerly fms_invoicing
│           ├── acl.ts                # feature ids: invoicing.view, invoicing.manage
│           ├── api/
│           ├── backend/
│           ├── commands/
│           ├── components/
│           ├── data/
│           │   ├── entities.ts       # Invoice, InvoiceLineItem, InvoicingSettings
│           │   └── validators.ts
│           ├── di.ts                 # registers: invoicingService (was fmsInvoicingService), invoicingImportService (was fmsInvoicingImportService — note the "-ing" in the original key, not "invoiceImportService")
│           ├── events.ts             # 7 event ids renamed (see below); `entity:` field changes from 'fms_invoicing_invoice' (table name) to 'invoice' (short logical name; see 01 §1.6). `invoicing.invoice.approved` payload augmented with sourceModule/sourceTable/sourceLineItemsTable for the KSeF bridge (see §2).
│           ├── i18n/
│           ├── index.ts              # metadata.name === 'invoicing' (field name is `name`, not `id`)
│           ├── lib/
│           ├── migrations/
│           ├── search.ts             # entity types: invoicing:invoice, invoicing:invoice_line_item, invoicing:invoicing_settings (colon, snake_case)
│           ├── services/             # InvoicingService (was FmsInvoicingService), InvoiceImportService (was FmsInvoiceImportService — class name keeps camelCase)
│           ├── setup.ts
│           ├── subscribers/          # auto-import-from-documents, auto-create-from-extraction
│           └── workers/
└── generated/
```

DB tables after rename: `invoices`, `invoice_line_items`, `invoicing_settings`.

## 2. Why `invoicing` is still the easiest extraction

- **No outbound source imports into other in-scope modules.** Grep under `../fms/packages/invoicing/src/modules/invoicing/` (post-rename, in Tier 2) for `from '@freighttech/` shows only the declared deps (`@freighttech/contractors`, `@freighttech/logistics`, `@freighttech/ksef`); no cross-package deep relative imports.
- **Own `di.ts`.** Two services registered: `invoicingService` (was `fmsInvoicingService`) and `invoicingImportService` (was `fmsInvoicingImportService` — note the `-ing` in the key). Every `container.resolve(…)` callsite uses the new names after Step 1.6.
- **Events arrive from `freight_documents`** (now in scope — renamed from `fms_documents` to `@freighttech/freight-documents`; see [08-pkg-freight-documents.md](./08-pkg-freight-documents.md)). The two subscribers live under `invoicing/subscribers/` and listen to `freight_documents.invoice.created` / `freight_documents.invoice.updated`.
- **KSeF wiring lives in `@freighttech/ksef`.** Moved as-is from `packages/ksef/` in Step 1.6 (same PR as invoicing). Declared as peer dep.
- **`Invoice` entities store party data as denormalized strings** (`seller_name`, `seller_tax_id`, `buyer_name`, `buyer_tax_id`, …). **No `contractor_id` column, no ORM-typed relation** to `Contractor` at the schema level. The `@freighttech/contractors` workspace dep exists for **direct runtime import** — backend invoice-creation pages resolve names/tax IDs against the contractor directory, pre-fill party fields from `Contractor` + `ContractorAddress` records, and render contractor pickers. This is load-bearing for the invoicing UX and is declared as a required `workspace:*` dependency in §3 — not a peer dep, not optional, not replaceable with an HTTP round-trip.

### Pre-existing bugs to fix during Step 1.6

1. **Broken DI resolve.** `api/invoices/import-from-sales/route.ts:42` and `api/invoices/import-from-document/route.ts:42` both call `container.resolve('fmsFmsInvoicingService')` — a key that doesn't exist (duplicated `fms` prefix). Rewrite to `container.resolve('invoicingService')` as part of the DI rename sweep.
2. **Collapse the double emit onto the bridge emit.** `commands/invoices.ts` emits `invoicing.invoice.approved` twice today: once at line 513 via `emitFmsInvoicingEvent('invoice.approved', {id, tenantId, organizationId, invoiceNumber, direction, sourceType})` (declared event, **no subscribers**), and again at line 525 via a direct `eventBus.emit('invoicing.invoice.approved', {…})` carrying the augmented KSeF-bridge payload (`sourceModule`, `sourceTable`, `sourceLineItemsTable`). Post-rename the two strings coincide — two emits at the same id with different payloads. **Decision: keep the bridge emit (line 525), delete the declared emit (line 513).** The bridge payload is a superset of the declared payload, and the declared emit has no subscribers.

   **Implementation steps during Step 1.6:**

   a. Delete the `emitFmsInvoicingEvent('invoice.approved', …)` call at line 513.

   b. Rewrite `events.ts` declaration for `invoicing.invoice.approved` to use the full bridge-payload type (`{id, tenantId, organizationId, invoiceNumber, direction, sourceType, sourceModule, sourceTable, sourceLineItemsTable}`). The bridge emit at line 525 becomes the only path; declaring the event with the full payload shape keeps it typed and stops the "undeclared emit" runtime warning.

   c. Optional consistency cleanup: rewrite line 525 from raw `eventBus.emit('invoicing.invoice.approved', …)` to `emitInvoicingEvent('invoice.approved', …)` (the typed helper). Functionally equivalent; keeps every emit in this module going through the typed helper.

   d. Flip the three payload values from pre-rename to post-rename forms (they must change in lockstep with the DB table renames in `01` §1.4 — `@freighttech/ksef`'s subscriber runs `knex(sourceTable).select(...)` against these strings at runtime, so a mismatch is a silent SQL error at send-time, not a compile failure):

      ```ts
      // old (today's line 525):
      sourceModule: 'fms_invoicing',
      sourceTable: 'fms_invoicing_invoices',
      sourceLineItemsTable: 'fms_invoicing_line_items',
      // new:
      sourceModule: 'invoicing',
      sourceTable: 'invoices',
      sourceLineItemsTable: 'invoice_line_items',
      ```

   e. Keep `@freighttech/ksef/src/modules/ksef/subscribers/bridge-invoice-approved.ts` unchanged — its `isSourceModuleAvailable('invoicing')` check works transparently once the invoicing module registers under its new id.

## 3. External dependencies

```jsonc
{
  "name": "@freighttech/invoicing",
  "dependencies": {
    "@freighttech/contractors": "workspace:*",
    "@freighttech/ksef": "workspace:*",
    "@freighttech/logistics": "workspace:*",
    "fast-xml-parser": "...",
    "handlebars": "...",
    "js-yaml": "...",
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

## 4. Imports that change on the move

```ts
// before
import { logger } from '../../../../lib/logger'
import { Contractor } from '../../contractors/data/entities'
import { ActivityPanel } from '../../../../lib/activity'

// after
import { logger } from '@freighttech/logistics/lib/logger'
import { Contractor } from '@freighttech/contractors/modules/contractors/data/entities'
import { ActivityPanel } from '@freighttech/logistics/lib/activity'
```

Document-event payload types live in `@freighttech/logistics/types/freight-document-events.ts` (moved there during Phase 1 so consumers stay decoupled from `@freighttech/freight-documents`):

```ts
import type { DocumentProcessedPayload, InvoiceUpdatedPayload } from '@freighttech/logistics/types/freight-document-events'
```

## 5. DI, ACL, events — under the rename

- **DI keys**: `fmsInvoicingService` → `invoicingService`, `fmsInvoicingImportService` → `invoicingImportService` (note the `-ing` in the source key — earlier drafts referred to `fmsInvoiceImportService`, which is not what `di.ts` registers). All `container.resolve(…)` callsites updated during Step 1.6, including the two broken `fmsFmsInvoicingService` callsites (§2).
- **Feature IDs**: `fms_invoicing.view` → `invoicing.view`, `fms_invoicing.manage` → `invoicing.manage`, etc. Reseeded from `setup.ts` on fresh initialization.
- **Event IDs emitted by this module**: all seven declared events in `events.ts` renamed `fms_invoicing.*` → `invoicing.*`. Plus resolve the §2 undeclared emit.
- **Event IDs consumed** (from `freight_documents`): `freight_documents.invoice.created`, `freight_documents.invoice.updated`.
- **Command IDs**: every `registerCommand({ id: 'fms_invoicing.…' })` and every `commandBus.execute('fms_invoicing.…')` rewritten to `invoicing.*`.
- **Workers**: queue names — if any use `fms_invoicing.<queue>`, rename to `invoicing.<queue>`.

## 6. `apps/web/src/modules.ts` diff (Step 1.6; in Tier 2)

```diff
- { id: 'fms_invoicing', from: '@open-mercato/fms' },
+ { id: 'invoicing', from: '@freighttech/invoicing' },
```

## 7. Acceptance

- `yarn workspace @freighttech/invoicing typecheck && yarn workspace @freighttech/invoicing build` green.
- `rg -n "Fms" packages/invoicing/src/modules/` returns zero.
- `rg -n "fms_invoicing\b|fms_documents\b" packages/invoicing/src/modules/` returns zero.
- Invoice CRUD works end-to-end.
- `freight_documents → invoicing` auto-import pipeline fires (OCR extraction → invoice record).
- KSeF send + status poll still work.
- `invoicing/__integration__/` tests pass (rewritten to use renamed events, entity-types, DI keys).
