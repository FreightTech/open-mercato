"use client"

import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Label } from '@open-mercato/ui/primitives/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useOrganizationScopeVersion } from '@/lib/frontend/useOrganizationScope'
import { useT } from '@/lib/i18n/context'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { CodeEditor } from './CodeEditor'
import type { CodeEditorHandle } from './CodeEditor'
import { TemplateFieldPicker } from './TemplateFieldPicker'

type EmailSettings = {
  companyName?: string | null
  companyLogoUrl?: string | null
  primaryColor: string
  accentColor: string
  contactEmail?: string | null
  contactPhone?: string | null
  websiteUrl?: string | null
  footerText?: string | null
  footerDisclaimer?: string | null
  fromName?: string | null
  fromEmail?: string | null
  replyToEmail?: string | null
}

type EmailTemplate = {
  subjectTemplate: string
  htmlTemplate: string
  isActive: boolean
}

type TemplateType = 'offer' | 'invoice' | 'quote_request' | 'shipment_notification' | 'booking_confirmation' | 'general_message'

type TemplateVariables = Record<string, any>

const DEFAULT_SETTINGS: EmailSettings = {
  companyName: '',
  companyLogoUrl: '',
  primaryColor: '#1a365d',
  accentColor: '#f7fafc',
  contactEmail: '',
  contactPhone: '',
  websiteUrl: '',
  footerText: '',
  footerDisclaimer: '',
  fromName: '',
  fromEmail: '',
  replyToEmail: '',
}

const DEFAULT_TEMPLATE: EmailTemplate = {
  subjectTemplate: '',
  htmlTemplate: '',
  isActive: true,
}

const TEMPLATE_TYPES: Array<{ id: TemplateType }> = [
  { id: 'offer' },
  { id: 'invoice' },
  { id: 'quote_request' },
  { id: 'shipment_notification' },
  { id: 'booking_confirmation' },
  { id: 'general_message' },
]

const DEFAULT_TEMPLATE_CONTENT: Record<TemplateType, { subject: string; html: string }> = {
  offer: {
    subject: 'Freight Offer {{offerNumber}} - {{originPorts}} to {{destPorts}}',
    html: `<p>Dear {{contactName}},</p>
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
{{#if lines}}
<h3 style="margin-top: 20px;">Line Items</h3>
<table style="width: 100%; border-collapse: collapse; margin: 10px 0;">
  <thead>
    <tr style="background: #f7fafc;">
      <th style="padding: 8px; text-align: left; border-bottom: 2px solid #e2e8f0;">Description</th>
      <th style="padding: 8px; text-align: center; border-bottom: 2px solid #e2e8f0;">Qty</th>
      <th style="padding: 8px; text-align: right; border-bottom: 2px solid #e2e8f0;">Unit Price</th>
      <th style="padding: 8px; text-align: right; border-bottom: 2px solid #e2e8f0;">Amount</th>
    </tr>
  </thead>
  <tbody>
    {{#each lines}}
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">{{description}}</td>
      <td style="padding: 8px; text-align: center; border-bottom: 1px solid #e2e8f0;">{{quantity}}</td>
      <td style="padding: 8px; text-align: right; border-bottom: 1px solid #e2e8f0;">{{unitPrice}}</td>
      <td style="padding: 8px; text-align: right; border-bottom: 1px solid #e2e8f0;">{{amount}}</td>
    </tr>
    {{/each}}
  </tbody>
</table>
{{/if}}
<p>The detailed offer is attached as a PDF document.</p>
<p>If you have any questions, please don't hesitate to contact us.</p>
<p>Best regards,<br>{{companyName}}</p>`,
  },
  invoice: {
    subject: 'Invoice {{invoiceNumber}} from {{companyName}}',
    html: `<p>Dear {{contactName}},</p>
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
<p>Best regards,<br>{{companyName}}</p>`,
  },
  quote_request: {
    subject: 'Quote Request {{quoteNumber}} - Response',
    html: `<p>Dear {{contactName}},</p>
<p>Thank you for your quote request. We have prepared a quotation for your requirements.</p>
<div class="details">
  <div class="details-row">
    <span class="details-label">Quote Number:</span>
    <span class="details-value">{{quoteNumber}}</span>
  </div>
  <div class="details-row">
    <span class="details-label">Valid Until:</span>
    <span class="details-value">{{validUntil}}</span>
  </div>
</div>
<p>Please review the attached quotation and let us know if you have any questions.</p>
<p>Best regards,<br>{{companyName}}</p>`,
  },
  shipment_notification: {
    subject: 'Shipment Update: {{shipmentNumber}}',
    html: `<p>Dear {{contactName}},</p>
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
<p>Best regards,<br>{{companyName}}</p>`,
  },
  booking_confirmation: {
    subject: 'Booking Confirmation {{bookingNumber}}',
    html: `<p>Dear {{contactName}},</p>
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
<p>Best regards,<br>{{companyName}}</p>`,
  },
  general_message: {
    subject: 'Message from {{companyName}}',
    html: `<p>Dear {{contactName}},</p>
{{#if message}}
<div class="message">
  <p>{{message}}</p>
</div>
{{/if}}
<p>Best regards,<br>{{companyName}}</p>`,
  },
}

// Sample data for preview
const SAMPLE_DATA: Record<TemplateType, TemplateVariables> = {
  offer: {
    contactName: 'John Smith',
    clientName: 'ACME Logistics',
    offerNumber: 'OFF-2024-001',
    originPorts: 'Shanghai (CNSHA)',
    destPorts: 'Los Angeles (USLAX)',
    validUntil: 'January 31, 2024',
    totalAmount: '$5,250.00',
    message: 'We are pleased to offer competitive rates for your shipment.',
    companyName: 'FreightTech International',
    primaryColor: '#1a365d',
    lines: [
      { description: 'Ocean Freight - 40ft Container', quantity: '2', unitPrice: '$1,500.00', amount: '$3,000.00' },
      { description: 'Terminal Handling Charge', quantity: '2', unitPrice: '$250.00', amount: '$500.00' },
      { description: 'Documentation Fee', quantity: '1', unitPrice: '$150.00', amount: '$150.00' },
      { description: 'Insurance', quantity: '1', unitPrice: '$600.00', amount: '$600.00' },
    ],
  },
  invoice: {
    contactName: 'Jane Doe',
    invoiceNumber: 'INV-2024-0042',
    dueDate: 'February 15, 2024',
    totalAmount: '$3,750.00',
    companyName: 'FreightTech International',
    primaryColor: '#1a365d',
  },
  quote_request: {
    contactName: 'Michael Chen',
    quoteNumber: 'QTE-2024-0123',
    validUntil: 'February 28, 2024',
    companyName: 'FreightTech International',
    primaryColor: '#1a365d',
  },
  shipment_notification: {
    contactName: 'Sarah Johnson',
    shipmentNumber: 'SHP-2024-0567',
    status: 'In Transit',
    currentLocation: 'Hong Kong Port',
    message: 'Your shipment is on schedule and expected to arrive within 3 days.',
    companyName: 'FreightTech International',
    primaryColor: '#1a365d',
  },
  booking_confirmation: {
    contactName: 'Robert Williams',
    bookingNumber: 'BK-2024-0891',
    bookingDate: 'March 15, 2024',
    companyName: 'FreightTech International',
    primaryColor: '#1a365d',
  },
  general_message: {
    contactName: 'Emily Davis',
    message: 'Thank you for choosing our services. We appreciate your business and look forward to serving you.',
    companyName: 'FreightTech International',
    primaryColor: '#1a365d',
  },
}

export function EmailTemplateSettings() {
  const t = useT()
  const scopeVersion = useOrganizationScopeVersion()
  
  const [settings, setSettings] = React.useState<EmailSettings>(DEFAULT_SETTINGS)
  const [templates, setTemplates] = React.useState<Record<TemplateType, EmailTemplate>>({
    offer: DEFAULT_TEMPLATE,
    invoice: DEFAULT_TEMPLATE,
    quote_request: DEFAULT_TEMPLATE,
    shipment_notification: DEFAULT_TEMPLATE,
    booking_confirmation: DEFAULT_TEMPLATE,
    general_message: DEFAULT_TEMPLATE,
  })
  
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState<'settings' | TemplateType>('settings')
  const [showPreview, setShowPreview] = React.useState(false)
  const [previewHtml, setPreviewHtml] = React.useState('')
  
  const editorRefs = React.useRef<Record<TemplateType, CodeEditorHandle | null>>({
    offer: null,
    invoice: null,
    quote_request: null,
    shipment_notification: null,
    booking_confirmation: null,
    general_message: null,
  })

  const loadSettings = React.useCallback(async () => {
    setLoading(true)
    try {
      const call = await apiCall<EmailSettings>('/api/email_templates/settings')
      if (call.ok && call.result) {
        setSettings({
          ...DEFAULT_SETTINGS,
          ...call.result,
        })
      } else {
        flash(t('email_templates.errors.load_settings', 'Failed to load email settings'), 'error')
      }
    } catch (err) {
      console.error('email_templates.settings.load failed', err)
      flash(t('email_templates.errors.load_settings', 'Failed to load email settings'), 'error')
    } finally {
      setLoading(false)
    }
  }, [t])

  const loadTemplates = React.useCallback(async () => {
    try {
      const call = await apiCall<{
        templates: Record<string, EmailTemplate>
        availableTypes: string[]
      }>('/api/email_templates/templates')
      
      if (call.ok && call.result) {
        const newTemplates = { ...templates }
        for (const type of TEMPLATE_TYPES) {
          if (call.result.templates[type.id]) {
            newTemplates[type.id] = call.result.templates[type.id]
          }
        }
        setTemplates(newTemplates)
      }
    } catch (err) {
      console.error('email_templates.templates.load failed', err)
      flash(t('email_templates.errors.load_templates', 'Failed to load email templates'), 'error')
    }
  }, [t, templates])

  React.useEffect(() => {
    void loadSettings()
    void loadTemplates()
  }, [scopeVersion])

  const handleSettingsChange = <K extends keyof EmailSettings>(
    key: K
  ) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setSettings((prev) => ({ ...prev, [key]: event.target.value }))
  }

  const handleTemplateChange = (
    templateType: TemplateType,
    key: keyof EmailTemplate
  ) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setTemplates((prev) => ({
      ...prev,
      [templateType]: {
        ...prev[templateType],
        [key]: event.target.value,
      },
    }))
  }

  const handleSaveSettings = React.useCallback(async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      const call = await apiCall<EmailSettings>('/api/email_templates/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(settings),
      })
      
      if (call.ok && call.result) {
        setSettings({
          ...DEFAULT_SETTINGS,
          ...call.result,
        })
        flash(t('email_templates.messages.settings_saved', 'Email settings saved successfully'), 'success')
      } else {
        flash(t('email_templates.errors.save_settings', 'Failed to save email settings'), 'error')
      }
    } catch (err) {
      console.error('email_templates.settings.save failed', err)
      flash(t('email_templates.errors.save_settings', 'Failed to save email settings'), 'error')
    } finally {
      setSaving(false)
    }
  }, [settings, t])

  const handleSaveTemplate = React.useCallback(async (templateType: TemplateType) => {
    setSaving(true)
    try {
      const template = templates[templateType]
      const call = await apiCall<EmailTemplate>('/api/email_templates/templates', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          templateType,
          ...template,
        }),
      })
      
      if (call.ok && call.result) {
        setTemplates((prev) => ({
          ...prev,
          [templateType]: call.result!,
        }))
        flash(t('email_templates.messages.template_saved', 'Email template saved successfully'), 'success')
      } else {
        flash(t('email_templates.errors.save_template', 'Failed to save email template'), 'error')
      }
    } catch (err) {
      console.error('email_templates.template.save failed', err)
      flash(t('email_templates.errors.save_template', 'Failed to save email template'), 'error')
    } finally {
      setSaving(false)
    }
  }, [templates, t])

  const handlePasteDefault = React.useCallback((templateType: TemplateType) => {
    const defaultTemplate = DEFAULT_TEMPLATE_CONTENT[templateType]
    setTemplates((prev) => ({
      ...prev,
      [templateType]: {
        subjectTemplate: defaultTemplate.subject,
        htmlTemplate: defaultTemplate.html,
        isActive: true,
      },
    }))
    flash(t('email_templates.messages.default_pasted', 'Default template pasted'), 'info')
  }, [t])

  const handleInsertTag = React.useCallback((templateType: TemplateType, tag: string) => {
    const editor = editorRefs.current[templateType]
    if (editor) {
      editor.insertAtCursor(tag)
    }
  }, [])

  const renderTemplate = React.useCallback((template: string, variables: TemplateVariables): string => {
    let rendered = template

    // Handle {{#each array}}...{{/each}} loops
    rendered = rendered.replace(/\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, key, content) => {
      const array = variables[key]
      if (!Array.isArray(array) || array.length === 0) {
        return ''
      }
      
      return array.map((item, index) => {
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
  }, [])

  const buildEmailWrapper = React.useCallback((content: string): string => {
    const {
      companyName = 'FreightTech International',
      companyLogoUrl,
      primaryColor = '#1a365d',
      accentColor = '#f7fafc',
      contactEmail,
      contactPhone,
      websiteUrl,
      footerText,
      footerDisclaimer,
    } = settings

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
      color: #2d3748;
      font-weight: 600;
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
      ${companyLogoUrl ? `<img src="${companyLogoUrl}" alt="${companyName}">` : `<h1>${companyName}</h1>`}
    </div>
    
    <div class="content">
      ${content}
    </div>
    
    <div class="footer">
      ${
        contactEmail || contactPhone || websiteUrl
          ? `
      <div class="footer-links">
        ${contactEmail ? `<a href="mailto:${contactEmail}">${contactEmail}</a>` : ''}
        ${contactPhone ? `<span>${contactPhone}</span>` : ''}
        ${websiteUrl ? `<a href="${websiteUrl}">${websiteUrl}</a>` : ''}
      </div>
      `
          : ''
      }
      ${footerText ? `<p>${footerText}</p>` : ''}
      ${
        footerDisclaimer
          ? `<p class="disclaimer">${footerDisclaimer}</p>`
          : '<p class="disclaimer">This email was sent from an automated system. Please do not reply directly to this email.</p>'
      }
    </div>
  </div>
</body>
</html>
`.trim()
  }, [settings])

  const handlePreview = React.useCallback((templateType: TemplateType) => {
    const template = templates[templateType]
    const sampleData = SAMPLE_DATA[templateType]
    
    // Merge settings into sample data
    const variables = {
      ...sampleData,
      companyName: settings.companyName || sampleData.companyName,
      primaryColor: settings.primaryColor,
    }

    // Render content with variables
    const renderedContent = renderTemplate(template.htmlTemplate || '', variables)
    
    // Wrap in email layout
    const fullHtml = buildEmailWrapper(renderedContent)
    
    setPreviewHtml(fullHtml)
    setShowPreview(true)
  }, [templates, settings, renderTemplate, buildEmailWrapper])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="settings" className="px-2">
            <span className="truncate block">{t('email_templates.settings.title', 'Settings')}</span>
          </TabsTrigger>
          {TEMPLATE_TYPES.map((type) => (
            <TabsTrigger key={type.id} value={type.id} className="px-2">
              <span className="truncate block" title={t(`email_templates.types.${type.id}.label`)}>
                {t(`email_templates.types.${type.id}.label`)}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('email_templates.settings.title', 'Email Settings')}</CardTitle>
              <CardDescription>
                {t('email_templates.settings.description', 'Configure default email layout and branding')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveSettings} className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">
                    {t('email_templates.settings.branding', 'Branding')}
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="companyName">
                        {t('email_templates.settings.company_name', 'Company Name')}
                      </Label>
                      <Input
                        id="companyName"
                        value={settings.companyName || ''}
                        onChange={handleSettingsChange('companyName')}
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="companyLogoUrl">
                        {t('email_templates.settings.logo_url', 'Logo URL')}
                      </Label>
                      <Input
                        id="companyLogoUrl"
                        type="url"
                        value={settings.companyLogoUrl || ''}
                        onChange={handleSettingsChange('companyLogoUrl')}
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="primaryColor">
                        {t('email_templates.settings.primary_color', 'Primary Color')}
                      </Label>
                      <Input
                        id="primaryColor"
                        type="color"
                        value={settings.primaryColor}
                        onChange={handleSettingsChange('primaryColor')}
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="accentColor">
                        {t('email_templates.settings.accent_color', 'Accent Color')}
                      </Label>
                      <Input
                        id="accentColor"
                        type="color"
                        value={settings.accentColor}
                        onChange={handleSettingsChange('accentColor')}
                        disabled={saving}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">
                    {t('email_templates.settings.contact_info', 'Contact Information')}
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="contactEmail">
                        {t('email_templates.settings.contact_email', 'Contact Email')}
                      </Label>
                      <Input
                        id="contactEmail"
                        type="email"
                        value={settings.contactEmail || ''}
                        onChange={handleSettingsChange('contactEmail')}
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contactPhone">
                        {t('email_templates.settings.contact_phone', 'Contact Phone')}
                      </Label>
                      <Input
                        id="contactPhone"
                        value={settings.contactPhone || ''}
                        onChange={handleSettingsChange('contactPhone')}
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="websiteUrl">
                        {t('email_templates.settings.website_url', 'Website URL')}
                      </Label>
                      <Input
                        id="websiteUrl"
                        type="url"
                        value={settings.websiteUrl || ''}
                        onChange={handleSettingsChange('websiteUrl')}
                        disabled={saving}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">
                    {t('email_templates.settings.sender_defaults', 'Sender Defaults')}
                  </h3>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="fromName">
                        {t('email_templates.settings.from_name', 'From Name')}
                      </Label>
                      <Input
                        id="fromName"
                        value={settings.fromName || ''}
                        onChange={handleSettingsChange('fromName')}
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fromEmail">
                        {t('email_templates.settings.from_email', 'From Email')}
                      </Label>
                      <Input
                        id="fromEmail"
                        type="email"
                        value={settings.fromEmail || ''}
                        onChange={handleSettingsChange('fromEmail')}
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="replyToEmail">
                        {t('email_templates.settings.reply_to', 'Reply-To Email')}
                      </Label>
                      <Input
                        id="replyToEmail"
                        type="email"
                        value={settings.replyToEmail || ''}
                        onChange={handleSettingsChange('replyToEmail')}
                        disabled={saving}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => loadSettings()} disabled={saving}>
                    {t('email_templates.actions.reset', 'Reset')}
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving
                      ? t('email_templates.actions.saving', 'Saving...')
                      : t('email_templates.actions.save', 'Save Settings')}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {TEMPLATE_TYPES.map((type) => (
          <TabsContent key={type.id} value={type.id} className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t(`email_templates.types.${type.id}.label`)}</CardTitle>
                <CardDescription>{t(`email_templates.types.${type.id}.description`)}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Subject field - full width */}
                  <div className="space-y-2">
                    <Label htmlFor={`${type.id}-subject`}>
                      {t('email_templates.template.subject', 'Email Subject')}
                    </Label>
                    <Input
                      id={`${type.id}-subject`}
                      value={templates[type.id].subjectTemplate}
                      onChange={handleTemplateChange(type.id, 'subjectTemplate')}
                      disabled={saving}
                      placeholder={t('email_templates.template.subject_placeholder', 'e.g., Your offer {{offerNumber}}')}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('email_templates.template.variables_hint', 'Use {{variableName}} for dynamic values')}
                    </p>
                  </div>

                  {/* HTML editor + Tag picker - 2 columns on desktop, stacked on mobile */}
                  <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
                    <div className="space-y-2 order-2 lg:order-1">
                      <Label htmlFor={`${type.id}-html`}>
                        {t('email_templates.template.html_body', 'Email HTML Template')}
                      </Label>
                      <CodeEditor
                        ref={(el) => { editorRefs.current[type.id] = el }}
                        id={`${type.id}-html`}
                        value={templates[type.id].htmlTemplate}
                        onChange={handleTemplateChange(type.id, 'htmlTemplate')}
                        disabled={saving}
                        rows={15}
                        placeholder={t(
                          'email_templates.template.html_placeholder',
                          'Enter your HTML email template here...'
                        )}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t(
                          'email_templates.template.html_hint',
                          'Click a field from the panel to insert it at your cursor position.'
                        )}
                      </p>
                    </div>
                    
                    <div className="lg:border-l lg:pl-4 order-1 lg:order-2">
                      <TemplateFieldPicker
                        templateType={type.id}
                        onInsertTag={(tag) => handleInsertTag(type.id, tag)}
                        disabled={saving}
                      />
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex justify-between gap-2">
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => handlePasteDefault(type.id)}
                        disabled={saving}
                      >
                        {t('email_templates.actions.paste_default', 'Paste Default')}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => handlePreview(type.id)}
                        disabled={saving}
                      >
                        {t('email_templates.actions.preview', 'Preview')}
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => loadTemplates()}
                        disabled={saving}
                      >
                        {t('email_templates.actions.reset', 'Reset')}
                      </Button>
                      <Button onClick={() => handleSaveTemplate(type.id)} disabled={saving}>
                        {saving
                          ? t('email_templates.actions.saving', 'Saving...')
                          : t('email_templates.actions.save_template', 'Save Template')}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent 
          className="overflow-hidden flex flex-col"
          style={{ maxWidth: '95vw', width: '95vw', maxHeight: '90vh', height: '90vh' }}
        >
          <DialogHeader>
            <DialogTitle>{t('email_templates.preview.title', 'Email Preview')}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto border rounded-md bg-gray-50 p-4">
            <iframe
              srcDoc={previewHtml}
              className="w-full h-full min-h-[700px] bg-white border-0"
              title="Email Preview"
              sandbox="allow-same-origin"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
