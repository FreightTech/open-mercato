import { apiFetch } from '@open-mercato/ui/backend/utils/api'
import type { EntitySearchResult } from '@open-mercato/ui/backend/dynamic-table'

// ============================================================================
// Users
// ============================================================================

type UserItem = {
  id: string
  name?: string | null
  email: string
}

type UsersResponse = {
  items?: UserItem[]
}

/**
 * Loads initial user suggestions for EntitySearchEditor dropdowns.
 * @param limit - Maximum number of users to return (default: 4)
 */
export async function loadInitialUsers(limit = 4): Promise<EntitySearchResult[]> {
  const params = new URLSearchParams({
    pageSize: String(limit),
  })

  try {
    const response = await apiFetch(`/api/auth/users?${params}`)
    if (!response.ok) return []

    const data: UsersResponse = await response.json()
    const users = data.items || []

    return users.map((user) => ({
      entityId: 'auth:user',
      recordId: user.id,
      presenter: {
        title: user.name || user.email,
        subtitle: user.name ? user.email : undefined,
      },
    }))
  } catch (error) {
    console.error('Failed to load initial users:', error)
    return []
  }
}

// ============================================================================
// Airports (FMS Locations with type='airport')
// ============================================================================

type AirportItem = {
  id: string
  code: string
  name?: string | null
  city?: string | null
  country?: string | null
}

type AirportsResponse = {
  items?: AirportItem[]
}

/**
 * Loads initial airport suggestions for EntitySearchEditor dropdowns.
 * @param limit - Maximum number of airports to return (default: 4)
 */
export async function loadInitialAirports(limit = 4): Promise<EntitySearchResult[]> {
  const params = new URLSearchParams({
    limit: String(limit),
  })

  try {
    const response = await apiFetch(`/api/fms_locations/airports?${params}`)
    if (!response.ok) return []

    const data: AirportsResponse = await response.json()
    const airports = data.items || []

    return airports.map((airport) => ({
      entityId: 'fms_locations:fms_location',
      recordId: airport.id,
      presenter: {
        title: airport.code,
        subtitle: [airport.city, airport.country].filter(Boolean).join(', ') || airport.name || undefined,
      },
    }))
  } catch (error) {
    console.error('Failed to load initial airports:', error)
    return []
  }
}

// ============================================================================
// Trucks
// ============================================================================

type TruckItem = {
  id: string
  name: string
  licensePlate?: string | null
  type?: string | null
}

type TrucksResponse = {
  items?: TruckItem[]
}

/**
 * Loads initial truck suggestions for EntitySearchEditor dropdowns.
 * @param limit - Maximum number of trucks to return (default: 4)
 */
export async function loadInitialTrucks(limit = 4): Promise<EntitySearchResult[]> {
  const params = new URLSearchParams({
    pageSize: String(limit),
  })

  try {
    const response = await apiFetch(`/api/frc_trucks/trucks?${params}`)
    if (!response.ok) return []

    const data: TrucksResponse = await response.json()
    const trucks = data.items || []

    return trucks.map((truck) => ({
      entityId: 'frc_trucks:frc_truck',
      recordId: truck.id,
      presenter: {
        title: truck.name,
        subtitle: truck.licensePlate || truck.type || undefined,
      },
    }))
  } catch (error) {
    console.error('Failed to load initial trucks:', error)
    return []
  }
}

// ============================================================================
// RFQs (Opportunities)
// ============================================================================

type RfqItem = {
  id: string
  name: string
  salesStage?: string | null
  requestDate?: string | null
}

type RfqsResponse = {
  items?: RfqItem[]
}

/**
 * Loads initial RFQ/opportunity suggestions for EntitySearchEditor dropdowns.
 * @param limit - Maximum number of RFQs to return (default: 4)
 */
export async function loadInitialRfqs(limit = 4): Promise<EntitySearchResult[]> {
  const params = new URLSearchParams({
    pageSize: String(limit),
    sortField: 'updatedAt',
    sortDir: 'desc',
  })

  try {
    const response = await apiFetch(`/api/frc_rfqs/rfqs?${params}`)
    if (!response.ok) return []

    const data: RfqsResponse = await response.json()
    const rfqs = data.items || []

    return rfqs.map((rfq) => ({
      entityId: 'frc_rfqs:frc_rfq',
      recordId: rfq.id,
      presenter: {
        title: rfq.name,
        subtitle: rfq.salesStage || undefined,
      },
    }))
  } catch (error) {
    console.error('Failed to load initial RFQs:', error)
    return []
  }
}

// ============================================================================
// Offers
// ============================================================================

type OfferItem = {
  id: string
  name: string
  status?: string | null
  rfqName?: string | null
}

type OffersResponse = {
  items?: OfferItem[]
}

/**
 * Loads initial offer suggestions for EntitySearchEditor dropdowns.
 * @param limit - Maximum number of offers to return (default: 4)
 */
export async function loadInitialOffers(limit = 4): Promise<EntitySearchResult[]> {
  const params = new URLSearchParams({
    pageSize: String(limit),
    sortField: 'updatedAt',
    sortDir: 'desc',
  })

  try {
    const response = await apiFetch(`/api/frc_offers/offers?${params}`)
    if (!response.ok) return []

    const data: OffersResponse = await response.json()
    const offers = data.items || []

    return offers.map((offer) => ({
      entityId: 'frc_offers:frc_offer',
      recordId: offer.id,
      presenter: {
        title: offer.name,
        subtitle: offer.status || offer.rfqName || undefined,
      },
    }))
  } catch (error) {
    console.error('Failed to load initial offers:', error)
    return []
  }
}

// ============================================================================
// Contractors (Customers)
// ============================================================================

type ContractorItem = {
  id: string
  name: string
  shortName?: string | null
  city?: string | null
}

type ContractorsResponse = {
  items?: ContractorItem[]
}

/**
 * Loads initial contractor/customer suggestions for EntitySearchEditor dropdowns.
 * @param limit - Maximum number of contractors to return (default: 4)
 */
export async function loadInitialContractors(limit = 4): Promise<EntitySearchResult[]> {
  const params = new URLSearchParams({
    pageSize: String(limit),
  })

  try {
    const response = await apiFetch(`/api/frc_contractors/contractors?${params}`)
    if (!response.ok) return []

    const data: ContractorsResponse = await response.json()
    const contractors = data.items || []

    return contractors.map((contractor) => ({
      entityId: 'contractors:contractor',
      recordId: contractor.id,
      presenter: {
        title: contractor.name,
        subtitle: contractor.shortName || contractor.city || undefined,
      },
    }))
  } catch (error) {
    console.error('Failed to load initial contractors:', error)
    return []
  }
}

// ============================================================================
// Air Cargo
// ============================================================================

type AirCargoItem = {
  id: string
  name: string
  numberOfPieces?: number | null
  actualWeightKg?: string | null
}

type AirCargoResponse = {
  items?: AirCargoItem[]
}

/**
 * Loads initial air cargo suggestions for EntitySearchEditor dropdowns.
 * @param limit - Maximum number of cargo items to return (default: 4)
 */
export async function loadInitialCargo(limit = 4): Promise<EntitySearchResult[]> {
  const params = new URLSearchParams({
    limit: String(limit),
    sortField: 'updatedAt',
    sortDir: 'desc',
  })

  try {
    const response = await apiFetch(`/api/air_cargo/air-cargo?${params}`)
    if (!response.ok) return []

    const data: AirCargoResponse = await response.json()
    const items = data.items || []

    return items.map((item) => ({
      entityId: 'air_cargo:frc_air_cargo',
      recordId: item.id,
      presenter: {
        title: item.name,
        subtitle: item.numberOfPieces
          ? `${item.numberOfPieces} pcs` + (item.actualWeightKg ? ` · ${item.actualWeightKg} kg` : '')
          : undefined,
      },
    }))
  } catch (error) {
    console.error('Failed to load initial cargo:', error)
    return []
  }
}
