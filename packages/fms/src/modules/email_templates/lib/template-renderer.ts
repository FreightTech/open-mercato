import type { EntityManager } from '@mikro-orm/postgresql'
import { loadEmailSettings } from '../commands/email-settings'
import { loadEmailTemplate } from '../commands/email-templates'
import type { EmailTemplateType } from '../data/entities'

type TemplateVariables = Record<string, any>

/**
 * Escapes HTML special characters to prevent XSS
 */
function escapeHtml(str: string | null | undefined): string {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Renders a template string by replacing {{variableName}} with values from the variables object
 * Also supports {{#if variable}}...{{/if}} conditionals and {{#each array}}...{{/each}} loops
 */
function renderTemplate(template: string, variables: TemplateVariables): string {
  let rendered = template

  // Handle {{#each array}}...{{/each}} loops
  rendered = rendered.replace(/\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, key, content) => {
    const array = variables[key]
    if (!Array.isArray(array) || array.length === 0) {
      return ''
    }
    
    return array.map((item: any, index: number) => {
      let itemContent = content
      
      // Replace {{this}} with the item itself (for primitive arrays)
      itemContent = itemContent.replace(/\{\{this\}\}/g, String(item))
      
      // Replace {{@index}} with the current index
      itemContent = itemContent.replace(/\{\{@index\}\}/g, String(index))
      
      // Replace {{propertyName}} with item properties (for object arrays)
      if (typeof item === 'object' && item !== null) {
        itemContent = itemContent.replace(/\{\{(\w+)\}\}/g, (m: string, prop: string) => {
          return item[prop] !== undefined && item[prop] !== null ? String(item[prop]) : m
        })
      }
      
      return itemContent
    }).join('')
  })

  // Handle {{#if variable}}...{{/if}} conditionals
  rendered = rendered.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, key, content) => {
    const value = variables[key]
    // Show content if value exists and is truthy
    if (value && value !== '' && value !== 'false' && value !== '0') {
      return content
    }
    return ''
  })

  // Handle {{variable}} replacements
  rendered = rendered.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = variables[key]
    return value !== undefined && value !== null ? String(value) : match
  })

  return rendered
}

/**
 * Builds the default email HTML wrapper with branding and layout
 */
function buildEmailWrapper(
  content: string,
  options: {
    companyName?: string | null
    companyLogoUrl?: string | null
    primaryColor?: string
    accentColor?: string
    contactEmail?: string | null
    contactPhone?: string | null
    websiteUrl?: string | null
    footerText?: string | null
    footerDisclaimer?: string | null
  }
): string {
  const {
    companyName = 'Open Mercato',
    companyLogoUrl,
    primaryColor = '#1a365d',
    accentColor = '#f7fafc',
    contactEmail,
    contactPhone,
    websiteUrl,
    footerText,
    footerDisclaimer,
  } = options

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: #333;
      line-height: 1.6;
      margin: 0;
      padding: 0;
      background-color: #f5f5f5;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    .header {
      background-color: ${primaryColor};
      color: #ffffff;
      padding: 20px;
      text-align: center;
    }
    .header img {
      max-width: 200px;
      height: auto;
    }
    .header h1 {
      margin: 10px 0 0;
      font-size: 24px;
      font-weight: 600;
    }
    .content {
      padding: 30px 20px;
    }
    .details {
      background: ${accentColor};
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
    }
    .details-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .details-label {
      color: #718096;
      font-weight: 500;
    }
    .details-value {
      font-weight: 600;
      color: #2d3748;
    }
    .message {
      background: #fff;
      border-left: 4px solid ${primaryColor};
      padding: 15px;
      margin: 20px 0;
    }
    .button {
      display: inline-block;
      background-color: ${primaryColor};
      color: #ffffff;
      padding: 12px 24px;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      margin: 10px 0;
    }
    .footer {
      background-color: #f7fafc;
      color: #718096;
      font-size: 12px;
      padding: 20px;
      text-align: center;
      border-top: 1px solid #e2e8f0;
    }
    .footer-links {
      margin: 10px 0;
    }
    .footer-links a {
      color: ${primaryColor};
      text-decoration: none;
      margin: 0 10px;
    }
    .disclaimer {
      margin-top: 15px;
      font-size: 11px;
      color: #a0aec0;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      ${companyLogoUrl ? `<img src="${escapeHtml(companyLogoUrl)}" alt="${escapeHtml(companyName)}">` : `<h1>${escapeHtml(companyName)}</h1>`}
    </div>
    
    <div class="content">
      ${content}
    </div>
    
    <div class="footer">
      ${
        contactEmail || contactPhone || websiteUrl
          ? `
      <div class="footer-links">
        ${contactEmail ? `<a href="mailto:${escapeHtml(contactEmail)}">${escapeHtml(contactEmail)}</a>` : ''}
        ${contactPhone ? `<span>${escapeHtml(contactPhone)}</span>` : ''}
        ${websiteUrl ? `<a href="${escapeHtml(websiteUrl)}">${escapeHtml(websiteUrl)}</a>` : ''}
      </div>
      `
          : ''
      }
      ${footerText ? `<p>${escapeHtml(footerText)}</p>` : ''}
      ${
        footerDisclaimer
          ? `<p class="disclaimer">${escapeHtml(footerDisclaimer)}</p>`
          : '<p class="disclaimer">This email was sent from an automated system. Please do not reply directly to this email.</p>'
      }
    </div>
  </div>
</body>
</html>
`.trim()
}

/**
 * Default email templates for each type
 */
const DEFAULT_TEMPLATES: Record<EmailTemplateType, { subject: string; html: string }> = {
  offer: {
    subject: 'Freight Offer {{offerNumber}} - {{originPorts}} to {{destPorts}}',
    html: `
      <p>Dear {{contactName}},</p>
      <p>Please find attached our freight offer for your shipment.</p>
      <div class="details">
        <div class="details-row">
          <span class="details-label">Route:</span>
          <span class="details-value">{{originPorts}} → {{destPorts}}</span>
        </div>
        <div class="details-row">
          <span class="details-label">Valid Until:</span>
          <span class="details-value">{{validUntil}}</span>
        </div>
        <div class="details-row">
          <span class="details-label">Total Amount:</span>
          <span class="details-value" style="font-size: 24px; color: {{primaryColor}};">{{totalAmount}}</span>
        </div>
      </div>
      {{#if message}}
      <div class="message">
        <p>{{message}}</p>
      </div>
      {{/if}}
      <p>The detailed offer is attached as a PDF document.</p>
      <p>If you have any questions, please don't hesitate to contact us.</p>
      <p>Best regards,<br>{{companyName}}</p>
    `,
  },
  invoice: {
    subject: 'Invoice {{invoiceNumber}} from {{companyName}}',
    html: `
      <p>Dear {{contactName}},</p>
      <p>Please find attached invoice {{invoiceNumber}}.</p>
      <div class="details">
        <div class="details-row">
          <span class="details-label">Invoice Number:</span>
          <span class="details-value">{{invoiceNumber}}</span>
        </div>
        <div class="details-row">
          <span class="details-label">Due Date:</span>
          <span class="details-value">{{dueDate}}</span>
        </div>
        <div class="details-row">
          <span class="details-label">Amount Due:</span>
          <span class="details-value" style="font-size: 24px; color: {{primaryColor}};">{{totalAmount}}</span>
        </div>
      </div>
      <p>Payment can be made via the methods specified in the attached invoice.</p>
      <p>Thank you for your business.</p>
      <p>Best regards,<br>{{companyName}}</p>
    `,
  },
  quote_request: {
    subject: 'RFQ: {{rfqTitle}} - Response',
    html: `
      <p>Dear {{contactName}},</p>
      <p>Thank you for your request for quotation. We have prepared a quotation for your requirements.</p>
      <div class="details">
        <div class="details-row">
          <span class="details-label">RFQ:</span>
          <span class="details-value">{{rfqTitle}}</span>
        </div>
        <div class="details-row">
          <span class="details-label">Valid Until:</span>
          <span class="details-value">{{validUntil}}</span>
        </div>
      </div>
      <p>Please review the attached quotation and let us know if you have any questions.</p>
      <p>Best regards,<br>{{companyName}}</p>
    `,
  },
  shipment_notification: {
    subject: 'Shipment Update: {{shipmentNumber}}',
    html: `
      <p>Dear {{contactName}},</p>
      <p>This is an update regarding your shipment {{shipmentNumber}}.</p>
      <div class="details">
        <div class="details-row">
          <span class="details-label">Status:</span>
          <span class="details-value">{{status}}</span>
        </div>
        <div class="details-row">
          <span class="details-label">Current Location:</span>
          <span class="details-value">{{currentLocation}}</span>
        </div>
      </div>
      {{#if message}}
      <div class="message">
        <p>{{message}}</p>
      </div>
      {{/if}}
      <p>You can track your shipment using the tracking number provided.</p>
      <p>Best regards,<br>{{companyName}}</p>
    `,
  },
  booking_confirmation: {
    subject: 'Booking Confirmation {{bookingNumber}}',
    html: `
      <p>Dear {{contactName}},</p>
      <p>Your booking has been confirmed.</p>
      <div class="details">
        <div class="details-row">
          <span class="details-label">Booking Number:</span>
          <span class="details-value">{{bookingNumber}}</span>
        </div>
        <div class="details-row">
          <span class="details-label">Date:</span>
          <span class="details-value">{{bookingDate}}</span>
        </div>
      </div>
      <p>Please find the booking details in the attachment.</p>
      <p>Best regards,<br>{{companyName}}</p>
    `,
  },
  general_message: {
    subject: 'Message from {{companyName}}',
    html: `
      <p>Dear {{contactName}},</p>
      {{#if message}}
      <div class="message">
        <p>{{message}}</p>
      </div>
      {{/if}}
      <p>Best regards,<br>{{companyName}}</p>
    `,
  },
}

/**
 * Renders an email using a template
 */
export async function renderEmail(params: {
  em: EntityManager
  tenantId: string
  organizationId: string
  templateType: EmailTemplateType
  variables: TemplateVariables
}): Promise<{ subject: string; html: string; from?: string; replyTo?: string }> {
  const { em, tenantId, organizationId, templateType, variables } = params

  // Load settings
  const settings = await loadEmailSettings(em, { tenantId, organizationId })

  // Load template
  const template = await loadEmailTemplate(em, { tenantId, organizationId, templateType })

  // Use custom template or default
  const subjectTemplate =
    template?.subjectTemplate || DEFAULT_TEMPLATES[templateType].subject
  const htmlTemplate = template?.htmlTemplate || DEFAULT_TEMPLATES[templateType].html

  // Merge settings into variables
  const mergedVariables = {
    ...variables,
    companyName: settings?.companyName || variables.companyName || 'Open Mercato',
    primaryColor: settings?.primaryColor || '#1a365d',
    accentColor: settings?.accentColor || '#f7fafc',
  }

  // Render subject
  const subject = renderTemplate(subjectTemplate, mergedVariables)

  // Render content
  const content = renderTemplate(htmlTemplate, mergedVariables)

  // Wrap in email layout
  const html = buildEmailWrapper(content, {
    companyName: settings?.companyName,
    companyLogoUrl: settings?.companyLogoUrl,
    primaryColor: settings?.primaryColor,
    accentColor: settings?.accentColor,
    contactEmail: settings?.contactEmail,
    contactPhone: settings?.contactPhone,
    websiteUrl: settings?.websiteUrl,
    footerText: settings?.footerText,
    footerDisclaimer: settings?.footerDisclaimer,
  })

  return {
    subject,
    html,
    from: settings?.fromEmail ? `${settings.fromName || settings.companyName || 'Open Mercato'} <${settings.fromEmail}>` : undefined,
    replyTo: settings?.replyToEmail || undefined,
  }
}

/**
 * Helper to get template defaults for preview
 */
export function getDefaultTemplate(templateType: EmailTemplateType) {
  return DEFAULT_TEMPLATES[templateType]
}
