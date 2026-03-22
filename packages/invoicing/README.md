# @open-mercato/invoicing

Centralized invoicing module with full integration to **KSeF** (Krajowy System e-Faktur) — the Polish National e-Invoice System. Supports outgoing invoice submission, incoming invoice retrieval, FA(3) XML generation, UPO (Urzedowe Poswiadczenie Odbioru) download, and offline modes.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Data Model](#data-model)
- [KSeF Integration](#ksef-integration)
  - [Environments](#environments)
  - [Authentication Flow (v2.0)](#authentication-flow-v20)
  - [Invoice Submission Flow](#invoice-submission-flow)
  - [Invoice Reception Flow](#invoice-reception-flow)
  - [UPO Download Flow](#upo-download-flow)
  - [Offline Modes](#offline-modes)
- [FA(3) XML Format](#fa3-xml-format)
- [Cryptography](#cryptography)
- [API Reference](#api-reference)
- [Background Workers](#background-workers)
- [Event-Driven Automation](#event-driven-automation)
- [Access Control](#access-control)
- [CLI Commands](#cli-commands)
- [Configuration](#configuration)
- [Testing](#testing)
- [Development Setup](#development-setup)

---

## Architecture Overview

```
                         ┌──────────────────────────────────────────────┐
                         │              API Layer                       │
                         │  /api/invoicing/invoices     (CRUD)          │
                         │  /api/invoicing/ksef/*       (KSeF ops)     │
                         │  /api/invoicing/credentials  (credential)   │
                         │  /api/invoicing/settings     (config)       │
                         └───────────┬──────────────────────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                 │
              ┌─────▼─────┐  ┌──────▼──────┐  ┌──────▼──────┐
              │  Commands  │  │  Services   │  │  Events     │
              │  (CRUD)    │  │  (Business) │  │  (19 types) │
              └─────┬──────┘  └──────┬──────┘  └──────┬──────┘
                    │                │                 │
                    │         ┌──────┴──────┐    ┌─────▼───────┐
                    │         │ KSeF Services│    │ Subscribers │
                    │         │ - Auth       │    │ - auto-     │
                    │         │ - Client     │    │   submit    │
                    │         │ - Crypto     │    │ - auto-     │
                    │         │ - Session    │    │   import    │
                    │         │ - Receiver   │    │ - UPO       │
                    │         │ - XML        │    │   download  │
                    │         └──────┬──────┘    └─────┬───────┘
                    │                │                 │
              ┌─────▼────────────────▼─────────────────▼──────┐
              │              Queue Workers                     │
              │  ksef-submit (3)  │  ksef-status-poll (5)      │
              │  ksef-receive-sync (2) │ ksef-upo-download (1) │
              │  invoice-import (2)                            │
              └────────────────────┬───────────────────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │               │
              ┌─────▼─────┐ ┌────▼─────┐ ┌──────▼──────────┐
              │  Database  │ │ KSeF API │ │  lib/ksef/       │
              │  (Postgres)│ │ (v2.0)   │ │  - crypto.ts     │
              │            │ │          │ │  - xml-builder.ts │
              │  5 tables  │ │ 3 envs   │ │  - endpoints.ts  │
              └────────────┘ └──────────┘ │  - status-codes  │
                                          │  - validators    │
                                          │  - offline-modes │
                                          └─────────────────┘
```

The module is organized into layers:

| Layer | Path | Responsibility |
|-------|------|----------------|
| **API Routes** | `api/` | HTTP endpoints with OpenAPI specs, auth, and validation |
| **Commands** | `commands/` | Undoable CRUD operations with event emission |
| **Services** | `services/` | Business logic, KSeF protocol implementation |
| **Workers** | `workers/` | Background queue jobs for async KSeF operations |
| **Subscribers** | `subscribers/` | Event-driven automation (auto-submit, auto-import) |
| **lib/ksef** | `lib/ksef/` | Low-level KSeF protocol: crypto, XML, endpoints, validation |
| **Data** | `data/` | MikroORM entities, Zod validators, type definitions |

---

## Data Model

### Entity Relationship Diagram

```
┌──────────────────────────┐       ┌──────────────────────────┐
│    InvoicingSettings     │       │  InvoicingKsefCredential │
│──────────────────────────│       │──────────────────────────│
│ ksefEnvironment          │       │ nip                      │
│ ksefAutoSubmit           │       │ authType (token|cert)    │
│ ksefSessionMode          │       │ ksefToken                │
│ defaultSellerNip         │       │ certificatePem           │
│ offlineMode              │       │ privateKeyPem            │
│ autoImportFromDocuments  │       │ environment              │
│ autoImportFromSales      │       │ isActive                 │
└──────────────────────────┘       └──────────────────────────┘
         1 per tenant                     N per tenant

┌──────────────────────────────────────────────────────────────┐
│                    InvoicingInvoice                           │
│──────────────────────────────────────────────────────────────│
│ invoiceNumber, invoiceDate, dueDate, serviceDate             │
│ seller*  (name, taxId, address, countryCode, bankAccount)    │
│ buyer*   (name, taxId, address, countryCode)                 │
│ netAmount, vatAmount, grossAmount, currencyCode              │
│ direction (outgoing | incoming)                              │
│ status (draft → pending_review → approved → sent → paid)     │
│ ksefStatus (none → queued → submitted → accepted/rejected)   │
│ ksefNumber, ksefReferenceNumber, ksefFaXml, ksefUpoXml      │
│ sourceType, sourceDocumentInvoiceId, sourceSalesInvoiceId    │
└─────────────────────────┬────────────────────────────────────┘
                          │ 1:N
              ┌───────────▼───────────┐
              │  InvoicingLineItem    │
              │───────────────────────│
              │ lineNumber            │
              │ description, quantity │
              │ unitPriceNet, unit    │
              │ vatRate, vatRateCode  │
              │ netAmount, vatAmount  │
              │ gtuCode, pkwiuCode   │
              └───────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                  InvoicingKsefSession                         │
│──────────────────────────────────────────────────────────────│
│ sessionType (interactive | batch)                            │
│ sessionStatus (initializing → active → closing → closed)     │
│ sessionToken (Bearer token)                                  │
│ encryptionKey, encryptionIv (AES-256 session keys)           │
│ nip, invoiceCount                                            │
│ ksefReferenceNumber, upoXml, upoDownloadedAt                │
└──────────────────────────────────────────────────────────────┘
```

### Database Tables

| Table | Description |
|-------|-------------|
| `invoicing_invoices` | Invoice headers with seller/buyer data, amounts, KSeF status |
| `invoicing_line_items` | Invoice line items with VAT details and Polish tax codes |
| `invoicing_ksef_sessions` | KSeF authentication sessions (tokens, encryption keys) |
| `invoicing_ksef_credentials` | KSeF credentials (tokens or X.509 certificates) |
| `invoicing_settings` | Per-tenant configuration (environment, auto-submit, offline mode) |

All tables are scoped by `organization_id` + `tenant_id`. Invoices support soft-delete via `deleted_at`.

### Invoice Lifecycle

```
                 ┌───────┐
                 │ draft │
                 └───┬───┘
                     │ submit for review
              ┌──────▼───────┐
              │pending_review│
              └───┬──────┬───┘
         approve  │      │  reject
          ┌───────▼┐  ┌──▼──────┐
          │approved│  │rejected │
          └───┬────┘  └─────────┘
              │ (auto-submit if enabled)
     ┌────────▼────────┐
     │  KSeF Pipeline  │
     │  queued →        │
     │  submitted →     │
     │  accepted/       │
     │  rejected/error  │
     └────────┬────────┘
              │ (on acceptance)
         ┌────▼───┐
         │  sent  │
         └────┬───┘
              │ payment received
         ┌────▼───┐
         │  paid  │
         └────────┘
```

---

## KSeF Integration

### Environments

| Environment | Base URL | Purpose |
|-------------|----------|---------|
| **test** | `https://api-test.ksef.mf.gov.pl` | Development and automated testing |
| **demo** | `https://api-demo.ksef.mf.gov.pl` | Staging, UAT |
| **production** | `https://api.ksef.mf.gov.pl` | Live invoicing |

All endpoint URLs are constructed by `lib/ksef/endpoints.ts` using the v2 API path prefix (`/v2/`).

### Authentication Flow (v2.0)

KSeF v2.0 uses an **asynchronous, multi-step** authentication flow with dual-token security:

```
Client                            KSeF API
  │                                  │
  │  1. POST /v2/auth/challenge      │
  │ ─────────────────────────────►   │
  │  ◄───── { challenge, timestamp } │
  │                                  │
  │  2a. POST /v2/auth/ksef-token    │   (token auth)
  │      { encryptedToken }          │
  │ ─────────────────────────────►   │
  │  ◄───── { referenceNumber }      │
  │                                  │
  │  2b. POST /v2/auth/xades-sig     │   (certificate auth)
  │      { signedXML }               │
  │ ─────────────────────────────►   │
  │  ◄───── { referenceNumber }      │
  │                                  │
  │  3. GET /v2/auth/{refNumber}     │   (poll until complete)
  │ ─────────────────────────────►   │
  │  ◄───── { status, authToken }    │
  │                                  │
  │  4. POST /v2/auth/token/redeem   │   (one-time exchange)
  │      { authToken }               │
  │ ─────────────────────────────►   │
  │  ◄───── { accessToken,           │
  │           refreshToken }         │
  │                                  │
  │  5. Authorization: Bearer <at>   │   (subsequent calls)
  │ ─────────────────────────────►   │
```

**Auth types supported:**

- **Token auth**: The KSeF authorization token is encrypted with AES-256-CBC, the AES key is wrapped with RSA-OAEP using KSeF's public key, and the combined payload is Base64-encoded.
- **Certificate auth**: X.509 certificate with XAdES-signed challenge (planned, not yet implemented).

**Token lifecycle:**
- `accessToken`: Short-lived, used as `Authorization: Bearer` header
- `refreshToken`: Long-lived, used to obtain new access tokens via `POST /v2/auth/token/refresh`

**Implementation:** `services/ksef/auth.service.ts` (`KsefAuthService.authenticate()`)

### Invoice Submission Flow

```
  API Route                   Worker                     KSeF API
  (/submit/:id)              (ksef-submit)
      │                          │                          │
      │ set ksefStatus=queued    │                          │
      │ enqueue worker ──────►   │                          │
      │ emit ksef.queued         │                          │
      │                          │                          │
      │                          │ 1. Load invoice + lines  │
      │                          │ 2. Get/create session    │
      │                          │    (authenticate if new) │
      │                          │ 3. buildFa3Xml()         │
      │                          │ 4. prepareForSubmission() │
      │                          │    (hash + optional AES) │
      │                          │                          │
      │                          │ 5. POST /invoices/send ──►
      │                          │ ◄── { refNumber, code }  │
      │                          │                          │
      │                          │ 6. Update invoice:       │
      │                          │    ksefStatus=submitted   │
      │                          │    ksefReferenceNumber    │
      │                          │                          │
      │                          │ 7. Enqueue status-poll ──►  (poll worker)
      │                          │                          │
                                 │                          │
  (status-poll worker)           │                          │
      │ GET /invoices/{hash}/status ────────────────────────►
      │ ◄── { processingCode }                              │
      │                                                     │
      │ code 200 → accepted (emit event, enqueue UPO)       │
      │ code 300 → rejected (emit event)                    │
      │ code 100 → pending (re-enqueue with backoff)        │
```

**Key files:**
- `api/ksef/submit/[id]/route.ts` — Sets status to `queued`, enqueues worker, emits event
- `workers/ksef-submit.ts` — Full submission pipeline (auth, XML, encrypt, send)
- `workers/ksef-status-poll.ts` — Exponential backoff polling (5s–300s, max 20 attempts)
- `lib/ksef/xml-builder.ts` — FA(3) XML generation
- `lib/ksef/crypto.ts` — Hash computation and optional AES encryption

**Batch submission** (`api/ksef/submit-batch/route.ts`) enqueues individual submit worker jobs for each eligible invoice. KSeF batch session API support is a planned optimization.

### Invoice Reception Flow

```
  API Route                   Worker                     KSeF API
  (/sync-received)           (ksef-receive-sync)
      │                          │                          │
      │ load settings            │                          │
      │ resolve NIP              │                          │
      │ enqueue worker ──────►   │                          │
      │                          │                          │
      │                          │ 1. Authenticate          │
      │                          │                          │
      │                          │ 2. POST /invoices/query ─►
      │                          │    (subjectTo: nip,       │
      │                          │     last 7 days default)  │
      │                          │ ◄── { headers[] }        │
      │                          │                          │
      │                          │ 3. For each header:      │
      │                          │    - Skip if imported    │
      │                          │    - GET /invoices/{hash} ►
      │                          │    ◄── { invoiceBody }   │
      │                          │    - Parse XML           │
      │                          │    - Create invoice      │
      │                          │      (direction=incoming, │
      │                          │       sourceType=         │
      │                          │       ksef_received)     │
      │                          │    - Emit ksef.received  │
```

**Implementation:** `workers/ksef-receive-sync.ts`

### UPO Download Flow

When a KSeF session is closed (event `invoicing.ksef.session_closed`), the `ksef-session-closed` subscriber enqueues the UPO download worker:

1. Worker authenticates with KSeF
2. `GET /v2/invoices/upo` downloads the UPO XML
3. UPO is stored in `InvoicingKsefSession.upoXml`
4. Invoices in that session are updated to `ksefStatus = 'upo_downloaded'`

**Implementation:** `workers/ksef-upo-download.ts`

### Offline Modes

Polish regulations require KSeF to support offline invoice issuance during system outages:

| Mode | Prefix | Duration | Description |
|------|--------|----------|-------------|
| `online` | — | — | Normal operation |
| `offline24` | `O24` | 24 hours | Planned offline period |
| `unavailability` | `OND` | Unlimited | KSeF system unavailability |
| `emergency` | `OAW` | Unlimited | Emergency declared by Ministry |

Offline invoices receive prefixed numbers and must be submitted to KSeF within the mode's deadline when connectivity is restored.

**Implementation:** `lib/ksef/offline-modes.ts`

---

## FA(3) XML Format

The module generates XML conforming to the Polish FA(3) invoice schema:

- **Namespace:** `http://crd.gov.pl/wzor/2023/06/29/12648/`
- **Schema version:** `3-0E`
- **Form code:** `FA` (system code: `FA (3)`)

### XML Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
  <Naglowek>                     <!-- Header: form code, version, timestamp -->
    <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="3-0E">FA</KodFormularza>
    <WariantFormularza>3</WariantFormularza>
    <DataWytworzeniaFa>2026-03-22</DataWytworzeniaFa>
    <SystemInfo>OpenMercato</SystemInfo>
  </Naglowek>
  <Podmiot1>                     <!-- Seller: NIP, name, address -->
    <DaneIdentyfikacyjne>
      <NIP>7980332920</NIP>
      <Nazwa>Sprzedawca Sp. z o.o.</Nazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>PL</KodKraju>
      <AdresL1>ul. Testowa 1</AdresL1>
      <AdresL2>00-001 Warszawa</AdresL2>
    </Adres>
  </Podmiot1>
  <Podmiot2>                     <!-- Buyer: NIP/EU VAT, name, address -->
    <DaneIdentyfikacyjne>
      <NIP>5261040828</NIP>
      <Nazwa>Nabywca S.A.</Nazwa>
    </DaneIdentyfikacyjne>
  </Podmiot2>
  <Fa>                           <!-- Invoice data -->
    <KodWaluty>PLN</KodWaluty>
    <P_1>2026-03-22</P_1>        <!-- Invoice date -->
    <P_2>FV/2026/03/001</P_2>   <!-- Invoice number -->
    <P_13_1>1500.00</P_13_1>    <!-- Net amount at 23% -->
    <P_14_1>345.00</P_14_1>     <!-- VAT amount at 23% -->
    <P_15>1845.00</P_15>        <!-- Gross total -->
    <Adnotacje>...</Adnotacje>
    <RodzajFaktury>VAT</RodzajFaktury>
    <TerminPlatnosci>
      <Termin>2026-04-22</Termin>
    </TerminPlatnosci>
    <FormaPlatnosci>1</FormaPlatnosci>  <!-- 1=transfer -->
    <RachunekBankowy>
      <NrRB>PL61109010140000071219812874</NrRB>
    </RachunekBankowy>
    <FaWiersz>                   <!-- Line items -->
      <NrWierszaFa>1</NrWierszaFa>
      <P_7>Usluga transportowa</P_7>
      <P_8A>szt.</P_8A>
      <P_8B>1</P_8B>
      <P_9A>1500.00</P_9A>
      <P_11>1500.00</P_11>
      <P_12>23</P_12>
    </FaWiersz>
  </Fa>
</Faktura>
```

### VAT Rate Mapping

| Rate | XML Element | Description |
|------|-------------|-------------|
| 23% / 22% | `P_13_1` / `P_14_1` | Standard rate |
| 8% / 7% | `P_13_2` / `P_14_2` | Reduced rate |
| 5% | `P_13_3` / `P_14_3` | Super-reduced rate |
| 0% | `P_13_6_1` | Zero rate (taxable) |
| `zw` | `P_13_7` | Exempt |
| `oo` / `np` | — | Out-of-scope / not applicable |

### Payment Method Codes

| Code | Method |
|------|--------|
| 1 | Bank transfer (`przelew`) |
| 2 | Cash (`gotowka`) |
| 3 | Card (`karta`) |
| 4 | Check (`czek`) |
| 5 | Credit/compensation (`kompensata`) |
| 6 | Other |

### GTU Codes (Goods/Services Classification)

Codes `GTU_01` through `GTU_13` classify goods and services for Polish reporting requirements. Set on individual line items via the `gtuCode` field.

**Implementation:** `lib/ksef/xml-builder.ts` and `lib/ksef/fa3-schema.ts`

---

## Cryptography

All cryptographic operations use Node.js built-in `crypto` module (no external dependencies).

### Operations

| Operation | Algorithm | Purpose |
|-----------|-----------|---------|
| Invoice hashing | SHA-256 (Base64) | Integrity verification for KSeF submission |
| Invoice encryption | AES-256-CBC | Optional session-level encryption of invoice XML |
| Key wrapping | RSA-OAEP (SHA-256) | Wrapping AES session key with KSeF's RSA public key |
| Token encryption | AES-256-CBC + RSA-OAEP | Encrypting KSeF auth token for token-based authentication |
| Challenge signing | RSA-SHA256 | Signing auth challenges for certificate-based authentication |

### Submission Preparation

`prepareInvoiceForSubmission(xml, sessionKey?, sessionIv?)` produces the payload for `POST /v2/invoices/send`:

1. Computes SHA-256 hash of the raw XML bytes (Base64-encoded)
2. Calculates file size in bytes
3. If session encryption keys are provided: encrypts XML with AES-256-CBC
4. Otherwise: Base64-encodes the plaintext XML
5. Returns `{ invoiceBody, hashValue, fileSize, encrypted }`

### Token Encryption for Auth

`encryptTokenForKsef(token, challenge, publicKeyPem)`:

1. Generates random AES-256 key (32 bytes) + IV (16 bytes)
2. Encrypts `token|challenge` with AES-256-CBC
3. Wraps the AES key with RSA-OAEP using KSeF's public key
4. Combines into a binary envelope: `[4-byte header][RSA-wrapped key][IV][ciphertext]`
5. Returns Base64-encoded result

**Implementation:** `lib/ksef/crypto.ts` (functions), `services/ksef/crypto.service.ts` (service class)

---

## API Reference

All routes are prefixed with `/api/invoicing/` and require authentication.

### Invoices

| Method | Path | Feature | Description |
|--------|------|---------|-------------|
| GET | `/invoices` | `invoices.view` | List invoices (paginated, filterable) |
| POST | `/invoices` | `invoices.manage` | Create invoice with line items |
| GET | `/invoices/:id` | `invoices.view` | Get invoice with line items |
| PATCH | `/invoices/:id` | `invoices.manage` | Update invoice |
| DELETE | `/invoices/:id` | `invoices.delete` | Soft-delete invoice |
| POST | `/invoices/:id/approve` | `invoices.approve` | Approve invoice |
| POST | `/invoices/:id/reject` | `invoices.approve` | Reject invoice (reason required) |
| GET | `/invoices/:id/pdf` | `invoices.view` | Download PDF |

### Import

| Method | Path | Feature | Description |
|--------|------|---------|-------------|
| POST | `/invoices/import` | `invoices.manage` | CSV bulk import |
| POST | `/invoices/import-from-document` | `invoices.manage` | Import from FMS document invoice |
| POST | `/invoices/import-from-sales` | `invoices.manage` | Import from sales module |

### KSeF Operations

| Method | Path | Feature | Description |
|--------|------|---------|-------------|
| POST | `/ksef/generate-xml/:id` | `ksef.submit` | Preview FA(3) XML without submitting |
| POST | `/ksef/submit/:id` | `ksef.submit` | Queue invoice for KSeF submission |
| POST | `/ksef/submit-batch` | `ksef.submit` | Queue multiple invoices (max 500) |
| GET | `/ksef/status/:id` | `ksef.view` | Check KSeF status (with optional live polling) |
| POST | `/ksef/sync-received` | `ksef.receive` | Trigger received invoice download |
| GET | `/ksef/sessions` | `ksef.view` | List KSeF sessions |
| POST | `/ksef/sessions` | `ksef.submit` | Create interactive KSeF session |
| GET | `/ksef/sessions/:id` | `ksef.view` | Get session details |

### Credentials & Settings

| Method | Path | Feature | Description |
|--------|------|---------|-------------|
| GET | `/credentials` | `settings.view` | List KSeF credentials |
| POST | `/credentials` | `settings.manage` | Store KSeF credential |
| GET | `/credentials/:id` | `settings.view` | Get credential |
| PATCH | `/credentials/:id` | `settings.manage` | Update credential |
| DELETE | `/credentials/:id` | `settings.manage` | Delete credential |
| POST | `/credentials/:id/test` | `settings.manage` | Test KSeF API connectivity |
| GET | `/settings` | `settings.view` | Get invoicing settings |
| PATCH | `/settings` | `settings.manage` | Update invoicing settings |

---

## Background Workers

| Worker | Queue Name | Concurrency | Trigger |
|--------|-----------|-------------|---------|
| **ksef-submit** | `invoicing-ksef-submit` | 3 | Submit route, auto-submit subscriber |
| **ksef-status-poll** | `invoicing-ksef-status-poll` | 5 | Submit worker (after successful send) |
| **ksef-receive-sync** | `invoicing-ksef-receive-sync` | 2 | Sync-received route, CLI command |
| **ksef-upo-download** | `invoicing-ksef-upo-download` | 1 | Session-closed subscriber |
| **invoice-import** | `invoicing-invoice-import` | 2 | Import routes |

### Status Poll Strategy

The status poll worker uses exponential backoff:
- Base delay: 5 seconds
- Maximum delay: 300 seconds (5 minutes)
- Maximum attempts: 20
- On terminal status (accepted/rejected): stop polling, emit event
- On error: stop polling, update invoice status

---

## Event-Driven Automation

### Declared Events (19 total)

**Invoice CRUD:**
- `invoicing.invoice.created`, `.updated`, `.deleted`

**Business Lifecycle:**
- `invoicing.invoice.approved`, `.rejected`

**KSeF Lifecycle:**
- `invoicing.ksef.queued`, `.submitted`, `.accepted`, `.rejected`, `.error`
- `invoicing.ksef.upo_downloaded`, `.received`

**Session Lifecycle:**
- `invoicing.ksef.session_opened`, `.session_closed`, `.session_error`

**Import:**
- `invoicing.import.completed`, `.failed`

### Event Subscribers

| Subscriber | Listens To | Action |
|------------|-----------|--------|
| `auto-submit-to-ksef` | `invoicing.invoice.approved` | If `ksefAutoSubmit` enabled and invoice is outgoing, enqueue submit worker |
| `auto-import-from-documents` | `fms_documents.invoice.updated` | If `autoImportFromDocuments` enabled, import approved document invoices |
| `ksef-session-closed` | `invoicing.ksef.session_closed` | Enqueue UPO download worker |

---

## Access Control

### RBAC Features

| Feature | Description |
|---------|-------------|
| `invoicing.invoices.view` | View invoices and their details |
| `invoicing.invoices.manage` | Create and edit invoices |
| `invoicing.invoices.approve` | Approve or reject invoices |
| `invoicing.invoices.delete` | Delete invoices |
| `invoicing.ksef.view` | View KSeF status and sessions |
| `invoicing.ksef.submit` | Submit invoices to KSeF |
| `invoicing.ksef.receive` | Receive/download invoices from KSeF |
| `invoicing.settings.view` | View invoicing settings |
| `invoicing.settings.manage` | Manage settings and credentials |

### Default Role Assignments

| Role | Features |
|------|----------|
| **Admin** | All 9 features |
| **Employee** | `invoices.view`, `ksef.view` |

---

## CLI Commands

```bash
# KSeF Test Environment
yarn mercato invoicing ksef:setup-test --nip <NIP> --pesel <PESEL> [--env test]
yarn mercato invoicing ksef:cleanup-test --nip <NIP> [--pesel <PESEL>]
yarn mercato invoicing ksef:test-connection [--env test]

# Credential Management
yarn mercato invoicing ksef:add-credential --nip <NIP> --tenant <id> --org <id> \
  [--cert cert.pem --key key.pem] [--token <token>] [--env test]
yarn mercato invoicing ksef:list-credentials --tenant <id> --org <id>

# Operations
yarn mercato invoicing ksef:status --tenant <id> --org <id>
yarn mercato invoicing ksef:backfill --tenant <id> --org <id> [--status approved]
yarn mercato invoicing ksef:sync-received --tenant <id> --org <id> \
  [--date-from 2026-01-01] [--date-to 2026-03-22]

# Help
yarn mercato invoicing help
```

### Test Environment Setup

To set up a test entity on KSeF's test environment:

```bash
# 1. Create test subject + person + permissions
yarn mercato invoicing ksef:setup-test --nip 7980332920 --pesel 30112206276

# 2. Generate a self-signed certificate
openssl genrsa -out ksef-test-key.pem 2048
openssl req -new -x509 -key ksef-test-key.pem -out ksef-test-cert.pem -days 365 \
  -subj "/CN=Test/O=Test Company/C=PL/serialNumber=PNOPL-30112206276"

# 3. Store credentials
yarn mercato invoicing ksef:add-credential \
  --nip 7980332920 \
  --cert ksef-test-cert.pem \
  --key ksef-test-key.pem \
  --tenant <tenant-id> --org <org-id>
```

---

## Configuration

### Settings (per tenant)

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `ksefEnvironment` | `test\|demo\|production` | `test` | Target KSeF environment |
| `ksefAutoSubmit` | boolean | `false` | Auto-submit outgoing invoices on approval |
| `ksefSessionMode` | `interactive\|batch` | `interactive` | KSeF session type |
| `defaultSellerNip` | string | — | Fallback seller NIP for submission |
| `defaultPaymentMethod` | string | — | Default payment method |
| `autoImportFromDocuments` | boolean | `false` | Auto-import from FMS document invoices |
| `autoImportFromSales` | boolean | `false` | Auto-import from sales invoices |
| `offlineMode` | `online\|offline24\|unavailability\|emergency` | `online` | KSeF offline mode |

Configure via `PATCH /api/invoicing/settings` or `yarn mercato invoicing settings:set`.

---

## Testing

### Unit Tests (Jest)

```bash
cd packages/invoicing
yarn test                    # Run all tests
yarn test -- 'crypto'        # Run crypto tests only
yarn test -- 'xml-builder'   # Run XML builder tests only
```

**Test coverage:**

| Area | Tests | What's covered |
|------|-------|----------------|
| **Crypto** (`lib/ksef/__tests__/crypto.test.ts`) | 14 | AES encrypt/decrypt round-trip, SHA-256, RSA-OAEP key wrap/unwrap, token encryption, `prepareInvoiceForSubmission` with and without encryption |
| **CryptoService** (`services/ksef/__tests__/crypto.service.test.ts`) | 12 | Service class with real RSA keys, challenge signing and verification, invoice XML encryption pipeline |
| **XML Builder** (`lib/ksef/__tests__/xml-builder.test.ts`) | 5 | FA(3) XML structure, crypto integration, special character escaping, EU buyer handling |
| **API Routes** (7 suites) | 32 | Auth, validation, worker enqueue, event emission, KSeF live polling, credential connectivity |

### Integration Tests (Playwright)

```bash
# Requires running dev server at localhost:3000
npx playwright test packages/invoicing/src/modules/invoicing/__integration__/TC-KSEF-001.spec.ts
```

| Test | What's verified |
|------|----------------|
| Create, approve, generate XML, submit, check status | Full e2e flow against live server |
| Generate-XML validation | Missing sellerTaxId returns 400 |
| Batch submit | Multiple invoices queued via API |
| Sync-received | Endpoint responds correctly |

### NIP Validation

The module includes a full Polish NIP checksum validator (`lib/ksef/validators.ts`). Test with known valid NIPs from KSeF test environment documentation.

---

## Development Setup

### Prerequisites

- Node.js 24+ (via nvm)
- PostgreSQL (via Docker)
- Running dev server (`yarn dev`)

### Build

```bash
yarn build:packages       # Build all packages including invoicing
yarn generate             # Re-run module generators
```

### Database

```bash
cd apps/mercato
yarn db:generate          # Generate migrations after entity changes
yarn db:migrate           # Apply migrations
```

### Module Files

The invoicing module follows the standard Open Mercato module convention:

| File | Purpose |
|------|---------|
| `index.ts` | Module metadata |
| `acl.ts` | RBAC feature declarations |
| `di.ts` | Dependency injection (7 services) |
| `events.ts` | 19 typed event declarations |
| `setup.ts` | Tenant initialization |
| `search.ts` | Full-text search indexing |
| `cli.ts` | 8 CLI commands |
| `data/entities.ts` | 5 MikroORM entities |
| `data/types.ts` | Type aliases |
| `data/validators.ts` | Zod schemas |

### Dependencies

| Package | Purpose |
|---------|---------|
| `@pdfme/generator` | PDF invoice generation |
| `zod` | Input validation |
| `@open-mercato/queue` | Background worker infrastructure |
| `@open-mercato/events` | Event bus for cross-module communication |
| `@open-mercato/shared` | DI, auth, i18n, data engine |
| `@open-mercato/core` | Auth, directory, organization scope |
| `@open-mercato/ui` | Backend page components |

### KSeF API Documentation

- Test environment docs: https://api-test.ksef.mf.gov.pl/docs/v2
- OpenAPI spec: https://api-test.ksef.mf.gov.pl/docs/v2/openapi.json
