# SPEC-017: FMS Module Restructuring — Quotes to RFQ, Simplified Products, Offer Calculations

## Overview

The FMS (Freight Management System) quoting flow was over-engineered: users created quotes with lines, then created offers from those quotes. In practice, the quote layer added complexity without value. This restructuring:

1. **Renamed the module** `fms_quotes` → `fms_offers`
2. **Replaced FmsQuote with a lightweight FmsRfq** (Request for Quotation) — a simple intake form capturing requirements from customer emails
3. **Simplified FmsProduct** — removed variants, carrier references, and type-specific fields; kept only name + charge code
4. **Introduced persisted FmsOfferCalculation** — groups offer charges by route with 4 location fields
5. **Restructured FmsOfferLine** — lines belong to calculations (not offers directly) with buy/sell pricing

---

## Problem Statement

The old flow required users to:
1. Create a **Quote** (with origin/destination ports, client reference, currency, lines)
2. Create an **Offer** from that Quote (copying lines, adding terms)
3. Send the Offer to the client

The Quote entity duplicated much of the Offer's data. Additionally:
- **Products** had a complex variant system (`FmsProductVariant`) with type-specific fields (contract type, carrier, loop, transit time, etc.) that was rarely used
- **Offer lines** belonged directly to the offer with no route grouping, making multi-route offers difficult
- Lines used `unitPrice`/`amount`/`unitCost` fields that didn't match freight industry conventions (buy price vs sell price)

---

## Solution

### Phase 1: Module Rename `fms_quotes` → `fms_offers`

**Directory rename:** `packages/fms/src/modules/fms_quotes/` → `packages/fms/src/modules/fms_offers/`

All internal references updated:
- Feature IDs: `fms_quotes.*` → `fms_offers.*`
- Command IDs: `fms_quotes.*` → `fms_offers.*`
- Import paths across `fms_projects`, `contractors`, `email_templates`
- Backend page routes: `/backend/fms-quotes` → `/backend/fms-offers`
- API routes: `/api/fms_quotes/*` → `/api/fms_offers/*`

### Phase 2: FmsRfq Replaces FmsQuote

**New entity: `FmsRfq`** — lightweight intake form with all fields optional except scoping.

**Removed entities:**
- `FmsQuote` (table: `fms_quotes`)
- `FmsQuoteLine` (table: `fms_quote_lines`)
- Pivot tables: `fms_quote_origin_ports`, `fms_quote_destination_ports`

**Removed files:**
- All Quote UI components (`QuoteWizard/`, `QuoteBasicInfo.tsx`, `QuoteDetailsTable.tsx`, `QuoteDrawer.tsx`, `QuotePreviewDrawer.tsx`, `QuoteOffersSection.tsx`, `QuoteDocuments.tsx`)
- Quote backend pages (`backend/fms-quotes/`)
- Quote dashboard widgets (`widgets/dashboard/draft-quotes/`)
- Quote API routes (`api/table-config/`, `api/entities/`)
- Quote commands (`commands/quotes.ts`, `commands/quote-lines.ts`)

**Key design decision:** FmsRfq has `companyName` (text) instead of `client` (FK to Contractor). This decouples RFQs from the contractors module. When contacts are needed, the system looks up contractors by matching the company name.

### Phase 3: Simplified FmsProduct

**Kept:** `id`, `name`, `chargeCode` (FK → FmsChargeCode), `isActive`, timestamps, audit fields

**Removed from FmsProduct:** `carrier`, `internalNotes`, `loop`, `source`, `destination`, `transitTime`, `location`, `description`, `variants` collection

**Removed entity:** `FmsProductVariant` (table: `fms_product_variants`)

### Phase 4: FmsOfferCalculation and Restructured Lines

**New entity: `FmsOfferCalculation`** — groups charges by route within an offer.

**FmsOfferLine changes:**
- Now belongs to `FmsOfferCalculation` (via `calculation` FK) instead of `FmsOffer` directly
- New pricing fields: `rate`, `buyPrice`, `sellPrice` (numeric 18,4)
- New toggle: `isEnabled` (boolean) — products are auto-populated as disabled, user enables the ones they need
- New field: `chargeBasis` (text) — per_container, per_shipment, per_kg, etc.
- Removed: `offer` FK, `variantId`, `sourceQuoteLineId`, `containerSize`, `providerId`, `carrierId`, `reference`, `validityStart`, `validityEnd`, `unitCost`, `unitPrice`, `amount`, `marginValue`, `marginType`

### Phase 5: Updated FmsProject References

- `FmsProject.quote` → `FmsProject.rfq` (FK change from `quote_id` to `rfq_id`)
- All project components updated to reference RFQ data instead of Quote data
- Conversion flow (`offer → project`) updated to read from `offer.calculations[].lines[]`

### Phase 6: Database Migrations

All schema changes applied via MikroORM-generated migrations in:
- `packages/fms/src/modules/fms_offers/migrations/Migration20260207163205.ts`
- `packages/fms/src/modules/fms_projects/migrations/Migration20260207163205.ts`
- `packages/fms/src/modules/fms_products/migrations/Migration20260207163205.ts`

---

## Data Models

### FmsRfq

Table: `fms_rfqs`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid PK | no | `gen_random_uuid()` |
| organization_id | uuid | no | scoping |
| tenant_id | uuid | no | scoping |
| title | text | yes | |
| description | text | yes | |
| origin | text | yes | free-form (not FK) |
| destination | text | yes | free-form (not FK) |
| container_count | integer | yes | |
| direction | text | yes | `import` / `export` |
| transport_mode | text | yes | `sea` / `air` / `road` / `rail` |
| cargo_type | text | yes | `general` / `dangerous` / `perishable` / `oog` |
| company_name | text | yes | from email, matched to Contractor by name |
| contact_person | text | yes | |
| context | text | yes | raw info from customer email |
| created_at | timestamptz | no | |
| updated_at | timestamptz | no | |
| deleted_at | timestamptz | yes | soft delete |

**Relationships:** `offers` → OneToMany → FmsOffer

### FmsOffer (updated)

Table: `fms_offers`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid PK | no | |
| rfq_id | uuid FK | yes | → fms_rfqs (was quote_id) |
| organization_id | uuid | no | scoping |
| tenant_id | uuid | no | scoping |
| offer_number | text | no | unique per org+tenant |
| version | integer | no | default 1 |
| status | text | no | draft/sent/accepted/declined/expired/cancelled |
| direction | text | yes | **new** — from RFQ or manual |
| transport_mode | text | yes | **new** — from RFQ or manual |
| cargo_type | text | yes | **new** — from RFQ or manual |
| valid_until | timestamptz | yes | |
| payment_terms | text | yes | |
| special_terms | text | yes | |
| customer_notes | text | yes | |
| notes | text | yes | internal |
| superseded_by_id | uuid | yes | versioning |
| assigned_to_id | uuid | yes | user ref (module isomorphism) |
| operational_guardian_id | uuid | yes | user ref |
| business_guardian_id | uuid | yes | user ref |
| document_id | uuid | yes | attachment ref |
| sent_at | timestamptz | yes | |
| sent_to_email | text | yes | |
| exchange_rates | jsonb | yes | snapshot at send time |
| created_at | timestamptz | no | |
| updated_at | timestamptz | no | |
| deleted_at | timestamptz | yes | |

**Relationships:**
- `rfq` → ManyToOne → FmsRfq (was `quote` → FmsQuote)
- `calculations` → OneToMany → FmsOfferCalculation (was `lines` → FmsOfferLine)

### FmsOfferCalculation (new)

Table: `fms_offer_calculations`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid PK | no | |
| offer_id | uuid FK | no | → fms_offers |
| organization_id | uuid | no | scoping |
| tenant_id | uuid | no | scoping |
| calculation_number | integer | no | default 1, ordering |
| label | text | yes | e.g., "Calculation 1" |
| containers | jsonb | yes | e.g., `['20GP', '40HC']` |
| origin_location_id | uuid | yes | ref to FmsLocation |
| destination_location_id | uuid | yes | ref to FmsLocation |
| place_of_loading_id | uuid | yes | expandable field |
| place_of_delivery_id | uuid | yes | expandable field |
| created_at | timestamptz | no | |
| updated_at | timestamptz | no | |
| deleted_at | timestamptz | yes | |

**Relationships:**
- `offer` → ManyToOne → FmsOffer
- `lines` → OneToMany → FmsOfferLine

### FmsOfferLine (restructured)

Table: `fms_offer_lines`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid PK | no | |
| calculation_id | uuid FK | no | → fms_offer_calculations (was offer_id) |
| organization_id | uuid | no | scoping |
| tenant_id | uuid | no | scoping |
| line_number | integer | no | ordering |
| product_id | uuid | yes | ref to FmsProduct |
| product_name | text | yes | snapshot |
| charge_code | text | yes | snapshot from product's charge code |
| charge_basis | text | yes | per_container, per_shipment, per_kg, etc. |
| currency_code | text | no | ISO 4217, default 'USD' |
| rate | numeric(18,4) | no | rate/tariff value |
| buy_price | numeric(18,4) | no | what we pay |
| sell_price | numeric(18,4) | no | what customer pays |
| is_enabled | boolean | no | default false, toggled by user |
| created_at | timestamptz | no | |
| updated_at | timestamptz | no | |
| deleted_at | timestamptz | yes | |

**Removed columns:** offer_id, variant_id, source_quote_line_id, container_size, provider_id, carrier_id, reference, validity_start, validity_end, unit_cost, unit_price, amount, margin_value, margin_type

### FmsProduct (simplified)

Table: `fms_products`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid PK | no | |
| organization_id | uuid | no | scoping |
| tenant_id | uuid | no | scoping |
| name | text | no | product name |
| charge_code_id | uuid FK | yes | → fms_charge_codes |
| is_active | boolean | no | default true |
| created_at | timestamptz | no | |
| updated_at | timestamptz | no | |
| deleted_at | timestamptz | yes | |
| created_by | uuid | yes | audit |
| updated_by | uuid | yes | audit |

**Removed columns:** carrier_id, loop, source_id, destination_id, transit_time, location_id, description, internal_notes

**Removed entity:** `FmsProductVariant` (table `fms_product_variants` dropped)

---

## API Contracts

### RFQ CRUD

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/fms_offers/rfq` | List RFQs (paginated) |
| POST | `/api/fms_offers/rfq` | Create RFQ |
| GET | `/api/fms_offers/rfq/[id]` | Get RFQ detail |
| PUT | `/api/fms_offers/rfq/[id]` | Update RFQ |
| DELETE | `/api/fms_offers/rfq/[id]` | Soft-delete RFQ |

### Offers

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/fms_offers/offers` | List offers (populates `rfq`, `calculations.lines`) |
| POST | `/api/fms_offers/offers` | Create offer (accepts `rfqId`) |
| GET | `/api/fms_offers/offers/[id]` | Get offer detail with calculations, lines, projects |
| PUT | `/api/fms_offers/offers/[id]` | Update offer |
| DELETE | `/api/fms_offers/offers/[id]` | Soft-delete offer |

### Offer Lines

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/fms_offers/offer-lines?offerId=X` | List lines for an offer (queries through calculations) |
| GET | `/api/fms_offers/offer-lines?calculationId=X` | List lines for a specific calculation |
| POST | `/api/fms_offers/offer-lines` | Create line |
| GET | `/api/fms_offers/offer-lines/[id]` | Get line detail |
| PUT | `/api/fms_offers/offer-lines/[id]` | Update line |
| DELETE | `/api/fms_offers/offer-lines/[id]` | Soft-delete line |

### Calculations

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/fms_offers/offers/[id]/calculations` | Create calculation (with auto-populate) |
| PUT | `/api/fms_offers/offers/[id]/calculations/[calcId]` | Update calculation |
| DELETE | `/api/fms_offers/offers/[id]/calculations/[calcId]` | Delete calculation |

### Contacts (updated)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/fms_offers/offers/[id]/contacts` | Get contacts — looks up Contractor by `rfq.companyName` match |

### Offer Detail Response Shape

```json
{
  "id": "uuid",
  "offerNumber": "OFF-2026-0001",
  "version": 1,
  "status": "draft",
  "direction": "import",
  "transportMode": "sea",
  "cargoType": "general",
  "rfq": {
    "id": "uuid",
    "title": "Shanghai to Rotterdam - 40ft",
    "companyName": "Acme Logistics",
    "contactPerson": "John Doe",
    "origin": "Shanghai",
    "destination": "Rotterdam",
    "containerCount": 2,
    "direction": "import",
    "transportMode": "sea",
    "cargoType": "general"
  },
  "calculations": [
    {
      "id": "uuid",
      "calculationNumber": 1,
      "label": "Calculation 1",
      "containers": ["40HC"],
      "originLocationId": "uuid",
      "destinationLocationId": "uuid",
      "placeOfLoadingId": null,
      "placeOfDeliveryId": null,
      "lines": [
        {
          "id": "uuid",
          "lineNumber": 1,
          "productId": "uuid",
          "productName": "Ocean Freight",
          "chargeCode": "OFR",
          "chargeBasis": "per_container",
          "chargeUnit": "container",
          "currencyCode": "USD",
          "rate": "1500.0000",
          "buyPrice": "1200.0000",
          "sellPrice": "1500.0000",
          "isEnabled": true
        }
      ]
    }
  ],
  "projects": [{ "id": "uuid", "projectNumber": "PRJ-2026-0001" }],
  "project": { "id": "uuid", "projectNumber": "PRJ-2026-0001" }
}
```

---

## UI Components

### Removed Components
- `QuoteWizard/` (24 files) — multi-step quote creation wizard
- `QuoteBasicInfo.tsx`, `QuoteDetailsTable.tsx`, `QuoteDrawer.tsx`, `QuotePreviewDrawer.tsx`, `QuoteOffersSection.tsx`, `QuoteDocuments.tsx`
- `backend/fms-quotes/` pages
- `widgets/dashboard/draft-quotes/`

### New/Updated Components

| Component | Location | Notes |
|-----------|----------|-------|
| `ProductSearchPanel` | `fms_offers/components/ProductSearchPanel.tsx` | Extracted from QuoteWizard, simplified columns (chargeCode, productName, chargeCodeName, chargeUnit) |
| `OfferDetailDrawer` | `fms_offers/components/OfferDetailDrawer.tsx` | Updated to display calculations with lines, new pricing columns (rate, buy, sell) |
| `OfferLinesTable` | `fms_offers/components/OfferLinesTable.tsx` | Updated types for new line fields |
| `ConvertToProjectDialog` | `fms_offers/components/ConvertToProjectDialog.tsx` | Simplified — no more route pills, container unit logic; shows enabled lines with sell prices |
| `OfferDialog` | `fms_offers/components/OfferDialog.tsx` | `quoteId` prop → `rfqId` |
| `ProjectOfferLines` | `fms_projects/components/ProjectOfferLines.tsx` | Updated to traverse `calculations[].lines[]`, new columns |
| `AddProjectProductDialog` | `fms_projects/components/AddProjectProductDialog.tsx` | Updated import path to new `ProductSearchPanel` |
| `ContractorOffersSection` | `contractors/components/ContractorOffersSection.tsx` | Column `quoteNumber` → `rfqTitle` |

### PDF Generation

`offer-pdf.service.tsx` updated:
- Client info: `rfq.companyName` + `rfq.contactPerson` (was `quote.client.name`)
- Route: `rfq.origin` → `rfq.destination` (was port collections)
- Lines: flattened from `calculations[].lines[]`, only `isEnabled` lines shown
- Columns: Code, Description, Basis, Rate, Buy, Sell (was Code, Description, Type, Qty, Unit Price, Amount)

---

## Access Control

Feature IDs updated from `fms_quotes.*` to `fms_offers.*`:

| Feature | Description |
|---------|-------------|
| `fms_offers.offers.view` | View offers |
| `fms_offers.offers.manage` | Create/edit/delete offers |
| `fms_offers.rfq.view` | View RFQs |
| `fms_offers.rfq.manage` | Create/edit/delete RFQs |

---

## Migration Path

This is a **breaking change** to the database schema. The migration:

1. Creates `fms_rfqs` table
2. Creates `fms_offer_calculations` table
3. Alters `fms_offers`: adds `rfq_id`, `direction`, `transport_mode`, `cargo_type`; drops `quote_id`
4. Alters `fms_offer_lines`: adds `calculation_id`, `charge_basis`, `rate`, `buy_price`, `sell_price`, `is_enabled`; drops `offer_id`, `variant_id`, `source_quote_line_id`, `container_size`, and other removed columns
5. Alters `fms_projects`: adds `rfq_id`, drops `quote_id`
6. Simplifies `fms_products`: drops `carrier_id`, `loop`, `source_id`, `destination_id`, `transit_time`, `location_id`, `description`, `internal_notes`
7. Drops tables: `fms_product_variants`, `fms_quote_lines`, `fms_quote_origin_ports`, `fms_quote_destination_ports`, `fms_quotes`

**Data migration:** Existing quote/offer data is not automatically migrated. This is acceptable as the system is pre-production.

---

## Key Design Decisions

### 1. Text-based company name instead of FK to Contractor
FmsRfq stores `companyName` as free text rather than a foreign key to the Contractor entity. This:
- Allows RFQs to be created quickly from email content without requiring a contractor to exist first
- Maintains module isomorphism (fms_offers doesn't depend on contractors module)
- Matching to contractors happens at runtime when contacts are needed (name lookup)

### 2. Lines belong to Calculations, not Offers
Lines are grouped under calculations which represent route-specific pricing. This enables:
- Multiple route options within a single offer
- Each calculation having its own origin/destination/loading/delivery locations
- Lines auto-populated from the product catalog with `isEnabled: false`

### 3. Three-tier pricing (rate, buyPrice, sellPrice)
Instead of the old `unitCost`/`unitPrice`/`amount` model:
- `rate`: the tariff/market rate
- `buyPrice`: what the company pays the carrier
- `sellPrice`: what the customer pays
- Margin is implicit: `sellPrice - buyPrice`

### 4. isEnabled toggle pattern
When a calculation is created, all active products are auto-populated as lines with `isEnabled: false`. Users toggle on the charges they need rather than searching and adding individual products. This provides a complete checklist of available charges.

---

## Changelog

### 2026-02-07
- Initial specification documenting the completed restructuring
- Phases 1-6 implemented across multiple sessions
- All packages build clean, migrations applied, generated files updated
