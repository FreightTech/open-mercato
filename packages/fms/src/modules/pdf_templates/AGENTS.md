# FMS Template Settings - Agent Guidelines

This document covers both **PDF Templates** (`pdf_templates`) and **Email Templates** (`email_templates`) modules, which share branding settings through a unified configuration UI.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Unified Template Settings Page                          │
│                  /backend/config/templates (UnifiedTemplateSettings)        │
├─────────────────────┬─────────────────────┬─────────────────────────────────┤
│   Brand Tab         │   Email Tab         │   PDF Tab                       │
│   (shared colors,   │   (sender config,   │   (links to pdfme designer)     │
│    logo, company)   │    templates)       │                                 │
└─────────────────────┴─────────────────────┴─────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    fms_email_settings (source of truth)                     │
│    company_name, company_logo_url, primary_color, accent_color,             │
│    contact_email, contact_phone, from_name, from_email, etc.                │
└─────────────────────────────────────────────────────────────────────────────┘
          │                                              │
          ▼                                              ▼
┌─────────────────────────────┐        ┌─────────────────────────────────────┐
│   fms_email_templates       │        │   fms_pdfme_templates               │
│   (per template_type)       │        │   (per template_type)               │
│   - subject_template        │        │   - template_json (pdfme JSON)      │
│   - html_template           │        │   - name, description               │
│   - is_active               │        │   - preview_image_url               │
└─────────────────────────────┘        └─────────────────────────────────────┘
```

### Module Dependency

- `pdf_templates` depends on `email_templates` for shared brand settings
- Brand settings (companyName, companyLogoUrl, primaryColor, accentColor) are stored in `fms_email_settings`
- Both modules read from this single source of truth

## Database Tables

### fms_email_settings

Stores shared branding and email sender configuration. **One record per tenant/organization**.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| organization_id | uuid | Organization scope |
| tenant_id | uuid | Tenant scope |
| company_name | text | Company name for branding |
| company_logo_url | text | Logo URL (can be data URI) |
| primary_color | text | Primary brand color (hex) |
| accent_color | text | Accent color (hex) |
| contact_email | text | Contact email for footer |
| contact_phone | text | Contact phone |
| website_url | text | Company website |
| footer_text | text | Email footer text |
| footer_disclaimer | text | Legal disclaimer |
| from_name | text | Sender name |
| from_email | text | Sender email |
| reply_to_email | text | Reply-to address |

### fms_email_templates

Custom email templates per type. Unique constraint: `(organization_id, tenant_id, template_type)`.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| organization_id | uuid | Organization scope |
| tenant_id | uuid | Tenant scope |
| template_type | text | Type: offer, invoice, quote_request, shipment_notification, booking_confirmation, general_message |
| subject_template | text | Email subject with {{variables}} |
| html_template | text | HTML body with {{variables}} |
| is_active | boolean | Whether template is active |

### fms_pdfme_templates

Visual PDF templates for pdfme. Unique constraint: `(organization_id, tenant_id, template_type)`.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| organization_id | uuid | Organization scope |
| tenant_id | uuid | Tenant scope |
| template_type | text | Type: 'offer' |
| name | text | Template display name |
| description | text | Optional description |
| template_json | jsonb | pdfme Template JSON structure |
| preview_image_url | text | Preview thumbnail |
| is_active | boolean | Whether template is active |

---

## PDF Templates Module

### pdfme Integration

The module uses [pdfme](https://pdfme.com/) for visual drag-and-drop PDF template creation:

- `@pdfme/generator` - Server-side PDF generation
- `@pdfme/ui` - Client-side Designer component
- `@pdfme/schemas` - Element types (text, image, barcodes, shapes)
- `@pdfme/common` - Shared types

### Template JSON Structure

```typescript
interface PdfmeTemplateJson {
  basePdf: string | {           // base64 PDF or dimension object
    width: number               // in mm (A4 = 210)
    height: number              // in mm (A4 = 297)
    padding: [top, right, bottom, left]
  }
  schemas: Array<Array<{        // Array of pages, each with elements
    name: string                // Field name for variable mapping
    type: string                // text, image, svg, line, rectangle, etc.
    position: { x: number; y: number }  // in mm
    width: number               // in mm
    height: number              // in mm
    content?: string            // Default/static content or {variable}
    readOnly?: boolean          // If true, uses content with placeholder substitution
    // Additional type-specific properties (fontSize, fontColor, etc.)
  }>>
}
```

### Placeholder Syntax - CRITICAL

**pdfme uses SINGLE braces `{variable}`, NOT double braces `{{variable}}`.**

Double braces are interpreted as JavaScript object literals and will cause `[object Object]` to appear in the PDF output.

```typescript
// ✅ CORRECT - single braces
{ content: "Offer: {offerNumber}" }

// ❌ WRONG - double braces (causes [object Object])
{ content: "Offer: {{offerNumber}}" }
```

The `fixDoubleBraceSyntax()` function automatically converts `{{var}}` to `{var}` when loading templates.

### Key Functions

#### generatePdfBuffer

Main PDF generation function. Automatically sanitizes inputs to strings.

```typescript
import { generatePdfBuffer } from '@open-mercato/fms/modules/pdf_templates'

const pdfBuffer = await generatePdfBuffer(template, [{
  companyName: 'Acme Corp',
  offerNumber: 'OFF-001',
  clientName: 'Customer Inc',
}])
```

#### loadPdfmeTemplate

Load custom template from database, returns null if not found (use default).

```typescript
import { loadPdfmeTemplate, getDefaultPdfmeTemplate } from '@open-mercato/fms/modules/pdf_templates'

const template = await loadPdfmeTemplate(em, {
  tenantId,
  organizationId,
  templateType: 'offer'
}) || getDefaultPdfmeTemplate('offer')
```

#### mapOfferToInputs

Maps offer entity data to flat key-value object for pdfme.

```typescript
import { mapOfferToInputs, settingsToBranding } from '@open-mercato/fms/modules/pdf_templates'

const inputs = mapOfferToInputs(
  offerData,                    // Offer entity with routes, client, etc.
  settingsToBranding(settings), // Brand settings from email_settings
  labels,                       // i18n labels
  { locale: 'en-US' }
)
```

#### normalizeTemplateForSave

Call before saving templates to database. Marks elements with content as `readOnly: true` to enable pdfme's placeholder substitution.

```typescript
import { normalizeTemplateForSave } from '@open-mercato/fms/modules/pdf_templates'

const normalizedTemplate = normalizeTemplateForSave(template)
await em.upsert(PdfmeTemplate, { ...normalizedTemplate })
```

### Template Variables (Offer)

| Category | Variables |
|----------|-----------|
| **Branding** | companyName, companyLogo, primaryColor, accentColor |
| **Labels** | labelOffer, labelClient, labelTaxId, labelIncoterms, labelValidity, labelPaymentTerms, labelCargo, labelCargoType, labelCurrency, labelLineNumber, labelName, labelCurrencyCol, labelFeeScope, labelQuantity, labelRate, labelTotal, labelCustomerNotes, labelExchangeRates, labelTermsTitle |
| **Offer** | offerNumber, version, status, createdDate, validUntil, isExpired |
| **Client** | clientName, clientAddress, clientTaxId |
| **Details** | incoterms, cargoDescription, cargoType, currencyCode, paymentTerms, customerNotes, exchangeRates |
| **Routes** | routesContent (formatted text) |
| **Footer** | footerHtml, rulesAgreementHtml |
| **System** | currentDate |

### Visual Designer

Access at `/backend/pdf-designer?type=offer`

**Components:**
- `PdfDesignerClient` - Server wrapper that loads template
- `PdfmeDesigner` - React wrapper for @pdfme/ui Designer

**Supported Element Types:**
- Text, Image, SVG
- Line, Rectangle, Ellipse
- QRCode, Code128, EAN13 (barcodes)

---

## Email Templates Module

### Template Types

```typescript
type EmailTemplateType =
  | 'offer'               // Freight offer emails
  | 'invoice'             // Invoice emails
  | 'quote_request'       // RFQ responses
  | 'shipment_notification' // Status updates
  | 'booking_confirmation'  // Booking confirmations
  | 'general_message'     // General purpose
```

### Variable Substitution Syntax

Email templates use **double braces** `{{variable}}` (different from PDF!).

```html
<!-- Simple variable -->
<p>Dear {{contactName}},</p>
<p>Your offer number is: {{offerNumber}}</p>

<!-- Conditional ({{#if}}) -->
{{#if message}}
<div class="message">
  <p>{{message}}</p>
</div>
{{/if}}

<!-- Loop ({{#each}}) -->
<ul>
{{#each items}}
  <li>{{name}} - {{price}}</li>
{{/each}}
</ul>

<!-- Loop with primitives -->
{{#each tags}}
  <span>{{this}}</span>
{{/each}}

<!-- Index in loop -->
{{#each lines}}
  <p>Item #{{@index}}: {{description}}</p>
{{/each}}
```

### renderEmail Function

Main email rendering function. Loads settings, template, substitutes variables, wraps in branded layout.

```typescript
import { renderEmail } from '@open-mercato/fms/modules/email_templates/lib/template-renderer'

const { subject, html, from, replyTo } = await renderEmail({
  em,
  tenantId,
  organizationId,
  templateType: 'offer',
  variables: {
    contactName: 'John Doe',
    offerNumber: 'OFF-2024-001',
    originPorts: 'Shanghai',
    destPorts: 'Los Angeles',
    validUntil: 'January 31, 2024',
    totalAmount: '$5,000.00',
    message: 'Please review the attached offer.',
  },
})

// Send via Resend
await resend.emails.send({
  from: from || process.env.EMAIL_FROM,
  to: 'customer@example.com',
  subject,
  html,
  reply_to: replyTo,
  attachments: [{ filename: 'offer.pdf', content: pdfBuffer }],
})
```

### Email Layout Wrapper

All templates are automatically wrapped in a responsive HTML layout:
- Header with logo or company name
- Branded colors (primaryColor, accentColor)
- Content area with CSS classes (.details, .details-row, .message, .button)
- Footer with contact links and disclaimer

The wrapper is applied by `buildEmailWrapper()` internally.

### Default Templates

Built-in templates in `DEFAULT_TEMPLATES` are used when no custom template exists:
- Professional layouts with branded styling
- Conditional sections for optional fields
- Responsive email design

---

## Unified Settings UI

### Component Hierarchy

```
UnifiedTemplateSettings
├── BrandSettingsTab        - Company name, logo, colors
├── EmailSettingsTab        - Contact info, sender config, template editor
│   ├── EmailTemplateEditor     - Markdown/HTML editor
│   └── EmailTemplateEditorDialog - Modal for template editing
└── PdfSettingsTab          - Links to pdfme designer for each template type
```

### Shared Brand Settings Flow

```typescript
// Load all settings (source: email_settings table)
const { brand, brandDefaults, email } = await loadAllTemplateSettings()

// Save brand settings (syncs to email module)
await syncBrandSettingsToAll(brandSettings)

// Apply brand defaults from registry (auto-populate from x-brand-id)
if (!hasBrandCustomizations(current) && brandDefaults) {
  setBrandSettings(applyBrandDefaults(current, brandDefaults))
}
```

### Brand Defaults

Brand defaults come from the brand registry (via `x-brand-id` header). If user hasn't customized settings, defaults are auto-applied:

```typescript
type BrandDefaults = {
  companyName: string | null
  companyLogoUrl: string | null  // data URI
  primaryColor: string
  accentColor: string
}
```

---

## API Endpoints

### PDF Templates

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pdf_templates/pdfme?type=offer` | Get template by type (or default) |
| PUT | `/api/pdf_templates/pdfme` | Create/update template |
| DELETE | `/api/pdf_templates/pdfme?type=offer` | Delete (revert to default) |
| POST | `/api/pdf_templates/pdfme/generate` | Generate PDF from template |

**Generate Request:**
```json
{
  "templateType": "offer",
  "inputs": [{
    "companyName": "Acme Corp",
    "offerNumber": "OFF-001"
  }]
}
```

### Email Templates

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/email_templates/settings` | Get email settings |
| PUT | `/api/email_templates/settings` | Update email settings |
| GET | `/api/email_templates/templates` | List all templates |
| GET | `/api/email_templates/templates?type=offer` | Get specific template |
| PUT | `/api/email_templates/templates` | Create/update template |
| DELETE | `/api/email_templates/templates?type=offer` | Delete template |

---

## ACL / Permissions

### PDF Templates (`pdf_templates/acl.ts`)

| Feature | Description |
|---------|-------------|
| `pdf_templates.view` | View PDF templates |
| `pdf_templates.manage` | Create/edit/delete PDF templates |

### Email Templates (`email_templates/acl.ts`)

| Feature | Description |
|---------|-------------|
| `email_templates.view` | View email templates |
| `email_templates.manage` | Create/edit/delete email templates |
| `email_templates.settings.view` | View email settings |
| `email_templates.settings.manage` | Modify email settings |

### Default Role Features (`setup.ts`)

Both modules grant:
- **admin**: All features
- **employee**: View-only

---

## File Structure

```
pdf_templates/
├── __integration__/          # Integration tests
│   ├── helpers/
│   ├── TC-PT-008.spec.ts     # pdfme generation tests
│   ├── TC-PT-009.spec.ts
│   └── TC-PT-010.spec.ts
├── api/
│   ├── pdfme/
│   │   ├── route.ts          # CRUD for pdfme templates
│   │   └── generate/route.ts # PDF generation endpoint
│   └── utils.ts
├── backend/
│   └── pdf-designer/
│       ├── page.tsx          # Designer page (server)
│       └── page.meta.ts      # Page metadata
├── components/
│   ├── PdfDesignerClient.tsx # Designer client wrapper
│   └── PdfmeDesigner.tsx     # React wrapper for @pdfme/ui
├── data/
│   ├── entities.ts           # PdfmeTemplate entity
│   └── validators.ts         # Zod schemas
├── i18n/                     # Translations
├── lib/
│   ├── __tests__/            # Unit tests
│   ├── default-pdfme-templates.ts # Built-in templates
│   ├── logo-utils.ts         # Logo handling
│   ├── offer-variable-mapper.ts   # Maps offer → inputs
│   └── pdfme-generator.ts    # PDF generation functions
├── migrations/
├── acl.ts                    # Feature permissions
├── index.ts                  # Module exports
├── README.md
└── setup.ts                  # Role default features

email_templates/
├── __integration__/
│   ├── helpers/
│   └── TC-ET-003.spec.ts
├── api/
│   ├── settings/route.ts     # Email settings CRUD
│   ├── templates/route.ts    # Email templates CRUD
│   └── utils.ts
├── backend/
│   └── config/
│       └── templates/
│           ├── page.tsx      # Unified settings page
│           └── page.meta.ts
├── commands/
│   ├── email-settings.ts     # loadEmailSettings
│   └── email-templates.ts    # loadEmailTemplate
├── components/
│   ├── BrandSettingsTab.tsx
│   ├── EmailSettingsTab.tsx
│   ├── EmailTemplateEditor.tsx
│   ├── EmailTemplateEditorDialog.tsx
│   ├── EmailTemplateSettings.tsx
│   ├── PdfSettingsTab.tsx
│   ├── TemplateFieldPicker.tsx
│   └── UnifiedTemplateSettings.tsx
├── data/
│   ├── entities.ts           # EmailTemplate, EmailSettings
│   └── validators.ts
├── i18n/
├── lib/
│   ├── __tests__/
│   ├── logo-utils.ts
│   ├── shared-brand-settings.ts  # Brand settings utilities
│   ├── template-fields.ts        # Field definitions per type
│   ├── template-renderer.client.ts # Client-side preview
│   └── template-renderer.ts      # Server-side rendering
├── migrations/
├── acl.ts
├── index.ts
├── README.md
└── setup.ts
```

---

## Common Patterns & Gotchas

### 1. Placeholder Syntax Difference

| Module | Syntax | Example |
|--------|--------|---------|
| PDF (pdfme) | Single braces | `{offerNumber}` |
| Email | Double braces | `{{offerNumber}}` |

### 2. Input Sanitization (PDF)

Always use `sanitizeInputs()` or let `generatePdfBuffer()` handle it. Objects passed as inputs cause `[object Object]` in PDFs.

```typescript
// ❌ WRONG - passing object
const inputs = [{ routes: offer.routes }]  // [object Object] in PDF

// ✅ CORRECT - pre-format to strings
const inputs = [{ routesContent: formatRoutesContent(offer.routes) }]
```

### 3. readOnly Flag (PDF)

Elements with `content` must have `readOnly: true` for pdfme's `replacePlaceholders()` to work. Use `normalizeTemplateForSave()` before saving.

### 4. Brand Settings Source

Brand settings live in `fms_email_settings` table. PDF templates read from there via `settingsToBranding()`.

### 5. Template Fallback

If no custom template exists, default templates are used:
- PDF: `getDefaultPdfmeTemplate('offer')`
- Email: `DEFAULT_TEMPLATES[templateType]`

### 6. Conditional Content (Email)

Values are considered "falsy" and hidden with `{{#if}}`:
- `undefined`, `null`
- Empty string `""`
- `false` or `"false"`
- `0` or `"0"`

---

## Testing

### Integration Tests

Located in `__integration__/` directories:

**PDF Templates:**
- `TC-PT-008.spec.ts` - Template CRUD operations
- `TC-PT-009.spec.ts` - PDF generation with variables
- `TC-PT-010.spec.ts` - Template normalization and placeholder handling

**Email Templates:**
- `TC-ET-003.spec.ts` - Email rendering with settings and templates

### Test Helpers

```
__integration__/helpers/
├── setup.ts          # Test database setup
├── fixtures.ts       # Sample data
└── utils.ts          # Helper functions
```

### Running Tests

```bash
# Run all template tests
yarn test --grep "pdf_templates|email_templates"

# Run specific test file
yarn test packages/fms/src/modules/pdf_templates/__integration__/TC-PT-008.spec.ts
```

---

## Checklist for New Template Types

### Adding PDF Template Type

1. Add type to `pdfTemplateTypes` in `data/validators.ts`
2. Add type to `PdfTemplateType` union in `data/entities.ts`
3. Create default template in `lib/default-pdfme-templates.ts`
4. Add variable mapper if needed (like `mapOfferToInputs`)
5. Add to valid types check in `backend/pdf-designer/page.tsx`
6. Add translations in `i18n/`

### Adding Email Template Type

1. Add type to `emailTemplateTypes` in `data/validators.ts`
2. Add type to `EmailTemplateType` union in `data/entities.ts`
3. Add default template in `DEFAULT_TEMPLATES` (template-renderer.ts)
4. Document variables in README.md
5. Add translations in `i18n/`

---

## Migrations

Both modules have migrations in `migrations/` directories:

- `pdf_templates/migrations/` - Creates `fms_pdfme_templates` table
- `email_templates/migrations/` - Creates `fms_email_settings` and `fms_email_templates` tables

Run migrations:
```bash
cd apps/mercato
yarn db:migrate
```
