# PDF Templates Module

This module provides a visual drag-and-drop PDF template designer using [pdfme](https://pdfme.com/), enabling users to create and customize professional PDF documents without coding.

## Features

- **Visual Template Designer**: Full pdfme Designer UI for drag-and-drop template creation
- **Database-driven templates**: Store custom templates per organization/tenant as JSON
- **Default templates**: Professional built-in templates for freight offers
- **Template variables**: Dynamic field mapping from offer data
- **Multi-tenant**: Unique templates per organization/tenant
- **Client-side preview**: Real-time preview with sample data

## Architecture

```
pdf_templates/
├── data/
│   ├── entities.ts              # PdfmeTemplate entity
│   └── validators.ts            # Zod schemas for pdfme templates
├── lib/
│   ├── pdfme-generator.ts       # PDF generation using @pdfme/generator
│   ├── default-pdfme-templates.ts # Built-in template definitions
│   └── offer-variable-mapper.ts # Maps offer data to template inputs
├── api/
│   └── pdfme/
│       ├── route.ts             # CRUD API for pdfme templates
│       └── generate/route.ts    # PDF generation endpoint
├── backend/
│   └── pdf-designer/
│       ├── page.tsx             # Server component
│       └── PdfDesignerClient.tsx # Client component with pdfme Designer
├── components/
│   └── PdfmeDesigner.tsx        # React wrapper for @pdfme/ui Designer
└── migrations/
    └── Migration20260312000000.ts
```

## Installation

### 1. Dependencies

The pdfme packages are installed at the root:

```bash
yarn add @pdfme/common @pdfme/generator @pdfme/ui @pdfme/schemas
```

### 2. Database Migration

```bash
cd apps/mercato
yarn db:migrate
```

This creates the `fms_pdfme_templates` table:

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| organization_id | uuid | Organization scope |
| tenant_id | uuid | Tenant scope |
| template_type | text | Type: 'offer' |
| name | text | Template display name |
| description | text | Optional description |
| template_json | jsonb | pdfme Template JSON |
| preview_image_url | text | Optional preview thumbnail |
| is_active | boolean | Active flag |
| created_at | timestamp | Creation date |
| updated_at | timestamp | Last update |

## API Endpoints

### Template CRUD

- `GET /api/pdf_templates/pdfme?type=offer` - Get template by type (or default)
- `PUT /api/pdf_templates/pdfme` - Create/update template
- `DELETE /api/pdf_templates/pdfme?type=offer` - Delete custom template (revert to default)

### PDF Generation

- `POST /api/pdf_templates/pdfme/generate` - Generate PDF from template

```typescript
// Request body
{
  templateType: 'offer',  // Use stored template
  // OR
  templateJson: { ... },  // Use provided template JSON
  inputs: [{ 
    companyName: 'Acme Corp',
    offerNumber: 'OFF-001',
    // ... other fields
  }]
}
```

## Template Designer

Access the designer at `/backend/pdf-designer?type=offer`

The designer provides:
- Drag-and-drop element placement
- Text, image, shape, and barcode elements
- Property panel for styling
- Real-time preview
- Save to database

## Template Variables

Templates use named fields that map to offer data:

### Branding Variables
- `companyName` - Company name from brand settings
- `companyLogo` - Company logo URL
- `primaryColor` - Brand primary color
- `accentColor` - Brand accent color

### Offer Variables
- `offerNumber` - Offer number (e.g., "OFF-001")
- `version` - Version number
- `status` - Offer status
- `createdDate` - Creation date formatted
- `validUntil` - Validity date formatted
- `isExpired` - 'true' or 'false'

### Client Variables
- `clientName` - Client/contractor name
- `clientAddress` - Billing address
- `clientTaxId` - Tax ID

### Details Variables
- `incoterms` - Incoterms code
- `cargoDescription` - Cargo notes
- `cargoType` - Cargo type label
- `currencyCode` - Currency code
- `paymentTerms` - Payment terms
- `customerNotes` - Customer notes

### System Variables
- `currentDate` - Current date formatted

## Programmatic Usage

### Generate PDF from Offer

```typescript
import { generateOfferPdf } from '@open-mercato/fms/modules/fms_offers/lib/offer-pdf.service'

const pdfBuffer = await generateOfferPdf(offerId, em, {
  tenantId: 'tenant-uuid',
  organizationId: 'org-uuid'
})
```

### Direct pdfme Generation

```typescript
import { 
  generatePdfBuffer, 
  loadPdfmeTemplate, 
  getDefaultPdfmeTemplate 
} from '@open-mercato/fms/modules/pdf_templates'

// Load custom or default template
const template = await loadPdfmeTemplate(em, {
  tenantId,
  organizationId,
  templateType: 'offer'
}) || getDefaultPdfmeTemplate('offer')

// Generate PDF
const pdf = await generatePdfBuffer(template.templateJson, [{
  companyName: 'Acme Corp',
  offerNumber: 'OFF-001',
  clientName: 'Customer Inc',
}])
```

## UI Integration

The PDF Templates tab is part of the unified Template Settings page:
- Settings > Templates > PDF Templates

From this tab, users can:
- View the list of templates
- Open the visual designer for each template type
- Preview templates with sample data
- Reset to default template

## Default Templates

Built-in templates are provided in `lib/default-pdfme-templates.ts`:

- **BLANK_A4_TEMPLATE** - Empty A4 page
- **DEFAULT_OFFER_TEMPLATE** - Professional offer document
- **COVER_PAGE_TEMPLATE** - Simple cover page

## Supported Schema Types

The pdfme Designer supports these element types:

| Type | Description |
|------|-------------|
| Text | Static or variable text |
| Image | Logo, photos |
| SVG | Vector graphics |
| Line | Horizontal/vertical lines |
| Rectangle | Box shapes |
| Ellipse | Circles and ovals |
| QRCode | QR codes |
| Code128 | Barcode format |
| EAN13 | Product barcodes |

## Template JSON Structure

```typescript
interface PdfmeTemplateJson {
  basePdf: string | {
    width: number    // in mm
    height: number   // in mm
    padding: [top, right, bottom, left]
  }
  schemas: Array<Array<{
    name: string       // Field name for variable mapping
    type: string       // Element type (text, image, etc.)
    position: { x: number; y: number }  // in mm
    width: number      // in mm
    height: number     // in mm
    content?: string   // Default content or static value
    // Additional properties per type (fontSize, fontColor, etc.)
  }>>
}
```

## Troubleshooting

### Template Not Applied

1. Check template exists: `GET /api/pdf_templates/pdfme?type=offer`
2. Verify `isActive: true`
3. Ensure correct `tenantId` and `organizationId`

### Designer Not Loading

1. Ensure pdfme packages are installed
2. Check browser console for errors
3. Verify the `PdfmeDesigner` component is mounted client-side

### PDF Generation Fails

1. Check template JSON structure
2. Verify all required fields are provided in inputs
3. Check server logs for pdfme errors

## Migration from HTML Templates

The previous HTML/Puppeteer-based system has been replaced. Key changes:

| Old System | New System |
|------------|------------|
| HTML templates | pdfme JSON templates |
| Puppeteer rendering | @pdfme/generator |
| CSS styling | Element properties |
| Handlebars syntax | Named field mapping |
| Server-side preview | Client-side preview |

Brand settings (company name, logo, colors) are now shared with the Email Templates module and stored in the `email_templates` table.
