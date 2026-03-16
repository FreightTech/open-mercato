export type TemplateType = 'offer' | 'invoice' | 'quote_request' | 'shipment_notification' | 'booking_confirmation' | 'general_message'

export type FieldGroup = 'common' | 'offer' | 'invoice' | 'shipment' | 'booking' | 'quote' | 'lines' | 'air_offer' | 'routing'

export type TemplateField = {
  tag: string
  group: FieldGroup
  isArray?: boolean
  arrayItemFields?: string[]
}

export const FIELD_GROUPS = [
  { id: 'common', label: 'Common' },
  { id: 'offer', label: 'Offer Details' },
  { id: 'air_offer', label: 'Air Freight Offer' },
  { id: 'routing', label: 'Air Routing' },
  { id: 'invoice', label: 'Invoice' },
  { id: 'shipment', label: 'Shipment' },
  { id: 'booking', label: 'Booking' },
  { id: 'quote', label: 'Quote Request' },
  { id: 'lines', label: 'Line Items' },
] as const

export const ALL_FIELDS: TemplateField[] = [
  // Common fields (available in all template types)
  { tag: 'contactName', group: 'common' },
  { tag: 'companyName', group: 'common' },
  { tag: 'primaryColor', group: 'common' },
  { tag: 'accentColor', group: 'common' },
  { tag: 'message', group: 'common' },

  // Offer fields
  { tag: 'offerNumber', group: 'offer' },
  { tag: 'originPorts', group: 'offer' },
  { tag: 'destPorts', group: 'offer' },
  { tag: 'validUntil', group: 'offer' },
  { tag: 'totalAmount', group: 'offer' },

  // Air freight offer fields (4R Cargo compatible)
  { tag: 'offerName', group: 'air_offer' },
  { tag: 'awbNumber', group: 'air_offer' },
  { tag: 'departureDate', group: 'air_offer' },
  { tag: 'arrivalDate', group: 'air_offer' },
  { tag: 'transitTime', group: 'air_offer' },
  { tag: 'connectionMethod', group: 'air_offer' },
  { tag: 'currencyCode', group: 'air_offer' },
  { tag: 'connectionRatePerKg', group: 'air_offer' },
  { tag: 'connectionRateTotal', group: 'air_offer' },
  { tag: 'airfreightRatePerKg', group: 'air_offer' },
  { tag: 'airfreightRateTotal', group: 'air_offer' },
  { tag: 'totalRatePerKg', group: 'air_offer' },
  { tag: 'totalRate', group: 'air_offer' },
  { tag: 'clientName', group: 'air_offer' },
  { tag: 'contactEmail', group: 'air_offer' },
  { tag: 'contactPhone', group: 'air_offer' },
  { tag: 'originAirport', group: 'air_offer' },
  { tag: 'destinationAirport', group: 'air_offer' },

  // Air routing (array)
  {
    tag: 'routing',
    group: 'routing',
    isArray: true,
    arrayItemFields: ['flightNumber', 'originAirport', 'destinationAirport', 'departureDate', 'departureTime', 'arrivalDate', 'arrivalTime'],
  },

  // Invoice fields
  { tag: 'invoiceNumber', group: 'invoice' },
  { tag: 'dueDate', group: 'invoice' },

  // Shipment fields
  { tag: 'shipmentNumber', group: 'shipment' },
  { tag: 'status', group: 'shipment' },
  { tag: 'currentLocation', group: 'shipment' },

  // Booking fields
  { tag: 'bookingNumber', group: 'booking' },
  { tag: 'bookingDate', group: 'booking' },

  // Quote request fields
  { tag: 'rfqTitle', group: 'quote' },

  // Line items (array)
  {
    tag: 'lines',
    group: 'lines',
    isArray: true,
    arrayItemFields: ['description', 'quantity', 'unitPrice', 'amount'],
  },
]

// Map template types to relevant field groups
export const TEMPLATE_TYPE_GROUPS: Record<TemplateType, FieldGroup[]> = {
  offer: ['common', 'offer', 'air_offer', 'routing', 'lines'],
  invoice: ['common', 'invoice', 'lines'],
  quote_request: ['common', 'quote'],
  shipment_notification: ['common', 'shipment'],
  booking_confirmation: ['common', 'booking'],
  general_message: ['common'],
}

// Get fields for a specific template type
export function getFieldsForType(templateType: TemplateType): TemplateField[] {
  const allowedGroups = TEMPLATE_TYPE_GROUPS[templateType]
  return ALL_FIELDS.filter((field) => allowedGroups.includes(field.group))
}

// Get fields grouped by category for a template type
export function getGroupedFieldsForType(templateType: TemplateType): Record<FieldGroup, TemplateField[]> {
  const allowedGroups = TEMPLATE_TYPE_GROUPS[templateType]
  const result: Record<FieldGroup, TemplateField[]> = {
    common: [],
    offer: [],
    air_offer: [],
    routing: [],
    invoice: [],
    shipment: [],
    booking: [],
    quote: [],
    lines: [],
  }

  for (const field of ALL_FIELDS) {
    if (allowedGroups.includes(field.group)) {
      result[field.group].push(field)
    }
  }

  return result
}

// Generate loop template for array fields
export function generateLoopTemplate(field: TemplateField): string {
  if (!field.isArray || !field.arrayItemFields) {
    return `{{${field.tag}}}`
  }

  const itemFields = field.arrayItemFields.map((f) => `{{${f}}}`).join(' | ')
  return `{{#each ${field.tag}}}\n  ${itemFields}\n{{/each}}`
}

// Control structures for advanced template editing
export const CONTROL_STRUCTURES = [
  {
    id: 'if',
    template: '{{#if variableName}}\n  Content when true\n{{/if}}',
  },
  {
    id: 'each',
    template: '{{#each arrayName}}\n  {{this}}\n{{/each}}',
  },
]

// Sample data for preview (per template type)
export const SAMPLE_TEMPLATE_DATA: Record<TemplateType, Record<string, unknown>> = {
  offer: {
    contactName: 'John Smith',
    companyName: 'FreightTech International',
    primaryColor: '#1a365d',
    accentColor: '#f7fafc',
    offerNumber: 'OFF-2024-001',
    originPorts: 'Shanghai (CNSHA)',
    destPorts: 'Los Angeles (USLAX)',
    validUntil: 'January 31, 2024',
    totalAmount: '$5,250.00',
    message: 'We are pleased to offer competitive rates for your shipment.',
    // Air freight specific fields (4R Cargo compatible)
    offerName: 'Air Freight Offer - Shanghai to Frankfurt',
    awbNumber: '160-12345678',
    departureDate: 'March 15, 2024',
    arrivalDate: 'March 16, 2024',
    transitTime: '1 day',
    connectionMethod: 'Truck',
    currencyCode: 'EUR',
    connectionRatePerKg: 'EUR 0.85',
    connectionRateTotal: 'EUR 425.00',
    airfreightRatePerKg: 'EUR 3.50',
    airfreightRateTotal: 'EUR 1,750.00',
    totalRatePerKg: 'EUR 4.35',
    totalRate: 'EUR 2,175.00',
    clientName: 'ACME Logistics GmbH',
    contactEmail: 'h.mueller@acme-logistics.de',
    contactPhone: '+49 69 123 4567',
    originAirport: 'PVG (Shanghai)',
    destinationAirport: 'FRA (Frankfurt)',
    routing: [
      {
        flightNumber: 'LH8401',
        originAirport: 'PVG (Shanghai)',
        destinationAirport: 'FRA (Frankfurt)',
        departureDate: 'March 15, 2024',
        departureTime: '10:30',
        arrivalDate: 'March 15, 2024',
        arrivalTime: '16:45',
      },
    ],
    lines: [
      { description: 'Ocean Freight - 40ft Container', quantity: '2', unitPrice: '$1,500.00', amount: '$3,000.00' },
      { description: 'Terminal Handling Charge', quantity: '2', unitPrice: '$250.00', amount: '$500.00' },
      { description: 'Documentation Fee', quantity: '1', unitPrice: '$150.00', amount: '$150.00' },
    ],
  },
  invoice: {
    contactName: 'Jane Doe',
    companyName: 'FreightTech International',
    primaryColor: '#1a365d',
    accentColor: '#f7fafc',
    invoiceNumber: 'INV-2024-0042',
    dueDate: 'February 15, 2024',
    totalAmount: '$3,750.00',
    lines: [
      { description: 'Freight Services', quantity: '1', unitPrice: '$3,500.00', amount: '$3,500.00' },
      { description: 'Insurance', quantity: '1', unitPrice: '$250.00', amount: '$250.00' },
    ],
  },
  quote_request: {
    contactName: 'Michael Chen',
    companyName: 'FreightTech International',
    primaryColor: '#1a365d',
    accentColor: '#f7fafc',
    rfqTitle: 'Shanghai to Los Angeles - 40ft Container',
    validUntil: 'February 28, 2024',
    message: 'Thank you for your request. Please find our quotation below.',
  },
  shipment_notification: {
    contactName: 'Sarah Johnson',
    companyName: 'FreightTech International',
    primaryColor: '#1a365d',
    accentColor: '#f7fafc',
    shipmentNumber: 'SHP-2024-0567',
    status: 'In Transit',
    currentLocation: 'Hong Kong Port',
    message: 'Your shipment is on schedule and expected to arrive within 3 days.',
  },
  booking_confirmation: {
    contactName: 'Robert Williams',
    companyName: 'FreightTech International',
    primaryColor: '#1a365d',
    accentColor: '#f7fafc',
    bookingNumber: 'BK-2024-0891',
    bookingDate: 'March 15, 2024',
    message: 'Your booking has been confirmed. Please find the details below.',
  },
  general_message: {
    contactName: 'Emily Davis',
    companyName: 'FreightTech International',
    primaryColor: '#1a365d',
    accentColor: '#f7fafc',
    message: 'Thank you for choosing our services. We appreciate your business and look forward to serving you.',
  },
}

// Default template content (markdown format)
export const DEFAULT_TEMPLATE_CONTENT: Record<TemplateType, { subject: string; content: string }> = {
  offer: {
    subject: 'Freight Offer {{offerNumber}} - {{originPorts}} to {{destPorts}}',
    content: `Dear {{contactName}},

Please find attached our freight offer for your shipment.

**Route:** {{originPorts}} to {{destPorts}}

**Valid Until:** {{validUntil}}

**Total Amount:** {{totalAmount}}

{{#if message}}
{{message}}
{{/if}}

{{#if lines}}
### Line Items

{{#each lines}}
- {{description}}: {{quantity}} x {{unitPrice}} = {{amount}}
{{/each}}
{{/if}}

The detailed offer is attached as a PDF document.

If you have any questions, please don't hesitate to contact us.

Best regards,
{{companyName}}`,
  },
  invoice: {
    subject: 'Invoice {{invoiceNumber}} from {{companyName}}',
    content: `Dear {{contactName}},

Please find attached invoice **{{invoiceNumber}}**.

**Due Date:** {{dueDate}}

**Amount Due:** {{totalAmount}}

{{#if lines}}
### Invoice Items

{{#each lines}}
- {{description}}: {{quantity}} x {{unitPrice}} = {{amount}}
{{/each}}
{{/if}}

Payment can be made via the methods specified in the attached invoice.

Thank you for your business.

Best regards,
{{companyName}}`,
  },
  quote_request: {
    subject: 'RFQ: {{rfqTitle}} - Response',
    content: `Dear {{contactName}},

Thank you for your request for quotation.

**RFQ:** {{rfqTitle}}

**Valid Until:** {{validUntil}}

{{#if message}}
{{message}}
{{/if}}

Please review the attached quotation and let us know if you have any questions.

Best regards,
{{companyName}}`,
  },
  shipment_notification: {
    subject: 'Shipment Update: {{shipmentNumber}}',
    content: `Dear {{contactName}},

This is an update regarding your shipment **{{shipmentNumber}}**.

**Status:** {{status}}

**Current Location:** {{currentLocation}}

{{#if message}}
{{message}}
{{/if}}

You can track your shipment using the tracking number provided.

Best regards,
{{companyName}}`,
  },
  booking_confirmation: {
    subject: 'Booking Confirmation {{bookingNumber}}',
    content: `Dear {{contactName}},

Your booking has been confirmed.

**Booking Number:** {{bookingNumber}}

**Date:** {{bookingDate}}

{{#if message}}
{{message}}
{{/if}}

Please find the booking details in the attachment.

Best regards,
{{companyName}}`,
  },
  general_message: {
    subject: 'Message from {{companyName}}',
    content: `Dear {{contactName}},

{{#if message}}
{{message}}
{{/if}}

Best regards,
{{companyName}}`,
  },
}

// Template type labels for UI
export const TEMPLATE_TYPE_LABELS: Record<TemplateType, string> = {
  offer: 'Offer',
  invoice: 'Invoice',
  quote_request: 'Quote Request',
  shipment_notification: 'Shipment Notification',
  booking_confirmation: 'Booking Confirmation',
  general_message: 'General Message',
}

export const TEMPLATE_TYPES: TemplateType[] = [
  'offer',
  'invoice',
  'quote_request',
  'shipment_notification',
  'booking_confirmation',
  'general_message',
]
