# SPEC-060: KSeF Integration — Architecture Report

**Created:** 2026-03-23
**Module:** `invoicing`
**Package:** `packages/invoicing/`
**Status:** Implemented (feat/ksef branch)
**Related specs:** SPEC-025 (FMS Invoicing with KSeF 2.0)

---

## Overview

The KSeF (Krajowy System e-Faktur / National e-Invoice System) integration enables full compliance with Poland's **mandatory e-invoicing requirement effective April 1, 2026**. The integration lives entirely within the `@open-mercato/invoicing` package and provides:

- Outgoing invoice submission to KSeF with FA(3) XML generation
- Incoming invoice reception and synchronization from KSeF
- Async multi-step authentication (KSeF API v2.0)
- Session management (interactive and batch modes)
- Offline invoicing modes mandated by Polish law
- UPO (Urzedowe Poswiadczenie Odbioru — official receipt) retrieval
- Credential management (token-based and certificate-based auth)
- Event-driven automation (auto-submit on approval, auto-import)

---

## Architecture

### High-Level Component Diagram

```
                         ┌──────────────────────────────────┐
                         │        Frontend (Backend Pages)   │
                         │  ┌────────┐ ┌──────┐ ┌────────┐ │
                         │  │Settings│ │KSeF  │ │Invoice │ │
                         │  │ Pages  │ │Dash  │ │Builder │ │
                         │  └───┬────┘ └──┬───┘ └───┬────┘ │
                         └──────┼─────────┼─────────┼──────┘
                                │         │         │
                                ▼         ▼         ▼
                         ┌──────────────────────────────────┐
                         │           API Routes              │
                         │  /api/invoicing/invoices/*        │
                         │  /api/invoicing/ksef/*            │
                         │  /api/invoicing/credentials/*     │
                         │  /api/invoicing/settings          │
                         └──────────────┬───────────────────┘
                                        │
                         ┌──────────────┼───────────────────┐
                         │          Commands                 │
                         │  createInvoice, approveInvoice,   │
                         │  queueKsef, updateKsefStatus      │
                         └──────────────┬───────────────────┘
                                        │
                    ┌───────────────────┼────────────────────┐
                    │                   │                     │
                    ▼                   ▼                     ▼
          ┌─────────────────┐  ┌──────────────┐  ┌──────────────────┐
          │   KSeF Services │  │   Workers     │  │   Subscribers    │
          │  ┌────────────┐ │  │  ┌──────────┐ │  │  ┌────────────┐ │
          │  │ Auth       │ │  │  │ Submit   │ │  │  │ Auto-submit│ │
          │  │ Client     │ │  │  │ Poll     │ │  │  │ Auto-import│ │
          │  │ Session    │ │  │  │ Receive  │ │  │  │ UPO-trigger│ │
          │  │ Crypto     │ │  │  │ UPO      │ │  │  └────────────┘ │
          │  │ Receiver   │ │  │  │ Import   │ │  └──────────────────┘
          │  │ XML        │ │  │  └──────────┘ │
          │  └────────────┘ │  └──────────────┘
          └────────┬────────┘         │
                   │                  │
                   ▼                  ▼
          ┌─────────────────────────────────────┐
          │           lib/ksef/                  │
          │  endpoints, types, crypto, xml-      │
          │  builder, xml-parser, fa3-schema,    │
          │  status-codes, validators, offline   │
          └────────────────┬────────────────────┘
                           │
                           ▼
                  ┌────────────────┐
                  │  KSeF API v2.0 │
                  │  (Government)  │
                  └────────────────┘
```

### Package Structure

```
packages/invoicing/src/modules/invoicing/
├── index.ts                    # Module metadata
├── acl.ts                      # 9 RBAC features
├── di.ts                       # DI: 7 services registered
├── events.ts                   # 17 typed events
├── setup.ts                    # Default role features
├── search.ts                   # Fulltext search config
├── cli.ts                      # CLI commands (ksef:setup-test)
│
├── data/
│   ├── entities.ts             # 5 MikroORM entities
│   ├── types.ts                # Type unions (statuses, environments, etc.)
│   ├── validators.ts           # Zod schemas
│   └── snapshots.ts            # Snapshot types for audit
│
├── lib/ksef/
│   ├── types.ts                # KSeF v2.0 API payload types
│   ├── endpoints.ts            # URL builders (all 30+ endpoints)
│   ├── crypto.ts               # AES-256-CBC, RSA-OAEP, SHA-256
│   ├── xml-builder.ts          # FA(3) XML generation
│   ├── xml-parser.ts           # XML response parsing
│   ├── fa3-schema.ts           # FA(3) constants (namespaces, codes)
│   ├── status-codes.ts         # Processing code → status resolution
│   ├── validators.ts           # NIP validation, formatting
│   └── offline-modes.ts        # Offline mode logic & deadlines
│
├── services/ksef/
│   ├── auth.service.ts         # Multi-step auth (v2.0 async flow)
│   ├── client.service.ts       # HTTP client for KSeF API
│   ├── crypto.service.ts       # Crypto service wrapper
│   ├── session.service.ts      # Session lifecycle
│   ├── receiver.service.ts     # Incoming invoice sync
│   └── xml.service.ts          # XML generation service
│
├── workers/
│   ├── ksef-submit.ts          # Submit invoice (concurrency: 3)
│   ├── ksef-status-poll.ts     # Poll status (concurrency: 5)
│   ├── ksef-receive-sync.ts    # Sync received (concurrency: 2)
│   ├── ksef-upo-download.ts    # Download UPO (concurrency: 1)
│   └── invoice-import.ts       # Bulk import (concurrency: 2)
│
├── subscribers/
│   ├── auto-submit-to-ksef.ts  # invoice.approved → queue submit
│   ├── ksef-session-closed.ts  # session_closed → queue UPO download
│   └── auto-import-from-documents.ts
│
├── commands/
│   ├── invoices.ts             # CRUD + approve/reject
│   ├── ksef.ts                 # queueKsef, updateKsefStatus
│   ├── settings.ts             # Settings + credential commands
│   └── shared.ts               # Snapshot helpers
│
├── api/                        # 21 API routes (see API section)
├── backend/                    # 7 backend pages (see UI section)
├── components/                 # 5 React components
├── migrations/                 # 3 database migrations
└── __integration__/            # 9 test specs
```

---

## Data Models

### Entity Relationship

```
InvoicingSettings (1 per tenant)
    ├── ksefEnvironment, ksefAutoSubmit, ksefSessionMode
    └── defaultSellerNip, offlineMode

InvoicingKsefCredential (N per tenant)
    ├── nip + environment (unique per tenant)
    ├── authType: token | certificate
    └── encrypted token or PEM cert + private key

InvoicingKsefSession (N per tenant)
    ├── sessionType: interactive | batch
    ├── sessionStatus: initializing → active → closing → closed
    ├── tokens: sessionToken, encryptionKey, encryptionIv
    └── invoiceCount, upoXml

InvoicingInvoice (N per tenant)
    ├── direction: outgoing | incoming
    ├── status: draft → pending_review → approved → sent → paid
    ├── ksefStatus: none → queued → submitted → processing → accepted → upo_downloaded
    ├── seller/buyer data (name, taxId, address)
    ├── amounts (net, vat, gross, currency)
    ├── KSeF fields (ksefNumber, ksefReferenceNumber, ksefFaXml, ksefUpoXml)
    └── line items (1:N)

InvoicingLineItem (N per invoice)
    ├── lineNumber, description, quantity, unit
    ├── unitPriceNet, vatRate, vatRateCode
    ├── netAmount, vatAmount, grossAmount
    └── gtuCode, pkwiuCode
```

### Invoice Status Machines

**Business Status** (sequential):
```
draft → pending_review → approved → sent → paid
                       ↘ rejected
                                    ↘ cancelled
```

**KSeF Status** (parallel, tracked independently):
```
none → queued → submitted → processing → accepted → upo_downloaded
                                       ↘ rejected
                                       ↘ error
                          ↘ cancelled
```

### Key Database Fields (KSeF-specific)

| Field | Type | Description |
|-------|------|-------------|
| `ksef_status` | enum | Current KSeF processing status |
| `ksef_number` | string | Official KSeF reference number (assigned on acceptance) |
| `ksef_reference_number` | string | Tracking reference from submission |
| `ksef_session_id` | FK | Session used for submission |
| `ksef_submitted_at` | timestamp | When submitted to KSeF |
| `ksef_accepted_at` | timestamp | When accepted by KSeF |
| `ksef_fa_xml` | text | Generated FA(3) XML (stored for audit) |
| `ksef_upo_xml` | text | UPO XML (official receipt) |
| `ksef_error_message` | text | Last error description |
| `ksef_error_code` | string | Last KSeF processing code |

---

## KSeF API v2.0 Integration

### Environments

| Environment | Base URL | Purpose |
|-------------|---------|---------|
| `test` | `https://api-test.ksef.mf.gov.pl` | Development testing |
| `demo` | `https://api-demo.ksef.mf.gov.pl` | Pre-production validation |
| `production` | `https://api.ksef.mf.gov.pl` | Live production |

All endpoints use the `/v2/` prefix. Defined in `lib/ksef/endpoints.ts` as URL builder functions.

### Authentication Flow (Async, Multi-Step)

KSeF 2.0 uses an asynchronous authentication flow — a major change from v1.0's synchronous single-request auth.

```
┌──────────┐                                    ┌─────────────┐
│  Client   │                                    │  KSeF API   │
└─────┬─────┘                                    └──────┬──────┘
      │                                                  │
      │  1. POST /v2/auth/challenge                     │
      │ ─────────────────────────────────────────────►  │
      │  ◄──────────── { challenge, timestamp }          │
      │                 (valid 10 minutes)                │
      │                                                  │
      │  2a. POST /v2/auth/ksef-token  (token auth)     │
      │      { challenge, contextIdentifier(NIP),        │
      │        encryptedToken }                          │
      │ ─────────────────────────────────────────────►  │
      │  ◄──── { authenticationToken, referenceNumber }  │
      │                                                  │
      │  3. GET /v2/auth/{referenceNumber}  (poll)      │
      │     Authorization: Bearer <authenticationToken>  │
      │ ─────────────────────────────────────────────►  │
      │  ◄──── { status: "pending" | "completed" }       │
      │        (repeat until completed, 2s interval)     │
      │                                                  │
      │  4. POST /v2/auth/token/redeem  (one-time)      │
      │     Authorization: Bearer <authenticationToken>  │
      │ ─────────────────────────────────────────────►  │
      │  ◄──── { accessToken, refreshToken }             │
      │                                                  │
      │  5. All subsequent calls use:                    │
      │     Authorization: Bearer <accessToken>          │
      │                                                  │
      │  6. POST /v2/auth/token/refresh                  │
      │     Authorization: Bearer <refreshToken>         │
      │ ─────────────────────────────────────────────►  │
      │  ◄──── { accessToken (new) }                     │
```

**Implementation:** `services/ksef/auth.service.ts` — `KsefAuthService.authenticate()` orchestrates the full flow. Polling uses 2s intervals, max 30 attempts.

### Dual Authentication Methods

**Token-based** (primary):
1. Fetch KSeF public key from `GET /v2/security/public-key-certificates`
2. Concatenate `token|timestamp` string
3. Encrypt with AES-256-CBC using random key/IV
4. Wrap AES key with RSA-OAEP (SHA-256) using KSeF's public key
5. Encode as binary: `[4-byte key length][wrapped key][IV][encrypted token]` → base64

**Certificate-based** (XAdES):
- Submit XAdES-signed XML to `POST /v2/auth/xades-signature`
- Requires qualified electronic certificate (e-signature)
- Currently stubbed — needs `xml-crypto` library for full implementation

**Key difference from v1.0:** v2.0 uses dual tokens (short-lived `accessToken` + long-lived `refreshToken`) with `Bearer` auth header, replacing v1.0's single `SessionToken` header.

### Cryptography

All crypto operations use Node.js built-in `crypto` module — no external libraries.

| Operation | Algorithm | Purpose |
|-----------|-----------|---------|
| Token encryption | AES-256-CBC | Encrypt `token\|timestamp` for auth |
| Key wrapping | RSA-OAEP (SHA-256) | Wrap AES key with KSeF's public key |
| Invoice hashing | SHA-256 (Base64) | Invoice integrity hash for submission |
| Invoice encryption | AES-256-CBC | Optional session-level invoice encryption |

**Implementation:** `lib/ksef/crypto.ts` — pure functions: `encryptAes256Cbc`, `wrapKeyRsaOaep`, `sha256HashBase64`, `encryptTokenForKsef`, `prepareInvoiceForSubmission`.

### Endpoint Map (30+ endpoints)

**Authentication (6):**
- `POST /v2/auth/challenge` — Get challenge
- `POST /v2/auth/ksef-token` — Token auth
- `POST /v2/auth/xades-signature` — Certificate auth
- `GET /v2/auth/{ref}` — Poll auth status
- `POST /v2/auth/token/redeem` — Exchange for access/refresh tokens
- `POST /v2/auth/token/refresh` — Refresh access token

**Sessions (3):**
- `GET /v2/auth/sessions` — List active sessions
- `DELETE /v2/auth/sessions/current` — Close current session
- `DELETE /v2/auth/sessions/{ref}` — Close specific session

**Invoices (5):**
- `POST /v2/invoices/send` — Submit invoice
- `GET /v2/invoices/{hash}` — Download by hash
- `GET /v2/invoices/{hash}/status` — Check processing status
- `POST /v2/invoices/query` — Query/search invoices
- `GET /v2/invoices/upo` — Download UPO

**Batch (3):**
- `POST /v2/batch/jobs` — Create batch job
- `GET /v2/batch/jobs/{id}` — Check batch status
- `GET /v2/batch/jobs/{id}/results` — Get batch results

**Security (1):** `GET /v2/security/public-key-certificates`

**Certificates (4):** Enrollment, status, retrieval, limits

**Permissions (2):** Grant to persons and entities

**Limits (2):** Context and rate limits

**Test Data (6):** Create/remove subjects, persons, permissions (test environment only)

---

## Invoice Submission Flow

### Outgoing Invoice Lifecycle

```
                  ┌──────────┐
                  │  Create   │  Manual / import from documents / import from sales
                  │  Invoice  │
                  └─────┬─────┘
                        │
                        ▼
                  ┌──────────┐
                  │  Draft    │  Invoice with line items
                  └─────┬─────┘
                        │  (approve action)
                        ▼
                  ┌──────────┐
                  │ Approved  │  Business status = approved
                  └─────┬─────┘
                        │  (auto-submit subscriber OR manual queue)
                        ▼
               ┌─────────────────┐
               │  ksef-submit    │  Worker (concurrency: 3)
               │  worker         │
               └────────┬────────┘
                        │
        ┌───────────────┼────────────────┐
        │               │                │
        ▼               ▼                ▼
  1. Authenticate   2. Build XML    3. Submit to KSeF
  (if no active     (FA(3) format)    (encrypted, with
   session)         + store XML       SHA-256 hash)
        │               │                │
        └───────────────┼────────────────┘
                        │
                        ▼
               ┌─────────────────┐
               │ ksef-status-poll│  Worker (concurrency: 5)
               │ worker          │  Exponential backoff: 5s → 300s
               └────────┬────────┘  Max 20 attempts
                        │
              ┌─────────┼──────────┐
              ▼         ▼          ▼
         ┌────────┐ ┌────────┐ ┌───────┐
         │Accepted│ │Rejected│ │ Error │
         │(200)   │ │(300-3xx│ │(400+) │
         └────┬───┘ └────────┘ └───────┘
              │
              ▼
      ┌──────────────┐
      │ UPO Download │  (triggered on session close)
      │ Worker       │
      └──────────────┘
```

### Submit Worker Pipeline (`workers/ksef-submit.ts`)

1. Load invoice + validate it's in `queued` status
2. Load tenant settings for environment config
3. Load line items (reject if empty)
4. Find or create active KSeF session for the seller NIP
5. Generate FA(3) XML via `buildFa3Xml(invoice, lineItems)`
6. Prepare for submission: SHA-256 hash + optional AES encryption
7. `POST /v2/invoices/send` with `Authorization: Bearer <accessToken>`
8. Update invoice: `ksefStatus = 'submitted'`, store reference number
9. Enqueue `ksef-status-poll` job for async status tracking

### Status Polling (`workers/ksef-status-poll.ts`)

- `GET /v2/invoices/{hash}/status` — returns `processingCode`
- Processing codes mapped to statuses via `lib/ksef/status-codes.ts`:

| Code Range | Resolved Status | Meaning |
|------------|----------------|---------|
| 100-199 | `pending` | Still processing |
| 200 | `accepted` | Invoice accepted |
| 300-399 | `rejected` | Schema/business validation failed, duplicate |
| 400-499 | `error` | Auth/session/resource errors |
| 500+ | `error` | Internal KSeF errors |

- Exponential backoff: `min(5000 * 2^(attempt-1), 300000)` ms
- Max 20 attempts before marking as error
- Emits typed events on terminal status (`invoicing.ksef.accepted`, `.rejected`, `.error`)

---

## FA(3) XML Generation

The module generates invoices in Poland's mandatory **FA(3)** schema format.

### Schema Constants

| Constant | Value |
|----------|-------|
| Namespace | `http://crd.gov.pl/wzor/2023/06/29/12648/` |
| Schema version | `3-0E` |
| Form code | `FA` |
| System code | `FA (3)` |
| Coding system | `JPK` |

### XML Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Naglowek>
    <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="3-0E">FA</KodFormularza>
    <WariantFormularza>3</WariantFormularza>
    <DataWytworzeniaFa>2026-03-23</DataWytworzeniaFa>
    <SystemInfo>JPK</SystemInfo>
  </Naglowek>
  <Podmiot1>                          <!-- Seller -->
    <DaneIdentyfikacyjne>
      <NIP>1234567890</NIP>
      <Nazwa>Seller Company Sp. z o.o.</Nazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>PL</KodKraju>
      <AdresL1>ul. Przykładowa 1</AdresL1>
      <AdresL2>00-001 Warszawa</AdresL2>
    </Adres>
  </Podmiot1>
  <Podmiot2>                          <!-- Buyer -->
    <DaneIdentyfikacyjne>
      <NIP>0987654321</NIP>
      <Nazwa>Buyer Company S.A.</Nazwa>
    </DaneIdentyfikacyjne>
  </Podmiot2>
  <Fa>                                <!-- Invoice data -->
    <KodWaluty>PLN</KodWaluty>
    <P_1>2026-03-23</P_1>             <!-- Invoice date -->
    <P_2>FV/2026/03/001</P_2>         <!-- Invoice number -->
    <P_6>2026-03-20</P_6>             <!-- Service date -->
    <P_13_1>1000.00</P_13_1>          <!-- Net amount @ 23% -->
    <P_14_1>230.00</P_14_1>           <!-- VAT amount @ 23% -->
    <P_15>1230.00</P_15>              <!-- Gross total -->
    <Adnotacje>...</Adnotacje>
    <RodzajFaktury>VAT</RodzajFaktury>
    <FormaPlatnosci>1</FormaPlatnosci> <!-- Transfer -->
    <FaWiersz>                         <!-- Line item -->
      <NrWierszaFa>1</NrWierszaFa>
      <P_7>Service description</P_7>
      <P_8A>szt.</P_8A>
      <P_8B>1</P_8B>
      <P_9A>1000.00</P_9A>
      <P_11>1000.00</P_11>
      <P_12>23</P_12>
      <GTU>GTU_12</GTU>
    </FaWiersz>
  </Fa>
</Faktura>
```

### VAT Rate Grouping

Lines are grouped by VAT rate code and mapped to specific XML elements:

| VAT Rate | Net Element | VAT Element |
|----------|-------------|-------------|
| 23% / 22% | `P_13_1` | `P_14_1` |
| 8% / 7% | `P_13_2` | `P_14_2` |
| 5% | `P_13_3` | `P_14_3` |
| 0% | `P_13_6_1` | — |
| `zw` (exempt) | `P_13_7` | — |
| `oo`, `np` | skipped | — |

### Payment Method Codes

| Code | Method |
|------|--------|
| `1` | Bank transfer |
| `2` | Cash |
| `3` | Card |
| `4` | Check |
| `5` | Credit/compensation |
| `6` | Other |

### GTU Classification

13 GTU codes (`GTU_01` through `GTU_13`) for goods/services classification, attached per line item.

---

## Incoming Invoice Reception

### Sync Flow (`workers/ksef-receive-sync.ts`)

1. Query KSeF for received invoices: `POST /v2/invoices/query`
   - Default: 7-day lookback window
   - Supports incremental or range-based queries
   - Paginated (100 per page)
2. For each invoice header:
   - Skip if already exists (by `ksefReferenceNumber`)
   - Download full XML: `GET /v2/invoices/{hash}`
   - Parse XML to extract seller/buyer/amounts/line items
   - Create `InvoicingInvoice` with `direction: 'incoming'`, `sourceType: 'ksef_received'`
3. Emit `invoicing.ksef.received` event for each new invoice

---

## Offline Modes

Polish law requires support for invoicing when KSeF is unavailable. Four modes are supported:

| Mode | Prefix | Duration | Description |
|------|--------|----------|-------------|
| `online` | — | — | Normal operation, real-time submission |
| `offline24` | `O24` | Max 24h | Planned offline period (e.g., maintenance) |
| `unavailability` | `OND` | Unlimited | KSeF system outage declared by Ministry of Finance |
| `emergency` | `OAW` | Unlimited | Extraordinary circumstances preventing KSeF access |

**Offline invoice numbers** are prefixed: `{prefix}/{sequence}/{baseNumber}` (e.g., `O24/1/FV/2026/03/001`).

When returning online, all offline invoices must be submitted to KSeF within the regulatory window.

**Implementation:** `lib/ksef/offline-modes.ts` — functions for prefix generation, deadline calculation, expiration checks.

---

## Background Workers

| Worker | Queue | Concurrency | Trigger | Purpose |
|--------|-------|-------------|---------|---------|
| `ksef-submit` | `invoicing-ksef-submit` | 3 | API route / auto-submit subscriber | Full submission pipeline |
| `ksef-status-poll` | `invoicing-ksef-status-poll` | 5 | Enqueued by submit worker | Exponential backoff polling |
| `ksef-receive-sync` | `invoicing-ksef-receive-sync` | 2 | API route (manual trigger) | Download received invoices |
| `ksef-upo-download` | `invoicing-ksef-upo-download` | 1 | Session closed subscriber | Download UPO XML |
| `invoice-import` | `invoicing-invoice-import` | 2 | API route (file upload) | CSV/document bulk import |

---

## Event-Driven Automation

### Declared Events (17 total)

**Invoice CRUD (3):** `created`, `updated`, `deleted`
**Business (2):** `approved`, `rejected`
**KSeF Submission (6):** `queued`, `submitted`, `accepted`, `rejected`, `error`, `upo_downloaded`
**KSeF Reception (1):** `received`
**Session (3):** `session_opened`, `session_closed`, `session_error`
**Import (2):** `import.completed`, `import.failed`

### Subscribers

| Subscriber | Listens To | Action |
|------------|-----------|--------|
| `auto-submit-to-ksef` | `invoicing.invoice.approved` | If `ksefAutoSubmit=true` and direction=outgoing, enqueue submit worker |
| `ksef-session-closed` | `invoicing.ksef.session_closed` | Enqueue UPO download worker |
| `auto-import-from-documents` | `fms_documents.invoice.updated` | If `autoImportFromDocuments=true`, import approved document invoices |

---

## API Contracts

### KSeF Operations

| Method | Path | Auth Feature | Purpose |
|--------|------|-------------|---------|
| POST | `/ksef/submit/{id}` | `ksef.submit` | Queue single invoice for submission |
| POST | `/ksef/submit-batch` | `ksef.submit` | Batch submit (1-500 invoice IDs) |
| GET | `/ksef/status/{id}` | `ksef.view` | Get KSeF status (optional live poll) |
| POST | `/ksef/generate-xml/{id}` | `ksef.view` | Preview FA(3) XML |
| POST | `/ksef/sync-received` | `ksef.receive` | Trigger incoming invoice sync |
| POST | `/ksef/sessions` | `ksef.submit` | Create KSeF session |
| GET | `/ksef/sessions` | `ksef.view` | List sessions |
| GET | `/ksef/sessions/{id}` | `ksef.view` | Get session details |

### Credential Management

| Method | Path | Auth Feature | Purpose |
|--------|------|-------------|---------|
| GET | `/credentials` | `settings.view` | List credentials |
| POST | `/credentials` | `settings.manage` | Create credential (NIP + token or cert) |
| PATCH | `/credentials/{id}` | `settings.manage` | Update credential |
| DELETE | `/credentials/{id}` | `settings.manage` | Delete credential |
| POST | `/credentials/{id}/test` | `settings.manage` | Test credential connectivity |

---

## Configuration

### Tenant Settings (`InvoicingSettings`)

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `ksefEnvironment` | `test \| demo \| production` | `test` | KSeF API environment |
| `ksefAutoSubmit` | boolean | `false` | Auto-submit approved invoices |
| `ksefSessionMode` | `interactive \| batch` | `batch` | Session type preference |
| `defaultSellerNip` | string | — | Default seller NIP for submissions |
| `offlineMode` | `online \| offline24 \| unavailability \| emergency` | `online` | Current offline mode |
| `autoImportFromDocuments` | boolean | `false` | Auto-import from document extraction |
| `autoImportFromSales` | boolean | `false` | Auto-import from sales orders |

### RBAC Features (9)

| Feature | Description |
|---------|-------------|
| `invoicing.invoices.view` | View invoices, download PDF |
| `invoicing.invoices.manage` | Create, update, import invoices |
| `invoicing.invoices.approve` | Approve/reject invoices |
| `invoicing.invoices.delete` | Soft-delete invoices |
| `invoicing.ksef.view` | View KSeF status, sessions |
| `invoicing.ksef.submit` | Submit to KSeF, create sessions |
| `invoicing.ksef.receive` | Sync received invoices |
| `invoicing.settings.view` | View settings and credentials |
| `invoicing.settings.manage` | Update settings, manage credentials |

**Default roles:** Admin gets all 9. Employee gets `invoices.view` + `ksef.view`.

---

## UI/UX

### Backend Pages

| Page | Route | Purpose |
|------|-------|---------|
| Invoice List | `/backend/invoicing` | DynamicTable with filtering, status badges, detail drawer |
| Create Invoice | `/backend/invoicing/create` | Invoice builder with live PDF preview |
| Edit Invoice | `/backend/invoicing/{id}/edit` | Same builder with pre-populated data |
| KSeF Dashboard | `/backend/invoicing/ksef` | Session list, batch submit, status overview |
| General Settings | `/backend/invoicing/settings/general` | Environment, defaults, automation toggles |
| Credentials | `/backend/invoicing/settings/credentials` | Create/edit/delete/test KSeF credentials |
| Sessions | `/backend/invoicing/settings/sessions` | Session history and management |

### Key Components

- **InvoiceBuilderPage** — Full invoice editor with state management (`useInvoiceBuilderState`)
- **InvoiceFormPanel** — Reusable form with seller/buyer sections and line items
- **InvoiceLineItemsTable** — Editable table with automatic VAT/gross calculation
- **InvoicePdfPreview** — Live PDF preview using PDFme
- **InvoiceDetailDrawer** — Right-side drawer for invoice details

---

## Testing

### Unit Tests
- `lib/ksef/__tests__/crypto.test.ts` — AES/RSA encryption, token encoding
- `lib/ksef/__tests__/xml-builder.test.ts` — FA(3) XML generation
- `lib/pdf/__tests__/` — PDF generation and variable mapping
- `workers/__tests__/ksef-submit.test.ts` — Submit worker pipeline

### Integration Tests
- `TC-INV-001` through `TC-INV-006` — Invoice CRUD, approve/reject, PDF, import
- `TC-KSEF-001` — Full KSeF submission workflow
- `invoice-builder.spec.ts` — Builder state management

---

## Risks & Impact Review

### KSeF API Unavailability
- **Scenario:** KSeF API is down or returns 5xx errors during submission
- **Severity:** High
- **Mitigation:** Offline modes (`offline24`, `unavailability`, `emergency`) allow continued invoicing. Workers retry with exponential backoff. Invoices remain in `error` status and can be re-queued.
- **Residual risk:** If offline mode isn't activated before KSeF goes down, some submissions may fail. Manual intervention required to switch modes.

### Authentication Token Expiry
- **Scenario:** Access token expires mid-submission batch
- **Severity:** Medium
- **Mitigation:** `refreshAccessToken()` uses the refresh token to get a new access token. Session tracks both tokens. Workers authenticate per-session.
- **Residual risk:** If both tokens expire (long idle), re-authentication is required.

### Duplicate Invoice Submission
- **Scenario:** Worker crashes after KSeF accepts but before local DB update
- **Severity:** Medium
- **Mitigation:** KSeF returns processing code 303 (duplicate detected). `ksefReferenceNumber` is stored as soon as submission response arrives. Status poll will catch accepted duplicates.
- **Residual risk:** Short window between submission and DB write where crash causes re-submit attempt.

### Cross-Tenant Data Isolation
- **Scenario:** Credential or invoice from one tenant used in another tenant's context
- **Severity:** Critical
- **Mitigation:** All queries filter by `organizationId + tenantId`. Credentials are scoped to `(nip, environment)` per tenant with unique constraint. Sessions are tenant-scoped.

### XML Schema Validation Failure
- **Scenario:** Generated FA(3) XML doesn't pass KSeF schema validation
- **Severity:** High
- **Mitigation:** Status code 301 (schema validation failed) is captured and reported. XML is stored in `ksefFaXml` for debugging. Unit tests validate XML structure.
- **Residual risk:** Edge cases in address formatting, special characters, or unusual VAT configurations may not be covered.

### XAdES Certificate Auth Not Fully Implemented
- **Scenario:** User selects certificate-based auth but XAdES signing is stubbed
- **Severity:** Medium
- **Mitigation:** Token-based auth is fully functional and is the primary method. Certificate auth path throws a clear error about needing `xml-crypto` implementation.
- **Residual risk:** Some organizations may require certificate-based auth. This needs `xml-crypto` integration to complete.

---

## Changelog

### 2026-03-23
- Created SPEC-060 as architectural report of the KSeF integration
- Documented all components, flows, and technical details from implementation

### 2026-03-17
- Initial implementation: SPEC-025 (fms_invoicing with KSeF 2.0)

### 2026-03-22
- Module extracted to standalone `@open-mercato/invoicing` package
- Added PDF generation, invoice builder UI, settings pages
- Database migrations and table renaming
