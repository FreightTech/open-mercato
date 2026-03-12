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
 * Format routes content as text for the placeholder field.
 * In a full implementation, you might use pdfme's Table schema instead.
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

  for (const route of routes) {
    const lines: string[] = []
    lines.push(`=== ${route.routeLabel} ===`)
    lines.push('')
    lines.push(`${labels.labelLineNumber} | ${labels.labelName} | ${labels.labelCurrencyCol} | ${labels.labelFeeScope} | ${labels.labelQuantity} | ${labels.labelRate} | ${labels.labelTotal}`)
    lines.push('---')

    for (const line of route.lines) {
      const lineCurrency = line.currencyCode || currencyCode
      lines.push(
        `${line.lineNumber} | ${line.productName} | ${lineCurrency} | ${line.containerSize || '-'} | ${line.quantity} | ${formatCurrency(line.unitPrice)} | ${formatCurrency(line.amount)}`
      )
    }

    sections.push(lines.join('\n'))
  }

  return sections.join('\n\n')
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
    companyLogo: branding.companyLogoUrl || '',
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
    exchangeRates: exchangeRatesStr,

    // Routes (formatted as text for placeholder)
    routesContent,

    // Footer & Terms
    footerHtml: branding.footerHtml || '',
    rulesAgreementHtml: branding.rulesAgreementHtml || '',

    // Cover
    coverPageImageUrl: branding.coverPageImageUrl || '',

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
