import type { PdfTemplateType } from '../data/entities'

export type { PdfTemplateType }

export type TemplateField = {
  tag: string
  label: string
  description?: string
  isArray?: boolean
  arrayItemFields?: { tag: string; label: string }[]
}

export type ControlStructure = {
  id: string
  label: string
  template: string
}

export const COMMON_FIELDS: TemplateField[] = [
  { tag: 'companyName', label: 'Company Name', description: 'Your company name from settings' },
  { tag: 'companyLogoUrl', label: 'Company Logo URL', description: 'URL to your company logo' },
  { tag: 'primaryColor', label: 'Primary Color', description: 'Primary brand color (hex)' },
  { tag: 'accentColor', label: 'Accent Color', description: 'Accent/background color (hex)' },
  { tag: 'currentDate', label: 'Current Date', description: 'Date when PDF is generated' },
  { tag: 'pageNumber', label: 'Page Number', description: 'Current page number' },
  { tag: 'totalPages', label: 'Total Pages', description: 'Total number of pages' },
]

export const TEMPLATE_FIELDS: Record<PdfTemplateType, TemplateField[]> = {
  offer: [
    // Label variables (customizable per company/language)
    { tag: 'labelOffer', label: 'Label: Offer', description: 'Text label for "Offer" (customizable)' },
    { tag: 'labelClient', label: 'Label: Client', description: 'Text label for "Client" section' },
    { tag: 'labelTaxId', label: 'Label: Tax ID', description: 'Text label for "Tax ID"' },
    { tag: 'labelIncoterms', label: 'Label: Incoterms', description: 'Text label for "Incoterms"' },
    { tag: 'labelValidity', label: 'Label: Validity', description: 'Text label for "Validity"' },
    { tag: 'labelPaymentTerms', label: 'Label: Payment Terms', description: 'Text label for "Payment Terms"' },
    { tag: 'labelCargo', label: 'Label: Cargo', description: 'Text label for "Cargo"' },
    { tag: 'labelCargoType', label: 'Label: Cargo Type', description: 'Text label for "Cargo Type"' },
    { tag: 'labelCurrency', label: 'Label: Currency', description: 'Text label for "Currency"' },
    { tag: 'labelLineNumber', label: 'Label: Line Number', description: 'Column header for line number' },
    { tag: 'labelName', label: 'Label: Name', description: 'Column header for product/service name' },
    { tag: 'labelCurrencyCol', label: 'Label: Currency Column', description: 'Column header for currency' },
    { tag: 'labelFeeScope', label: 'Label: Fee Scope', description: 'Column header for fee scope/container size' },
    { tag: 'labelQuantity', label: 'Label: Quantity', description: 'Column header for quantity' },
    { tag: 'labelRate', label: 'Label: Rate', description: 'Column header for unit rate/price' },
    { tag: 'labelTotal', label: 'Label: Total', description: 'Column header for total amount' },
    { tag: 'labelCustomerNotes', label: 'Label: Customer Notes', description: 'Text label for customer notes section' },
    { tag: 'labelExchangeRates', label: 'Label: Exchange Rates', description: 'Text label for exchange rates' },
    { tag: 'labelTermsTitle', label: 'Label: Terms Title', description: 'Title for terms & conditions page' },

    // Offer data fields
    { tag: 'offerNumber', label: 'Offer Number', description: 'Unique offer identifier' },
    { tag: 'version', label: 'Version', description: 'Offer version number' },
    { tag: 'status', label: 'Status', description: 'Current offer status' },
    { tag: 'createdDate', label: 'Created Date', description: 'Date offer was created' },
    { tag: 'validUntil', label: 'Valid Until', description: 'Offer expiration date' },
    { tag: 'isExpired', label: 'Is Expired', description: 'Boolean: true if offer has expired' },
    { tag: 'clientName', label: 'Client Name', description: 'Name of the client company' },
    { tag: 'clientAddress', label: 'Client Address', description: 'Client full address with postal code' },
    { tag: 'clientTaxId', label: 'Client Tax ID', description: 'Client tax identification number' },
    { tag: 'incoterms', label: 'Incoterms', description: 'Incoterms (e.g., CFR, FOB, CIF)' },
    { tag: 'cargoDescription', label: 'Cargo Description', description: 'Description of the cargo/goods' },
    { tag: 'cargoType', label: 'Cargo Type', description: 'Type of cargo load (e.g., FCL, LCL, Neutral)' },
    { tag: 'currencyCode', label: 'Currency Code', description: 'Currency code (e.g., USD, EUR)' },
    { tag: 'paymentTerms', label: 'Payment Terms', description: 'Payment terms (e.g., "21 dni", "Net 30")' },
    { tag: 'customerNotes', label: 'Customer Notes', description: 'Notes for the customer' },
    { tag: 'exchangeRates', label: 'Exchange Rates', description: 'Exchange rate information (e.g., "USD: 3.5848")' },
    { tag: 'coverPageImageUrl', label: 'Cover Page Image URL', description: 'URL of cover page image (optional)' },
    { tag: 'footerHtml', label: 'Footer HTML', description: 'Custom HTML for footer section (from settings)' },
    { tag: 'rulesAgreementHtml', label: 'Rules Agreement HTML', description: 'Terms & conditions HTML (from settings)' },
    
    // Routes array
    {
      tag: 'routes',
      label: 'Routes',
      description: 'Array of route sections (each with origin, destination, and line items)',
      isArray: true,
      arrayItemFields: [
        { tag: 'routeLabel', label: 'Route Label' },
        { tag: 'transportModeClass', label: 'Transport Mode CSS Class' },
        { tag: 'lines', label: 'Route Line Items (nested array)' },
      ],
    },
  ],
}

export const CONTROL_STRUCTURES: ControlStructure[] = [
  {
    id: 'if',
    label: 'Conditional (if)',
    template: '{{#if CONDITION}}\n  <!-- Content shown if CONDITION is truthy -->\n{{/if}}',
  },
  {
    id: 'each',
    label: 'Loop (each)',
    template: '{{#each ARRAY}}\n  <tr>\n    <td>{{propertyName}}</td>\n  </tr>\n{{/each}}',
  },
]

/**
 * Get all available fields for a template type including common fields
 */
export function getFieldsForType(templateType: PdfTemplateType): TemplateField[] {
  return [...COMMON_FIELDS, ...TEMPLATE_FIELDS[templateType]]
}

/**
 * Get field documentation as HTML for display in editor
 */
export function getFieldDocumentation(templateType: PdfTemplateType): string {
  const fields = getFieldsForType(templateType)
  
  let html = '<h3>Available Variables</h3>\n<table>\n<tr><th>Tag</th><th>Description</th></tr>\n'
  
  for (const field of fields) {
    if (field.isArray) {
      html += `<tr><td><code>{{#each ${field.tag}}}</code></td><td>${field.description} (array)</td></tr>\n`
      if (field.arrayItemFields) {
        for (const subField of field.arrayItemFields) {
          html += `<tr><td><code>  {{${subField.tag}}}</code></td><td>${subField.label}</td></tr>\n`
        }
      }
    } else {
      html += `<tr><td><code>{{${field.tag}}}</code></td><td>${field.description || field.label}</td></tr>\n`
    }
  }
  
  html += '</table>'
  return html
}
