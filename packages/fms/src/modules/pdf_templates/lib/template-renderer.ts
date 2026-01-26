import type { EntityManager } from '@mikro-orm/postgresql'
import type { PdfTemplateType, PageSize, PageOrientation } from '../data/entities'
import { getDefaultTemplate } from './default-templates'

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
 * Supports {{#if variable}}...{{/if}} conditionals and {{#each array}}...{{/each}} loops
 */
function renderTemplate(template: string, variables: TemplateVariables): string {
  let rendered = template

  // Handle {{#each array}}...{{/each}} loops
  rendered = rendered.replace(/\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, key, content) => {
    const array = variables[key]
    if (!Array.isArray(array) || array.length === 0) {
      return ''
    }

    return array
      .map((item: any, index: number) => {
        let itemContent = content

        // Replace {{this}} with the item itself (for primitive arrays)
        itemContent = itemContent.replace(/\{\{this\}\}/g, escapeHtml(String(item)))

        // Replace {{@index}} with the current index
        itemContent = itemContent.replace(/\{\{@index\}\}/g, String(index))

        // Replace {{@first}} and {{@last}}
        itemContent = itemContent.replace(/\{\{@first\}\}/g, String(index === 0))
        itemContent = itemContent.replace(/\{\{@last\}\}/g, String(index === array.length - 1))

        // Replace {{propertyName}} with item properties (for object arrays)
        if (typeof item === 'object' && item !== null) {
          itemContent = itemContent.replace(/\{\{(\w+)\}\}/g, (m: string, prop: string) => {
            const val = item[prop]
            return val !== undefined && val !== null ? escapeHtml(String(val)) : ''
          })
        }

        return itemContent
      })
      .join('')
  })

  // Handle {{#if variable}}...{{else}}...{{/if}} conditionals with else
  rendered = rendered.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (match, key, ifContent, elseContent) => {
      const value = variables[key]
      if (value && value !== '' && value !== 'false' && value !== '0' && value !== false) {
        return ifContent
      }
      return elseContent
    }
  )

  // Handle {{#if variable}}...{{/if}} conditionals without else
  rendered = rendered.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, key, content) => {
    const value = variables[key]
    if (value && value !== '' && value !== 'false' && value !== '0' && value !== false) {
      return content
    }
    return ''
  })

  // Handle {{variable}} replacements (escape HTML by default)
  rendered = rendered.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = variables[key]
    return value !== undefined && value !== null ? escapeHtml(String(value)) : ''
  })

  // Handle {{{variable}}} replacements (raw HTML, no escaping)
  rendered = rendered.replace(/\{\{\{(\w+)\}\}\}/g, (match, key) => {
    const value = variables[key]
    return value !== undefined && value !== null ? String(value) : ''
  })

  return rendered
}

/**
 * Builds the full HTML document for PDF generation
 */
function buildPdfHtml(
  content: string,
  cssStyles: string,
  options: {
    companyName?: string | null
    companyLogoUrl?: string | null
    primaryColor?: string
    accentColor?: string
    headerHtml?: string | null
    footerHtml?: string | null
    pageSize?: PageSize
    pageOrientation?: PageOrientation
  }
): string {
  const {
    companyName = 'Open Mercato',
    primaryColor = '#1a365d',
    accentColor = '#f7fafc',
    pageSize = 'A4',
    pageOrientation = 'portrait',
  } = options

  // Replace color variables in CSS
  let processedCss = cssStyles
    .replace(/\{\{primaryColor\}\}/g, primaryColor)
    .replace(/\{\{accentColor\}\}/g, accentColor)

  // Page size dimensions
  const pageSizes: Record<PageSize, { width: string; height: string }> = {
    A4: { width: '210mm', height: '297mm' },
    A3: { width: '297mm', height: '420mm' },
    Letter: { width: '8.5in', height: '11in' },
    Legal: { width: '8.5in', height: '14in' },
  }

  const size = pageSizes[pageSize]
  const width = pageOrientation === 'landscape' ? size.height : size.width
  const height = pageOrientation === 'landscape' ? size.width : size.height

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(companyName)} Document</title>
  <style>
    @page {
      size: ${pageSize} ${pageOrientation};
      margin: 0;
    }
    
    html, body {
      width: ${width};
      min-height: ${height};
      margin: 0;
      padding: 0;
    }
    
    ${processedCss}
  </style>
</head>
<body>
  ${content}
</body>
</html>
`.trim()
}

/**
 * Load PDF settings for an organization/tenant
 */
export async function loadPdfSettings(
  em: EntityManager,
  params: { tenantId: string; organizationId: string }
) {
  const { PdfSettings } = await import('../data/entities')
  
  return em.findOne(PdfSettings, {
    tenantId: params.tenantId,
    organizationId: params.organizationId,
  })
}

/**
 * Load a custom PDF template
 */
export async function loadPdfTemplate(
  em: EntityManager,
  params: { tenantId: string; organizationId: string; templateType: PdfTemplateType }
) {
  const { PdfTemplate } = await import('../data/entities')
  
  return em.findOne(PdfTemplate, {
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    templateType: params.templateType,
    isActive: true,
  })
}

export interface RenderPdfHtmlParams {
  em: EntityManager
  tenantId: string
  organizationId: string
  templateType: PdfTemplateType
  variables: TemplateVariables
}

export interface RenderPdfHtmlResult {
  html: string
  pageSize: PageSize
  pageOrientation: PageOrientation
}

/**
 * Renders a PDF template to HTML
 * This HTML can then be converted to PDF using Puppeteer or similar
 */
export async function renderPdfHtml(params: RenderPdfHtmlParams): Promise<RenderPdfHtmlResult> {
  const { em, tenantId, organizationId, templateType, variables } = params

  // Load settings
  const settings = await loadPdfSettings(em, { tenantId, organizationId })

  // Load custom template or use default
  const customTemplate = await loadPdfTemplate(em, { tenantId, organizationId, templateType })
  const defaultTemplate = getDefaultTemplate(templateType)

  const htmlTemplate = customTemplate?.htmlTemplate || defaultTemplate.htmlTemplate
  const cssStyles = customTemplate?.cssStyles || defaultTemplate.cssStyles
  const pageSize = customTemplate?.pageSize || settings?.defaultPageSize || 'A4'
  const pageOrientation = customTemplate?.pageOrientation || settings?.defaultPageOrientation || 'portrait'

  // Merge settings into variables
  const mergedVariables: TemplateVariables = {
    ...variables,
    companyName: settings?.companyName || variables.companyName || 'Open Mercato',
    companyLogoUrl: settings?.companyLogoUrl || variables.companyLogoUrl,
    primaryColor: settings?.primaryColor || '#1a365d',
    accentColor: settings?.accentColor || '#f7fafc',
    coverPageImageUrl: settings?.coverPageImageUrl || variables.coverPageImageUrl,
    footerHtml: settings?.footerHtml || variables.footerHtml,
    rulesAgreementHtml: settings?.rulesAgreementHtml || variables.rulesAgreementHtml,
    currentDate: new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  }

  // Render template content
  const content = renderTemplate(htmlTemplate, mergedVariables)

  // Build full HTML document
  const html = buildPdfHtml(content, cssStyles, {
    companyName: mergedVariables.companyName,
    companyLogoUrl: mergedVariables.companyLogoUrl,
    primaryColor: mergedVariables.primaryColor,
    accentColor: mergedVariables.accentColor,
    headerHtml: settings?.headerHtml,
    footerHtml: settings?.footerHtml,
    pageSize,
    pageOrientation,
  })

  return {
    html,
    pageSize,
    pageOrientation,
  }
}

export interface GeneratePdfParams extends RenderPdfHtmlParams {}

/**
 * Generates a PDF buffer from a template
 * Uses Puppeteer for HTML to PDF conversion
 */
export async function generatePdf(params: GeneratePdfParams): Promise<Buffer> {
  const { html, pageSize, pageOrientation } = await renderPdfHtml(params)

  // Dynamic import to avoid loading Puppeteer unless needed
  const puppeteer = await import('puppeteer')

  const browser = await puppeteer.default.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  try {
    const page = await browser.newPage()

    // Set content and wait for any images to load
    await page.setContent(html, { waitUntil: 'networkidle0' })

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: pageSize,
      landscape: pageOrientation === 'landscape',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    })

    return Buffer.from(pdfBuffer)
  } finally {
    await browser.close()
  }
}

/**
 * Preview a template with sample data (returns HTML)
 */
export async function previewTemplate(params: {
  templateType: PdfTemplateType
  htmlTemplate: string
  cssStyles: string
  variables: TemplateVariables
  settings?: {
    companyName?: string
    companyLogoUrl?: string
    primaryColor?: string
    accentColor?: string
  }
}): Promise<string> {
  const { templateType, htmlTemplate, cssStyles, variables, settings } = params

  const mergedVariables: TemplateVariables = {
    ...variables,
    companyName: settings?.companyName || 'Open Mercato',
    companyLogoUrl: settings?.companyLogoUrl,
    primaryColor: settings?.primaryColor || '#1a365d',
    accentColor: settings?.accentColor || '#f7fafc',
    currentDate: new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  }

  const content = renderTemplate(htmlTemplate, mergedVariables)

  return buildPdfHtml(content, cssStyles, {
    companyName: mergedVariables.companyName,
    companyLogoUrl: mergedVariables.companyLogoUrl,
    primaryColor: mergedVariables.primaryColor,
    accentColor: mergedVariables.accentColor,
  })
}

/**
 * Sample data for template previews
 */
export const SAMPLE_DATA: Record<PdfTemplateType, TemplateVariables> = {
  offer: {
    // Label variables (can be customized per company/language)
    labelOffer: 'OFERTA',
    labelClient: 'ZLECENIODAWCA',
    labelTaxId: 'NIP',
    labelIncoterms: 'Warunki incoterms',
    labelValidity: 'Ważność oferty',
    labelPaymentTerms: 'Termin płatności',
    labelCargo: 'Towar',
    labelCargoType: 'Rodzaj ładunku',
    labelCurrency: 'Waluta',
    labelLineNumber: 'LP.',
    labelName: 'Nazwa',
    labelCurrencyCol: 'Waluta',
    labelFeeScope: 'Zakres opłaty',
    labelQuantity: 'Ilość',
    labelRate: 'Stawka',
    labelTotal: 'Suma',
    labelCustomerNotes: 'Uwagi dla klienta',
    labelExchangeRates: 'Kursy wymiany',
    labelTermsTitle: 'WARUNKI OFERTY',

    // Offer data
    offerNumber: 'MAC071220251',
    version: '1',
    status: 'sent',
    createdDate: 'January 27, 2026',
    validUntil: '2026-01-31',
    isExpired: false,
    clientName: 'MACIEJ TWARDOWSKI "TWARGUM" SP. J.',
    clientAddress: 'TWARGUM SP. J. Lubelska 7, 59-970 Zawidów, Polska',
    clientTaxId: '6152062642',
    incoterms: 'CFR',
    cargoDescription: 'Wyroby gumowe',
    cargoType: 'Neutralny',
    currencyCode: 'USD',
    paymentTerms: '21 dni',
    customerNotes: 'Brak',
    exchangeRates: 'USD: 3.5848',

    // Routes structure - each route is a separate section
    routes: [
      {
        routeLabel: 'EXPORT/FCL  Zawidów (59-970) → Gdańsk → Laem Chabang',
        transportModeClass: 'mode-sea',
        labelLineNumber: 'LP.',
        labelName: 'Nazwa',
        labelCurrencyCol: 'Waluta',
        labelFeeScope: 'Zakres opłaty',
        labelQuantity: 'Ilość',
        labelRate: 'Stawka',
        labelTotal: 'Suma',
        lines: [
          {
            lineNumber: '1',
            productName: 'Usługa spedycyjna',
            currencyCode: 'USD',
            containerSize: "40'HC",
            quantity: '1',
            unitPrice: '1350,00',
            amount: '1350,00',
          },
        ],
      },
      {
        routeLabel: 'EXPORT/FCL  Zawidów (59-970) → Gdańsk → Ningbo',
        transportModeClass: 'mode-sea',
        labelLineNumber: 'LP.',
        labelName: 'Nazwa',
        labelCurrencyCol: 'Waluta',
        labelFeeScope: 'Zakres opłaty',
        labelQuantity: 'Ilość',
        labelRate: 'Stawka',
        labelTotal: 'Suma',
        lines: [
          {
            lineNumber: '1',
            productName: 'Usługa spedycyjna',
            currencyCode: 'USD',
            containerSize: "40'HC",
            quantity: '1',
            unitPrice: '1330,00',
            amount: '1330,00',
          },
        ],
      },
      {
        routeLabel: 'EXPORT/FCL  Zawidów (59-970) → Gdańsk → Penang',
        transportModeClass: 'mode-sea',
        labelLineNumber: 'LP.',
        labelName: 'Nazwa',
        labelCurrencyCol: 'Waluta',
        labelFeeScope: 'Zakres opłaty',
        labelQuantity: 'Ilość',
        labelRate: 'Stawka',
        labelTotal: 'Suma',
        lines: [
          {
            lineNumber: '1',
            productName: 'Usługa spedycyjna',
            currencyCode: 'USD',
            containerSize: "40'HC",
            quantity: '1',
            unitPrice: '1360,00',
            amount: '1360,00',
          },
        ],
      },
    ],
  },
}
