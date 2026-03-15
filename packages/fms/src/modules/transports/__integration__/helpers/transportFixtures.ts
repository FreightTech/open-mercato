import type { APIRequestContext } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

function decodeJwtPayload(token: string): { sub?: string; tenantId?: string; orgId?: string } {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return {}
    const payload = Buffer.from(parts[1], 'base64url').toString('utf-8')
    return JSON.parse(payload)
  } catch {
    return {}
  }
}

function buildOrgHeaders(token: string): Record<string, string> {
  const jwt = decodeJwtPayload(token)
  return {
    Authorization: `Bearer ${token}`,
    Cookie: `om_selected_org=${jwt.orgId}; om_selected_tenant=${jwt.tenantId}`,
  }
}

// Re-export project fixtures for convenience
export {
  createProjectFixture,
  deleteProjectIfExists,
  deleteProjectsIfExist,
} from '../../../fms_projects/__integration__/helpers/projectFixtures'
export type { CreateProjectInput, ProjectRecord } from '../../../fms_projects/__integration__/helpers/projectFixtures'

export interface CreateSeaContainerInput {
  containerNumber?: string
  containerType?: string
  bookingNumber?: string
  notes?: string
  status?: string
  vgmStatus?: string
  vgmWeight?: number
  customsClearanceStatus?: string
  pinCode?: string
  voyageNumber?: string
  carrierScac?: string
  imoNumber?: string
}

export interface SeaContainerRecord {
  id: string
  containerNumber: string | null
  containerType: string | null
  bookingNumber: string | null
  notes: string | null
}

export interface CreateRoadUnitInput {
  vehicleType?: string
  bookingNumber?: string
  truckNumber?: string
  trailerNumber?: string
  driverName?: string
  driverPhone?: string
  carrierName?: string
  originAddress?: string
  destinationAddress?: string
  notes?: string
  unloadingNotes?: string
  rate?: number
  rateCurrency?: string
}

export interface RoadUnitRecord {
  id: string
  vehicleType: string | null
  bookingNumber: string | null
  notes: string | null
}

export interface TransportRow {
  id: string
  transportType: 'sea' | 'air' | 'road'
  projectId: string
  projectNumber: string
  containerNumber: string | null
  bookingNumber: string | null
  notes: string | null
  vehicleType: string | null
  [key: string]: unknown
}

export interface TransportListResult {
  items: TransportRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/**
 * Creates a sea container via the FMS Projects API.
 */
export async function createSeaContainerFixture(
  request: APIRequestContext,
  token: string,
  projectId: string,
  overrides?: CreateSeaContainerInput
): Promise<SeaContainerRecord | null> {
  const jwtPayload = decodeJwtPayload(token)

  const payload = {
    projectId,
    organizationId: jwtPayload.orgId,
    tenantId: jwtPayload.tenantId,
    containerNumber: overrides?.containerNumber ?? null,
    containerType: overrides?.containerType ?? null,
    bookingNumber: overrides?.bookingNumber ?? null,
    notes: overrides?.notes ?? null,
    status: overrides?.status ?? 'PENDING',
    vgmStatus: overrides?.vgmStatus ?? undefined,
    vgmWeight: overrides?.vgmWeight ?? undefined,
    customsClearanceStatus: overrides?.customsClearanceStatus ?? undefined,
    pinCode: overrides?.pinCode ?? undefined,
    voyageNumber: overrides?.voyageNumber ?? undefined,
    carrierScac: overrides?.carrierScac ?? undefined,
    imoNumber: overrides?.imoNumber ?? undefined,
  }

  const response = await request.fetch(
    `${BASE_URL}/api/fms_projects/projects/${projectId}/sea-containers`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Cookie: `om_selected_org=${jwtPayload.orgId}; om_selected_tenant=${jwtPayload.tenantId}`,
      },
      data: JSON.stringify(payload),
    }
  )

  if (!response.ok()) {
    console.error('Failed to create sea container:', await response.text())
    return null
  }

  const body = (await response.json()) as Record<string, unknown>
  if (body.id) {
    return {
      id: body.id as string,
      containerNumber: (body.containerNumber as string) ?? overrides?.containerNumber ?? null,
      containerType: (body.containerType as string) ?? overrides?.containerType ?? null,
      bookingNumber: (body.bookingNumber as string) ?? overrides?.bookingNumber ?? null,
      notes: (body.notes as string) ?? overrides?.notes ?? null,
    }
  }
  return null
}

/**
 * Creates a road unit via the FMS Projects API.
 */
export async function createRoadUnitFixture(
  request: APIRequestContext,
  token: string,
  projectId: string,
  overrides?: CreateRoadUnitInput
): Promise<RoadUnitRecord | null> {
  const jwtPayload = decodeJwtPayload(token)

  const payload: Record<string, unknown> = {
    vehicleType: overrides?.vehicleType ?? 'ftl_truck',
  }
  if (overrides?.bookingNumber !== undefined) payload.bookingNumber = overrides.bookingNumber
  if (overrides?.truckNumber !== undefined) payload.truckNumber = overrides.truckNumber
  if (overrides?.trailerNumber !== undefined) payload.trailerNumber = overrides.trailerNumber
  if (overrides?.driverName !== undefined) payload.driverName = overrides.driverName
  if (overrides?.driverPhone !== undefined) payload.driverPhone = overrides.driverPhone
  if (overrides?.carrierName !== undefined) payload.carrierName = overrides.carrierName
  if (overrides?.originAddress !== undefined) payload.originAddress = overrides.originAddress
  if (overrides?.destinationAddress !== undefined) payload.destinationAddress = overrides.destinationAddress
  if (overrides?.notes !== undefined) payload.notes = overrides.notes
  if (overrides?.unloadingNotes !== undefined) payload.unloadingNotes = overrides.unloadingNotes
  if (overrides?.rate !== undefined) payload.rate = overrides.rate
  if (overrides?.rateCurrency !== undefined) payload.rateCurrency = overrides.rateCurrency

  const response = await request.fetch(
    `${BASE_URL}/api/fms_projects/projects/${projectId}/road-units`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Cookie: `om_selected_org=${jwtPayload.orgId}; om_selected_tenant=${jwtPayload.tenantId}`,
      },
      data: JSON.stringify(payload),
    }
  )

  if (!response.ok()) {
    console.error('Failed to create road unit:', await response.text())
    return null
  }

  const body = (await response.json()) as Record<string, unknown>
  if (body.id) {
    return {
      id: body.id as string,
      vehicleType: (body.vehicleType as string) ?? overrides?.vehicleType ?? null,
      bookingNumber: (body.bookingNumber as string) ?? overrides?.bookingNumber ?? null,
      notes: (body.notes as string) ?? overrides?.notes ?? null,
    }
  }
  return null
}

/**
 * Gets a single transport by ID via the aggregate transports API.
 */
export async function getTransportById(
  request: APIRequestContext,
  token: string,
  id: string
): Promise<TransportRow | null> {
  const response = await request.fetch(`${BASE_URL}/api/transports/${id}`, {
    method: 'GET',
    headers: buildOrgHeaders(token),
  })

  if (!response.ok()) {
    return null
  }

  const body = (await response.json()) as Record<string, unknown>
  if (body && typeof body.id === 'string') {
    return body as unknown as TransportRow
  }
  return null
}

/**
 * Lists transports from the aggregate transports API.
 */
export async function listTransports(
  request: APIRequestContext,
  token: string,
  params?: {
    page?: number
    limit?: number
    q?: string
    sortField?: string
    sortDir?: 'asc' | 'desc'
    filters?: string
  }
): Promise<TransportListResult> {
  const searchParams = new URLSearchParams()
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.limit) searchParams.set('limit', String(params.limit))
  if (params?.q) searchParams.set('q', params.q)
  if (params?.sortField) searchParams.set('sortField', params.sortField)
  if (params?.sortDir) searchParams.set('sortDir', params.sortDir)
  if (params?.filters) searchParams.set('filters', params.filters)

  const queryString = searchParams.toString()
  const url = `${BASE_URL}/api/transports${queryString ? `?${queryString}` : ''}`

  const response = await request.fetch(url, {
    method: 'GET',
    headers: buildOrgHeaders(token),
  })

  if (!response.ok()) {
    return { items: [], total: 0, page: 1, pageSize: 100, totalPages: 0 }
  }

  const body = (await response.json()) as TransportListResult
  return {
    items: body.items ?? [],
    total: body.total ?? 0,
    page: body.page ?? 1,
    pageSize: body.pageSize ?? 100,
    totalPages: body.totalPages ?? 0,
  }
}

/**
 * Updates a transport via PUT /api/transports/:id.
 */
export async function updateTransport(
  request: APIRequestContext,
  token: string,
  id: string,
  data: Record<string, unknown>
): Promise<TransportRow | null> {
  const response = await request.fetch(`${BASE_URL}/api/transports/${id}`, {
    method: 'PUT',
    headers: {
      ...buildOrgHeaders(token),
      'Content-Type': 'application/json',
    },
    data: JSON.stringify(data),
  })

  if (!response.ok()) {
    console.error('Failed to update transport:', await response.text())
    return null
  }

  const body = (await response.json()) as Record<string, unknown>
  if (body && typeof body.id === 'string') {
    return body as unknown as TransportRow
  }
  return null
}
