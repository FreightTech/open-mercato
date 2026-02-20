export type TemplateField = {
  tag: string
  label: string
  group: string
  isArray?: boolean
  arrayItemFields?: string[]
}

export const OFFER_TEMPLATE_FIELDS: TemplateField[] = [
  // Offer Details
  { group: 'offer', tag: 'offerName', label: 'Offer Name' },
  { group: 'offer', tag: 'offerNumber', label: 'Offer Number' },
  { group: 'offer', tag: 'awbNumber', label: 'AWB Number' },
  { group: 'offer', tag: 'departureDate', label: 'Departure Date' },
  { group: 'offer', tag: 'status', label: 'Status' },
  { group: 'offer', tag: 'connectionMethod', label: 'Connection Method' },

  // Rates & Pricing
  { group: 'rates', tag: 'currencyCode', label: 'Currency' },
  { group: 'rates', tag: 'connectionRatePerKg', label: 'Connection Rate/kg' },
  { group: 'rates', tag: 'connectionRateTotal', label: 'Connection Rate Total' },
  { group: 'rates', tag: 'airfreightRatePerKg', label: 'Airfreight Rate/kg' },
  { group: 'rates', tag: 'airfreightRateTotal', label: 'Airfreight Rate Total' },
  { group: 'rates', tag: 'totalRatePerKg', label: 'Total Rate/kg' },
  { group: 'rates', tag: 'totalRate', label: 'Total Rate' },

  // Client Information
  { group: 'client', tag: 'clientName', label: 'Client Name' },
  { group: 'client', tag: 'contactName', label: 'Contact Name' },
  { group: 'client', tag: 'contactEmail', label: 'Contact Email' },
  { group: 'client', tag: 'contactPhone', label: 'Contact Phone' },

  // Company Information
  { group: 'company', tag: 'companyName', label: 'Company Name' },
  { group: 'company', tag: 'companyEmail', label: 'Company Email' },
  { group: 'company', tag: 'companyPhone', label: 'Company Phone' },
  { group: 'company', tag: 'companyAddress', label: 'Company Address' },

  // Air Routing (array)
  {
    group: 'routing',
    tag: 'routing',
    label: 'Air Routing Legs',
    isArray: true,
    arrayItemFields: [
      'flightNumber',
      'originAirport',
      'destinationAirport',
      'departureDate',
      'departureTime',
      'arrivalDate',
      'arrivalTime',
      'carrierName',
    ],
  },

  // Offer Lines (array)
  {
    group: 'lines',
    tag: 'lines',
    label: 'Offer Lines',
    isArray: true,
    arrayItemFields: [
      'name',
      'numberOfPieces',
      'actualWeightKg',
      'chargeableWeightKg',
      'volumeM3',
      'loadingMetres',
    ],
  },
]

export const FIELD_GROUPS = [
  { id: 'offer', label: 'Offer Details' },
  { id: 'rates', label: 'Rates & Pricing' },
  { id: 'client', label: 'Client Information' },
  { id: 'company', label: 'Company Information' },
  { id: 'routing', label: 'Air Routing' },
  { id: 'lines', label: 'Offer Lines' },
] as const

export type FieldGroup = (typeof FIELD_GROUPS)[number]['id']

export function getFieldsByGroup(group: FieldGroup): TemplateField[] {
  return OFFER_TEMPLATE_FIELDS.filter((field) => field.group === group)
}

export function generateLoopTemplate(field: TemplateField): string {
  if (!field.isArray || !field.arrayItemFields) {
    return `{{${field.tag}}}`
  }

  const itemFields = field.arrayItemFields.map((f) => `{{${f}}}`).join(' | ')
  return `{{#each ${field.tag}}}\n  ${itemFields}\n{{/each}}`
}

// Sample data for preview
export const SAMPLE_TEMPLATE_DATA = {
  offerName: 'Air Freight Offer - Shanghai to Frankfurt',
  offerNumber: 'OFF-2024-001234',
  awbNumber: '160-12345678',
  departureDate: 'March 15, 2024',
  status: 'Confirmed',
  connectionMethod: 'Truck',

  currencyCode: 'EUR',
  connectionRatePerKg: '0.85',
  connectionRateTotal: '425.00',
  airfreightRatePerKg: '3.50',
  airfreightRateTotal: '1,750.00',
  totalRatePerKg: '4.35',
  totalRate: '2,175.00',

  clientName: 'ACME Logistics GmbH',
  contactName: 'Hans Mueller',
  contactEmail: 'h.mueller@acme-logistics.de',
  contactPhone: '+49 69 123 4567',

  companyName: '4R Cargo',
  companyEmail: 'offers@4rcargo.com',
  companyPhone: '+48 22 123 4567',
  companyAddress: 'ul. Lotnicza 12, 00-001 Warsaw, Poland',

  routing: [
    {
      flightNumber: 'LH8401',
      originAirport: 'PVG (Shanghai)',
      destinationAirport: 'FRA (Frankfurt)',
      departureDate: 'March 15, 2024',
      departureTime: '10:30',
      arrivalDate: 'March 15, 2024',
      arrivalTime: '16:45',
      carrierName: 'Lufthansa Cargo',
    },
  ],

  lines: [
    {
      name: 'Electronic Components',
      numberOfPieces: 12,
      actualWeightKg: '450.00',
      chargeableWeightKg: '500.00',
      volumeM3: '2.50',
      loadingMetres: '1.20',
    },
    {
      name: 'Machinery Parts',
      numberOfPieces: 4,
      actualWeightKg: '280.00',
      chargeableWeightKg: '320.00',
      volumeM3: '1.60',
      loadingMetres: '0.80',
    },
  ],
}
