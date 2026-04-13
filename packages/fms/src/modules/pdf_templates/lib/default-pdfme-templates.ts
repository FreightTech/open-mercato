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
 * Primary color — dark teal used in the INF-style template
 */
export const PRIMARY_COLOR = '#1b5e5e'

/**
 * Accent color — warm orange for cover page highlights
 */
export const ACCENT_COLOR = '#e07040'

/**
 * Default offer template — 3-page professional freight/logistics layout.
 *
 * Page 0: Cover page (dark teal background, offer label, company branding)
 * Page 1: Content (header, client info, route/charges tables)
 * Page 2: Contact person, terms & conditions, QR code placeholder
 *
 * Designed to match the INF offer style. Users can customize via the
 * PDF designer at /backend/pdf-designer?type=offer.
 */
export const DEFAULT_OFFER_TEMPLATE: PdfmeTemplateJson = {
  basePdf: {
    width: A4.width,
    height: A4.height,
    padding: [0, 0, 0, 0],
  },
  schemas: [
    // ═══════════════════════════════════════════════════
    // PAGE 0 — COVER
    // ═══════════════════════════════════════════════════
    [
      // Full-bleed dark teal background
      {
        name: 'coverBg',
        type: 'rectangle',
        position: { x: 0, y: 0 },
        width: A4.width,
        height: A4.height,
        color: PRIMARY_COLOR,
        borderWidth: 0,
        borderColor: '',
        content: '',
        readOnly: true,
      } as any,
      // Accent stripe — thin orange bar along the left edge
      {
        name: 'coverAccentStripe',
        type: 'rectangle',
        position: { x: 0, y: 0 },
        width: 4,
        height: A4.height,
        color: ACCENT_COLOR,
        borderWidth: 0,
        borderColor: '',
        content: '',
        readOnly: true,
      } as any,
      // Large offer label (e.g., "OFERTA" / "OFFER")
      {
        name: 'coverOfferLabel',
        type: 'text',
        position: { x: 20, y: 80 },
        width: 170,
        height: 28,
        fontSize: 52,
        fontWeight: 'bold',
        fontColor: ACCENT_COLOR,
        content: '{labelOffer}',
        readOnly: true,
      },
      // Offer number below label
      {
        name: 'coverOfferNumber',
        type: 'text',
        position: { x: 20, y: 112 },
        width: 170,
        height: 10,
        fontSize: 16,
        fontColor: '#ffffff',
        content: '{offerNumber}',
        readOnly: true,
      },
      // Thin white line separator
      {
        name: 'coverSeparator',
        type: 'line',
        position: { x: 20, y: 128 },
        width: 60,
        height: 1,
        color: '#ffffff',
      },
      // Client name on cover
      {
        name: 'coverClientName',
        type: 'text',
        position: { x: 20, y: 136 },
        width: 170,
        height: 8,
        fontSize: 14,
        fontColor: '#ffffff',
      },
      // Date on cover
      {
        name: 'coverDate',
        type: 'text',
        position: { x: 20, y: 148 },
        width: 170,
        height: 6,
        fontSize: 10,
        fontColor: '#ffffffb3',
        content: '{createdDate}',
        readOnly: true,
      },
      // Company logo (bottom-left, white version)
      {
        name: 'companyLogo',
        type: 'image',
        position: { x: 20, y: 250 },
        width: 50,
        height: 20,
      },
      // Company name fallback (below logo area)
      {
        name: 'coverCompanyName',
        type: 'text',
        position: { x: 20, y: 272 },
        width: 100,
        height: 6,
        fontSize: 9,
        fontColor: '#ffffff80',
      },
    ],

    // ═══════════════════════════════════════════════════
    // PAGE 1 — CONTENT (routes & pricing)
    // ═══════════════════════════════════════════════════
    [
      // Top accent bar
      {
        name: 'contentTopBar',
        type: 'rectangle',
        position: { x: 0, y: 0 },
        width: A4.width,
        height: 3,
        color: PRIMARY_COLOR,
        borderWidth: 0,
        borderColor: '',
        content: '',
        readOnly: true,
      } as any,

      // ── Header ──
      // Offer label + number (left)
      {
        name: 'contentOfferTitle',
        type: 'text',
        position: { x: 12, y: 8 },
        width: 100,
        height: 7,
        fontSize: 11,
        fontWeight: 'bold',
        fontColor: PRIMARY_COLOR,
        content: '{labelOffer} — {offerNumber}',
        readOnly: true,
      },
      // Company logo (right)
      {
        name: 'contentLogo',
        type: 'image',
        position: { x: 160, y: 6 },
        width: 38,
        height: 14,
      },

      // Header line
      {
        name: 'contentHeaderLine',
        type: 'line',
        position: { x: 12, y: 22 },
        width: 186,
        height: 1,
        color: '#e2e8f0',
      },

      // ── Two-column info section ──
      // Left: Company / Sender info
      {
        name: 'senderLabel',
        type: 'text',
        position: { x: 12, y: 26 },
        width: 80,
        height: 4,
        fontSize: 7,
        fontWeight: 'bold',
        fontColor: '#718096',
        content: 'FROM',
        readOnly: true,
      },
      {
        name: 'companyName',
        type: 'text',
        position: { x: 12, y: 31 },
        width: 80,
        height: 6,
        fontSize: 10,
        fontWeight: 'bold',
        fontColor: '#1a202c',
      },
      {
        name: 'contactPersonName',
        type: 'text',
        position: { x: 12, y: 38 },
        width: 80,
        height: 5,
        fontSize: 8,
        fontColor: '#4a5568',
      },
      {
        name: 'contactPersonEmail',
        type: 'text',
        position: { x: 12, y: 43 },
        width: 80,
        height: 5,
        fontSize: 8,
        fontColor: '#718096',
      },

      // Right: Client info
      {
        name: 'clientLabel',
        type: 'text',
        position: { x: 115, y: 26 },
        width: 80,
        height: 4,
        fontSize: 7,
        fontWeight: 'bold',
        fontColor: '#718096',
        content: '{labelClient}',
        readOnly: true,
      },
      {
        name: 'clientName',
        type: 'text',
        position: { x: 115, y: 31 },
        width: 83,
        height: 6,
        fontSize: 10,
        fontWeight: 'bold',
        fontColor: '#1a202c',
      },
      {
        name: 'clientAddress',
        type: 'text',
        position: { x: 115, y: 38 },
        width: 83,
        height: 5,
        fontSize: 8,
        fontColor: '#4a5568',
      },
      {
        name: 'clientTaxId',
        type: 'text',
        position: { x: 115, y: 43 },
        width: 83,
        height: 5,
        fontSize: 8,
        fontColor: '#718096',
        content: '{labelTaxId}: {clientTaxId}',
        readOnly: true,
      },

      // ── Metadata row ──
      {
        name: 'metadataLine',
        type: 'line',
        position: { x: 12, y: 51 },
        width: 186,
        height: 1,
        color: '#e2e8f0',
      },
      // Date
      {
        name: 'dateLabel',
        type: 'text',
        position: { x: 12, y: 54 },
        width: 20,
        height: 4,
        fontSize: 7,
        fontColor: '#718096',
        content: 'Date',
        readOnly: true,
      },
      {
        name: 'createdDate',
        type: 'text',
        position: { x: 12, y: 58 },
        width: 30,
        height: 5,
        fontSize: 8,
        fontWeight: 'bold',
      },
      // Valid until
      {
        name: 'validityLabel',
        type: 'text',
        position: { x: 48, y: 54 },
        width: 25,
        height: 4,
        fontSize: 7,
        fontColor: '#718096',
        content: '{labelValidity}',
        readOnly: true,
      },
      {
        name: 'validUntil',
        type: 'text',
        position: { x: 48, y: 58 },
        width: 30,
        height: 5,
        fontSize: 8,
        fontWeight: 'bold',
      },
      // Currency
      {
        name: 'currencyLabel',
        type: 'text',
        position: { x: 84, y: 54 },
        width: 22,
        height: 4,
        fontSize: 7,
        fontColor: '#718096',
        content: '{labelCurrency}',
        readOnly: true,
      },
      {
        name: 'currencyCode',
        type: 'text',
        position: { x: 84, y: 58 },
        width: 22,
        height: 5,
        fontSize: 8,
        fontWeight: 'bold',
      },
      // Incoterms
      {
        name: 'incotermsLabel',
        type: 'text',
        position: { x: 112, y: 54 },
        width: 25,
        height: 4,
        fontSize: 7,
        fontColor: '#718096',
        content: '{labelIncoterms}',
        readOnly: true,
      },
      {
        name: 'incoterms',
        type: 'text',
        position: { x: 112, y: 58 },
        width: 25,
        height: 5,
        fontSize: 8,
        fontWeight: 'bold',
      },
      // Payment terms
      {
        name: 'paymentTermsLabel',
        type: 'text',
        position: { x: 143, y: 54 },
        width: 30,
        height: 4,
        fontSize: 7,
        fontColor: '#718096',
        content: '{labelPaymentTerms}',
        readOnly: true,
      },
      {
        name: 'paymentTerms',
        type: 'text',
        position: { x: 143, y: 58 },
        width: 55,
        height: 5,
        fontSize: 8,
      },

      // ── Cargo & Exchange rates ──
      {
        name: 'cargoLine',
        type: 'line',
        position: { x: 12, y: 66 },
        width: 186,
        height: 1,
        color: '#e2e8f0',
      },
      {
        name: 'cargoLabel',
        type: 'text',
        position: { x: 12, y: 69 },
        width: 18,
        height: 4,
        fontSize: 7,
        fontColor: '#718096',
        content: '{labelCargo}',
        readOnly: true,
      },
      {
        name: 'cargoDescription',
        type: 'text',
        position: { x: 32, y: 69 },
        width: 60,
        height: 4,
        fontSize: 8,
      },
      {
        name: 'cargoTypeLabel',
        type: 'text',
        position: { x: 100, y: 69 },
        width: 22,
        height: 4,
        fontSize: 7,
        fontColor: '#718096',
        content: '{labelCargoType}',
        readOnly: true,
      },
      {
        name: 'cargoType',
        type: 'text',
        position: { x: 124, y: 69 },
        width: 30,
        height: 4,
        fontSize: 8,
      },
      {
        name: 'exchangeRatesLabel',
        type: 'text',
        position: { x: 12, y: 75 },
        width: 25,
        height: 4,
        fontSize: 7,
        fontColor: '#718096',
        content: '{labelExchangeRates}',
        readOnly: true,
      },
      {
        name: 'exchangeRates',
        type: 'text',
        position: { x: 39, y: 75 },
        width: 159,
        height: 4,
        fontSize: 7,
        fontColor: '#4a5568',
      },

      // ── Routes & Lines table ──
      {
        name: 'routesTable',
        type: 'table',
        position: { x: 12, y: 83 },
        width: 186,
        height: 170,
        showHead: true,
        repeatHead: false,
        head: ['#', 'Description', 'Container', 'Currency', 'Amount'],
        headWidthPercentages: [6, 40, 14, 15, 25],
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
          backgroundColor: PRIMARY_COLOR,
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
          alternateBackgroundColor: '#f7fafa',
        },
        columnStyles: {},
      },

      // ── Footer ──
      {
        name: 'footerLine',
        type: 'line',
        position: { x: 12, y: 275 },
        width: 186,
        height: 1,
        color: PRIMARY_COLOR,
      },
      {
        name: 'footerHtml',
        type: 'text',
        position: { x: 12, y: 278 },
        width: 130,
        height: 12,
        fontSize: 7,
        fontColor: '#718096',
        lineHeight: 1.4,
      },
      {
        name: 'footerDate',
        type: 'text',
        position: { x: 150, y: 278 },
        width: 48,
        height: 5,
        fontSize: 7,
        fontColor: '#718096',
        alignment: 'right',
        content: '{currentDate}',
        readOnly: true,
      },
    ],

    // ═══════════════════════════════════════════════════
    // PAGE 2 — CONTACT & TERMS
    // ═══════════════════════════════════════════════════
    [
      // Top accent bar
      {
        name: 'page2TopBar',
        type: 'rectangle',
        position: { x: 0, y: 0 },
        width: A4.width,
        height: 3,
        color: PRIMARY_COLOR,
        borderWidth: 0,
        borderColor: '',
        content: '',
        readOnly: true,
      } as any,

      // Header — offer label + number (left)
      {
        name: 'page2OfferTitle',
        type: 'text',
        position: { x: 12, y: 8 },
        width: 100,
        height: 7,
        fontSize: 11,
        fontWeight: 'bold',
        fontColor: PRIMARY_COLOR,
        content: '{labelOffer} — {offerNumber}',
        readOnly: true,
      },
      // Company logo (right)
      {
        name: 'page2Logo',
        type: 'image',
        position: { x: 160, y: 6 },
        width: 38,
        height: 14,
      },
      // Header line
      {
        name: 'page2HeaderLine',
        type: 'line',
        position: { x: 12, y: 22 },
        width: 186,
        height: 1,
        color: '#e2e8f0',
      },

      // ── Contact section ──
      {
        name: 'contactSectionLabel',
        type: 'text',
        position: { x: 12, y: 28 },
        width: 60,
        height: 5,
        fontSize: 8,
        fontWeight: 'bold',
        fontColor: PRIMARY_COLOR,
        content: 'Contact Person',
        readOnly: true,
      },
      // Contact person photo placeholder (circle area)
      {
        name: 'contactPhoto',
        type: 'ellipse',
        position: { x: 12, y: 36 },
        width: 28,
        height: 28,
        color: '#e2e8f0',
        borderWidth: 0,
        borderColor: '',
        content: '',
        readOnly: true,
      } as any,
      {
        name: 'page2ContactName',
        type: 'text',
        position: { x: 46, y: 40 },
        width: 60,
        height: 7,
        fontSize: 12,
        fontWeight: 'bold',
        fontColor: '#1a202c',
      },
      {
        name: 'page2ContactEmail',
        type: 'text',
        position: { x: 46, y: 48 },
        width: 60,
        height: 5,
        fontSize: 9,
        fontColor: '#4a5568',
      },

      // QR Code placeholder (right side of contact section)
      {
        name: 'qrCodeLabel',
        type: 'text',
        position: { x: 155, y: 28 },
        width: 43,
        height: 4,
        fontSize: 7,
        fontColor: '#718096',
        alignment: 'center',
        content: 'Scan for details',
        readOnly: true,
      },
      {
        name: 'qrCode',
        type: 'qrcode',
        position: { x: 163, y: 34 },
        width: 28,
        height: 28,
      } as any,

      // ── Terms & Conditions ──
      {
        name: 'termsSeparator',
        type: 'line',
        position: { x: 12, y: 72 },
        width: 186,
        height: 1,
        color: '#e2e8f0',
      },
      {
        name: 'termsTitle',
        type: 'text',
        position: { x: 12, y: 78 },
        width: 100,
        height: 8,
        fontSize: 14,
        fontWeight: 'bold',
        fontColor: PRIMARY_COLOR,
        content: '{labelTermsTitle}',
        readOnly: true,
      },
      {
        name: 'rulesAgreementHtml',
        type: 'text',
        position: { x: 12, y: 90 },
        width: 186,
        height: 20,
        fontSize: 9,
        fontColor: '#4a5568',
        lineHeight: 1.5,
      },

      // ── Special terms ──
      {
        name: 'specialTermsLabel',
        type: 'text',
        position: { x: 12, y: 114 },
        width: 60,
        height: 5,
        fontSize: 8,
        fontWeight: 'bold',
        fontColor: PRIMARY_COLOR,
        content: 'Special Terms:',
        readOnly: true,
      },
      {
        name: 'specialTerms',
        type: 'text',
        position: { x: 12, y: 121 },
        width: 186,
        height: 70,
        fontSize: 9,
        fontColor: '#1a202c',
        lineHeight: 1.5,
      },

      // ── Customer notes ──
      {
        name: 'customerNotesLabel',
        type: 'text',
        position: { x: 12, y: 196 },
        width: 40,
        height: 5,
        fontSize: 8,
        fontWeight: 'bold',
        fontColor: PRIMARY_COLOR,
        content: '{labelCustomerNotes}:',
        readOnly: true,
      },
      {
        name: 'customerNotes',
        type: 'text',
        position: { x: 12, y: 203 },
        width: 186,
        height: 20,
        fontSize: 9,
        fontColor: '#4a5568',
        lineHeight: 1.4,
      },

      // ── Footer ──
      {
        name: 'page2FooterLine',
        type: 'line',
        position: { x: 12, y: 275 },
        width: 186,
        height: 1,
        color: PRIMARY_COLOR,
      },
      {
        name: 'page2FooterHtml',
        type: 'text',
        position: { x: 12, y: 278 },
        width: 130,
        height: 12,
        fontSize: 7,
        fontColor: '#718096',
        lineHeight: 1.4,
      },
      {
        name: 'page2FooterDate',
        type: 'text',
        position: { x: 150, y: 278 },
        width: 48,
        height: 5,
        fontSize: 7,
        fontColor: '#718096',
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
  { name: 'specialTerms', type: 'text', description: 'Custom conditions / special terms' },
  { name: 'exchangeRates', type: 'text', description: 'Exchange rate information' },

  // Contact Person
  { name: 'contactPersonName', type: 'text', description: 'Name of the contact person' },
  { name: 'contactPersonEmail', type: 'text', description: 'Email of the contact person' },

  // Routes (dynamic content)
  { name: 'routesContent', type: 'text', description: 'Formatted routes/lines content (legacy text)' },
  { name: 'routesTable', type: 'text', description: 'Offer lines as table data (JSON 2D array, 5 cols: #, Description, Container, Currency, Amount). Includes route header rows and totals.' },

  // Footer & Terms
  { name: 'footerHtml', type: 'text', description: 'Footer content' },
  { name: 'page2FooterHtml', type: 'text', description: 'Page 2 footer content' },
  { name: 'rulesAgreementHtml', type: 'text', description: 'Terms and conditions' },

  // Cover
  { name: 'coverPageImageUrl', type: 'image', description: 'Cover page image URL' },
  { name: 'coverClientName', type: 'text', description: 'Client name displayed on cover page' },
  { name: 'coverCompanyName', type: 'text', description: 'Company name displayed on cover page' },
  { name: 'coverDate', type: 'text', description: 'Date displayed on cover page' },

  // Page 2 (contact & terms page)
  { name: 'page2ContactName', type: 'text', description: 'Contact person name on page 2' },
  { name: 'page2ContactEmail', type: 'text', description: 'Contact person email on page 2' },
  { name: 'qrCode', type: 'text', description: 'QR code content (defaults to offer number)' },

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
  primaryColor: '#1b5e5e',
  accentColor: '#e07040',

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
  specialTerms: 'Rates are subject to equipment availability at the time of booking.\nFree time at destination: 14 days.\nDemurrage and detention charges apply after free time expires.',
  exchangeRates: 'EUR: 1.00, USD: 1.08, PLN: 4.32',

  // Contact Person
  contactPersonName: 'Jan Kowalski',
  contactPersonEmail: 'jan.kowalski@example.com',

  // Routes (formatted example)
  routesContent: `EXPORT  Warsaw \u2192 Hamburg \u2192 Shanghai
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
#   Name                            Cur         Total
1.  Ocean Freight (40'HC)           EUR      1,800.00
2.  THC Origin                      EUR        350.00
3.  Documentation Fee               EUR         50.00
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    TOTAL                           EUR      2,200.00`,

  // Routes (table data for pdfme table schema — 5 columns with route grouping)
  // NOTE: In real PDF generation, expandRouteTables() replaces the single
  // routesTable with per-route tables (routeTable_0, routeTable_1, …).
  // This sample is used only for the designer preview which keeps the flat layout.
  routesTable: JSON.stringify([
    ['', 'EXPORT  Warsaw - Shanghai', '', '', ''],
    ['1', "Ocean Freight (40'HC)", "40'HC", 'EUR', '1,800.00'],
    ['2', 'THC Origin', "40'HC", 'EUR', '350.00'],
    ['3', 'Documentation Fee', '-', 'EUR', '50.00'],
    ['', 'IMPORT  Shanghai - Warsaw', '', '', ''],
    ['4', 'Inland Transport', '-', 'USD', '500.00'],
    ['5', 'Customs Clearance', '-', 'USD', '150.00'],
  ]),

  // Footer & Terms
  footerHtml: 'Thank you for your business!',
  page2FooterHtml: 'Thank you for your business!',
  rulesAgreementHtml: 'Standard terms and conditions apply.',

  // Cover
  coverPageImageUrl: '',
  coverClientName: 'ACME Corporation',
  coverCompanyName: 'Open Mercato',
  coverDate: 'March 12, 2026',

  // Page 2
  page2ContactName: 'Jan Kowalski',
  page2ContactEmail: 'jan.kowalski@example.com',
  qrCode: 'OFF-2026-00001',

  // System
  currentDate: 'March 15, 2026',
}
