# PDF Templates Module

This module provides a customizable PDF template system for generating professional PDFs from HTML/CSS templates, similar to the email templates module.

## Features

- **Database-driven templates**: Store custom HTML/CSS templates per organization/tenant
- **Default templates**: Professional built-in templates for freight offers
- **Template variables**: Handlebars-like syntax with support for conditionals and loops
- **Multi-tenant**: Unique templates and settings per organization/tenant
- **Backward compatible**: Existing PDFs continue working with legacy renderers
- **Puppeteer-based**: High-quality HTML to PDF conversion

## Installation

### 1. Install Dependencies

The puppeteer dependency should already be installed. If not:

```bash
cd /path/to/open-mercato
yarn install
```

### 2. Register the Module

The module has been registered in `apps/mercato/src/modules.ts`:

```typescript
{ id: 'pdf_templates', from: '@open-mercato/fms' },
```

### 3. Run Database Migration

**Option A: Standard Migration (if no conflicts)**

```bash
cd apps/mercato
yarn db:migrate
```

**Option B: Manual SQL Migration (if conflicts exist)**

If you encounter migration conflicts, run the SQL directly:

```sql
-- Create PDF settings table
CREATE TABLE "fms_pdf_settings" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "company_name" text NULL,
  "company_logo_url" text NULL,
  "primary_color" text NOT NULL DEFAULT '#1a365d',
  "accent_color" text NOT NULL DEFAULT '#f7fafc',
  "header_html" text NULL,
  "footer_html" text NULL,
  "show_page_numbers" boolean NOT NULL DEFAULT true,
  "default_page_size" text NOT NULL DEFAULT 'A4',
  "default_page_orientation" text NOT NULL DEFAULT 'portrait',
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "fms_pdf_settings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "fms_pdf_settings" 
  ADD CONSTRAINT "fms_pdf_settings_scope_unique" 
  UNIQUE ("organization_id", "tenant_id");

-- Create PDF templates table
CREATE TABLE "fms_pdf_templates" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "template_type" text NOT NULL,
  "html_template" text NOT NULL,
  "css_styles" text NULL,
  "page_size" text NOT NULL DEFAULT 'A4',
  "page_orientation" text NOT NULL DEFAULT 'portrait',
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL,
  CONSTRAINT "fms_pdf_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fms_pdf_templates_org_tenant_idx" 
  ON "fms_pdf_templates" ("organization_id", "tenant_id");

ALTER TABLE "fms_pdf_templates" 
  ADD CONSTRAINT "fms_pdf_templates_scope_type_unique" 
  UNIQUE ("organization_id", "tenant_id", "template_type");

-- Record migration
INSERT INTO mikro_orm_migrations_pdf_templates (name, executed_at)
VALUES ('Migration20260124000000', NOW());
```

**Option C: Check if tables already exist**

```sql
SELECT tablename FROM pg_tables 
WHERE tablename LIKE 'fms_pdf%' 
ORDER BY tablename;
```

If the tables already exist, you're all set!

## Usage

### API Endpoints

#### PDF Settings
- `GET /api/pdf_templates/settings` - Get PDF branding settings
- `PUT /api/pdf_templates/settings` - Update PDF branding settings

#### PDF Templates
- `GET /api/pdf_templates/templates` - List all templates
- `GET /api/pdf_templates/templates?type=offer` - Get specific template
- `PUT /api/pdf_templates/templates` - Create/update custom template
- `DELETE /api/pdf_templates/templates?type=offer` - Delete custom template

#### Preview
- `GET /api/pdf_templates/preview?type=offer` - Preview default template with sample data
- `POST /api/pdf_templates/preview` - Preview custom template

### Programmatic Usage

#### Generate PDF from Offer

```typescript
import { generateOfferPdf } from '@open-mercato/fms/modules/fms_quotes/lib/offer-pdf.service'

const pdfBuffer = await generateOfferPdf(offerId, em, {
  tenantId: 'tenant-uuid',
  organizationId: 'org-uuid'
})
```

The function automatically:
1. Checks for custom template
2. Uses template-based generation if custom template exists
3. Falls back to legacy React PDF renderer if no custom template

## Template Types

### Supported Template Types

1. **offer** - Freight offer documents

### Template Variables

Each template type has specific variables available. See `lib/template-fields.ts` for complete list.

#### Common Variables (all templates)
- `{{companyName}}` - Company name from settings
- `{{companyLogoUrl}}` - Company logo URL
- `{{primaryColor}}` - Primary brand color
- `{{accentColor}}` - Accent color
- `{{currentDate}}` - Current date

#### Offer Variables
- `{{offerNumber}}`, `{{version}}`, `{{status}}`
- `{{clientName}}`, `{{clientTaxId}}`
- `{{originPorts}}`, `{{destPorts}}`
- `{{totalAmount}}`, `{{currencyCode}}`
- `{{lines}}` - Array of line items

#### Template Syntax

**Variables**: `{{variableName}}`

**Conditionals**:
```html
{{#if variable}}
  Content shown if variable is truthy
{{/if}}

{{#if variable}}
  Content if true
{{else}}
  Content if false
{{/if}}
```

**Loops**:
```html
{{#each lines}}
  <tr>
    <td>{{lineNumber}}</td>
    <td>{{description}}</td>
    <td>{{amount}}</td>
  </tr>
{{/each}}
```

## Architecture

The module follows the same pattern as `email_templates`:

```
pdf_templates/
├── data/
│   ├── entities.ts          # PdfTemplate, PdfSettings entities
│   └── validators.ts         # Zod schemas
├── lib/
│   ├── template-renderer.ts  # Core rendering engine
│   ├── template-fields.ts    # Variable definitions
│   └── default-templates.ts  # Built-in HTML/CSS templates
├── commands/
│   ├── pdf-settings.ts       # Settings commands
│   └── pdf-templates.ts      # Template commands
├── api/
│   ├── settings/route.ts     # Settings API
│   ├── templates/route.ts    # Templates API
│   └── preview/route.ts      # Preview API
└── migrations/
    └── Migration20260124000000.ts
```

## Testing

### Preview Default Template

```bash
curl http://localhost:3000/api/pdf_templates/preview?type=offer > offer.html
open offer.html
```

### Test PDF Generation

```typescript
import { previewTemplate, SAMPLE_DATA } from '@open-mercato/fms/modules/pdf_templates'

const html = await previewTemplate({
  templateType: 'offer',
  htmlTemplate: '...your HTML...',
  cssStyles: '...your CSS...',
  variables: SAMPLE_DATA.offer
})
```

## Customization

### Custom Templates

Users can create custom templates via the API or UI (if implemented):

```typescript
const response = await fetch('/api/pdf_templates/templates', {
  method: 'PUT',
  body: JSON.stringify({
    templateType: 'offer',
    htmlTemplate: '<div>Custom HTML with {{variables}}</div>',
    cssStyles: 'body { font-family: Arial; }',
    pageSize: 'A4',
    pageOrientation: 'portrait'
  })
})
```

### Branding Settings

```typescript
const response = await fetch('/api/pdf_templates/settings', {
  method: 'PUT',
  body: JSON.stringify({
    companyName: 'My Company',
    companyLogoUrl: 'https://example.com/logo.png',
    primaryColor: '#0066cc',
    accentColor: '#f0f0f0'
  })
})
```

## Troubleshooting

### Puppeteer Issues

If you encounter Puppeteer errors:

```bash
# Install Chromium manually
cd node_modules/puppeteer
npm install
```

### Migration Conflicts

If migration fails due to existing tables:
1. Check if tables exist: `SELECT * FROM fms_pdf_settings LIMIT 1;`
2. If they exist, the module is already migrated
3. If not, run the manual SQL migration above

### Template Not Applied

The template system only activates when:
1. A custom template exists in the database
2. `tenantId` and `organizationId` are provided
3. Template is marked as `isActive: true`

Otherwise, the legacy renderer is used (backward compatibility).

## Future Enhancements

- [ ] UI component for template editor
- [ ] Template versioning
- [ ] Preview with real data
- [ ] Export/import templates
- [ ] Template marketplace
- [ ] PDF signature support
- [ ] Watermarks
