# SPEC-025: FMS Invoicing Module with KSeF 2.0 Integration

**Created:** 2026-03-17
**Module:** `fms_invoicing`
**Package:** `packages/fms/src/modules/fms_invoicing/`
**Status:** Implemented
**Related specs:** SPEC-024 (ERP Financial Modules), SPEC-023 (FMS Module Restructuring)

---

## Context

Poland's KSeF (Krajowy System e-Faktur / National e-Invoice System) becomes **mandatory for all VAT-registered businesses on April 1, 2026**. The `fms_invoicing` module is the **single hub** for all FMS invoicing operations with full KSeF API v2 integration.

The module:
- Centralizes outgoing and incoming invoice lifecycle management
- Provides full KSeF API v2.0 integration (async auth, submission, reception, UPO retrieval)
- Imports invoices from `fms_documents` (extraction pipeline) and `sales` (commerce flow) via FK-based cross-module references
- Supports offline invoicing modes mandated by Polish law (`offline24`, `unavailability`, `emergency`)
- Generates FA(3) schema-compliant XML for KSeF submission

### Key Design Decisions

1. **New entities** (`FmsInvoicingInvoice`, `FmsInvoicingLineItem`) rather than reusing `FmsInvoice` from `fms_documents` -- invoicing lifecycle is fundamentally different from document extraction lifecycle
2. **FK-based cross-module references** (per architecture rules) -- `sourceDocumentInvoiceId` and `sourceSalesInvoiceId` link to source records without ORM relationships
3. **KSeF crypto operations** in module-internal `lib/ksef/` -- AES-256-CBC encryption, RSA-OAEP key wrapping, SHA-256 hashing
4. **Batch sessions by default** -- `ksefSessionMode` defaults to `batch` in settings for throughput; interactive sessions supported
5. **Separate workers per concern** -- submission, status polling, UPO download, reception sync, and import each get dedicated workers
6. **Offline mode support** -- four modes (`online`, `offline24`, `unavailability`, `emergency`) with deadline tracking and invoice number prefixing

---

## KSeF 2.0 API Reference

### Key Differences from KSeF 1.0

| Aspect | KSeF 1.0 | KSeF 2.0 |
|--------|----------|----------|
| Base URLs | `ksef-test.mf.gov.pl/api` | `api-test.ksef.mf.gov.pl` |
| API version prefix | `/online/` | `/v2/` |
| Auth flow | Synchronous (single request) | Async: challenge -> submit -> poll -> redeem tokens |
| Auth header | `SessionToken` header | `Authorization: Bearer <accessToken>` |
| Token system | Single session token | Dual: short-lived accessToken + long-lived refreshToken |
| Session termination | `GET /online/Session/Terminate` | `DELETE /v2/auth/sessions/current` |
| Test data | No dedicated endpoints | `/v2/testdata/*` endpoints for subject/person/permissions |

### API Environments

| Environment | Base URL | Purpose |
|-------------|---------|---------|
| test | `https://api-test.ksef.mf.gov.pl` | Development testing |
| demo | `https://api-demo.ksef.mf.gov.pl` | Pre-production validation |
| production | `https://api.ksef.mf.gov.pl` | Live production |

Documentation URLs for each environment:
- Docs: `{baseUrl}/docs/v2`
- OpenAPI: `{baseUrl}/docs/v2/openapi.json`

### Authentication Flow (v2)

```
1. POST /v2/auth/challenge
   -> { challenge, timestamp }                    (valid 10 minutes)

2a. POST /v2/auth/ksef-token                      (token auth)
    Body: { challenge, contextIdentifier, encryptedToken }
    -> { authenticationToken, referenceNumber }

2b. POST /v2/auth/xades-signature                 (certificate auth)
    Body: XAdES-signed XML
    -> { authenticationToken, referenceNumber }

3. GET /v2/auth/{referenceNumber}                  (poll until completed)
   Headers: Authorization: Bearer <authenticationToken>
   -> { status: "pending" | "completed" | "failed" }

4. POST /v2/auth/token/redeem                      (one-time exchange)
   Headers: Authorization: Bearer <authenticationToken>
   -> { accessToken: { token, expiresAt }, refreshToken: { token, expiresAt } }

5. POST /v2/auth/token/refresh                     (when accessToken expires)
   Headers: Authorization: Bearer <refreshToken>
   -> { accessToken: { token, expiresAt } }
```

Token encryption for step 2a uses:
- Fetch KSeF public key from `GET /v2/security/public-key-certificates`
- Concatenate `token|timestamp` string
- Encrypt with AES-256-CBC using random key/IV
- Wrap AES key with RSA-OAEP (SHA-256) using KSeF public key
- Encode as: `[4-byte key length][wrapped key][iv][encrypted token]` in base64

### Complete Endpoint Map

All endpoints are defined in `lib/ksef/endpoints.ts` with URL builder functions.

**Authentication (6 endpoints):**

| Method | Path | Function | Purpose |
|--------|------|----------|---------|
| POST | `/v2/auth/challenge` | `getAuthChallengeUrl` | Get challenge + timestamp (valid 10 min) |
| POST | `/v2/auth/ksef-token` | `getAuthKsefTokenUrl` | Submit encrypted token auth |
| POST | `/v2/auth/xades-signature` | `getAuthXadesSignatureUrl` | Submit XAdES-signed auth |
| GET | `/v2/auth/{ref}` | `getAuthStatusUrl` | Poll auth operation status |
| POST | `/v2/auth/token/redeem` | `getAuthTokenRedeemUrl` | Exchange authToken for access+refresh |
| POST | `/v2/auth/token/refresh` | `getAuthTokenRefreshUrl` | Refresh expired accessToken |

**Session Management (3 endpoints):**

| Method | Path | Function | Purpose |
|--------|------|----------|---------|
| GET | `/v2/auth/sessions` | `getActiveSessionsUrl` | List active sessions |
| DELETE | `/v2/auth/sessions/current` | `getInvalidateCurrentSessionUrl` | Invalidate current session |
| DELETE | `/v2/auth/sessions/{ref}` | `getInvalidateSessionUrl` | Invalidate specific session |

**Invoices (5 endpoints):**

| Method | Path | Function | Purpose |
|--------|------|----------|---------|
| POST | `/v2/invoices/send` | `getSendInvoiceUrl` | Send invoice |
| GET | `/v2/invoices/{hash}` | `getInvoiceUrl` | Download invoice by hash |
| GET | `/v2/invoices/{hash}/status` | `getInvoiceStatusUrl` | Check processing status |
| POST | `/v2/invoices/query` | `getQueryInvoicesUrl` | Query/search invoices |
| GET | `/v2/invoices/upo` | `getUpoUrl` | Download UPO |

**Batch Operations (3 endpoints):**

| Method | Path | Function | Purpose |
|--------|------|----------|---------|
| POST | `/v2/batch/jobs` | `getBatchJobsUrl` | Create batch job |
| GET | `/v2/batch/jobs/{id}` | `getBatchJobStatusUrl` | Monitor batch status |
| GET | `/v2/batch/jobs/{id}/results` | `getBatchJobResultsUrl` | Get batch results |

**Security (1 endpoint):**

| Method | Path | Function | Purpose |
|--------|------|----------|---------|
| GET | `/v2/security/public-key-certificates` | `getPublicKeyCertificatesUrl` | Download MF public key for token encryption |

**Certificates (4 endpoints):**

| Method | Path | Function | Purpose |
|--------|------|----------|---------|
| GET | `/v2/certificates/limits` | `getCertificateLimitsUrl` | Certificate limits |
| POST | `/v2/certificates/enrollments` | `getCertificateEnrollmentUrl` | Request new certificate |
| GET | `/v2/certificates/enrollments/{ref}` | `getCertificateEnrollmentStatusUrl` | Check enrollment status |
| POST | `/v2/certificates/retrieve` | `getCertificateRetrieveUrl` | Download by serial number |

**Permissions (2 endpoints):**

| Method | Path | Function | Purpose |
|--------|------|----------|---------|
| POST | `/v2/permissions/persons/grants` | `getPermissionsPersonsGrantsUrl` | Grant permissions to persons |
| POST | `/v2/permissions/entities/grants` | `getPermissionsEntitiesGrantsUrl` | Grant permissions to entities |

**Limits (2 endpoints):**

| Method | Path | Function | Purpose |
|--------|------|----------|---------|
| GET | `/v2/limits/context` | `getContextLimitsUrl` | Context limits |
| GET | `/v2/rate-limits` | `getRateLimitsUrl` | Rate limits |

**Test Data (6 endpoints, test environment only):**

| Method | Path | Function | Purpose |
|--------|------|----------|---------|
| POST | `/v2/testdata/subject` | `getTestDataSubjectUrl` | Create test company |
| POST | `/v2/testdata/subject/remove` | `getTestDataSubjectRemoveUrl` | Remove test company |
| POST | `/v2/testdata/person` | `getTestDataPersonUrl` | Create test person |
| POST | `/v2/testdata/person/remove` | `getTestDataPersonRemoveUrl` | Remove test person |
| POST | `/v2/testdata/permissions` | `getTestDataPermissionsUrl` | Grant test permissions |
| POST | `/v2/testdata/permissions/revoke` | `getTestDataPermissionsRevokeUrl` | Revoke test permissions |

### KSeF API Types

All request/response types are defined in `lib/ksef/types.ts`. Key types:

| Type | Purpose |
|------|---------|
| `KsefContextIdentifier` | `{ value, type: 'nip' \| 'internalId' \| 'vatEu' }` |
| `KsefAuthChallengeResponse` | `{ challenge, timestamp }` |
| `KsefTokenAuthRequest` | `{ challenge, contextIdentifier, encryptedToken, authorizationPolicy? }` |
| `KsefAuthStatusResponse` | `{ status: 'pending' \| 'completed' \| 'failed', referenceNumber, errorDescription? }` |
| `KsefTokenRedeemResponse` | `{ accessToken: { token, expiresAt? }, refreshToken: { token, expiresAt? } }` |
| `KsefSendInvoiceRequest` | `{ invoiceHash: { hashSHA, fileSize }, invoicePayload: { type, invoiceBody } }` |
| `KsefSendInvoiceResponse` | `{ elementReferenceNumber, referenceNumber, processingCode, timestamp }` |
| `KsefInvoiceStatusResponse` | `{ processingCode, processingDescription, ksefReferenceNumber?, acquisitionTimestamp? }` |
| `KsefQueryCriteria` | `{ subjectType, type, acquisitionTimestamp*, invoicingDate* }` |
| `KsefQueryInvoicesResponse` | `{ invoiceHeaderList[], numberOfElements, pageSize, pageOffset }` |
| `KsefErrorResponse` | `{ exception: { serviceCtx, serviceCode, exceptionDetailList[] } }` |
| `KsefBatchJobStatusResponse` | `{ jobId, status: 'pending' \| 'processing' \| 'completed' \| 'failed', processedCount?, errorCount? }` |
| `KsefTestDataSubjectRequest` | `{ subjectNip, subjectType?, description?, subunits?[] }` |
| `KsefTestDataPermissionsRequest` | `{ contextIdentifier, authorizedIdentifier, permissions[] }` |
| `KsefPermissionType` | `'InvoiceRead' \| 'InvoiceWrite' \| 'Introspection' \| 'CredentialsRead' \| 'CredentialsManage' \| 'SubunitManage' \| 'EnforcementOperations'` |

### Processing Status Codes

Defined in `lib/ksef/status-codes.ts`:

| Code | Resolved Status | Description |
|------|----------------|-------------|
| 100 | pending | Processing started |
| 101 | pending | Waiting for processing |
| 102 | pending | Processing in progress |
| 200 | accepted | Invoice accepted |
| 300 | rejected | Invoice rejected |
| 301 | rejected | Schema validation failed |
| 302 | rejected | Business validation failed |
| 303 | rejected | Duplicate invoice detected |
| 310 | session_active | Session is active |
| 315 | session_closed | Session closed, UPO available |
| 400 | error | Processing error |
| 401 | error | Authentication error |
| 402 | error | Authorization error |
| 403 | error | Session expired |
| 404 | error | Resource not found |
| 500 | error | Internal server error |

Fallback ranges: 1xx=pending, 2xx=accepted, 3xx=rejected, 4xx+=error.

---

## Architecture

### Module Structure (65 files)

```
packages/fms/src/modules/fms_invoicing/
  index.ts                              Module metadata, requires: [fms_documents, attachments]
  acl.ts                                9 ACL features
  setup.ts                              Default role features (admin: all 9, employee: view-only)
  events.ts                             17 event declarations via createModuleEvents
  di.ts                                 DI registration (7 services)
  cli.ts                                8 CLI commands
  search.ts                             Search indexing config for fms_invoicing_invoice
  data/
    entities.ts                         5 MikroORM entities
    types.ts                            Type unions for all status enums
    validators.ts                       Zod schemas for CRUD and query operations
    snapshots.ts                        Snapshot types for command undo
  commands/
    index.ts                            Command barrel import
    invoices.ts                         CRUD + approve/reject commands (5 commands)
    ksef.ts                             KSeF queue + status update commands (2 commands)
    settings.ts                         Settings upsert + credential CRUD commands (4 commands)
    shared.ts                           Shared helpers (scope checks, snapshot loading)
  services/
    invoicing.service.ts                Core: settings upsert, import from documents/sales, total recalc
    import.service.ts                   CSV and KSeF XML import
    ksef/
      auth.service.ts                   KSeF 2.0 auth flow (challenge -> token -> poll -> redeem)
      client.service.ts                 HTTP client for authenticated KSeF API calls
      session.service.ts                Session lifecycle (get/close/stale cleanup/UPO storage)
      xml.service.ts                    FA(3) XML generation from invoice entities
      crypto.service.ts                 AES-256-CBC, RSA-OAEP, SHA-256 operations
      receiver.service.ts              Sync received invoices from KSeF
  lib/ksef/
    types.ts                            KSeF API v2 request/response payload types
    endpoints.ts                        URL builders for all KSeF API endpoints (32 functions)
    crypto.ts                           Standalone crypto functions (encrypt, hash, prepare)
    xml-builder.ts                      FA(3) XML generation (standalone version)
    xml-parser.ts                       KSeF XML response parsing
    fa3-schema.ts                       FA(3) schema constants (namespaces, codes, GTU, limits)
    status-codes.ts                     KSeF processing code resolution
    validators.ts                       NIP/IBAN/KSeF number validation
    offline-modes.ts                    Offline mode helpers (prefix, deadline)
  api/
    invoices/
      route.ts                          GET (list) + POST (create) via makeCrudRoute
      [id]/
        route.ts                        GET (detail) + PATCH (update) + DELETE (soft-delete)
        approve/route.ts                POST approve
        reject/route.ts                 POST reject
      import/route.ts                   POST batch import
      import-from-document/route.ts     POST import from fms_documents
      import-from-sales/route.ts        POST import from sales module
    settings/
      route.ts                          GET + PATCH (upsert)
    credentials/
      route.ts                          GET (list) + POST (create)
      [id]/
        route.ts                        PATCH (update) + DELETE
        test/route.ts                   POST test credential connectivity
    ksef/
      sessions/
        route.ts                        GET list sessions
        [id]/route.ts                   GET session detail
      submit/[id]/route.ts              POST queue single invoice for KSeF
      submit-batch/route.ts             POST queue batch of invoices
      sync-received/route.ts            POST sync received invoices
      generate-xml/[id]/route.ts        POST generate FA(3) XML preview
      status/[id]/route.ts              GET KSeF status for invoice
  workers/
    ksef-submit.ts                      Submit queued invoices to KSeF
    ksef-status-poll.ts                 Poll KSeF for invoice status updates
    ksef-upo-download.ts               Download UPO for closed sessions
    ksef-receive-sync.ts               Sync received invoices from KSeF
    invoice-import.ts                   Process CSV/XML imports
  subscribers/
    auto-import-from-documents.ts       Import approved fms_documents invoices
    auto-submit-to-ksef.ts             Auto-queue approved outgoing invoices
    ksef-session-closed.ts             Trigger UPO download on session close
  backend/
    fms-invoicing/
      page.meta.ts                      Invoice list metadata
      page.tsx                          Invoice list page
      ksef/
        page.meta.ts                    KSeF dashboard metadata
        page.tsx                        KSeF session management
      settings/
        page.meta.ts                    Settings page metadata
        page.tsx                        Invoicing settings page
```

### Coexistence with fms_documents

Both modules live permanently side by side:

| Concern | `fms_documents` | `fms_invoicing` |
|---------|----------------|-----------------|
| Primary role | Document extraction & OCR pipeline | Invoice lifecycle & KSeF compliance |
| Entity | `FmsDocumentInvoice` (`fms_document_invoices`) | `FmsInvoicingInvoice` (`fms_invoicing_invoices`) |
| Source of truth for | Extracted data from uploaded documents | Business invoice records for accounting & KSeF |
| Bridge | Emits `fms_documents.invoice.updated` | Subscribes via `auto-import-from-documents`, imports via `sourceDocumentInvoiceId` FK |

**Import flow:** The subscriber `auto-import-from-documents` listens to `fms_documents.invoice.updated`. When the source document invoice has `status = 'approved'` and `settings.autoImportFromDocuments` is enabled, it calls `InvoicingService.importFromDocumentInvoice()`, which copies header + line items into `fms_invoicing_invoices` / `fms_invoicing_line_items` with `sourceType = 'document_extraction'` and `status = 'pending_review'`. Duplicates are prevented by checking `sourceDocumentInvoiceId` uniqueness.

---

## Data Models

### FmsInvoicingInvoice

**Table:** `fms_invoicing_invoices`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid PK | no | gen_random_uuid() | |
| organization_id | uuid | no | | Tenant scoping |
| tenant_id | uuid | no | | Tenant scoping |
| invoice_number | text | no | | Required |
| invoice_date | date | yes | | |
| due_date | date | yes | | |
| service_date | date | yes | | |
| seller_name | text | yes | | |
| seller_tax_id | text | yes | | NIP for Polish entities |
| seller_address | text | yes | | |
| seller_country_code | text | yes | | ISO 3166-1 alpha-2 |
| seller_bank_account | text | yes | | IBAN |
| buyer_name | text | yes | | |
| buyer_tax_id | text | yes | | |
| buyer_address | text | yes | | |
| buyer_country_code | text | yes | | |
| net_amount | numeric(18,2) | no | '0' | |
| vat_amount | numeric(18,2) | no | '0' | |
| gross_amount | numeric(18,2) | no | '0' | |
| currency_code | text | no | 'PLN' | ISO 4217 |
| payment_method | text | yes | | transfer/cash/card/check/credit/other |
| payment_terms | text | yes | | |
| direction | text | no | 'outgoing' | `outgoing` / `incoming` |
| source_type | text | no | 'manual' | `manual` / `document_extraction` / `sales_import` / `external_import` / `ksef_received` |
| source_document_invoice_id | uuid | yes | | FK to fms_document_invoices (by convention) |
| source_sales_invoice_id | uuid | yes | | FK to sales_invoices (by convention) |
| source_import_reference | text | yes | | e.g. `csv:INV-001:3` or `xml:INV-001` |
| attachment_id | uuid | yes | | FK to attachments |
| status | text | no | 'draft' | See InvoiceStatus type |
| ksef_status | text | no | 'none' | See KsefStatus type |
| ksef_number | text | yes | | Unique. Official KSeF reference number |
| ksef_session_id | uuid | yes | | FK to fms_invoicing_ksef_sessions |
| ksef_submitted_at | timestamptz | yes | | |
| ksef_accepted_at | timestamptz | yes | | |
| ksef_reference_number | text | yes | | Element reference number from submission |
| ksef_fa_xml | text | yes | | Generated FA(3) XML |
| ksef_upo_xml | text | yes | | Official Proof of Receipt XML |
| ksef_error_message | text | yes | | |
| ksef_error_code | text | yes | | |
| notes | text | yes | | Internal notes |
| metadata | jsonb | yes | | Extensible metadata |
| reviewed_by | uuid | yes | | User who approved/rejected |
| reviewed_at | timestamptz | yes | | |
| review_notes | text | yes | | |
| created_at | timestamptz | no | now() | |
| created_by | uuid | yes | | Audit |
| updated_at | timestamptz | no | now() | |
| updated_by | uuid | yes | | Audit |
| deleted_at | timestamptz | yes | | Soft delete |

**Indexes:**
- `fms_invoicing_invoices_scope_idx` on (organization_id, tenant_id)
- `fms_invoicing_invoices_status_idx` on (organization_id, tenant_id, status)
- `fms_invoicing_invoices_ksef_status_idx` on (organization_id, tenant_id, ksef_status)
- `fms_invoicing_invoices_seller_tax_idx` on (organization_id, tenant_id, seller_tax_id)
- `fms_invoicing_invoices_date_idx` on (organization_id, tenant_id, invoice_date)
- `fms_invoicing_invoices_source_doc_idx` on (source_document_invoice_id)
- `fms_invoicing_invoices_source_sales_idx` on (source_sales_invoice_id)
- `fms_invoicing_invoices_ksef_number_idx` on (ksef_number) UNIQUE

**Status enums:**

```
InvoiceStatus: draft | pending_review | approved | rejected | sent | paid | cancelled
KsefStatus:    none | queued | submitted | processing | accepted | upo_downloaded | rejected | error | cancelled
```

### FmsInvoicingLineItem

**Table:** `fms_invoicing_line_items`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid PK | no | gen_random_uuid() | |
| organization_id | uuid | no | | |
| tenant_id | uuid | no | | |
| invoice (FK) | uuid | no | | ManyToOne -> FmsInvoicingInvoice, cascade delete |
| line_number | int | no | | Ordering |
| description | text | no | | |
| quantity | numeric(18,4) | no | '1' | |
| unit | text | yes | | e.g. 'szt.', 'kg', 'h' |
| unit_price_net | numeric(18,4) | no | '0' | |
| vat_rate | numeric(5,2) | no | '0' | Percentage |
| vat_rate_code | text | yes | | `23` / `8` / `5` / `0` / `zw` / `oo` / `np` |
| net_amount | numeric(18,2) | no | '0' | |
| vat_amount | numeric(18,2) | no | '0' | |
| gross_amount | numeric(18,2) | no | '0' | |
| product_id | uuid | yes | | FK to catalog products (by convention) |
| gtu_code | text | yes | | GTU_01 through GTU_13 |
| pkwiu_code | text | yes | | Polish Classification of Products and Services |
| created_at | timestamptz | no | now() | |
| updated_at | timestamptz | no | now() | |

### FmsInvoicingKsefSession

**Table:** `fms_invoicing_ksef_sessions`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid PK | no | gen_random_uuid() | |
| organization_id | uuid | no | | |
| tenant_id | uuid | no | | |
| session_type | text | no | | `interactive` / `batch` |
| session_status | text | no | 'initializing' | `initializing` / `active` / `closing` / `closed` / `error` |
| ksef_reference_number | text | yes | | Session reference from KSeF API |
| session_token | text | yes | | Access token (Bearer auth) |
| encryption_key | text | yes | | Refresh token (stored in this field for v2) or Base64-encoded AES key |
| encryption_iv | text | yes | | Base64-encoded AES IV (batch encryption) |
| nip | text | no | | Polish Tax ID (10 digits) |
| invoice_count | int | no | 0 | Invoices submitted in this session |
| started_at | timestamptz | yes | | |
| closed_at | timestamptz | yes | | |
| error_message | text | yes | | |
| upo_xml | text | yes | | Session-level UPO |
| upo_downloaded_at | timestamptz | yes | | |
| created_at | timestamptz | no | now() | |
| updated_at | timestamptz | no | now() | |

### FmsInvoicingKsefCredential

**Table:** `fms_invoicing_ksef_credentials`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid PK | no | gen_random_uuid() | |
| organization_id | uuid | no | | |
| tenant_id | uuid | no | | |
| nip | text | no | | Polish Tax ID |
| auth_type | text | no | | `token` / `certificate` |
| ksef_token | text | yes | | API authorization token |
| certificate_pem | text | yes | | X.509 certificate in PEM format |
| private_key_pem | text | yes | | Private key in PEM format |
| environment | text | no | 'test' | `test` / `demo` / `production` |
| is_active | boolean | no | true | |
| label | text | yes | | Human-readable label |
| last_used_at | timestamptz | yes | | |
| created_at | timestamptz | no | now() | |
| updated_at | timestamptz | no | now() | |

**Unique:** (organization_id, tenant_id, nip, environment)

### FmsInvoicingSettings

**Table:** `fms_invoicing_settings`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid PK | no | gen_random_uuid() | |
| organization_id | uuid | no | | |
| tenant_id | uuid | no | | |
| ksef_environment | text | no | 'test' | `test` / `demo` / `production` |
| ksef_auto_submit | boolean | no | false | Auto-queue approved invoices for KSeF |
| ksef_session_mode | text | no | 'batch' | `interactive` / `batch` |
| default_seller_nip | text | yes | | Pre-fill seller NIP |
| default_payment_method | text | yes | | |
| auto_import_from_documents | boolean | no | true | Subscribe to fms_documents events |
| auto_import_from_sales | boolean | no | false | Subscribe to sales events |
| offline_mode | text | no | 'online' | `online` / `offline24` / `unavailability` / `emergency` |
| created_at | timestamptz | no | now() | |
| updated_at | timestamptz | no | now() | |

**Unique:** (organization_id, tenant_id) -- one settings row per tenant

---

## Services (8)

### DI Registration (`di.ts`)

| DI Name | Class | Scope |
|---------|-------|-------|
| `fmsInvoicingService` | `InvoicingService` | scoped |
| `fmsInvoiceImport` | `InvoiceImportService` | scoped |
| `fmsKsefAuthService` | `KsefAuthService` | scoped |
| `fmsKsefXmlService` | `KsefXmlService` | scoped |
| `fmsKsefCryptoService` | `KsefCryptoService` | scoped |
| `fmsKsefSessionService` | `KsefSessionService` | scoped |
| `fmsKsefReceiverService` | `KsefReceiverService` | scoped |

Note: `KsefClientService` is not registered in DI -- it is instantiated per-use with a specific environment and access token.

### InvoicingService (`services/invoicing.service.ts`)

| Method | Description |
|--------|-------------|
| `getOrCreateSettings(em, tenantId, orgId)` | Upsert settings row for the tenant |
| `importFromDocumentInvoice(em, params)` | Copy header + lines from `fms_document_invoices` into `fms_invoicing_invoices`. Deduplicates by `sourceDocumentInvoiceId`. Sets `sourceType = 'document_extraction'`, `status = 'pending_review'`, `direction = 'incoming'` |
| `importFromSalesInvoice(em, params)` | Copy from `sales_invoices`. Deduplicates by `sourceSalesInvoiceId`. Sets `sourceType = 'sales_import'`, `status = 'draft'`, `direction = 'outgoing'` |
| `recalculateTotals(em, invoiceId)` | Sum line item amounts and update invoice header totals |

### InvoiceImportService (`services/import.service.ts`)

| Method | Description |
|--------|-------------|
| `importFromCsv(csvContent, params)` | Parse CSV with bilingual header mapping, group by invoice number, create invoices + line items. Returns `{ imported, errors }` |
| `importFromXml(xmlContent, params)` | Parse KSeF FA(3) XML, extract fields, create invoices with `ksefFaXml` preserved. Returns `{ imported, errors }` |

### KsefAuthService (`services/ksef/auth.service.ts`)

Implements the complete KSeF 2.0 async auth flow.

| Method | Description |
|--------|-------------|
| `authenticate(em, params)` | Full auth flow: find credential -> create session -> challenge -> submit auth -> poll status -> redeem tokens. Returns `{ accessToken, refreshToken, referenceNumber, session }` |
| `refreshAccessToken(em, sessionId, environment)` | Refresh an expired accessToken using the stored refreshToken. Updates session's `sessionToken` |
| `invalidateSession(em, sessionId, environment)` | Terminate a session via `DELETE /v2/auth/sessions/current`. Transitions to `closed` or `error` |

Private methods: `requestChallenge`, `submitTokenAuth`, `submitXadesAuth`, `pollAuthStatus` (max 30 attempts, 2s interval), `redeemTokens`.

### KsefClientService (`services/ksef/client.service.ts`)

Stateful HTTP client for authenticated KSeF API calls. Uses `Authorization: Bearer <accessToken>`.

| Method | Description |
|--------|-------------|
| `setAccessToken(token)` | Set the Bearer token for subsequent requests |
| `sendInvoice(request)` | `POST /v2/invoices/send` |
| `getInvoiceStatus(hash)` | `GET /v2/invoices/{hash}/status` |
| `downloadUpo()` | `GET /v2/invoices/upo` |
| `queryInvoices(request)` | `POST /v2/invoices/query` |
| `downloadInvoice(hash)` | `GET /v2/invoices/{hash}` |

Throws `KsefApiError` on non-OK responses, which parses KSeF exception details from the response body.

### KsefSessionService (`services/ksef/session.service.ts`)

| Method | Description |
|--------|-------------|
| `getActiveSession(em, params)` | Find active session for NIP |
| `requireActiveSession(em, params)` | Like above but throws if not found |
| `closeSession(em, sessionId)` | Mark session as closed |
| `markSessionError(em, sessionId, message)` | Mark session as error |
| `incrementInvoiceCount(em, sessionId)` | Increment submission counter |
| `storeUpo(em, sessionId, upoXml)` | Store UPO XML and timestamp |
| `listSessions(em, params)` | Paginated session list with optional NIP/status filters |
| `closeStaleActiveSessions(em, params)` | Close sessions active > 24 hours (configurable `maxAgeMs`) |

### KsefXmlService (`services/ksef/xml.service.ts`)

| Method | Description |
|--------|-------------|
| `generateFa3Xml(em, invoiceId)` | Load invoice + line items, validate required fields (date, seller NIP, buyer NIP, at least 1 line item), generate compliant FA(3) XML |

FA(3) XML structure generated:
```xml
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
  <Naglowek>
    <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="FA(3)">FA</KodFormularza>
    <WariantFormularza>3</WariantFormularza>
    <DataWytworzeniaFa>{ISO timestamp}</DataWytworzeniaFa>
    <SystemInfo>open-mercato</SystemInfo>
  </Naglowek>
  <Podmiot1>...</Podmiot1>   <!-- Seller: NIP, Nazwa, Adres -->
  <Podmiot2>...</Podmiot2>   <!-- Buyer: NIP, Nazwa, Adres -->
  <Fa>
    <KodWaluty>{currency}</KodWaluty>
    <P_1>{date}</P_1>        <!-- Invoice date -->
    <P_2>{number}</P_2>      <!-- Invoice number -->
    <P_6>{serviceDate}</P_6> <!-- Service date (optional) -->
    <P_13_*>...</P_13_*>     <!-- Net totals per VAT rate -->
    <P_14_*>...</P_14_*>     <!-- VAT totals per VAT rate -->
    <P_15>{gross}</P_15>     <!-- Gross total -->
    <TerminPlatnosci>...</TerminPlatnosci>
    <FormaPlatnosci>...</FormaPlatnosci>
    <RachunekBankowy>...</RachunekBankowy>
    <FaWiersz>...</FaWiersz> <!-- Line items with P_7, P_8A, P_8B, P_9A, P_11, P_11A, P_12, GTU, PKWiU -->
  </Fa>
</Faktura>
```

VAT rate suffix mapping: 23%=1, 8%=2, 5%=3, 0%=4, zw=5, oo=6, np=7.

### KsefCryptoService (`services/ksef/crypto.service.ts`)

| Method | Description |
|--------|-------------|
| `generateAesKeyPair()` | Random 32-byte key + 16-byte IV |
| `encryptAes256Cbc(plaintext, key, iv)` | AES-256-CBC encryption |
| `wrapKeyRsaOaep(aesKey, publicKeyPem)` | RSA-OAEP with SHA-256 key wrapping |
| `sha256Hash(data)` | SHA-256 digest as base64 |
| `encryptInvoiceXml(xml, ksefPublicKeyPem)` | Encrypt XML with new AES key, wrap key with RSA |
| `computeInvoiceHash(xml)` | SHA-256 hash + file size for submission |
| `signChallenge(challenge, timestamp, privateKeyPem)` | Sign `timestamp\|challenge` with private key |
| `encodeInvoicePayload(xml)` | Base64-encode invoice XML |

Standalone crypto functions also available in `lib/ksef/crypto.ts`:
- `encryptTokenForKsef(token, challenge, publicKeyPem)` -- token encryption for auth step 2a
- `prepareInvoiceForSubmission(xml, sessionKey?, sessionIv?)` -- hash + optionally encrypt invoice for submission

### KsefReceiverService (`services/ksef/receiver.service.ts`)

| Method | Description |
|--------|-------------|
| `syncReceivedInvoices(em, params)` | Query KSeF for invoices received by `subject2` (buyer), download bodies, create incoming `FmsInvoicingInvoice` records with `sourceType = 'ksef_received'`. Paginates through results (page size 100). Returns `{ received, skipped, errors[] }` |

---

## API Endpoints (27 routes)

### Invoice CRUD

| Method | Path | Feature | Description |
|--------|------|---------|-------------|
| GET | `/api/fms_invoicing/invoices` | `invoices.view` | List invoices with filtering, sorting, pagination |
| POST | `/api/fms_invoicing/invoices` | `invoices.manage` | Create invoice (with optional inline `lineItems`) |
| GET | `/api/fms_invoicing/invoices/[id]` | `invoices.view` | Get invoice detail with line items |
| PATCH | `/api/fms_invoicing/invoices/[id]` | `invoices.manage` | Update invoice fields |
| DELETE | `/api/fms_invoicing/invoices/[id]` | `invoices.delete` | Soft-delete invoice |
| POST | `/api/fms_invoicing/invoices/[id]/approve` | `invoices.approve` | Approve invoice (sets status, records reviewer) |
| POST | `/api/fms_invoicing/invoices/[id]/reject` | `invoices.approve` | Reject invoice (requires review notes) |

### Invoice Import

| Method | Path | Feature | Description |
|--------|------|---------|-------------|
| POST | `/api/fms_invoicing/invoices/import` | `invoices.manage` | Batch import (array of invoices, max 100) |
| POST | `/api/fms_invoicing/invoices/import-from-document` | `invoices.manage` | Import from fms_documents by ID |
| POST | `/api/fms_invoicing/invoices/import-from-sales` | `invoices.manage` | Import from sales module by ID |

### KSeF Operations

| Method | Path | Feature | Description |
|--------|------|---------|-------------|
| POST | `/api/fms_invoicing/ksef/submit/[id]` | `ksef.submit` | Queue single invoice for KSeF submission |
| POST | `/api/fms_invoicing/ksef/submit-batch` | `ksef.submit` | Queue batch of invoice IDs for KSeF submission |
| POST | `/api/fms_invoicing/ksef/sync-received` | `ksef.receive` | Sync received invoices from KSeF |
| POST | `/api/fms_invoicing/ksef/generate-xml/[id]` | `ksef.submit` | Generate FA(3) XML preview (stub) |
| GET | `/api/fms_invoicing/ksef/status/[id]` | `ksef.view` | Get KSeF submission status for invoice |

### KSeF Sessions

| Method | Path | Feature | Description |
|--------|------|---------|-------------|
| GET | `/api/fms_invoicing/ksef/sessions` | `ksef.view` | List sessions (paginated, optional status filter) |
| GET | `/api/fms_invoicing/ksef/sessions/[id]` | `ksef.view` | Get session detail |

### Settings & Credentials

| Method | Path | Feature | Description |
|--------|------|---------|-------------|
| GET | `/api/fms_invoicing/settings` | `settings.view` | Get invoicing settings (returns defaults if no row) |
| PATCH | `/api/fms_invoicing/settings` | `settings.manage` | Update settings (upsert) |
| GET | `/api/fms_invoicing/credentials` | `settings.view` | List credentials (sensitive fields masked: `hasToken`, `hasCertificate`) |
| POST | `/api/fms_invoicing/credentials` | `settings.manage` | Create credential (409 if NIP+env exists) |
| PATCH | `/api/fms_invoicing/credentials/[id]` | `settings.manage` | Update credential fields |
| DELETE | `/api/fms_invoicing/credentials/[id]` | `settings.manage` | Permanently delete credential |
| POST | `/api/fms_invoicing/credentials/[id]/test` | `settings.manage` | Test credential (validates config, connectivity test stub) |

All routes export `openApi` for documentation generation.

---

## Commands (11)

| Command ID | Type | Description | Undoable |
|-----------|------|-------------|----------|
| `fms_invoicing.invoices.create` | CRUD | Create invoice with optional line items | Yes (hard delete on undo) |
| `fms_invoicing.invoices.update` | CRUD | Update invoice fields | Yes (restore snapshot) |
| `fms_invoicing.invoices.delete` | CRUD | Soft-delete invoice | Yes (restore snapshot) |
| `fms_invoicing.invoices.approve` | Lifecycle | Set status to `approved`, record reviewer | Yes (restore previous status) |
| `fms_invoicing.invoices.reject` | Lifecycle | Set status to `rejected`, require review notes | Yes (restore previous status) |
| `fms_invoicing.ksef.queue` | KSeF | Set `ksefStatus = 'queued'`. Requires `status = 'approved'` | No (state machine) |
| `fms_invoicing.ksef.update_status` | KSeF | Update KSeF fields (status, number, reference, XML, errors). Called by workers | No (system-driven) |
| `fms_invoicing.settings.update` | Settings | Upsert tenant settings | No |
| `fms_invoicing.credentials.create` | Settings | Create KSeF credential | No |
| `fms_invoicing.credentials.update` | Settings | Update credential fields | No |
| `fms_invoicing.credentials.delete` | Settings | Hard-delete credential | No |

---

## Workers (5)

| Worker | Queue Name | Concurrency | Description |
|--------|-----------|-------------|-------------|
| `ksef-submit` | `fms-invoicing-ksef-submit` | 3 | Authenticate -> generate FA(3) XML -> prepare (hash/encrypt) -> submit via `POST /v2/invoices/send` -> update invoice status -> enqueue status poll. Reuses active session for same NIP or creates new one |
| `ksef-status-poll` | `fms-invoicing-ksef-status-poll` | 5 | Poll `GET /v2/invoices/{hash}/status` with exponential backoff (base 5s, max 300s, max 20 attempts). Resolves processing codes to accepted/rejected/error/pending. Emits events on terminal status |
| `ksef-upo-download` | `fms-invoicing-ksef-upo-download` | 3 | Download UPO via `GET /v2/invoices/upo` for a closed session. Stores UPO XML on session and all accepted invoices in that session. Emits `ksef.upo_downloaded` events |
| `ksef-receive-sync` | `fms-invoicing-ksef-receive-sync` | 2 | Authenticate -> query KSeF for received invoices (`subjectType: 'subject2'`) -> download invoice XML -> create incoming invoice records. Invalidates session on completion |
| `invoice-import` | `fms-invoicing-import` | 3 | Process queued CSV/XML imports. CSV: parse headers, deduplicate by `sourceImportReference`, create invoices + optional line items. XML: extract fields via regex, store raw XML. Emits `import.completed` or `import.failed` |

### Worker Flow: KSeF Submission (ksef-submit)

```
1. Load invoice with ksefStatus='queued' (skip if not found or not queued)
2. Load tenant settings for KSeF environment
3. Determine seller NIP from invoice.sellerTaxId or settings.defaultSellerNip
4. Find or create active KSeF session for the NIP:
   a. Find existing active session for NIP
   b. If none: authenticate via KsefAuthService.authenticate()
      - POST /v2/auth/challenge -> challenge + timestamp
      - POST /v2/auth/ksef-token -> { authenticationToken, referenceNumber }
      - Poll GET /v2/auth/{ref} until status=completed
      - POST /v2/auth/token/redeem -> { accessToken, refreshToken }
5. Generate FA(3) XML (inline generation)
6. Prepare invoice: SHA-256 hash + base64 encode (optionally AES encrypt with session key)
7. POST /v2/invoices/send -> { elementReferenceNumber, processingCode }
8. Update invoice: ksefStatus='submitted', ksefReferenceNumber, ksefSubmittedAt
9. Increment session invoice count
10. Enqueue ksef-status-poll job for the invoice
```

On error: set `ksefStatus='error'`, store error message, re-throw for worker retry.

### Worker Flow: KSeF Status Polling (ksef-status-poll)

```
1. Load invoice (skip if not found or already terminal)
2. Check attempt count (max 20, then set error + emit event)
3. GET /v2/invoices/{hash}/status
4. Resolve processingCode:
   - 200 (accepted): set ksefStatus='accepted', store ksefNumber + ksefAcceptedAt, emit ksef.accepted
   - 300-303 (rejected): set ksefStatus='rejected', store error, emit ksef.rejected
   - 400+ (error): set ksefStatus='error', store error, emit ksef.error
   - 100-102 (pending): re-enqueue with exponential backoff (5s * 2^attempt, max 300s)
5. On transient network errors: re-enqueue if under max attempts
```

---

## Subscribers (3)

| Subscriber | Listens to | Persistent | Action |
|------------|-----------|------------|--------|
| `auto-import-from-documents` | `fms_documents.invoice.updated` | Yes | If `settings.autoImportFromDocuments` is enabled and source invoice has `status='approved'`, import via `InvoicingService.importFromDocumentInvoice()`. Deduplicates by checking `sourceDocumentInvoiceId`. Classifies errors as retryable vs non-retryable |
| `auto-submit-to-ksef` | `fms_invoicing.invoice.approved` | Yes | If `settings.ksefAutoSubmit` is enabled, invoice is outgoing, and `ksefStatus='none'`, set `ksefStatus='queued'` and enqueue `fms-invoicing-ksef-submit` job |
| `ksef-session-closed` | `fms_invoicing.ksef.session_closed` | Yes | If session has a reference number and UPO is not yet downloaded, enqueue `fms-invoicing-ksef-upo-download` job |

All subscribers fork the EntityManager (`em.fork()`) and implement non-retryable error classification (TypeError, ReferenceError, constraint violations).

---

## Events (17)

Declared via `createModuleEvents` in `events.ts`:

### Invoice CRUD Events
| Event ID | Category | Entity |
|----------|----------|--------|
| `fms_invoicing.invoice.created` | crud | fms_invoicing_invoice |
| `fms_invoicing.invoice.updated` | crud | fms_invoicing_invoice |
| `fms_invoicing.invoice.deleted` | crud | fms_invoicing_invoice |

### Business Lifecycle Events
| Event ID | Category | Entity |
|----------|----------|--------|
| `fms_invoicing.invoice.approved` | lifecycle | fms_invoicing_invoice |
| `fms_invoicing.invoice.rejected` | lifecycle | fms_invoicing_invoice |

### KSeF Lifecycle Events
| Event ID | Category | Entity |
|----------|----------|--------|
| `fms_invoicing.ksef.queued` | lifecycle | fms_invoicing_invoice |
| `fms_invoicing.ksef.submitted` | lifecycle | fms_invoicing_invoice |
| `fms_invoicing.ksef.accepted` | lifecycle | fms_invoicing_invoice |
| `fms_invoicing.ksef.rejected` | lifecycle | fms_invoicing_invoice |
| `fms_invoicing.ksef.error` | lifecycle | fms_invoicing_invoice |
| `fms_invoicing.ksef.upo_downloaded` | lifecycle | fms_invoicing_invoice |
| `fms_invoicing.ksef.received` | lifecycle | fms_invoicing_invoice |

### Session Events
| Event ID | Category | Entity |
|----------|----------|--------|
| `fms_invoicing.ksef.session_opened` | lifecycle | fms_invoicing_ksef_session |
| `fms_invoicing.ksef.session_closed` | lifecycle | fms_invoicing_ksef_session |
| `fms_invoicing.ksef.session_error` | lifecycle | fms_invoicing_ksef_session |

### Import Events
| Event ID | Category |
|----------|----------|
| `fms_invoicing.import.completed` | lifecycle |
| `fms_invoicing.import.failed` | lifecycle |

### Event Payloads

```typescript
interface InvoiceEventPayload {
  id: string
  tenantId: string
  organizationId: string
  invoiceNumber: string
  direction?: string
  sourceType?: string
  [key: string]: unknown
}

interface KsefSessionEventPayload {
  id: string
  tenantId: string
  organizationId: string
  sessionType: string
  nip: string
  [key: string]: unknown
}

interface ImportEventPayload {
  tenantId: string
  organizationId: string
  count: number
  sourceType: string
  errorMessage?: string
  [key: string]: unknown
}
```

---

## Access Control (9 features)

| Feature ID | Title | Description |
|-----------|-------|-------------|
| `fms_invoicing.invoices.view` | View invoices | Read access to invoice list and detail |
| `fms_invoicing.invoices.manage` | Manage invoices | Create, edit, and import invoices |
| `fms_invoicing.invoices.approve` | Approve/reject invoices | Approve or reject invoices for KSeF submission |
| `fms_invoicing.invoices.delete` | Delete invoices | Soft-delete invoices |
| `fms_invoicing.ksef.view` | View KSeF status | Read KSeF status on invoices, view sessions |
| `fms_invoicing.ksef.submit` | Submit invoices to KSeF | Queue invoices, open/close sessions, generate XML |
| `fms_invoicing.ksef.receive` | Receive invoices from KSeF | Sync received invoices |
| `fms_invoicing.settings.view` | View invoicing settings | Read settings and credentials |
| `fms_invoicing.settings.manage` | Manage invoicing settings | Modify settings, CRUD credentials, test credentials |

### Default Role Features

| Role | Features |
|------|----------|
| `admin` | All 9 features |
| `employee` | `fms_invoicing.invoices.view`, `fms_invoicing.ksef.view` |

---

## Search Configuration

Defined in `search.ts`. Entity: `fms_invoicing:fms_invoicing_invoice`, priority 7.

**Searchable fields:** `invoice_number`, `seller_name`, `seller_tax_id`, `buyer_name`, `buyer_tax_id`, `ksef_number`, `notes`, `source_import_reference`

**Excluded fields:** `id`, `organization_id`, `tenant_id`, `attachment_id`, `ksef_fa_xml`, `ksef_upo_xml`, `ksef_session_id`, `metadata`, `deleted_at`

**Presenter:** icon=`receipt`, badge=`status`, title=`invoice_number`, subtitle=`seller_name | gross_amount | currency_code`

---

## CLI Commands (8)

All commands use: `yarn mercato fms_invoicing <command> [options]`

### KSeF Test Environment Commands

| Command | Description |
|---------|-------------|
| `ksef:setup-test` | Create test subject + person + permissions on KSeF test env. Requires `--nip`, optionally `--pesel` for person/permissions, `--description` for label. Calls `POST /v2/testdata/subject`, `POST /v2/testdata/person`, `POST /v2/testdata/permissions`. Prints next steps for certificate generation |
| `ksef:cleanup-test` | Remove test data. Revokes permissions, removes person, removes subject. Requires `--nip`, optionally `--pesel` |
| `ksef:test-connection` | Test API connectivity by hitting `/v2/auth/challenge` and `/v2/security/public-key-certificates`. Reports status codes and response sizes |

### Credential Management

| Command | Description |
|---------|-------------|
| `ksef:add-credential` | Add or update credential in DB. Requires `--nip`, `--tenant`, `--org`. Either `--cert`/`--key` (certificate auth) or `--token` (token auth). Reads PEM files from disk. Updates existing if NIP+env match exists |
| `ksef:list-credentials` | List stored credentials for a tenant. Shows ID, NIP, auth type, environment, active status, label, last used. Requires `--tenant`, `--org` |

### Status & Operations

| Command | Description |
|---------|-------------|
| `ksef:status` | Show tenant-level dashboard: settings (environment, auto-submit, session mode, offline mode), credential count, active session count, invoice counts by status and ksef_status. Requires `--tenant`, `--org` |
| `ksef:backfill` | Import existing `FmsInvoice` records from `fms_documents` into `fms_invoicing`. Filters by `--status` (default: `approved`). Skips already-imported IDs. Reports source count, imported, skipped |
| `help` | Print command reference with all commands, options, and examples |

### Common Options

| Option | Description |
|--------|-------------|
| `--tenant <id>` | Tenant ID |
| `--org <id>` | Organization ID |
| `--env <environment>` | KSeF environment: `test` (default), `demo`, `production` |
| `--nip <NIP>` | Polish Tax ID (10 digits) |

---

## KSeF Validation Library

Defined in `lib/ksef/validators.ts`:

| Function | Description |
|----------|-------------|
| `validateNip(nip)` | Validate Polish NIP (10 digits, checksum using weights [6,5,7,2,3,4,5,6,7], mod 11) |
| `formatNipForKsef(nip)` | Strip whitespace/dashes, validate, return clean 10-digit NIP. Throws on invalid |
| `validateKsefNumber(ksefNumber)` | Validate 35-char KSeF reference: `NNNNNNNNNN-DDDDDDDD-AAAAAA-BBBBBBBB` |
| `validateInvoiceNumber(invoiceNumber)` | Non-empty, max 256 chars |
| `validateTaxId(taxId, countryCode?)` | Polish NIP validation for PL, length check (4-20) for others |
| `validateBankAccountNumber(account)` | Validate 26-digit Polish account or IBAN format with mod-97 checksum |
| `validateCurrencyCode(code)` | 3 uppercase letters (ISO 4217) |
| `validateVatRate(rate)` | Numeric 0-100 |

---

## Offline Modes

| Mode | Prefix | Max Duration | Description |
|------|--------|-------------|-------------|
| `online` | (none) | N/A | Normal operation, real-time submission |
| `offline24` | `O24` | 24 hours | Planned short outage; invoices must be submitted within 24h |
| `unavailability` | `OND` | Unlimited | KSeF declared unavailable by Ministry of Finance |
| `emergency` | `OAW` | Unlimited | Extraordinary circumstances (force majeure) |

When offline, invoice numbers are prefixed: `{prefix}/{sequence}/{baseNumber}`.
The `offlineMode` setting in `FmsInvoicingSettings` controls the mode for the entire tenant. Helpers in `lib/ksef/offline-modes.ts`.

---

## UI Pages

| Path | Component | Features Required |
|------|-----------|-------------------|
| `/backend/fms-invoicing` | Invoice list with DataTable | `fms_invoicing.invoices.view` |
| `/backend/fms-invoicing/ksef` | KSeF session management dashboard | `fms_invoicing.ksef.view` |
| `/backend/fms-invoicing/settings` | Invoicing settings + credential management | `fms_invoicing.settings.view` |

---

## Testing Guide

### Setting Up Test Data on KSeF Test Environment

**Step 1: Create test subject and person**
```bash
yarn mercato fms_invoicing ksef:setup-test \
  --nip 7980332920 \
  --pesel 30112206276 \
  --description "Test Company"
```

This creates a test company (subject), test person, and grants all 5 permission types (InvoiceRead, InvoiceWrite, CredentialsManage, CredentialsRead, Introspection).

**Step 2: Generate a self-signed certificate**
```bash
openssl genrsa -out ksef-test-key.pem 2048
openssl req -new -x509 -key ksef-test-key.pem -out ksef-test-cert.pem -days 365 \
  -subj "/CN=Test/O=Test Company/C=PL/serialNumber=PNOPL-30112206276"
```

**Step 3: Store credential in the database**
```bash
yarn mercato fms_invoicing ksef:add-credential \
  --nip 7980332920 \
  --cert ksef-test-cert.pem \
  --key ksef-test-key.pem \
  --tenant <tenant-id> \
  --org <org-id> \
  --env test
```

**Step 4: Verify connectivity**
```bash
yarn mercato fms_invoicing ksef:test-connection --env test
```

**Step 5: Check module status**
```bash
yarn mercato fms_invoicing ksef:status --tenant <tenant-id> --org <org-id>
```

### Testing the Full Submission Flow

1. Create an invoice via `POST /api/fms_invoicing/invoices` with seller/buyer NIP, line items, and `direction: 'outgoing'`
2. Approve it via `POST /api/fms_invoicing/invoices/{id}/approve`
3. Submit to KSeF via `POST /api/fms_invoicing/ksef/submit/{id}`
4. Monitor status via `GET /api/fms_invoicing/ksef/status/{id}`
5. Check sessions via `GET /api/fms_invoicing/ksef/sessions`

### Cleaning Up Test Data

```bash
yarn mercato fms_invoicing ksef:cleanup-test \
  --nip 7980332920 \
  --pesel 30112206276 \
  --env test
```

---

## Risks & Impact Review

### KSeF API Unavailability During Mandatory Period
- **Scenario**: KSeF API is down after April 1, 2026. Outgoing invoices cannot receive official KSeF numbers.
- **Severity**: Critical
- **Affected area**: All outgoing invoice operations, legal compliance
- **Mitigation**: Offline mode support (`offline24`, `unavailability`, `emergency`) allows issuing invoices with offline prefixes. When KSeF comes back, queued invoices are submitted with offline annotations.
- **Residual risk**: If `offline24` exceeds 24 hours, user must manually switch to `unavailability`. No automated KSeF health check.

### Credential Exposure
- **Scenario**: KSeF tokens or private keys in `fms_invoicing_ksef_credentials` leak via API responses, logs, or DB breach.
- **Severity**: Critical
- **Affected area**: KSeF sessions for the affected NIP. Attacker could submit fraudulent invoices.
- **Mitigation**: API list endpoint masks sensitive fields (returns `hasToken`/`hasCertificate` booleans, never raw values). Session tokens are temporary.
- **Residual risk**: Credentials stored as plaintext in DB. Future: use `findWithDecryption` pattern to encrypt at rest.

### Data Integrity During Import
- **Scenario**: Import from `fms_documents` or `sales` interrupted mid-way (crash after header, before lines).
- **Severity**: Medium
- **Affected area**: Invoice data completeness
- **Mitigation**: Duplicate imports prevented by uniqueness checks on `sourceDocumentInvoiceId`/`sourceSalesInvoiceId`. Partial invoices detectable by line count comparison.
- **Residual risk**: No transaction wrapping around multi-flush import sequence. Future: wrap in `withAtomicFlush`.

### Race Condition on KSeF Status Updates
- **Scenario**: Multiple workers update same invoice's `ksefStatus` concurrently, older status overwrites newer.
- **Severity**: Medium
- **Affected area**: Invoice KSeF lifecycle tracking
- **Mitigation**: Status poll worker processes sequentially per invoice (job payload contains invoiceId). Terminal status check at poll start skips already-resolved invoices.
- **Residual risk**: No optimistic locking or state machine guard. Future: add state machine validator rejecting backward transitions.

### Tenant Data Isolation
- **Scenario**: Query bug leaks invoices between tenants.
- **Severity**: Critical
- **Affected area**: All invoice queries and imports
- **Mitigation**: All entities include `organization_id`+`tenant_id`. API routes resolve scope via `resolveOrganizationScopeForRequest` and filter by `$in: allowedOrgIds`. Import services use parameterized queries with explicit tenant filtering.
- **Residual risk**: Raw knex queries in import services manually include tenant filters. A missed filter could leak data.

### KSeF Session Token Expiry
- **Scenario**: Access token expires during batch submission. Subsequent API calls fail with 401.
- **Severity**: High
- **Affected area**: Batch submission workflow
- **Mitigation**: `KsefAuthService.refreshAccessToken()` can refresh tokens. Workers catch errors and can re-authenticate. `KsefSessionService.closeStaleActiveSessions()` closes sessions > 24h.
- **Residual risk**: No proactive token refresh before expiry. No circuit breaker pattern.

### Storage Growth from XML
- **Scenario**: `ksef_fa_xml` and `ksef_upo_xml` TEXT columns cause DB bloat at scale.
- **Severity**: Medium
- **Affected area**: Database storage, query performance
- **Mitigation**: XML not stored for drafts. List API does not select XML columns. Search config excludes XML fields.
- **Residual risk**: No archival strategy. Future: move XML to blob storage.

### Rate Limiting on KSeF API
- **Scenario**: Rapid batch submission triggers KSeF 429 responses.
- **Severity**: Medium
- **Affected area**: Batch submission worker
- **Mitigation**: Worker concurrency capped. Status poll uses exponential backoff. `getRateLimitsUrl` endpoint available for checking limits.
- **Residual risk**: KSeF rate limits not publicly documented. Future: adaptive rate limiting.

### Migration & Deployment
- **Scenario**: Migration fails on production database.
- **Severity**: Low (initial deployment)
- **Affected area**: Database schema
- **Mitigation**: All 5 tables are new (additive-only). Can be rolled back by dropping tables. No data backfill required.
- **Residual risk**: Future alterations must be backward-compatible with defaults for non-nullable columns.

---

## Compliance

### Polish Legal Requirements (KSeF)

| Requirement | Implementation |
|-------------|----------------|
| FA(3) schema compliance | `KsefXmlService.generateFa3Xml()` generates compliant XML with correct namespace `http://crd.gov.pl/wzor/2023/06/29/12648/` |
| NIP validation | `lib/ksef/validators.ts` implements full checksum validation (mod-11 with weights) |
| VAT rate codes | `23%`, `8%`, `5%`, `0%`, `zw` (exempt), `oo` (reverse charge), `np` (not applicable) |
| Payment method codes | transfer, cash, card, check, credit, other |
| Offline mode compliance | `lib/ksef/offline-modes.ts` implements prefix formatting, deadline tracking per legal requirements |
| UPO (Official Proof of Receipt) | Downloaded per-session via `ksef-upo-download` worker, stored on session and per-invoice |
| PKWiU classification | Optional `pkwiu_code` on line items |
| GTU classification | Optional `gtu_code` on line items (GTU_01 through GTU_13) |
| Invoice retention | Soft-delete preserves data (tax law requires 5-year retention) |
| IBAN validation | `validateBankAccountNumber` validates 26-digit Polish accounts and full IBAN with mod-97 |

### GDPR Considerations

- Seller and buyer names, tax IDs, and addresses are business data
- Soft-delete preserves data for audit trail (required by tax law)
- No encryption at rest for PII fields currently; future: apply `findWithDecryption` pattern
- Credential PEM files and tokens should be encrypted at rest (documented residual risk)

---

## Open Questions

1. **Correction invoices (faktura korygujaca)**: FA(3) supports invoice type `KOR`. Should correction invoices be a separate entity or a flag on `FmsInvoicingInvoice`?
2. **Multi-NIP tenants**: Supported via multiple credentials. Submission flow selects credential by matching `invoice.sellerTaxId` against credentials. Need to verify edge cases.
3. **KSeF webhooks**: KSeF v2 does not offer webhooks. Status polling is the only option. Consider SSE for real-time UI updates.
4. **Archival policy**: When to move XML to blob storage? After UPO download? After configurable retention period?
5. **XAdES signing**: Certificate-based auth (`submitXadesAuth`) is stubbed. Requires `xml-crypto` or similar library for proper XAdES XML construction.
6. **Sprint 4 stubs**: Three API routes return 501 (Not Implemented): `generate-xml/{id}`, `sync-received`, and `credentials/{id}/test`. The underlying services exist but are not wired through the API layer yet.

---

## Changelog

### 2026-03-17
- Complete rewrite of specification reflecting fully implemented codebase
- Documented all 65 files across 8 layers (data, commands, services, lib, api, workers, subscribers, backend)
- Documented KSeF 2.0 API with complete endpoint map (32 KSeF endpoints), auth flow, and type reference
- Documented all 8 services with method signatures and behavior
- Documented all 27 API endpoints (up from 2 in initial spec; all previously "planned" endpoints now implemented)
- Documented all 5 workers with queue names, concurrency, and detailed flow descriptions
- Documented all 3 subscribers with event sources and behavior
- Documented all 11 commands with undo support details
- Documented 8 CLI commands with usage, options, and examples
- Added search configuration details
- Added testing guide with step-by-step setup instructions
- Added KSeF processing status code reference table
- Added validation library reference
- Updated risks section with 9 risk scenarios
- Updated compliance section with implementation references
