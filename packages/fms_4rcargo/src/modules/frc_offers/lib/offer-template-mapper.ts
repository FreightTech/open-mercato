/**
 * Maps offer data to template variables for email rendering.
 * 
 * These variables are compatible with FMS email template system.
 * When using FMS renderEmail(), these variables will be merged with
 * email settings (companyName, primaryColor, etc.) automatically.
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

/**
 * Template variables compatible with FMS email template system.
 * 
 * Note: companyName, primaryColor, accentColor are NOT included here
 * because they are merged from EmailSettings by FMS renderEmail().
 */
export type TemplateVariables = {
  // Offer fields (FMS compatible)
  offerNumber: string
  offerName: string
  awbNumber: string
  departureDate: string
  arrivalDate: string
  transitTime: string
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
  totalAmount: string // FMS compatibility alias for totalRate

  // Client (FMS compatible names)
  clientName: string
  contactName: string // FMS primary field for recipient name
  contactEmail: string
  contactPhone: string

  // Origin/Destination (air freight style)
  originAirport: string
  destinationAirport: string
  // Also provide FMS-style port names for compatibility
  originPorts: string
  destPorts: string

  // Optional message
  message: string

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
    description: string // FMS compatibility alias
    numberOfPieces: number
    quantity: string // FMS compatibility alias
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
 * Calculate transit time from routing
 */
function calculateTransitTime(routing: OfferDetailResponse['airRouting']): string {
  if (routing.length === 0) return ''
  const firstLeg = routing[0]
  const lastLeg = routing[routing.length - 1]
  if (!firstLeg.departureDate || !lastLeg.arrivalDate) return ''
  
  try {
    const departure = new Date(firstLeg.departureDate)
    const arrival = new Date(lastLeg.arrivalDate)
    const diffMs = arrival.getTime() - departure.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays <= 0) return 'Same day'
    if (diffDays === 1) return '1 day'
    return `${diffDays} days`
  } catch {
    return ''
  }
}

/**
 * Get last arrival date from routing
 */
function getLastArrivalDate(routing: OfferDetailResponse['airRouting']): string {
  if (routing.length === 0) return ''
  const lastLeg = routing[routing.length - 1]
  return formatDate(lastLeg.arrivalDate)
}

/**
 * Map offer data to template variables.
 * 
 * Variables are compatible with FMS email template system.
 * Note: companyName, primaryColor, accentColor will be merged from
 * EmailSettings automatically when using FMS renderEmail().
 */
export function mapOfferToTemplateVariables(
  offer: OfferDetailResponse,
  contractor?: ContractorData | null,
  options?: { message?: string }
): TemplateVariables {
  const contact = getPrimaryContact(contractor ?? null)
  const contactName = contact
    ? [contact.firstName, contact.lastName].filter(Boolean).join(' ') || ''
    : ''

  const totalRateFormatted = formatCurrency(offer.totalRate, offer.currencyCode)
  const originAirportFormatted = formatAirport(offer.originAirport)
  const destinationAirportFormatted = formatAirport(offer.destinationAirport)

  return {
    // Offer fields (FMS compatible)
    offerNumber: generateOfferNumber(offer),
    offerName: offer.name || '',
    awbNumber: offer.awbNumber || '',
    departureDate: formatDate(offer.departureDate),
    arrivalDate: getLastArrivalDate(offer.airRouting),
    transitTime: calculateTransitTime(offer.airRouting),
    status: offer.status || '',
    connectionMethod: offer.connectionMethod || '',

    // Rates
    currencyCode: offer.currencyCode || 'EUR',
    connectionRatePerKg: formatCurrency(offer.connectionRatePerKg, offer.currencyCode),
    connectionRateTotal: formatCurrency(offer.connectionRateTotal, offer.currencyCode),
    airfreightRatePerKg: formatCurrency(offer.airfreightRatePerKg, offer.currencyCode),
    airfreightRateTotal: formatCurrency(offer.airfreightRateTotal, offer.currencyCode),
    totalRatePerKg: formatCurrency(offer.totalRatePerKg, offer.currencyCode),
    totalRate: totalRateFormatted,
    totalAmount: totalRateFormatted, // FMS compatibility alias

    // Client (FMS compatible names)
    clientName: contractor?.name || '',
    contactName,
    contactEmail: contact?.email || '',
    contactPhone: contact?.phone || '',

    // Origin/Destination (both air and port style for compatibility)
    originAirport: originAirportFormatted,
    destinationAirport: destinationAirportFormatted,
    originPorts: originAirportFormatted, // FMS compatibility
    destPorts: destinationAirportFormatted, // FMS compatibility

    // Optional message
    message: options?.message || '',

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

    // Offer lines array (with FMS compatibility aliases)
    lines: offer.offerLines.map((l) => ({
      name: l.name || '',
      description: l.name || '', // FMS compatibility alias
      numberOfPieces: l.numberOfPieces,
      quantity: String(l.numberOfPieces), // FMS compatibility alias
      actualWeightKg: formatNumber(l.actualWeightKg),
      chargeableWeightKg: formatNumber(l.chargeableWeightKg),
      volumeM3: formatNumber(l.volumeM3, 3),
      loadingMetres: formatNumber(l.loadingMetres),
    })),
  }
}
