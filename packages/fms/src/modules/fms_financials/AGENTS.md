# FMS Financials Module

## Overview

The FMS Financials module handles document processing with AI-powered OCR extraction, automatic document type detection, transportation metadata extraction, and charge code matching. It supports multiple document types including invoices, bills of lading, delivery notes, and customs declarations.

**Module Path**: `packages/fms/src/modules/fms_financials/`
**API Base Path**: `/api/fms_financials/`
**Version**: 0.2.0

**Dependencies**: `fms_projects`, `fms_quotes`, `fms_products`, `attachments`

## Setup & Configuration

### Required Environment Variables

```bash
# Mistral AI API Key (required for OCR)
MISTRAL_API_KEY=your_mistral_api_key

# Optional: Custom storage path for page images (default: ./storage/attachments/invoicePages)
INVOICE_PAGES_STORAGE_PATH=/custom/path/to/pages
```

### Database Setup

Run migrations to create the required tables:

```bash
cd apps/mercato
yarn db:migrate --modules=fms_financials
```

This creates:
- `fms_invoices` table with document type and transportation metadata columns
- `fms_invoice_pages` table for storing page image references
- `fms_invoice_line_items` table for extracted line items

## Core Functionality

### 1. Document Upload & Processing Pipeline

```
PDF Upload → OCR (Mistral) → Document Detection → Schema Selection → Structured Extraction → Normalization → Storage
                                    ↓
                          Transportation Metadata Extraction (parallel)
                                    ↓
                          Page Image Extraction & Storage
```

**Supported File Types:**
- PDF (primary)
- PNG, JPEG, TIFF, WebP (images)
- Maximum file size: 20MB

### 2. Document Type Detection

The module automatically detects document types using weighted pattern matching:

| Type | Description | Detection Patterns |
|------|-------------|-------------------|
| `invoice` | Freight invoices, VAT invoices | faktura, invoice, VAT, NIP |
| `bill_of_lading` | Bills of Lading (B/L) | bill of lading, B/L, shipper, consignee |
| `delivery_note` | Delivery notes | delivery note, DN, receiver |
| `customs_declaration` | Customs declarations (SAD) | customs, declaration, SAD, MRN |

Each document receives a confidence score (0-100) based on pattern matching.

### 3. YAML-Based Extraction Schemas

Extraction schemas are defined in YAML format in `data/schemas/`. This allows easy customization without code changes.

**Schema Location**: `data/schemas/*.yaml`

**Schema Structure:**
```yaml
schema:
  version: "1.0"
  name: "Freight Invoice"
  documentType: "invoice"

detection:
  patterns:
    - regex: "faktura|invoice"
      weight: 50
    - regex: "VAT|NIP"
      weight: 30
  requiredPatterns: ["faktura|invoice"]
  minScore: 40

fields:
  invoice_number:
    type: string
    required: true
    patterns: ["FV.*", "INV-.*"]
  line_items:
    type: array
    required: true
    itemSchema:
      description: { type: string, required: true }
      gross_amount: { type: decimal }

normalization:
  rules:
    - path: "line_items.*.gross_amount"
      transform: decimal_2dp
    - path: "invoice_date"
      transform: iso_date
```

**Adding New Document Types:**
1. Create a new YAML file in `data/schemas/my_document.yaml`
2. Add the document type to `data/schema-types.ts`
3. The schema will be auto-discovered on next service restart

### 4. Transportation Metadata Extraction

The `TransportationMetadataExtractor` service extracts shipping references using regex patterns:

| Field | Pattern Examples | Validation |
|-------|-----------------|------------|
| `blNumber` | COSU1234567890, MAEU9876543210 | Carrier prefix + digits |
| `containerNumbers` | MSCU1234567, TRIU9876543 | ISO 6346 with check digit |
| `vesselName` | M/V EVER GIVEN, vessel: MAERSK | After "M/V" or "vessel" keywords |
| `voyageNumber` | VVD-NEUT0107S, voyage 123E | After "voyage" or "vvd" keywords |
| `portOfLoading` | POL: SHANGHAI | After POL keywords |
| `portOfDischarge` | POD: ROTTERDAM | After POD keywords |
| `carrierName` | Identified from BL prefix | SCAC code mapping |

**Container Number Validation:**
Uses ISO 6346 standard with check digit validation (4 letters + 6 digits + 1 check digit).

### 5. PDF Page Image Extraction

- Converts PDF pages to PNG images using `pdf-to-img` (pure JavaScript, no external dependencies)
- No GraphicsMagick or ImageMagick installation required
- Stores images in local filesystem (extensible to S3)
- Provides split-view drawer showing page preview alongside invoice details

**Storage Path:** `./storage/attachments/invoicePages/org_{orgId}/{invoiceId}/page_{n}.png`

### 6. Charge Code Matching

Line items are automatically matched to `FmsChargeCode` entities using a multi-strategy algorithm:

**Matching Strategies (in priority order):**

1. **Exact Code Match (80 points)** - Description contains the charge code
2. **Name Match (70 points)** - Description contains charge code name
3. **Word Overlap (up to 50 points)** - Significant words overlap
4. **Keyword Match (up to 60 points)** - Matches charge code keywords
5. **Freight Term Mapping (40 points)** - Common freight terms mapped

**Confidence Thresholds:**
- Auto-apply match: >= 70% confidence
- Suggest for review: 40-69% confidence
- No suggestion: < 40% confidence

## Data Model

### FmsInvoice

Primary entity storing invoice header and transportation metadata.

```typescript
{
  id: string                    // UUID
  organizationId: string
  tenantId: string

  // Core fields
  invoiceNumber: string | null
  invoiceDate: Date | null
  currency: string | null
  totalGross: string | null     // Decimal as string
  totalNet: string | null
  totalVat: string | null

  // Document processing
  documentType: string          // 'invoice' | 'bill_of_lading' | etc.
  documentTypeConfidence: number | null  // 0-100
  status: string                // 'pending_review' | 'approved' | 'rejected'
  extractionConfidence: string  // 'HIGH' | 'MEDIUM' | 'LOW'

  // Seller/Buyer info
  sellerName: string | null
  sellerTaxId: string | null
  buyerName: string | null
  buyerTaxId: string | null

  // Transportation metadata (indexed for search)
  transportationMetadata: TransportationMetadata | null
  blNumber: string | null       // B/L number (indexed)
  containerNumbers: string[] | null
  vesselName: string | null
  voyageNumber: string | null

  // Source data
  sourceType: string            // 'pdf' | 'manual'
  originalFilename: string | null
  attachmentId: string | null
  ocrConfidence: number | null
  extractedData: object | null  // Raw OCR result

  // Relations
  lineItems: FmsInvoiceLineItem[]
  pages: FmsInvoicePage[]
}
```

### FmsInvoicePage

Stores page image metadata.

```typescript
{
  id: string
  organizationId: string
  tenantId: string
  invoice: FmsInvoice           // ManyToOne relation
  pageNumber: number
  storagePath: string           // Local filesystem path
  storageDriver: string         // 'local' (extensible to 's3')
  width: number | null
  height: number | null
  fileSize: number | null
  extractedText: string | null  // Per-page OCR text
  createdAt: Date
}
```

### FmsInvoiceLineItem

Extracted line items with charge code matching.

```typescript
{
  id: string
  organizationId: string
  tenantId: string
  invoice: FmsInvoice
  description: string
  quantity: string | null
  unitPrice: string | null
  grossAmount: string | null
  netAmount: string | null
  vatAmount: string | null
  vatRate: string | null
  chargeCodeId: string | null   // Matched charge code
  matchConfidence: number | null
}
```

## Services (DI Tokens)

| Service | DI Token | Purpose |
|---------|----------|---------|
| `SchemaRegistry` | `fmsSchemaRegistry` | Load/manage YAML schemas (singleton) |
| `DocumentDetector` | `fmsDocumentDetector` | Detect document type |
| `TransportationMetadataExtractor` | `fmsTransportationExtractor` | Extract shipping references |
| `MistralOcrService` | `fmsMistralOcrService` | OCR extraction |
| `ChargeCodeMatcherService` | `fmsChargeCodeMatcher` | Match line items to charge codes |
| `PageImageService` | `fmsPageImageService` | PDF page to image conversion |

## API Endpoints

### Invoice CRUD

| Method | Endpoint | Description | Feature |
|--------|----------|-------------|---------|
| GET | `/api/fms_financials/invoices` | List invoices with filters | `invoices.view` |
| POST | `/api/fms_financials/invoices` | Create invoice manually | `invoices.manage` |
| GET | `/api/fms_financials/invoices/:id` | Get invoice with line items | `invoices.view` |
| PUT | `/api/fms_financials/invoices/:id` | Update invoice | `invoices.manage` |
| DELETE | `/api/fms_financials/invoices/:id` | Soft delete invoice | `invoices.delete` |

### Document Processing

| Method | Endpoint | Description | Feature |
|--------|----------|-------------|---------|
| POST | `/api/fms_financials/invoices/upload` | Upload PDF for OCR | `invoices.upload` |
| POST | `/api/fms_financials/invoices/:id/extract` | Re-extract data | `invoices.manage` |
| POST | `/api/fms_financials/invoices/:id/match-charges` | Match to charge codes | `invoices.manage` |

### Page Images

| Method | Endpoint | Description | Feature |
|--------|----------|-------------|---------|
| GET | `/api/fms_financials/invoices/:id/pages` | List page metadata | `invoices.view` |
| GET | `/api/fms_financials/invoices/:id/pages/:pageNum/image` | Get page image (PNG) | `invoices.view` |

## Commands

All mutations use the command pattern with undo support:

| Command | Description |
|---------|-------------|
| `fms_financials.invoices.create` | Create invoice with line items |
| `fms_financials.invoices.update` | Update invoice fields |
| `fms_financials.invoices.delete` | Soft delete invoice |
| `fms_financials.invoices.approve` | Approve invoice |
| `fms_financials.invoices.reject` | Reject with notes |
| `fms_financials.invoices.matchChargeCode` | Match line item to charge code |

## Permissions (ACL)

| Feature | Description |
|---------|-------------|
| `fms_financials.dashboard.view` | View financials dashboard |
| `fms_financials.reports.view` | View financial reports |
| `fms_financials.invoices.view` | View invoice list and details |
| `fms_financials.invoices.upload` | Upload new invoices |
| `fms_financials.invoices.manage` | Create, update invoices |
| `fms_financials.invoices.approve` | Approve or reject invoices |
| `fms_financials.invoices.delete` | Delete invoices |

## UI Components

### Dashboard (`/backend/fms-financials`)

**Features:**
- Invoice list with filtering and search
- Status and confidence indicators
- Upload dialog for new invoices
- Detail panel with split-view

### InvoiceDetailPanel (Split-View)

When an invoice has pages, displays a split-view layout:

```
+----------------------------------------------------------+
| Invoice Details                                     [X]  |
+---------------------------+------------------------------+
|                           |                              |
|   +-------------------+   |  Invoice: FV/2026/01/001     |
|   |                   |   |  Date: 2026-01-15            |
|   |   Page Preview    |   |  Status: Pending Review      |
|   |     (Image)       |   |  Type: invoice (95%)         |
|   |                   |   |                              |
|   +-------------------+   |  Transportation:             |
|                           |  BL: COSU1234567890          |
|   [1] [2] [3]  <- pages   |  Vessel: M/V EVER GIVEN      |
|                           |  Containers: MSCU1234567     |
|   [Zoom] [Rotate]         |                              |
|                           |  Line Items (5)              |
|                           |  - Ocean Freight: $1,200     |
|                           |                              |
|                           |  [Approve] [Reject]          |
+---------------------------+------------------------------+
```

### PagePreview Component
- Displays selected page image
- Zoom: 50% to 300%
- Rotate: 90 degree increments
- Download page as PNG

### PageThumbnails Component
- Horizontal thumbnail strip
- Click to select page
- Highlights current selection

## Directory Structure

```
packages/fms/src/modules/fms_financials/
+-- acl.ts                    # Feature permissions
+-- index.ts                  # Module metadata
+-- di.ts                     # Dependency injection registration
+-- api/
|   +-- invoices/
|       +-- route.ts          # List/create invoices
|       +-- upload/route.ts   # PDF upload with OCR
|       +-- [id]/
|           +-- route.ts      # Get/update/delete invoice
|           +-- extract/route.ts       # Re-extract data
|           +-- match-charges/route.ts # Match to charge codes
|           +-- pages/
|               +-- route.ts           # List page metadata
|               +-- [pageNum]/image/route.ts  # Serve page image
+-- backend/
|   +-- fms-financials/
|       +-- page.tsx          # Main backend page
|       +-- page.meta.ts      # Page metadata
+-- commands/
|   +-- index.ts              # Command registration
|   +-- invoices.ts           # Invoice CRUD commands
|   +-- shared.ts             # Shared command utilities
+-- components/
|   +-- InvoiceDetailPanel.tsx    # Split-view invoice details
|   +-- InvoiceUploadDialog.tsx   # Upload dialog
|   +-- LineItemMatcher.tsx       # Charge code matching UI
|   +-- PagePreview.tsx           # Page image display
|   +-- PageThumbnails.tsx        # Page navigation
+-- data/
|   +-- entities.ts           # MikroORM entities
|   +-- types.ts              # TypeScript types
|   +-- validators.ts         # Zod validation schemas
|   +-- snapshots.ts          # Snapshot utilities
|   +-- schema-types.ts       # YAML schema type definitions
|   +-- extraction-schema.ts  # Legacy extraction schema
|   +-- schemas/              # YAML extraction schemas
|       +-- invoice.yaml
|       +-- bill_of_lading.yaml
|       +-- delivery_note.yaml
|       +-- customs_declaration.yaml
+-- services/
|   +-- mistral-ocr.service.ts           # Mistral AI OCR integration
|   +-- schema-registry.service.ts       # YAML schema loading
|   +-- document-detector.service.ts     # Document type detection
|   +-- transportation-extractor.service.ts  # Transport metadata
|   +-- charge-code-matcher.service.ts   # Charge code matching
|   +-- page-image.service.ts            # PDF page image extraction
+-- migrations/
    +-- Migration20260125170000.ts       # Initial tables
    +-- Migration20260125200000.ts       # Transportation & pages
```

## Assumptions & Design Decisions

### 1. Polish Invoice Focus
The module is optimized for Polish invoices with support for:
- Default currency: PLN
- Tax ID format: NIP
- Polish freight terms (fracht, celna, konosament)

### 2. Extraction Before Storage
Invoices are created only after successful OCR extraction - no "upload now, extract later" workflow.

### 3. Local Page Image Storage
Page images are stored locally by default. Configure `INVOICE_PAGES_STORAGE_PATH` for custom location. S3 support planned for future.

### 4. ISO 6346 Container Validation
Container numbers are validated using the ISO 6346 check digit algorithm.

### 5. Carrier SCAC Code Mapping
BL number prefixes are mapped to carrier names using SCAC codes (COSU->COSCO, MAEU->Maersk, etc).

### 6. Soft Delete
Invoices use soft delete (`deletedAt` timestamp). Deleted invoices can be restored if needed.

## Testing

### Manual Testing Workflow

1. **Upload a PDF**:
   - Navigate to `/backend/fms-financials`
   - Click "Upload Invoice"
   - Select a PDF file

2. **Verify Extraction**:
   - Check document type and confidence
   - Verify transportation metadata (BL, containers, vessel)
   - Review extracted line items

3. **Test Page Images**:
   - Open invoice detail panel
   - Verify split-view displays page preview
   - Test zoom, rotate, and page navigation

4. **Test Charge Code Matching**:
   - Click "Match Charges" button
   - Review suggestions and apply matches

## Future Enhancements

- [ ] S3 storage driver for page images
- [ ] Batch invoice upload
- [ ] Invoice approval workflow integration
- [ ] Cost reconciliation with projects
- [ ] Multi-currency support with exchange rates
- [ ] Invoice PDF generation
- [ ] Email notifications on status changes
- [ ] Auto-approval rules for high-confidence invoices
- [ ] Duplicate detection
- [ ] Vendor matching to contractor database
- [ ] Learning system based on user corrections
