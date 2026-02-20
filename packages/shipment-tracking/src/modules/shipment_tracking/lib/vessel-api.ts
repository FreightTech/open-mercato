/**
 * Vessel API client for fetching real-time vessel position and trace data.
 *
 * API Documentation: https://vessel-api.octopus.freighttech.org
 */

// ─── Types ───────────────────────────────────────────────────

export interface VesselDimensions {
  a: number
  b: number
  c: number
  d: number
}

export interface PortInfo {
  locode: string
  name: string
  city: string
  country: string
}

export interface Position {
  lat: number
  lng: number
}

export type VesselStatus = 'AT_SEA' | 'IN_PORT'
export type PoiType = 'PORT' | 'TERMINAL' | 'WAYPOINT' | 'PORT_GEOMETRIC_CENTER'

export interface VesselInfo {
  imo: number
  mmsi: number | null
  name: string
  callsign: string | null
  shipType: string | null
  operatorName: string | null
  owner: string | null
  dimensions: VesselDimensions | null
  status: VesselStatus | null
  lastPosition: Position | null
  lastHeading: number | null
  lastDestination: string | null
  lastDestinationPort: PortInfo | null
  currentPort: PortInfo | null
  currentPoiCode: string | null
  currentPoiType: PoiType | null
  isStationary: boolean
  updatedAt: string
}

export type TraceEventType =
  | 'POSITION_UPDATE'
  | 'PORT_ARRIVAL'
  | 'PORT_DEPARTURE'
  | 'TERMINAL_ARRIVAL'
  | 'TERMINAL_DEPARTURE'
  | 'DESTINATION_CHANGE'

export interface TracePoint {
  lat: number
  lng: number
  speed: number | null
  heading: number | null
  eventType: TraceEventType
  destination: string | null
  timestamp: string
}

export interface BoundingBox {
  north: number
  south: number
  east: number
  west: number
}

export interface VesselResponse {
  vessel: VesselInfo
}

export interface TraceResponse {
  vessel: {
    imo: number
    mmsi: number | null
    name: string
  }
  trace: TracePoint[]
  count: number
  limit: number
  bounds?: BoundingBox
}

// ─── Configuration ───────────────────────────────────────────

const VESSEL_API_BASE_URL =
  process.env.NEXT_PUBLIC_VESSEL_API_URL || 'https://vessel-api.octopus.freighttech.org'

// ─── API Functions ───────────────────────────────────────────

/**
 * Fetch vessel information by IMO number or MMSI.
 *
 * @param imoOrMmsi - IMO number (7 digits) or MMSI (9 digits)
 * @returns Vessel info or null if not found
 */
export async function fetchVessel(imoOrMmsi: number | string): Promise<VesselInfo | null> {
  const id = typeof imoOrMmsi === 'string' ? imoOrMmsi : String(imoOrMmsi)

  try {
    const response = await fetch(`${VESSEL_API_BASE_URL}/vessel/${encodeURIComponent(id)}`)

    if (response.status === 404) {
      return null
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(error.error || `HTTP ${response.status}`)
    }

    const data: VesselResponse = await response.json()
    return data.vessel
  } catch (error) {
    console.error('[vessel-api] Failed to fetch vessel:', error)
    throw error
  }
}

/**
 * Fetch vessel trace (position history) with optional bounding box filter.
 *
 * @param imoOrMmsi - IMO number or MMSI
 * @param bounds - Optional bounding box to filter trace points
 * @param limit - Maximum number of points to return (default: 5000)
 * @returns Trace data with array of position points
 */
export async function fetchVesselTrace(
  imoOrMmsi: number | string,
  bounds?: BoundingBox,
  limit?: number
): Promise<TraceResponse> {
  const id = typeof imoOrMmsi === 'string' ? imoOrMmsi : String(imoOrMmsi)

  const params = new URLSearchParams()

  if (bounds) {
    params.set('north', String(bounds.north))
    params.set('south', String(bounds.south))
    params.set('east', String(bounds.east))
    params.set('west', String(bounds.west))
  }

  if (limit) {
    params.set('limit', String(limit))
  }

  const queryString = params.toString()
  const url = `${VESSEL_API_BASE_URL}/vessel/${encodeURIComponent(id)}/trace${queryString ? `?${queryString}` : ''}`

  try {
    const response = await fetch(url)

    if (response.status === 404) {
      return {
        vessel: { imo: 0, mmsi: null, name: 'Unknown' },
        trace: [],
        count: 0,
        limit: limit || 5000,
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(error.error || `HTTP ${response.status}`)
    }

    const data: TraceResponse = await response.json()
    return data
  } catch (error) {
    console.error('[vessel-api] Failed to fetch vessel trace:', error)
    throw error
  }
}
