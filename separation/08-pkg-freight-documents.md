# SPEC — `@freighttech/freight-documents`

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Phase** | Migration Phase 1, Step 1.5 (lands after projects so subscriber strings are in place; before invoicing so its subscribers find a live emitter) |
| **Modules hosted** | `freight_documents` (formerly `fms_documents`) |
| **Depends on** | `@freighttech/logistics`, `@open-mercato/core`; **no** compile-time deps on other domain packages — cross-module reads go via the data engine (E5 remediation) |

## 1. Why not just `documents`

The module id `documents` and the package `@open-mercato/documents` already exist as the generic document-storage module (file attachments, generic blob store). This is a **different** module — freight-specific OCR + extraction pipeline that produces structured invoices, document pages, cost allocations, etc.

Rename target: **module id `freight_documents`, package `@freighttech/freight-documents`**. Keeps the domain scope explicit and avoids the collision.

## 2. Class renames

Two classes clash with well-known globals or with other modules in this rename set:

| Before | After | Reason |
|---|---|---|
| `FmsDocument` | `FreightDocument` | bare `Document` collides with the DOM global `Document` (lib.dom.d.ts) |
| `FmsDocumentPage` | `FreightDocumentPage` | follows the `FreightDocument` pattern |
| `FmsInvoice` | `ExtractedInvoice` | disambiguates from `Invoice` in `@freighttech/invoicing` (which is the billing-issued invoice). `ExtractedInvoice` emphasizes the OCR-parsed origin. |
| `FmsInvoiceLineItem` | `ExtractedLineItem` | same disambiguation |
| `FmsInvoiceCostAllocation` | `ExtractedCostAllocation` | same |
| `FmsInvoicePage` | `ExtractedInvoicePage` | same |

## 3. What's inside

```
packages/freight-documents/
├── package.json
├── build.mjs, watch.mjs
├── tsconfig.json
├── src/
│   └── modules/
│       └── freight_documents/
│           ├── acl.ts                # feature ids: freight_documents.view, freight_documents.manage
│           ├── api/                  # upload, document CRUD, page image, invoice upload
│           ├── backend/freight-documents/
│           ├── commands/             # invoices.ts, cost-allocations.ts, invoice-shared.ts
│           ├── components/
│           ├── data/
│           │   ├── entities.ts       # FreightDocument, FreightDocumentPage, ExtractedInvoice, ExtractedLineItem, ExtractedCostAllocation, ExtractedInvoicePage
│           │   ├── schema-types.ts
│           │   └── validators.ts
│           ├── di.ts                 # registers: freightDocumentSchemaRegistry, documentDetector, transportationExtractor, mistralOcrService, pageImageService
│           ├── events.ts             # event ids: freight_documents.document.*, freight_documents.invoice.*
│           ├── i18n/
│           ├── index.ts              # metadata.name === 'freight_documents' (field is `name`, not `id`)
│           ├── lib/
│           ├── migrations/
│           ├── search.ts             # entity types: freight_documents:freight_document, freight_documents:freight_document_page, freight_documents:extracted_invoice, freight_documents:extracted_line_item, freight_documents:extracted_cost_allocation, freight_documents:extracted_invoice_page (colon + snake_case)
│           ├── services/
│           │   ├── document-detector.service.ts
│           │   ├── mistral-ocr.service.ts
│           │   ├── page-image.service.ts
│           │   ├── schema-registry.service.ts
│           │   ├── transportation-extractor.service.ts
│           │   ├── contractor-matcher.service.ts      # ← E5 target: rewritten to use dataEngine, no Contractor import
│           │   ├── charge-code-matcher.service.ts     # ← E5 target: rewritten to use dataEngine, no Product import
│           │   └── project-matcher.service.ts         # ← E5 target: rewritten to use dataEngine, no Project/SeaContainer import
│           ├── setup.ts
│           ├── subscribers/          # auto-create-invoice, auto-link-on-identifiers-update, auto-link-to-project
│           └── workers/              # document-extract
└── generated/
```

DB tables after rename: `freight_documents`, `freight_document_pages`, `extracted_invoices`, `extracted_line_items`, `extracted_cost_allocations`, `extracted_invoice_pages`.

## 4. Remediation E5 — decouple from other domain packages

### The problem

Today `fms_documents` reaches into four other in-scope modules at the source level:

| Service / file | Imports | Cross-module |
|---|---|---|
| `services/contractor-matcher.service.ts` | `Contractor` from `contractors/data/entities` | → `@freighttech/contractors` |
| `services/charge-code-matcher.service.ts` | `FmsProduct` from `fms_products/data/entities` | → `@freighttech/products` |
| `services/project-matcher.service.ts` | `FmsProject`, `FmsSeaContainer` from `fms_projects/data/entities` | → `@freighttech/projects` |
| `commands/invoice-shared.ts` | `FmsProduct` | → `@freighttech/products` |
| `commands/invoices.ts` | `FmsProduct` | → `@freighttech/products` |
| `commands/cost-allocations.ts` | `FmsProjectLine` | → `@freighttech/projects` |
| `data/entities.ts` | `FmsProduct` (type reference on a column?) | → `@freighttech/products` |

Extracting `freight-documents` as a package with those compile-time deps would make it sit **downstream** of projects, products, and contractors — which is fine topologically (projects is already downstream of master-data). But it creates subtle cycles: `projects` subscribes to `freight_documents.document.processed`, so if its subscriber imports the event payload type from `freight-documents`, that's a reverse dep — cycle.

### The fix

Make `freight-documents` **depend only on `logistics` + `core`**. Replace every cross-module entity import with a data-engine query by entity-type string.

```ts
// before (services/project-matcher.service.ts)
import { FmsProject, FmsSeaContainer } from '../../fms_projects/data/entities'
const projects = await em.find(FmsProject, { /* … */ })

// after (post-E5 + rename)
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
const dataEngine = container.resolve<DataEngine>('dataEngine')
const rows = await dataEngine.query({
  entityType: 'projects:project',
  fields: ['id', 'referenceNumber', 'status', 'clientId'],
  where: { /* matching criteria */ },
  limit: 50,
})
```

Apply the same pattern to:
- `contractor-matcher.service.ts` → `entityType: 'contractors:contractor'`
- `charge-code-matcher.service.ts` / `invoice-shared.ts` / `invoices.ts` → `entityType: 'products:product'`
- `project-matcher.service.ts` → `entityType: 'projects:project'`, `entityType: 'projects:sea_container'`
- `cost-allocations.ts` → `entityType: 'projects:project_line'`

This is mechanical but touches ~7 files. Lands in Step 1.x alongside E1/E2/E3/E4.

### Event payload types

Make sure `events.ts` payload interfaces don't reference entity CLASSES — only primitive fields + ids. Move any shared payload type that crosses package boundaries into `@freighttech/logistics/types/freight-document-events.ts`. Subscribers in `projects`, `folders`, `invoicing` import payload types from `@freighttech/logistics`, not from `@freighttech/freight-documents` — keeps the cycle broken.

## 5. External dependencies

```jsonc
{
  "name": "@freighttech/freight-documents",
  "dependencies": {
    "@freighttech/logistics": "workspace:*",
    "@ai-sdk/anthropic": "...",
    "@ai-sdk/google": "...",
    "@ai-sdk/openai": "...",
    "@anthropic-ai/sdk": "...",
    "@mistralai/mistralai": "...",
    "@google/generative-ai": "...",
    "ai": "...",
    "canvas": "...",
    "pdf-lib": "...",
    "pdf-to-img": "...",
    "puppeteer": "...",
    "uuid": "..."
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

No deps on `@freighttech/contractors` / `products` / `projects` — that's the whole point of E5.

## 6. Event ID rename

All 9 events declared in today's `fms_documents/events.ts` get renamed (earlier drafts listed only 4 — verified against actual source):

| Before | After |
|---|---|
| `fms_documents.document.processed` | `freight_documents.document.processed` |
| `fms_documents.document.identifiers_updated` | `freight_documents.document.identifiers_updated` |
| `fms_documents.document.created` | `freight_documents.document.created` |
| `fms_documents.document.updated` | `freight_documents.document.updated` |
| `fms_documents.document.deleted` | `freight_documents.document.deleted` |
| `fms_documents.invoice.confirmed` | `freight_documents.invoice.confirmed` |
| `fms_documents.invoice.created` | `freight_documents.invoice.created` |
| `fms_documents.invoice.updated` | `freight_documents.invoice.updated` |
| `fms_documents.invoice.deleted` | `freight_documents.invoice.deleted` |

Subscribers that live in other packages (`projects/subscribers/auto-create-from-booking`, `folders/subscribers/auto-link-to-folder`, `folders/subscribers/create-invoice-from-document`, `folders/subscribers/auto-create-leg-from-booking`, `invoicing/subscribers/auto-import-from-documents`, `invoicing/subscribers/auto-create-from-extraction`) update their `metadata.event` strings accordingly.

## 7. DI key rename

| Before | After |
|---|---|
| `fmsSchemaRegistry` | `freightDocumentSchemaRegistry` (qualified to match package domain) |
| `fmsDocumentDetector` | `documentDetector` |
| `fmsTransportationExtractor` | `transportationExtractor` |
| `fmsMistralOcrService` | `mistralOcrService` |

## 8. `apps/web/src/modules.ts` diff (Step 1.5; in Tier 2)

```diff
- { id: 'fms_documents', from: '@open-mercato/fms' },
+ { id: 'freight_documents', from: '@freighttech/freight-documents' },
```

## 9. Acceptance

- `yarn workspace @freighttech/freight-documents typecheck && yarn workspace @freighttech/freight-documents build` green.
- `rg -n "Fms(Document|Invoice|InvoiceLine|InvoicePage|Product|Project|SeaContainer|Contractor|ProjectLine)\b" packages/freight-documents/src/` returns zero.
- `rg -n "from '@open-mercato/(contractors|products|projects|offers|invoicing|folders|facilities)'" packages/freight-documents/src/` returns zero (E5 holds).
- `rg -n "\bDocument\b" packages/freight-documents/src/modules/` shows only the `FreightDocument` / `DocumentCategory` / `DocumentType` uses — no bare `Document` class.
- OCR pipeline works: upload → page extraction → invoice matcher → project matcher all still produce the expected records, now via data-engine lookups for cross-module reads.
- Integration tests in `freight_documents/__integration__/` (renamed from `TC-FMS-DOC-*`) pass.
