# SPEC-022: FMS Documents — AI-Powered Document Extraction Pipeline

## Overview

The `fms_documents` module implements a multi-provider LLM-powered document extraction pipeline for freight/logistics documents. It processes uploaded PDFs through OCR, classification, and parallel LLM extraction with consensus voting, then populates searchable real columns on the `FmsDocument` entity. The module also absorbed the former `fms_financials` module (invoice entities and approval workflow).

**Key goals:**
- Classify documents automatically (invoice, bill of lading, customs declaration, booking confirmation, packing list, VGM certificate, delivery note)
- Extract structured data using multiple LLM providers (Mistral, Claude, Gemini) with consensus
- Populate real database columns for fast filtering/search (BL number, booking number, vessel, POL/POD, etc.)
- Provide an editable detail panel with PDF page preview and section-based data display

---

## Architecture

### Processing Pipeline

```
Upload → OCR (Mistral) → Classification (weighted patterns) → Schema Lookup
       → Parallel LLM Extraction (Mistral + Claude + Gemini)
       → Consensus Engine → Transportation Merge (LLM-first, regex-fallback)
       → Real Column Population → Page Image Extraction
```

### Components

| Component | File | Responsibility |
|-----------|------|----------------|
| `PipelineOrchestrator` | `services/pipeline/orchestrator.ts` | Orchestrates the full 7-step pipeline |
| `DocumentDetector` | `services/document-detector.service.ts` | Weighted pattern matching for document classification |
| `SchemaRegistry` | `services/schema-registry.service.ts` | Loads YAML schemas, builds JSON Schema and extraction prompts |
| `ConsensusEngine` | `services/pipeline/consensus.ts` | Builds consensus from multiple LLM provider results |
| `TransportationExtractor` | `services/pipeline/transportation-extractor.ts` | Regex-based transportation field extraction (safety net) |
| Extraction route | `api/documents/[id]/extract/route.ts` | API endpoint triggering extraction and populating real columns |

### Dual Data Copies

- **`extractedData`** — immutable audit copy of what LLMs returned
- **`documentData`** — editable working copy for user corrections

### LLM-First Transportation Extraction

Transportation fields (BL, vessel, ports, containers) are populated from LLM consensus data first, with regex-based extraction as a fallback for any gaps. The `mergeTransportation()` method handles field name variants across different LLM responses (e.g., `hbl_number`, `hbl_no`, `bl_number` all map to `blNumber`).

---

## Data Models

### FmsDocument

Table: `fms_documents`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid PK | no | `gen_random_uuid()` |
| organization_id | uuid | no | tenant scoping |
| tenant_id | uuid | no | tenant scoping |
| name | text | yes | document name |
| category | text | no | `offer\|invoice\|customs\|bill_of_lading\|booking\|packing_list\|vgm\|other` |
| description | text | yes | |
| attachment_id | uuid | yes | FK to attachments |
| related_entity_id | uuid | yes | links to projects, etc. |
| related_entity_type | text | yes | e.g., `fms_project` |
| **Extraction & Processing** | | | |
| processing_status | text | yes | `pending\|processing\|completed\|failed` |
| processed_at | timestamptz | yes | |
| processing_result | jsonb | yes | full pipeline result |
| consensus_confidence | numeric | yes | 0-100 |
| consensus_recommendation | text | yes | `APPROVE\|MANUAL` |
| document_type | text | yes | detected type |
| document_type_confidence | numeric | yes | detection confidence |
| extracted_data | jsonb | yes | immutable audit copy |
| document_data | jsonb | yes | editable working copy |
| raw_text | text | yes | OCR output |
| **Real Columns (Indexed)** | | | |
| document_number | text | yes | invoice/doc number |
| document_date | timestamptz | yes | |
| bl_number | text | yes | HBL number (indexed) |
| mbl_number | text | yes | MBL number |
| booking_number | text | yes | booking ref (indexed) |
| container_numbers | jsonb | yes | array of strings |
| vessel_name | text | yes | |
| voyage_number | text | yes | |
| port_of_loading | text | yes | |
| port_of_discharge | text | yes | |
| currency | text | yes | ISO 4217 |
| seller_name | text | yes | |
| buyer_name | text | yes | |
| total_gross_amount | text | yes | |
| **Edit Tracking** | | | |
| edited_by | uuid | yes | |
| edited_at | timestamptz | yes | |
| **Bundle Support** | | | |
| parent_document_id | uuid | yes | self-FK (indexed), cascade delete |
| **Standard** | | | |
| created_at | timestamptz | no | |
| updated_at | timestamptz | no | |
| deleted_at | timestamptz | yes | soft delete |
| created_by | uuid | yes | |
| updated_by | uuid | yes | |

**Relationships:**
- `children` → OneToMany → FmsDocument (bundle sub-documents)
- `pages` → OneToMany → FmsDocumentPage

### FmsDocumentPage

Table: `fms_document_pages`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid PK | no | |
| document_id | uuid FK | no | → fms_documents |
| page_number | integer | no | |
| storage_path | text | no | path in object store |
| storage_driver | text | no | e.g., `nats_object_store` |
| width | integer | yes | image dimensions |
| height | integer | yes | |
| file_size | integer | yes | bytes |

### FmsInvoice (migrated from fms_financials)

Table: `fms_invoices`

Invoice-specific entity with approval workflow:
- `status`: `pending_review\|approved\|rejected`
- Line items via `FmsInvoiceLineItem`
- Transportation metadata fields
- Review tracking: `reviewedBy`, `reviewedAt`, `reviewNotes`

---

## Document Classification

### YAML-Based Schema System

Seven document type schemas in `data/schemas/*.yaml`:

| Schema | File | Key Detection Patterns |
|--------|------|----------------------|
| Invoice | `invoice.yaml` | `faktura\|invoice\|rachunek`, VAT/NIP, gross amount |
| Bill of Lading | `bill_of_lading.yaml` | `bill of lading\|B/L`, shipper/consignee, container details |
| Customs Declaration | `customs_declaration.yaml` | `customs\|declaration\|SAD`, HS codes, duties |
| Delivery Note | `delivery_note.yaml` | `delivery note\|lieferschein`, vehicle info |
| Booking Confirmation | `booking_confirmation.yaml` | `booking confirmation\|booking number`, carrier, vessel |
| Packing List | `packing_list.yaml` | `packing list\|lista pakowa`, container/cargo details |
| VGM Certificate | `vgm_certificate.yaml` | `VGM\|verified gross mass`, SOLAS, weighing method |

### Scoring Algorithm

```
score = Σ(matched_pattern_weight) - Σ(matched_negative_pattern_weight)
if any required_pattern not matched: score = 0
confidence = (score / max_possible_score) × 100%
```

A document type is selected when it has the highest score above `minScore`.

### Bundle Detection

When 2+ document types score above 70% of their `minScore`, the PDF is treated as a bundle and each type is extracted separately.

---

## API Contracts

### Document Extraction

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/fms_documents/documents/{id}/extract` | Trigger extraction pipeline |
| GET | `/api/fms_documents/documents/{id}/extract` | Get extraction status/results |

### Document CRUD

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/fms_documents/documents` | List documents (paginated, filterable, searchable) |
| POST | `/api/fms_documents/documents` | Create document |
| GET | `/api/fms_documents/documents/{id}` | Get document detail |
| PUT | `/api/fms_documents/documents/{id}` | Update document metadata |
| DELETE | `/api/fms_documents/documents/{id}` | Soft-delete document |

### Table Configuration

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/fms_documents/table-config` | Column definitions for DynamicTable |

### List API Response

```json
{
  "items": [{
    "id": "uuid",
    "name": "DN25112411.pdf",
    "category": "invoice",
    "documentType": "invoice",
    "documentNumber": "FV/2025/1234",
    "blNumber": "KUNSE25112411",
    "bookingNumber": null,
    "vesselName": "MOGENS MAERSK",
    "portOfLoading": "QINGDAO,CHINA",
    "portOfDischarge": "GDANSK",
    "sellerName": "Kuehne + Nagel",
    "totalGrossAmount": "3500.00",
    "currency": "USD",
    "createdAt": "2026-02-15T..."
  }],
  "total": 47,
  "page": 1,
  "pageSize": 50,
  "totalPages": 1
}
```

### Extraction Response

```json
{
  "ok": true,
  "documentId": "uuid",
  "documentType": "invoice",
  "documentTypeConfidence": 85,
  "consensus": {
    "recommendation": "APPROVE",
    "overallConfidence": 87.5,
    "data": { "...consensusData" },
    "disagreements": [],
    "providerCount": 3
  },
  "processingTimeMs": 12345
}
```

---

## UI/UX

### Documents Table (`backend/fms-documents/page.tsx`)

DynamicTable with document-specific columns:

| Column | Width | Type | Notes |
|--------|-------|------|-------|
| Name | 250 | editable link | Opens detail panel on click |
| Category | 130 | dropdown | Badge renderer, editable |
| Detected Type | 120 | readOnly | Color-coded badge |
| Doc Number | 160 | readOnly | |
| B/L Number | 160 | readOnly | |
| Booking No. | 140 | readOnly | |
| Vessel | 150 | readOnly | |
| POL | 140 | readOnly | |
| POD | 140 | readOnly | |
| Seller | 180 | readOnly | |
| Amount | 100 | readOnly | |
| Currency | 80 | readOnly | |
| Download | 90 | readOnly | Download link |

**Table Configuration:**
- `readOnlyStyle: 'normal'` — readOnly columns render with white background (not grayed out)
- Server-side filter suggestions via `useFilterSuggestions`
- Server-side sorting and search across document-specific fields
- Perspective support (save/load column layouts)

### Document Detail Panel (`DocumentDetailPanel.tsx`)

Right-side sheet with split view:
- **Left**: PDF page preview with thumbnail navigation
- **Right**: Extracted data in document-type-specific sections

Section types:
- **Flat sections**: key-value pairs (header info, totals)
- **Object sections**: nested objects (seller, buyer, routing, vessel)
- **Array sections**: line items, containers, goods

Features: edit mode, save, download, confidence badges, processing status.

### Document Upload Dialog (`DocumentUploadDialog.tsx`)

Modal for batch upload:
- Drag-and-drop + file picker
- Auto-detect category from filename patterns
- AI extraction toggle (default: enabled)
- Real-time progress per file
- Links to related entities (optional)

---

## Commands

| Command ID | Description |
|------------|-------------|
| `fms_documents.documents.create` | Create document with attachment |
| `fms_documents.documents.update` | Update metadata (name, category, description) |
| `fms_documents.documents.delete` | Soft-delete document |
| `fms_documents.documents.updateDocumentData` | Update extracted data fields and real columns |
| `fms_documents.invoices.create` | Create invoice (migrated from fms_financials) |
| `fms_documents.invoices.update` | Update invoice |
| `fms_documents.invoices.delete` | Soft-delete invoice |
| `fms_documents.invoices.approve` | Approve invoice |
| `fms_documents.invoices.reject` | Reject invoice |
| `fms_documents.invoices.matchChargeCode` | Match line item to charge code |
| `fms_documents.documents.process` | Trigger document processing |

---

## Search Configuration

Full-text search indexing via `search.ts`:

**Indexed fields:** name, category, description, document_type, document_number, bl_number, booking_number, vessel_name, voyage_number, port_of_loading, port_of_discharge, currency, seller_name, buyer_name

**Deep indexing:** Walks `documentData` JSONB to index all nested string values.

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DOCUMENT_PROCESSING_ENABLED` | `false` | Enable the full AI extraction pipeline |
| `MISTRAL_API_KEY` | — | Mistral OCR + extraction provider |
| `ANTHROPIC_API_KEY` | — | Claude extraction provider |
| `GEMINI_API_KEY` | — | Gemini extraction provider |

---

## Key Design Decisions

### 1. Multi-provider consensus over single LLM
Three LLM providers extract independently; consensus engine resolves disagreements. This reduces hallucination risk and increases extraction accuracy for critical fields (amounts, document numbers).

### 2. YAML schemas for detection + extraction
Human-readable YAML files define both detection patterns and extraction field schemas. This allows non-developers to add new document types without code changes.

### 3. LLM-first, regex-fallback for transportation
The `mergeTransportation()` method prioritizes LLM consensus data for transportation fields (BL, vessel, ports, containers). Regex-based extraction via `TransportationExtractor` serves as a safety net for structured patterns like ISO 6346 container numbers with check digit validation.

### 4. Real columns for searchable fields
Key identifiers (BL number, booking number, vessel, ports, seller, amount) are stored as real database columns with indexes, not just in JSONB. This enables fast server-side filtering and sorting in the DynamicTable.

### 5. Dual data copies (extractedData vs documentData)
`extractedData` is the immutable audit trail of what LLMs returned. `documentData` is the working copy that users can edit. This preserves extraction provenance while allowing corrections.

### 6. Merged fms_financials into fms_documents
Invoice entities (`FmsInvoice`, `FmsInvoiceLineItem`, `FmsInvoicePage`) moved from the former `fms_financials` module into `fms_documents` to consolidate all document-related entities under one module.

---

## Risks & Impact Review

#### LLM Provider Unavailability
- **Scenario**: One or more LLM providers (Mistral, Claude, Gemini) are down during extraction
- **Severity**: Medium
- **Affected area**: Document extraction quality
- **Mitigation**: Consensus engine works with 1+ providers; falls back to legacy extraction if pipeline fails entirely
- **Residual risk**: Single-provider extraction has lower confidence; acceptable for non-critical documents

#### OCR Quality on Scanned Documents
- **Scenario**: Poor scan quality leads to garbled OCR text, causing misclassification and extraction errors
- **Severity**: Medium
- **Affected area**: All downstream processing (classification, extraction)
- **Mitigation**: Confidence scores flag low-quality extractions; `consensusRecommendation: 'MANUAL'` triggers manual review
- **Residual risk**: Some documents will require manual data entry; this is expected

#### JSONB Data Growth
- **Scenario**: `extractedData`, `documentData`, `processingResult` columns grow large for complex documents
- **Severity**: Low
- **Affected area**: Database storage, query performance on large datasets
- **Mitigation**: Real columns used for filtering/sorting (not JSONB queries); JSONB only loaded on detail view
- **Residual risk**: Storage costs grow linearly with document count; acceptable at current scale

#### Tenant Data Isolation
- **Scenario**: Cross-tenant data leak via document queries
- **Severity**: Critical
- **Affected area**: All API endpoints
- **Mitigation**: Every query filters by `tenantId` and `organizationId`; commands enforce scope via `ensureTenantScope`/`ensureOrganizationScope`
- **Residual risk**: None — scope enforcement is mandatory in all code paths

#### Concurrent Extraction Requests
- **Scenario**: Multiple users trigger extraction on the same document simultaneously
- **Severity**: Low
- **Affected area**: Document data consistency
- **Mitigation**: `processingStatus` tracks state; last-write-wins for real columns (acceptable since extraction is idempotent)
- **Residual risk**: Brief inconsistency window; acceptable as extraction produces deterministic results

---

## Changelog

### 2026-02-15
- Initial specification documenting the complete fms_documents extraction pipeline
- Documents table updated: document-specific columns (type, doc number, BL, booking, vessel, POL, POD, seller, amount, currency) replace generic metadata columns
- ReadOnly columns styled as normal (white) via `readOnlyStyle: 'normal'`
- Server-side search extended to cover document-specific fields
- LLM-first transportation extraction with regex fallback
- New YAML schemas: booking_confirmation, packing_list, vgm_certificate
- Merged fms_financials entities (FmsInvoice, FmsInvoiceLineItem, FmsInvoicePage) into fms_documents
- Migration `Migration20260215180000.ts` adds 26 columns to fms_documents table
