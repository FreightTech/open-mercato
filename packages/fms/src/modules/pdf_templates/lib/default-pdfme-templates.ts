import type { PdfmeTemplateJson } from '../data/entities'

/**
 * A4 page dimensions in mm
 */
export const A4 = {
  width: 210,
  height: 297,
}

/**
 * Default padding for A4 pages (top, right, bottom, left in mm)
 */
export const DEFAULT_PADDING: [number, number, number, number] = [10, 10, 10, 10]

/**
 * Primary color for headers and accents
 */
export const PRIMARY_COLOR = '#1a365d'

/**
 * Default offer template with standard layout.
 * This template is designed for freight/logistics offers.
 */
export const DEFAULT_OFFER_TEMPLATE: PdfmeTemplateJson = {
  basePdf: {
    width: A4.width,
    height: A4.height,
    padding: DEFAULT_PADDING,
  },
  schemas: [
    // Page 1: Main offer content
    [
      // ═══════════════════════════════════════════
      // HEADER SECTION (y: 10–38)
      // ═══════════════════════════════════════════

      // Company logo (top-left)
      {
        name: 'companyLogo',
        type: 'image',
        position: { x: 10, y: 10 },
        width: 40,
        height: 16,
      },
      // Company name (next to logo, shown if no logo image)
      {
        name: 'companyName',
        type: 'text',
        position: { x: 10, y: 27 },
        width: 80,
        height: 6,
        fontSize: 9,
        fontColor: '#718096',
      },

      // Offer badge (top-right): title + number
      {
        name: 'offerTitle',
        type: 'text',
        position: { x: 140, y: 10 },
        width: 60,
        height: 10,
        fontSize: 20,
        fontWeight: 'bold',
        fontColor: PRIMARY_COLOR,
        alignment: 'right',
        content: '{labelOffer}',
        readOnly: true,
      },
      {
        name: 'offerNumber',
        type: 'text',
        position: { x: 140, y: 21 },
        width: 60,
        height: 7,
        fontSize: 11,
        fontColor: '#4a5568',
        alignment: 'right',
        content: '{offerNumber}',
        readOnly: true,
      },

      // Header accent line
      {
        name: 'headerAccent',
        type: 'line',
        position: { x: 10, y: 36 },
        width: 190,
        height: 1,
        color: PRIMARY_COLOR,
      },

      // ═══════════════════════════════════════════
      // CLIENT + OFFER METADATA (y: 40–76)
      // Two-column layout: client left, metadata right
      // ═══════════════════════════════════════════

      // -- Left column: Client info --
      {
        name: 'clientLabel',
        type: 'text',
        position: { x: 10, y: 40 },
        width: 50,
        height: 5,
        fontSize: 8,
        fontWeight: 'bold',
        fontColor: PRIMARY_COLOR,
        content: '{labelClient}',
        readOnly: true,
      },
      {
        name: 'clientName',
        type: 'text',
        position: { x: 10, y: 46 },
        width: 90,
        height: 8,
        fontSize: 12,
        fontWeight: 'bold',
        fontColor: '#1a202c',
      },
      {
        name: 'clientAddress',
        type: 'text',
        position: { x: 10, y: 55 },
        width: 90,
        height: 6,
        fontSize: 9,
        fontColor: '#4a5568',
      },
      {
        name: 'clientTaxId',
        type: 'text',
        position: { x: 10, y: 62 },
        width: 90,
        height: 5,
        fontSize: 8,
        fontColor: '#718096',
        content: '{labelTaxId}: {clientTaxId}',
        readOnly: true,
      },

      // -- Right column: Offer metadata (label + value pairs) --
      // Date
      {
        name: 'dateLabel',
        type: 'text',
        position: { x: 130, y: 40 },
        width: 30,
        height: 5,
        fontSize: 8,
        fontColor: '#718096',
        content: 'Date:',
        readOnly: true,
      },
      {
        name: 'createdDate',
        type: 'text',
        position: { x: 160, y: 40 },
        width: 40,
        height: 5,
        fontSize: 8,
        fontWeight: 'bold',
        alignment: 'right',
      },
      // Valid until
      {
        name: 'validityLabel',
        type: 'text',
        position: { x: 130, y: 46 },
        width: 30,
        height: 5,
        fontSize: 8,
        fontColor: '#718096',
        content: '{labelValidity}:',
        readOnly: true,
      },
      {
        name: 'validUntil',
        type: 'text',
        position: { x: 160, y: 46 },
        width: 40,
        height: 5,
        fontSize: 8,
        fontWeight: 'bold',
        alignment: 'right',
      },
      // Currency
      {
        name: 'currencyLabel',
        type: 'text',
        position: { x: 130, y: 52 },
        width: 30,
        height: 5,
        fontSize: 8,
        fontColor: '#718096',
        content: '{labelCurrency}:',
        readOnly: true,
      },
      {
        name: 'currencyCode',
        type: 'text',
        position: { x: 160, y: 52 },
        width: 40,
        height: 5,
        fontSize: 8,
        alignment: 'right',
      },
      // Payment terms
      {
        name: 'paymentTermsLabel',
        type: 'text',
        position: { x: 130, y: 58 },
        width: 30,
        height: 5,
        fontSize: 8,
        fontColor: '#718096',
        content: '{labelPaymentTerms}:',
        readOnly: true,
      },
      {
        name: 'paymentTerms',
        type: 'text',
        position: { x: 160, y: 58 },
        width: 40,
        height: 5,
        fontSize: 8,
        alignment: 'right',
      },
      // Incoterms
      {
        name: 'incotermsLabel',
        type: 'text',
        position: { x: 130, y: 64 },
        width: 30,
        height: 5,
        fontSize: 8,
        fontColor: '#718096',
        content: '{labelIncoterms}:',
        readOnly: true,
      },
      {
        name: 'incoterms',
        type: 'text',
        position: { x: 160, y: 64 },
        width: 40,
        height: 5,
        fontSize: 8,
        fontWeight: 'bold',
        alignment: 'right',
      },

      // ═══════════════════════════════════════════
      // CARGO SECTION (y: 74–88)
      // ═══════════════════════════════════════════
      {
        name: 'cargoLine',
        type: 'line',
        position: { x: 10, y: 74 },
        width: 190,
        height: 1,
        color: '#e2e8f0',
      },
      {
        name: 'cargoLabel',
        type: 'text',
        position: { x: 10, y: 77 },
        width: 25,
        height: 5,
        fontSize: 8,
        fontColor: '#718096',
        content: '{labelCargo}:',
        readOnly: true,
      },
      {
        name: 'cargoDescription',
        type: 'text',
        position: { x: 36, y: 77 },
        width: 70,
        height: 5,
        fontSize: 9,
      },
      {
        name: 'cargoTypeLabel',
        type: 'text',
        position: { x: 115, y: 77 },
        width: 30,
        height: 5,
        fontSize: 8,
        fontColor: '#718096',
        content: '{labelCargoType}:',
        readOnly: true,
      },
      {
        name: 'cargoType',
        type: 'text',
        position: { x: 146, y: 77 },
        width: 54,
        height: 5,
        fontSize: 9,
      },

      // Exchange rates (shown below cargo if present)
      {
        name: 'exchangeRatesLabel',
        type: 'text',
        position: { x: 10, y: 83 },
        width: 30,
        height: 5,
        fontSize: 8,
        fontColor: '#718096',
        content: '{labelExchangeRates}:',
        readOnly: true,
      },
      {
        name: 'exchangeRates',
        type: 'text',
        position: { x: 42, y: 83 },
        width: 158,
        height: 5,
        fontSize: 8,
        fontColor: '#4a5568',
      },

      // ═══════════════════════════════════════════
      // ROUTES & LINES TABLE (y: 90–230)
      // ═══════════════════════════════════════════
      {
        name: 'routesTable',
        type: 'table',
        position: { x: 10, y: 93 },
        width: 190,
        height: 140,
        showHead: true,
        repeatHead: false,
        head: ['#', 'Description', 'Currency', 'Amount'],
        headWidthPercentages: [8, 52, 15, 25],
        tableStyles: {
          borderColor: '#e2e8f0',
          borderWidth: 0,
        },
        headStyles: {
          alignment: 'left',
          verticalAlignment: 'middle',
          fontSize: 9,
          lineHeight: 1,
          characterSpacing: 0,
          fontColor: '#ffffff',
          backgroundColor: '#1a365d',
          borderColor: '',
          borderWidth: { top: 0, right: 0, bottom: 0, left: 0 },
          padding: { top: 4, right: 6, bottom: 4, left: 6 },
        },
        bodyStyles: {
          alignment: 'left',
          verticalAlignment: 'middle',
          fontSize: 9,
          lineHeight: 1,
          characterSpacing: 0,
          fontColor: '#1a202c',
          backgroundColor: '',
          borderColor: '#e2e8f0',
          borderWidth: { top: 0.3, right: 0, bottom: 0.3, left: 0 },
          padding: { top: 3, right: 6, bottom: 3, left: 6 },
          alternateBackgroundColor: '#f7fafc',
        },
        columnStyles: {},
      },

      // ═══════════════════════════════════════════
      // TERMS & CONDITIONS (y: 236–260)
      // ═══════════════════════════════════════════
      {
        name: 'termsLine',
        type: 'line',
        position: { x: 10, y: 236 },
        width: 190,
        height: 1,
        color: '#e2e8f0',
      },
      {
        name: 'termsTitle',
        type: 'text',
        position: { x: 10, y: 239 },
        width: 80,
        height: 5,
        fontSize: 8,
        fontWeight: 'bold',
        fontColor: PRIMARY_COLOR,
        content: '{labelTermsTitle}',
        readOnly: true,
      },
      {
        name: 'rulesAgreementHtml',
        type: 'text',
        position: { x: 10, y: 245 },
        width: 190,
        height: 12,
        fontSize: 8,
        fontColor: '#4a5568',
        lineHeight: 1.4,
      },

      // Customer notes
      {
        name: 'customerNotesLabel',
        type: 'text',
        position: { x: 10, y: 258 },
        width: 30,
        height: 5,
        fontSize: 8,
        fontColor: '#718096',
        content: '{labelCustomerNotes}:',
        readOnly: true,
      },
      {
        name: 'customerNotes',
        type: 'text',
        position: { x: 42, y: 258 },
        width: 158,
        height: 8,
        fontSize: 8,
        fontColor: '#4a5568',
        lineHeight: 1.3,
      },

      // ═══════════════════════════════════════════
      // FOOTER (y: 270–287)
      // ═══════════════════════════════════════════
      {
        name: 'footerLine',
        type: 'line',
        position: { x: 10, y: 270 },
        width: 190,
        height: 1,
        color: '#cbd5e0',
      },
      {
        name: 'footerHtml',
        type: 'text',
        position: { x: 10, y: 273 },
        width: 130,
        height: 14,
        fontSize: 7,
        fontColor: '#a0aec0',
        lineHeight: 1.4,
      },
      {
        name: 'footerDate',
        type: 'text',
        position: { x: 140, y: 273 },
        width: 60,
        height: 5,
        fontSize: 7,
        fontColor: '#a0aec0',
        alignment: 'right',
        content: '{currentDate}',
        readOnly: true,
      },
    ],
  ],
}

/**
 * Blank A4 template for custom designs.
 * Use this as a starting point for creating new templates.
 */
export const BLANK_A4_TEMPLATE: PdfmeTemplateJson = {
  basePdf: {
    width: A4.width,
    height: A4.height,
    padding: DEFAULT_PADDING,
  },
  schemas: [
    [
      // Just a placeholder text to get started
      {
        name: 'title',
        type: 'text',
        position: { x: 10, y: 10 },
        width: 100,
        height: 15,
        fontSize: 24,
        fontWeight: 'bold',
        fontColor: PRIMARY_COLOR,
        content: 'Your Title Here',
      },
    ],
  ],
}

/**
 * Cover page template with full-bleed image.
 */
export const COVER_PAGE_TEMPLATE: PdfmeTemplateJson = {
  basePdf: {
    width: A4.width,
    height: A4.height,
    padding: [0, 0, 0, 0], // No padding for full-bleed
  },
  schemas: [
    [
      {
        name: 'coverImage',
        type: 'image',
        position: { x: 0, y: 0 },
        width: A4.width,
        height: A4.height,
      },
    ],
  ],
}

/**
 * Get the default template for a given type.
 */
export function getDefaultPdfmeTemplate(templateType: string): PdfmeTemplateJson {
  switch (templateType) {
    case 'offer':
      return DEFAULT_OFFER_TEMPLATE
    case 'cover':
      return COVER_PAGE_TEMPLATE
    case 'blank':
    default:
      return BLANK_A4_TEMPLATE
  }
}

/**
 * Available template variables for offers.
 * Used by the designer to show available variable insertions.
 */
export const OFFER_TEMPLATE_VARIABLES = [
  // Company/Branding
  { name: 'companyLogo', type: 'image', description: 'Company logo image (data URI or URL)' },
  { name: 'companyName', type: 'text', description: 'Company name' },
  { name: 'primaryColor', type: 'text', description: 'Primary brand color (hex)' },
  { name: 'accentColor', type: 'text', description: 'Accent color (hex)' },

  // Labels (localizable)
  { name: 'labelOffer', type: 'text', description: 'Offer label (e.g., "OFERTA", "OFFER")' },
  { name: 'labelClient', type: 'text', description: 'Client section label' },
  { name: 'labelTaxId', type: 'text', description: 'Tax ID label (e.g., "NIP", "VAT")' },
  { name: 'labelValidity', type: 'text', description: 'Validity period label' },
  { name: 'labelPaymentTerms', type: 'text', description: 'Payment terms label' },
  { name: 'labelCargo', type: 'text', description: 'Cargo description label' },
  { name: 'labelCargoType', type: 'text', description: 'Cargo type label' },
  { name: 'labelCurrency', type: 'text', description: 'Currency label' },
  { name: 'labelIncoterms', type: 'text', description: 'Incoterms label' },
  { name: 'labelCustomerNotes', type: 'text', description: 'Customer notes label' },
  { name: 'labelExchangeRates', type: 'text', description: 'Exchange rates label' },
  { name: 'labelTermsTitle', type: 'text', description: 'Terms & conditions title' },

  // Offer Data
  { name: 'offerNumber', type: 'text', description: 'Offer/quote number' },
  { name: 'version', type: 'text', description: 'Offer version number' },
  { name: 'status', type: 'text', description: 'Offer status' },
  { name: 'createdDate', type: 'text', description: 'Creation date (formatted)' },
  { name: 'validUntil', type: 'text', description: 'Validity expiration date' },
  { name: 'isExpired', type: 'text', description: 'Whether offer is expired (true/false)' },

  // Client Data
  { name: 'clientName', type: 'text', description: 'Client company name' },
  { name: 'clientAddress', type: 'text', description: 'Client full address' },
  { name: 'clientTaxId', type: 'text', description: 'Client tax ID / VAT number' },

  // Offer Details
  { name: 'incoterms', type: 'text', description: 'Incoterms (e.g., CFR, FOB)' },
  { name: 'cargoDescription', type: 'text', description: 'Description of goods' },
  { name: 'cargoType', type: 'text', description: 'Type of cargo' },
  { name: 'currencyCode', type: 'text', description: 'Currency code (USD, EUR, etc.)' },
  { name: 'paymentTerms', type: 'text', description: 'Payment terms' },
  { name: 'customerNotes', type: 'text', description: 'Notes for customer' },
  { name: 'exchangeRates', type: 'text', description: 'Exchange rate information' },

  // Routes (dynamic content)
  { name: 'routesContent', type: 'text', description: 'Formatted routes/lines content (legacy text)' },
  { name: 'routesTable', type: 'text', description: 'Offer lines as table data (JSON 2D array)' },

  // Footer & Terms
  { name: 'footerHtml', type: 'text', description: 'Footer content' },
  { name: 'rulesAgreementHtml', type: 'text', description: 'Terms and conditions' },

  // Cover
  { name: 'coverPageImageUrl', type: 'image', description: 'Cover page image URL' },

  // System
  { name: 'currentDate', type: 'text', description: 'Current date (generated at render time)' },
] as const

export type OfferTemplateVariable = typeof OFFER_TEMPLATE_VARIABLES[number]

/**
 * Sample offer inputs for PDF preview.
 * Contains realistic example values for all template variables.
 * Used by the PDF designer and template settings to generate preview PDFs.
 */
export const SAMPLE_OFFER_INPUTS: Record<string, string> = {
  // Company/Branding
  companyName: 'Open Mercato',
  companyLogo: '', // Empty - would need base64 data for actual logo
  primaryColor: '#1a365d',
  accentColor: '#f7fafc',

  // Labels (i18n)
  labelOffer: 'OFFER',
  labelClient: 'CLIENT',
  labelTaxId: 'Tax ID',
  labelValidity: 'Valid Until',
  labelPaymentTerms: 'Payment Terms',
  labelCargo: 'Cargo',
  labelCargoType: 'Cargo Type',
  labelCurrency: 'Currency',
  labelIncoterms: 'Incoterms',
  labelCustomerNotes: 'Notes',
  labelExchangeRates: 'Exchange Rates',
  labelTermsTitle: 'TERMS & CONDITIONS',
  labelLineNumber: '#',
  labelName: 'Name',
  labelCurrencyCol: 'Currency',
  labelFeeScope: 'Scope',
  labelQuantity: 'Qty',
  labelRate: 'Rate',
  labelTotal: 'Total',

  // Offer Data
  offerNumber: 'OFF-2026-00001',
  version: '1',
  status: 'Sent',
  createdDate: 'March 12, 2026',
  validUntil: 'April 12, 2026',
  isExpired: 'false',

  // Client Data
  clientName: 'ACME Corporation',
  clientAddress: '123 Business Street, Warsaw, Poland',
  clientTaxId: 'PL1234567890',

  // Offer Details
  incoterms: 'CFR',
  cargoDescription: 'Industrial Equipment - 2 pallets',
  cargoType: 'General Cargo',
  currencyCode: 'EUR',
  paymentTerms: '30 days net',
  customerNotes: 'Handle with care. Delivery to warehouse entrance.',
  exchangeRates: 'EUR: 1.00, USD: 1.08, PLN: 4.32',

  // Routes (formatted example)
  routesContent: `EXPORT  Warsaw \u2192 Hamburg \u2192 Shanghai
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
#   Name                            Cur         Total
1.  Ocean Freight (40'HC)           EUR      1,800.00
2.  THC Origin                      EUR        350.00
3.  Documentation Fee               EUR         50.00
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    TOTAL                           EUR      2,200.00`,

  // Routes (table data for pdfme table schema)
  routesTable: JSON.stringify([
    ['1', "Ocean Freight (40'HC)", 'EUR', '1,800.00'],
    ['2', 'THC Origin', 'EUR', '350.00'],
    ['3', 'Documentation Fee', 'EUR', '50.00'],
    ['', 'TOTAL', 'EUR', '2,200.00'],
  ]),

  // Footer & Terms
  footerHtml: 'Thank you for your business!',
  rulesAgreementHtml: 'Standard terms and conditions apply.',

  // Cover
  coverPageImageUrl: '',

  // System
  currentDate: 'March 15, 2026',
}
