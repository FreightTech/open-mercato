# KSeF Module — Agent Guidelines

`@open-mercato/ksef` implements the Polish National e-Invoicing System (KSeF)
integration: issue FA(3) invoices, sign and submit them to the KSeF API,
track submission status, sync received documents, and manage sessions,
company profile, tokens, and certificates.

All paths below use `src/modules/ksef/` as shorthand.

## Before Writing Code

1. **Read `src/modules/ksef/docs/invoice-types.md`** before touching
   anything invoice-facing — it specifies per-type invariants for the
   form, validator, XML builder, and data model. Breaking them produces
   silent KSeF rejections at submission time.
2. Read `docs/invoice-types.md` **in full** when adding or modifying a
   RodzajFaktury (`VAT` / `KOR` / `ZAL` / `ROZ` / `UPR` / `KOR_ZAL` /
   `KOR_ROZ`) — the matrix at the top identifies which blocks and columns
   each type needs.
3. For new integration providers, follow the root `AGENTS.md` integration
   guide — KSeF is an integration provider, it ships env-backed
   preconfiguration via `src/modules/ksef/lib/preset.ts`.

## Detailed Guides

| Task | Guide |
|------|-------|
| Building or modifying the invoice form (create / edit / detail pages) | `docs/invoice-types.md` |
| Changing RodzajFaktury behavior (validator rules, XML emission, DB columns) | `docs/invoice-types.md` |
| Adding a new invoice type | `docs/invoice-types.md` → *Adding a new invoice type* |
| Wiring new XML fields into FA(3) output | `docs/invoice-types.md` + `lib/xml-builder.ts` |
| KSeF API client work (auth challenge, redeem, session lifecycle) | `services/*.ts` + `lib/types.ts` |

## Module Layout

```
src/modules/ksef/
├── acl.ts                      # Feature-based RBAC (ksef.view, ksef.submit, …)
├── ce.ts                       # Custom entity declarations
├── cli.ts                      # Module-scoped CLI commands
├── di.ts                       # DI registrar
├── events.ts                   # Declared module events
├── index.ts                    # Module metadata
├── integration.ts              # Integration-marketplace manifest
├── setup.ts                    # Tenant init + default role features
├── search.ts                   # Fulltext / index configuration
├── api/                        # Auto-discovered API routes
│   ├── invoices/               # CRUD (route.ts, [id]/route.ts, import-xml, clear-synced)
│   ├── submit/[id]/            # Submit a stored invoice to KSeF
│   ├── submit-batch/           # Batch submit
│   ├── status/[id]/            # Poll submission status
│   ├── generate-xml/[id]/      # Preview FA(3) XML
│   ├── sessions/               # Interactive/batch session management
│   ├── settings/               # Tenant KSeF settings CRUD
│   ├── sync-received/          # Download received invoices
│   ├── company-profile/        # White List NIP profile
│   ├── lookup-nip/ & verify-nip/
│   └── openapi.ts              # OpenAPI helpers
├── backend/                    # Admin UI routes (auto-discovered)
│   └── ksef/
│       ├── page.tsx            # Dashboard
│       └── invoices/           # List + create + [id] + import
├── bridge/                     # fms-invoicing / generic invoicing bridge
├── data/
│   ├── entities.ts             # MikroORM entities (invoices, sessions, profiles, …)
│   ├── extensions.ts           # Entity links
│   ├── enrichers.ts            # Response enrichers
│   ├── types.ts                # DB-adjacent enums
│   └── validators.ts           # Zod schemas (per-type refinements)
├── docs/
│   └── invoice-types.md        # ⭐ Primary reference for RodzajFaktury
├── lib/
│   ├── fa3-schema.ts           # FA(3) constants (enum codes, namespaces, limits)
│   ├── xml-builder.ts          # FA(3) XML generation
│   ├── xml-parser.ts           # Inbound XML parsing
│   ├── crypto.ts               # RSA / AES helpers
│   ├── endpoints.ts            # KSeF API URL map
│   ├── health.ts               # Health check
│   ├── offline-modes.ts        # offline24 / unavailability / emergency
│   ├── offline-qr.ts           # Offline QR payloads
│   ├── preset.ts               # Env-backed preconfiguration
│   ├── status-codes.ts         # KSeF processing codes
│   ├── types.ts                # KSeF API request/response types
│   └── validators.ts           # Low-level validators
├── migrations/                 # MikroORM migrations
└── services/
    ├── auth.service.ts         # Challenge → submit auth → redeem tokens
    ├── client.service.ts       # REST client
    ├── crypto.service.ts
    ├── receiver.service.ts
    ├── session.service.ts      # Interactive + batch session lifecycle
    └── xml.service.ts          # Loads entity → builds FA(3) XML
```

## Data Entities

Primary tables owned by this module:

| Table | Purpose |
|-------|---------|
| `ksef_invoices` | Stored invoices (outgoing + incoming). Type-specific columns listed in `docs/invoice-types.md`. |
| `ksef_invoice_line_items` | `FaWiersz` rows. Carries `is_pre_state` for KOR StanPrzed flow. |
| `ksef_invoice_order_lines` | `ZamowienieWiersz` rows for ZAL / KOR_ZAL. |
| `ksef_invoice_advance_refs` | Prior advance invoice references for ROZ / KOR_ROZ / final ZAL. |
| `ksef_submissions` | One row per submit attempt; holds KSeF number, UPO, status. |
| `ksef_sessions` | Interactive + batch session state. |
| `ksef_company_profiles` | White List cache for the tenant's own NIP. |

## Key Rules

- **Never hand-write migrations**. Update `data/entities.ts` and run
  `yarn db:generate`. (There are a few legacy manual migrations on
  historical branches — when you edit them, keep them MikroORM
  `Migration`-subclass-style.)
- **Validator is the contract**. Every RodzajFaktury-specific invariant
  lives in `applyInvoiceTypeRules` inside `data/validators.ts`. The form
  and API both call into the same zod schema; do not duplicate rules
  inline on the page.
- **XML builder is decoupled from entities**. It takes plain
  `InvoiceForXml` / `LineItemForXml` / `OrderLineForXml` / `AdvanceRefForXml`
  structures. Do not import ORM entities into the builder.
- **Do not edit `corrected_ksef_number` on an existing correction record
  once it's been submitted** — a wrong NIP requires a zeroing KOR followed
  by a fresh VAT invoice. The create form enforces this by disabling the
  buyer NIP input when `editId && isCorrection`.
- **`P_14_*` fields** (VAT per rate) and their `P_14_*W` PLN-converted
  siblings are emitted from summed line-item VAT. When touching the totals
  logic, keep the `isPreState` sign convention intact — the VAT summary
  must match the XML written by the builder.
- **Foreign currency**: store `exchange_rate` + `exchange_rate_date` on
  the invoice. The builder will only emit `P_14_*W` when both the currency
  differs from PLN and a rate is present.
- **ACL features**: declared in `acl.ts` as `ksef.*`. Always guard write
  routes with `requireFeatures: ['ksef.submit']` and read routes with
  `['ksef.view']`.
- **Events**: declared in `events.ts` via `createModuleEvents`. Use
  `emitKsefEvent` (do not emit raw strings).

## Testing

- XML builder has a fixture per invoice type in
  `lib/__tests__/xml-builder.test.ts`. When adding a new block, add the
  matching assertion — tests double as behavioural documentation.
- Integration tests: see `.ai/qa/` for the general test policy. KSeF
  currently has no Playwright coverage; adding one should cover the
  per-type form sections + submission status flow.

## Environment Configuration

KSeF is an integration-marketplace provider and preconfigures itself via
env variables documented in its own integration manifest
(`integration.ts`) and `lib/preset.ts`. Do not add KSeF-specific env
handling to core modules.

## Documentation

- Primary reference: **`src/modules/ksef/docs/invoice-types.md`** — the
  full RodzajFaktury guide.
- Per-component detail lives next to the code (see "Scope of coverage" at
  the top of the invoice-types doc).
