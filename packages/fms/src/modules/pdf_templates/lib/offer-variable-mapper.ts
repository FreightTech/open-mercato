/**
 * Maps offer data to pdfme template input variables.
 * 
 * This module transforms the offer entity and related data into a flat
 * key-value object that can be used with pdfme's generate() function.
 */

import type { SharedBrandSettings } from '../../email_templates/lib/shared-brand-settings'

/**
 * Offer data structure from the database
 */
export interface OfferData {
  id: string
  offerNumber: string
  version: number
  status: string
  createdAt: Date
  validUntil?: Date | null
  
  // Client
  client?: {
    id: string
    name: string
    address?: string | null
    taxId?: string | null
  } | null
  
  // Details
  incoterms?: string | null
  cargoDescription?: string | null
  cargoType?: string | null
  currencyCode?: string | null
  paymentTerms?: string | null
  customerNotes?: string | null
  specialTerms?: string | null

  // Contact person
  contactPersonName?: string | null
  contactPersonEmail?: string | null

  // Routes/Lines
  routes?: Array<{
    id: string
    routeLabel: string
    transportMode?: string | null
    lines: Array<{
      lineNumber: number
      productName: string
      currencyCode?: string | null
      containerSize?: string | null
      quantity: number
      unitPrice: number
      amount: number
    }>
  }>
}

/**
 * Branding/settings data
 */
export interface BrandingData {
  companyName?: string | null
  companyLogoUrl?: string | null
  primaryColor?: string
  accentColor?: string
  footerHtml?: string | null
  rulesAgreementHtml?: string | null
  coverPageImageUrl?: string | null
}

/**
 * Labels configuration (for i18n)
 */
export interface OfferLabels {
  labelOffer?: string
  labelClient?: string
  labelTaxId?: string
  labelIncoterms?: string
  labelValidity?: string
  labelPaymentTerms?: string
  labelCargo?: string
  labelCargoType?: string
  labelCurrency?: string
  labelLineNumber?: string
  labelName?: string
  labelCurrencyCol?: string
  labelFeeScope?: string
  labelQuantity?: string
  labelRate?: string
  labelTotal?: string
  labelCustomerNotes?: string
  labelExchangeRates?: string
  labelTermsTitle?: string
}

/**
 * Default English labels
 */
export const DEFAULT_LABELS: OfferLabels = {
  labelOffer: 'OFFER',
  labelClient: 'CLIENT',
  labelTaxId: 'Tax ID',
  labelIncoterms: 'Incoterms',
  labelValidity: 'Valid Until',
  labelPaymentTerms: 'Payment Terms',
  labelCargo: 'Cargo',
  labelCargoType: 'Cargo Type',
  labelCurrency: 'Currency',
  labelLineNumber: 'No.',
  labelName: 'Name',
  labelCurrencyCol: 'Currency',
  labelFeeScope: 'Scope',
  labelQuantity: 'Qty',
  labelRate: 'Rate',
  labelTotal: 'Total',
  labelCustomerNotes: 'Notes',
  labelExchangeRates: 'Exchange Rates',
  labelTermsTitle: 'TERMS & CONDITIONS',
}

/**
 * Format a date for display
 */
function formatDate(date: Date | string | null | undefined, locale = 'en-US'): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * Format a number as currency
 */
function formatCurrency(amount: number, currencyCode = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * Get transport mode CSS class
 */
function getTransportModeClass(mode?: string | null): string {
  if (!mode) return ''
  const m = mode.toLowerCase()
  if (m.includes('sea') || m.includes('fcl') || m.includes('lcl')) return 'mode-sea'
  if (m.includes('air')) return 'mode-air'
  if (m.includes('road') || m.includes('truck')) return 'mode-road'
  if (m.includes('rail')) return 'mode-rail'
  return ''
}

/**
 * Pad a string to a fixed width (right-padded for left-aligned, left-padded for right-aligned).
 */
function padRight(str: string, width: number): string {
  return str.length >= width ? str : str + ' '.repeat(width - str.length)
}

function padLeft(str: string, width: number): string {
  return str.length >= width ? str : ' '.repeat(width - str.length) + str
}

/**
 * Format routes content as text for the placeholder field.
 * Uses aligned columns with a clean, professional layout.
 */
function formatRoutesContent(
  routes: OfferData['routes'],
  labels: OfferLabels,
  currencyCode: string
): string {
  if (!routes || routes.length === 0) {
    return ''
  }

  const sections: string[] = []
  const COL_NUM = 4
  const COL_NAME = 32
  const COL_CUR = 6
  const COL_RATE = 12

  for (const route of routes) {
    const lines: string[] = []

    // Route header
    lines.push(route.routeLabel)
    lines.push('\u2500'.repeat(56))

    // Column header
    lines.push(
      padRight('#', COL_NUM) +
      padRight(labels.labelName || 'Name', COL_NAME) +
      padRight(labels.labelCurrencyCol || 'Cur', COL_CUR) +
      padLeft(labels.labelTotal || 'Total', COL_RATE)
    )

    // Line items
    let routeTotal = 0
    for (const line of route.lines) {
      const lineCurrency = line.currencyCode || currencyCode
      routeTotal += line.amount
      lines.push(
        padRight(String(line.lineNumber) + '.', COL_NUM) +
        padRight(line.productName, COL_NAME) +
        padRight(lineCurrency, COL_CUR) +
        padLeft(formatCurrency(line.amount), COL_RATE)
      )
    }

    // Route total
    lines.push('\u2500'.repeat(56))
    const totalCurrency = route.lines[0]?.currencyCode || currencyCode
    lines.push(
      padRight('', COL_NUM) +
      padRight('TOTAL', COL_NAME) +
      padRight(totalCurrency, COL_CUR) +
      padLeft(formatCurrency(routeTotal), COL_RATE)
    )

    sections.push(lines.join('\n'))
  }

  return sections.join('\n\n')
}

/**
 * Format routes as a JSON-serialized 2D array for the pdfme table schema.
 * Always produces 5-column rows: [#, Description, Container, Currency, Amount].
 * Always shows route header rows and a grand total.
 * Multi-route offers also get per-route subtotals.
 */
function formatRoutesTableData(routes: OfferData['routes'], currencyCode: string): string {
  if (!routes || routes.length === 0) return JSON.stringify([])

  const rows: string[][] = []
  let lineNum = 1
  let grandTotal = 0

  for (const route of routes) {
    if (route.lines.length === 0) continue
    // Route header row — label goes in the Description column (widest)
    rows.push(['', route.routeLabel, '', '', ''])

    let routeTotal = 0
    for (const line of route.lines) {
      const lineCurrency = line.currencyCode || currencyCode
      routeTotal += line.amount
      rows.push([
        String(lineNum++),
        line.productName,
        line.containerSize || '-',
        lineCurrency,
        formatCurrency(line.amount),
      ])
    }

    grandTotal += routeTotal
  }

  return JSON.stringify(rows)
}

/**
 * Maps offer data to pdfme template inputs.
 *
 * @param offer - The offer entity data
 * @param branding - Company branding/settings
 * @param labels - Localized labels
 * @param options - Additional options
 * @returns Flat object for pdfme inputs
 */
export function mapOfferToInputs(
  offer: OfferData,
  branding: BrandingData = {},
  labels: OfferLabels = DEFAULT_LABELS,
  options: {
    locale?: string
    exchangeRates?: Record<string, number>
  } = {}
): Record<string, string> {
  const { locale = 'en-US', exchangeRates = {} } = options

  // Check if offer is expired
  const isExpired = offer.validUntil
    ? new Date(offer.validUntil) < new Date()
    : false

  // Format exchange rates
  const exchangeRatesStr = Object.entries(exchangeRates)
    .map(([code, rate]) => `${code}: ${rate.toFixed(4)}`)
    .join(', ') || ''

  // Format routes content
  const routesContent = formatRoutesContent(
    offer.routes,
    labels,
    offer.currencyCode || 'USD'
  )

  return {
    // Branding
    companyName: branding.companyName || 'Open Mercato',
    // pdfme image elements only support PNG and JPEG data URIs.
    // SVG, WebP, plain URLs, etc. crash with "SOI not found in JPEG"
    // because pdfme defaults to JPEG embedding for anything not PNG.
    companyLogo: branding.companyLogoUrl && (branding.companyLogoUrl.startsWith('data:image/png') || branding.companyLogoUrl.startsWith('data:image/jpeg')) ? branding.companyLogoUrl : '',
    contentLogo: branding.companyLogoUrl && (branding.companyLogoUrl.startsWith('data:image/png') || branding.companyLogoUrl.startsWith('data:image/jpeg')) ? branding.companyLogoUrl : '',
    page2Logo: branding.companyLogoUrl && (branding.companyLogoUrl.startsWith('data:image/png') || branding.companyLogoUrl.startsWith('data:image/jpeg')) ? branding.companyLogoUrl : '',
    primaryColor: branding.primaryColor || '#1a365d',
    accentColor: branding.accentColor || '#f7fafc',

    // Labels
    labelOffer: labels.labelOffer || 'OFFER',
    labelClient: labels.labelClient || 'CLIENT',
    labelTaxId: labels.labelTaxId || 'Tax ID',
    labelIncoterms: labels.labelIncoterms || 'Incoterms',
    labelValidity: labels.labelValidity || 'Valid Until',
    labelPaymentTerms: labels.labelPaymentTerms || 'Payment Terms',
    labelCargo: labels.labelCargo || 'Cargo',
    labelCargoType: labels.labelCargoType || 'Cargo Type',
    labelCurrency: labels.labelCurrency || 'Currency',
    labelLineNumber: labels.labelLineNumber || 'No.',
    labelName: labels.labelName || 'Name',
    labelCurrencyCol: labels.labelCurrencyCol || 'Currency',
    labelFeeScope: labels.labelFeeScope || 'Scope',
    labelQuantity: labels.labelQuantity || 'Qty',
    labelRate: labels.labelRate || 'Rate',
    labelTotal: labels.labelTotal || 'Total',
    labelCustomerNotes: labels.labelCustomerNotes || 'Notes',
    labelExchangeRates: labels.labelExchangeRates || 'Exchange Rates',
    labelTermsTitle: labels.labelTermsTitle || 'TERMS & CONDITIONS',

    // Offer data
    offerNumber: offer.offerNumber || '',
    version: String(offer.version || 1),
    status: offer.status || '',
    createdDate: formatDate(offer.createdAt, locale),
    validUntil: formatDate(offer.validUntil, locale),
    isExpired: isExpired ? 'true' : 'false',

    // Client
    clientName: offer.client?.name || '',
    clientAddress: offer.client?.address || '',
    clientTaxId: offer.client?.taxId || '',

    // Details
    incoterms: offer.incoterms || '',
    cargoDescription: offer.cargoDescription || '',
    cargoType: offer.cargoType || '',
    currencyCode: offer.currencyCode || 'USD',
    paymentTerms: offer.paymentTerms || '',
    customerNotes: offer.customerNotes || '',
    specialTerms: offer.specialTerms || '',
    exchangeRates: exchangeRatesStr,

    // Contact person
    contactPersonName: offer.contactPersonName || '',
    contactPersonEmail: offer.contactPersonEmail || '',

    // Routes (formatted as text for legacy templates)
    routesContent,
    // Routes (table data for pdfme table schema)
    routesTable: formatRoutesTableData(offer.routes, offer.currencyCode || 'USD'),

    // Footer & Terms
    footerHtml: branding.footerHtml || '',
    rulesAgreementHtml: branding.rulesAgreementHtml || '',

    // Cover page fields
    coverPageImageUrl: branding.coverPageImageUrl || '',
    coverClientName: offer.client?.name || '',
    coverCompanyName: branding.companyName || 'Open Mercato',
    coverDate: formatDate(offer.createdAt, locale),

    // Page 2 fields (mirrors page 1 values for multi-page templates)
    page2FooterHtml: branding.footerHtml || '',
    page2ContactName: offer.contactPersonName || '',
    page2ContactEmail: offer.contactPersonEmail || '',

    // QR code (offer number as default content)
    qrCode: offer.offerNumber || '',

    // System
    currentDate: formatDate(new Date(), locale),
  }
}

/**
 * Maps SharedBrandSettings to BrandingData
 */
export function settingsToBranding(settings: SharedBrandSettings | null): BrandingData {
  if (!settings) {
    return {
      companyName: 'Open Mercato',
      primaryColor: '#1a365d',
      accentColor: '#f7fafc',
    }
  }

  return {
    companyName: settings.companyName,
    companyLogoUrl: settings.companyLogoUrl,
    primaryColor: settings.primaryColor,
    accentColor: settings.accentColor,
    // Note: footerHtml, rulesAgreementHtml, coverPageImageUrl are now managed
    // per pdfme template, not as global settings
    footerHtml: null,
    rulesAgreementHtml: null,
    coverPageImageUrl: null,
  }
}
