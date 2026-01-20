# Email Templates Module

This module provides a flexible email templating system for sending branded, customizable transactional emails.

## Features

- **Centralized Email Settings**: Configure company branding, colors, contact info, and sender defaults per tenant/organization
- **Template Management**: Create and manage HTML email templates for different types of emails
- **Variable Substitution**: Use `{{variableName}}` syntax to inject dynamic data
- **Default Templates**: Built-in templates for common email types with professional layouts
- **Theme Support**: Customize colors, logos, and footer content
- **Multi-Tenant**: Fully scoped to tenant and organization for white-label support

## Template Types

1. **offer** - Freight offer emails with pricing and route details
2. **invoice** - Invoice emails with payment information
3. **quote_request** - Quote request responses
4. **shipment_notification** - Shipment status updates
5. **booking_confirmation** - Booking confirmations
6. **general_message** - General purpose communications

## Configuration

### Access Settings

Navigate to **Backend → Configuration → Email Templates** to configure:

#### Email Settings Tab
- Company branding (name, logo URL, colors)
- Contact information (email, phone, website)
- Sender defaults (from name, from email, reply-to)
- Footer text and disclaimers

#### Template Tabs
Each template type has its own tab where you can customize:
- Email subject line (with variable support)
- HTML email body (with variable support)
- Active/inactive status

## Usage

### Basic Usage

```typescript
import { renderEmail } from '@open-mercato/fms/modules/email_templates/lib/template-renderer'
import type { EntityManager } from '@mikro-orm/postgresql'

// Inside a command or API handler
async function sendOfferEmail(em: EntityManager, tenantId: string, organizationId: string) {
  const rendered = await renderEmail({
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

  // rendered.subject - The email subject
  // rendered.html - The full HTML email
  // rendered.from - Optional from address from settings
  // rendered.replyTo - Optional reply-to address from settings

  // Send via Resend, SendGrid, or your email service
  await resend.emails.send({
    from: rendered.from || 'no-reply@example.com',
    to: 'customer@example.com',
    subject: rendered.subject,
    html: rendered.html,
    reply_to: rendered.replyTo,
  })
}
```

### Available Variables

Common variables supported across all templates:
- `{{companyName}}` - From email settings or variable
- `{{contactName}}` - Recipient name
- `{{primaryColor}}` - From email settings
- `{{accentColor}}` - From email settings

Template-specific variables:

**Offer Template:**
- `{{offerNumber}}`, `{{originPorts}}`, `{{destPorts}}`, `{{validUntil}}`, `{{totalAmount}}`, `{{message}}`

**Invoice Template:**
- `{{invoiceNumber}}`, `{{dueDate}}`, `{{totalAmount}}`

**Quote Request Template:**
- `{{quoteNumber}}`, `{{validUntil}}`

**Shipment Notification Template:**
- `{{shipmentNumber}}`, `{{status}}`, `{{currentLocation}}`, `{{message}}`

**Booking Confirmation Template:**
- `{{bookingNumber}}`, `{{bookingDate}}`

**General Message Template:**
- `{{message}}`

### Customizing Templates

Templates use a simple `{{variableName}}` syntax for substitution. You can include HTML formatting:

```html
<p>Dear {{contactName}},</p>

<div class="details">
  <div class="details-row">
    <span class="details-label">Order Number:</span>
    <span class="details-value">{{orderNumber}}</span>
  </div>
</div>

<p>Your total is <strong>{{totalAmount}}</strong>.</p>
```

#### Conditional Sections

You can use `{{#if variable}}...{{/if}}` to conditionally include content:

```html
{{#if message}}
<div class="message">
  <p>{{message}}</p>
</div>
{{/if}}
```

The content inside the conditional will only be shown if the variable:
- Exists (is not `undefined` or `null`)
- Is not an empty string (`""`)
- Is not `false` or `"false"`
- Is not `0` or `"0"`

#### Loops

You can use `{{#each array}}...{{/each}}` to loop over arrays:

```html
<table>
  <thead>
    <tr>
      <th>Description</th>
      <th>Quantity</th>
      <th>Price</th>
    </tr>
  </thead>
  <tbody>
    {{#each lines}}
    <tr>
      <td>{{description}}</td>
      <td>{{quantity}}</td>
      <td>{{unitPrice}}</td>
    </tr>
    {{/each}}
  </tbody>
</table>
```

Inside loops you can use:
- `{{propertyName}}` - Access object properties
- `{{this}}` - The item itself (for primitive arrays like strings/numbers)
- `{{@index}}` - The current index (0-based)

**Example with primitive array:**
```html
<ul>
{{#each tags}}
  <li>{{this}}</li>
{{/each}}
</ul>
```

**Example with index:**
```html
{{#each items}}
  <p>Item #{{@index}}: {{name}}</p>
{{/each}}
```

The template renderer will:
1. Load your custom template (or use the default if not configured)
2. Merge email settings into variables
3. Process conditional `{{#if}}` blocks
4. Substitute all `{{variable}}` placeholders
5. Wrap the content in a professional email layout with header, footer, and branding

### Email Layout Wrapper

All templates are automatically wrapped in a responsive HTML layout that includes:
- Header with company logo or name
- Branded colors from settings
- Responsive content area
- Footer with contact links and disclaimer
- Mobile-friendly design

## API Endpoints

### Get Email Settings
```
GET /api/email_templates/settings
```

Returns current email settings for the organization.

### Update Email Settings
```
PUT /api/email_templates/settings
Content-Type: application/json

{
  "companyName": "ACME Freight",
  "primaryColor": "#1a365d",
  "contactEmail": "support@acme.com",
  ...
}
```

### Get Templates
```
GET /api/email_templates/templates
```

Returns all templates for the organization.

```
GET /api/email_templates/templates?type=offer
```

Returns a specific template type.

### Update Template
```
PUT /api/email_templates/templates
Content-Type: application/json

{
  "templateType": "offer",
  "subjectTemplate": "Your Freight Offer {{offerNumber}}",
  "htmlTemplate": "<p>Dear {{contactName}},</p>...",
  "isActive": true
}
```

### Delete Template
```
DELETE /api/email_templates/templates?type=offer
```

Deletes a custom template (will revert to default).

## Database Schema

### `fms_email_settings`
- Unique per (organization_id, tenant_id)
- Stores branding, colors, contact info, sender defaults

### `fms_email_templates`
- Unique per (organization_id, tenant_id, template_type)
- Stores custom subject and HTML templates
- `is_active` flag to enable/disable

## Permissions

Required features:
- `email_templates.view` - View templates
- `email_templates.manage` - Create/edit/delete templates
- `email_templates.settings.view` - View email settings
- `email_templates.settings.manage` - Modify email settings

## Example: Updating offer-operations.ts

The `offer-operations.ts` command now uses the template renderer:

```typescript
// Render email from template
const { renderEmail } = await import('@open-mercato/fms/modules/email_templates/lib/template-renderer')
const renderedEmail = await renderEmail({
  em,
  tenantId,
  organizationId: orgId,
  templateType: 'offer',
  variables: {
    contactName,
    offerNumber: offer.offerNumber,
    originPorts,
    destPorts,
    validUntil: validUntilText,
    totalAmount: formattedTotal,
    message: parsed.message || '',
  },
})

await resend.emails.send({
  from: renderedEmail.from || process.env.EMAIL_FROM,
  to: contact.email,
  subject: renderedEmail.subject,
  html: renderedEmail.html,
  reply_to: renderedEmail.replyTo,
  attachments: [{ filename: 'offer.pdf', content: pdfBuffer }],
})
```

## Future Enhancements

Potential improvements:
- Rich text editor for template editing
- Template preview functionality
- Support for attachments in template metadata
- Email send history and tracking
- A/B testing support
- Localization per template
- Conditional blocks (e.g., `{{#if variable}}...{{/if}}`)
