export type TemplateType = 'offer' | 'invoice' | 'quote_request' | 'shipment_notification' | 'booking_confirmation' | 'general_message'

export type TemplateField = {
  tag: string                    // e.g., "contactName"
  isArray?: boolean             // If true, clicking inserts loop template
  arrayItemFields?: string[]    // For loop templates, suggested fields
}

export type ControlStructure = {
  id: string
  template: string              // Template with PLACEHOLDER markers
}

export const COMMON_FIELDS: TemplateField[] = [
  { tag: 'contactName' },
  { tag: 'companyName' },
  { tag: 'primaryColor' },
  { tag: 'accentColor' },
]

export const TEMPLATE_FIELDS: Record<TemplateType, TemplateField[]> = {
  offer: [
    { tag: 'offerNumber' },
    { tag: 'originPorts' },
    { tag: 'destPorts' },
    { tag: 'validUntil' },
    { tag: 'totalAmount' },
    { tag: 'message' },
    { 
      tag: 'lines',
      isArray: true,
      arrayItemFields: ['description', 'quantity', 'unitPrice', 'amount']
    },
  ],
  invoice: [
    { tag: 'invoiceNumber' },
    { tag: 'dueDate' },
    { tag: 'totalAmount' },
  ],
  quote_request: [
    { tag: 'rfqTitle' },
    { tag: 'validUntil' },
  ],
  shipment_notification: [
    { tag: 'shipmentNumber' },
    { tag: 'status' },
    { tag: 'currentLocation' },
    { tag: 'message' },
  ],
  booking_confirmation: [
    { tag: 'bookingNumber' },
    { tag: 'bookingDate' },
  ],
  general_message: [
    { tag: 'message' },
  ],
}

export const CONTROL_STRUCTURES: ControlStructure[] = [
  {
    id: 'if',
    template: '{{#if CONDITION}}\n  CONTENT\n{{/if}}',
  },
  {
    id: 'each',
    template: '{{#each ARRAY}}\n  {{PROPERTY}}\n{{/each}}',
  },
]
