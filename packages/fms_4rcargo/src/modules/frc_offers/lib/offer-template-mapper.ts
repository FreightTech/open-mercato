/**
 * Maps offer data to template variables for email rendering.
 */

export type OfferDetailResponse = {
  id: string
  name: string
  rfqId: string | null
  rfqName: string | null
  originAirport: { id: string; code: string; city: string | null } | null
  destinationAirport: { id: string; code: string; city: string | null } | null
  carrierId: string | null
  status: string
  awbNumber: string | null
  connectionMethod: string | null
  departureDate: string | null
  connectionRatePerKg: string | null
  connectionRateTotal: string | null
  airfreightRatePerKg: string | null
  airfreightRateTotal: string | null
  totalRatePerKg: string | null
  totalRate: string | null
  currencyCode: string
  assignedToId: string | null
  organizationId: string
  tenantId: string
  createdAt: string
  updatedAt: string
  airRouting: Array<{
    id: string
    name: string
    type: string
    flightNumber: string | null
    originAirport: { id: string; code: string; city?: string | null } | null
    destinationAirport: { id: string; code: string; city?: string | null } | null
    departureDate: string | null
    departureTime: string | null
    arrivalDate: string | null
    arrivalTime: string | null
  }>
  offerLines: Array<{
    id: string
    name: string
    numberOfPieces: number
    stackableType: string
    lengthCm: string | null
    widthCm: string | null
    heightCm: string | null
    volumeM3: string
    actualWeightKg: string
    chargeableWeightKg: string
    loadingMetres: string
  }>
}

export type ContractorData = {
  id: string
  name: string
  contacts: Array<{
    id: string
    firstName: string | null
    lastName: string | null
    email: string | null
    phone: string | null
    isPrimary: boolean
  }>
}

export type TemplateVariables = {
  // Offer fields
  offerName: string
  offerNumber: string
  awbNumber: string
  departureDate: string
  status: string
  connectionMethod: string

  // Rates
  currencyCode: string
  connectionRatePerKg: string
  connectionRateTotal: string
  airfreightRatePerKg: string
  airfreightRateTotal: string
  totalRatePerKg: string
  totalRate: string

  // Client (from RFQ -> contractors)
  clientName: string
  contactName: string
  contactEmail: string
  contactPhone: string

  // Company (static or from settings - placeholder for now)
  companyName: string
  companyEmail: string
  companyPhone: string
  companyAddress: string

  // Origin/Destination
  originAirport: string
  destinationAirport: string

  // Arrays
  routing: Array<{
    flightNumber: string
    originAirport: string
    destinationAirport: string
    departureDate: string
    departureTime: string
    arrivalDate: string
    arrivalTime: string
  }>
  lines: Array<{
    name: string
    numberOfPieces: number
    actualWeightKg: string
    chargeableWeightKg: string
    volumeM3: string
    loadingMetres: string
  }>
}

/**
 * Format a date string to a readable format
 * Input: "2024-03-15" or ISO date string
 * Output: "March 15, 2024"
 */
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return dateStr
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

/**
 * Format a numeric value with currency
 */
function formatCurrency(value: string | null | undefined, currency: string): string {
  if (!value) return ''
  const num = parseFloat(value)
  if (isNaN(num)) return value
  return `${currency} ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * Format a numeric value
 */
function formatNumber(value: string | null | undefined, decimals: number = 2): string {
  if (!value) return ''
  const num = parseFloat(value)
  if (isNaN(num)) return value
  return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/**
 * Format airport for display
 */
function formatAirport(airport: { code: string; city?: string | null } | null): string {
  if (!airport) return ''
  if (airport.city) {
    return `${airport.code} (${airport.city})`
  }
  return airport.code
}

/**
 * Get primary contact from contractor
 */
function getPrimaryContact(contractor: ContractorData | null): ContractorData['contacts'][0] | null {
  if (!contractor?.contacts?.length) return null
  const primary = contractor.contacts.find((c) => c.isPrimary)
  return primary ?? contractor.contacts[0]
}

/**
 * Generate offer number from ID or name
 */
function generateOfferNumber(offer: OfferDetailResponse): string {
  // Use first 8 chars of UUID, uppercase
  const shortId = offer.id.substring(0, 8).toUpperCase()
  return `OFF-${shortId}`
}

/**
 * Map offer data to template variables
 */
export function mapOfferToTemplateVariables(
  offer: OfferDetailResponse,
  contractor?: ContractorData | null
): TemplateVariables {
  const contact = getPrimaryContact(contractor ?? null)
  const contactName = contact
    ? [contact.firstName, contact.lastName].filter(Boolean).join(' ') || ''
    : ''

  return {
    // Offer fields
    offerName: offer.name || '',
    offerNumber: generateOfferNumber(offer),
    awbNumber: offer.awbNumber || '',
    departureDate: formatDate(offer.departureDate),
    status: offer.status || '',
    connectionMethod: offer.connectionMethod || '',

    // Rates
    currencyCode: offer.currencyCode || 'EUR',
    connectionRatePerKg: formatCurrency(offer.connectionRatePerKg, offer.currencyCode),
    connectionRateTotal: formatCurrency(offer.connectionRateTotal, offer.currencyCode),
    airfreightRatePerKg: formatCurrency(offer.airfreightRatePerKg, offer.currencyCode),
    airfreightRateTotal: formatCurrency(offer.airfreightRateTotal, offer.currencyCode),
    totalRatePerKg: formatCurrency(offer.totalRatePerKg, offer.currencyCode),
    totalRate: formatCurrency(offer.totalRate, offer.currencyCode),

    // Client (from contractor)
    clientName: contractor?.name || '',
    contactName,
    contactEmail: contact?.email || '',
    contactPhone: contact?.phone || '',

    // Company (placeholder - could be from organization settings in future)
    companyName: '4R Cargo',
    companyEmail: 'info@4rcargo.com',
    companyPhone: '+1 234 567 890',
    companyAddress: '123 Logistics Way, Freight City',

    // Origin/Destination
    originAirport: formatAirport(offer.originAirport),
    destinationAirport: formatAirport(offer.destinationAirport),

    // Air routing array
    routing: offer.airRouting.map((r) => ({
      flightNumber: r.flightNumber || '',
      originAirport: formatAirport(r.originAirport),
      destinationAirport: formatAirport(r.destinationAirport),
      departureDate: formatDate(r.departureDate),
      departureTime: r.departureTime || '',
      arrivalDate: formatDate(r.arrivalDate),
      arrivalTime: r.arrivalTime || '',
    })),

    // Offer lines array
    lines: offer.offerLines.map((l) => ({
      name: l.name || '',
      numberOfPieces: l.numberOfPieces,
      actualWeightKg: formatNumber(l.actualWeightKg),
      chargeableWeightKg: formatNumber(l.chargeableWeightKg),
      volumeM3: formatNumber(l.volumeM3, 3),
      loadingMetres: formatNumber(l.loadingMetres),
    })),
  }
}
