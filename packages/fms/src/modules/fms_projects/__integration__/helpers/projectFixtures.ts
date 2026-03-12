import type { APIRequestContext } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

/**
 * Decodes a JWT token and extracts its payload without verifying the signature.
 * This is safe for test scenarios where we just need to read the org/tenant IDs.
 */
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

export interface CreateProjectInput {
  projectNumber?: string
  cargoType?: 'fcl' | 'lcl'
  direction?: 'export' | 'import' | 'domestic'
  shipmentType?: 'EXP' | 'IMP' | 'RAIL' | 'FTL' | 'LTL' | 'DEPOT'
  blNumber?: string
  bookingNumber?: string
  mblNumber?: string
  containerNumbers?: string[]
  clientReference?: string
  internalReference?: string
  commodityDescription?: string
}

export interface ProjectRecord {
  id: string
  projectNumber: string
  cargoType?: string
  direction?: string
  shipmentType?: string
  blNumber?: string
  bookingNumber?: string
  mblNumber?: string
  containerNumbers?: string[]
  createdAt?: string
  updatedAt?: string
}

/**
 * Creates a project (FmsProject) via API.
 * This is used to set up existing projects for auto-link testing.
 *
 * Note: The API expects organizationId and tenantId to be provided either in the
 * request body or from the auth context. We extract them from the JWT token.
 */
export async function createProjectFixture(
  request: APIRequestContext,
  token: string,
  input: CreateProjectInput
): Promise<ProjectRecord | null> {
  const timestamp = Date.now()
  const projectNumber = input.projectNumber || `TEST/FCL/${timestamp.toString().slice(-5)}/2026/TST`

  // Extract org/tenant from JWT token
  const jwtPayload = decodeJwtPayload(token)

  const payload = {
    // Include org/tenant IDs from JWT (API will use these if not provided via context)
    organizationId: jwtPayload.orgId,
    tenantId: jwtPayload.tenantId,
    // Project fields
    cargoType: input.cargoType || 'fcl',
    direction: input.direction || 'export',
    shipmentType: input.shipmentType || 'EXP',
    blNumber: input.blNumber,
    bookingNumber: input.bookingNumber,
    mblNumber: input.mblNumber,
    containerNumbers: input.containerNumbers,
    clientReference: input.clientReference,
    internalReference: input.internalReference,
    commodityDescription: input.commodityDescription,
  }

  const response = await request.fetch(`${BASE_URL}/api/fms_projects/projects`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: JSON.stringify(payload),
  })

  if (!response.ok()) {
    const errorText = await response.text()
    console.error('Failed to create project:', errorText)
    console.error('JWT payload extracted:', jwtPayload)
    return null
  }

  const body = (await response.json()) as { id?: string; projectNumber?: string }
  if (body.id) {
    return {
      id: body.id,
      projectNumber: body.projectNumber || projectNumber,
      ...input,
    }
  }
  return null
}

/**
 * Updates a project via API.
 */
export async function updateProjectFixture(
  request: APIRequestContext,
  token: string,
  projectId: string,
  updates: Partial<CreateProjectInput>
): Promise<ProjectRecord | null> {
  const response = await request.fetch(
    `${BASE_URL}/api/fms_projects/projects/${projectId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: JSON.stringify(updates),
    }
  )

  if (!response.ok()) {
    console.error('Failed to update project:', await response.text())
    return null
  }

  const body = (await response.json()) as { item?: ProjectRecord }
  return body.item ?? null
}

/**
 * Gets a project by ID.
 */
export async function getProjectById(
  request: APIRequestContext,
  token: string,
  projectId: string
): Promise<ProjectRecord | null> {
  const response = await request.fetch(
    `${BASE_URL}/api/fms_projects/projects/${projectId}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }
  )

  if (!response.ok()) {
    return null
  }

  const body = (await response.json()) as Record<string, unknown>
  if (body && typeof body.id === 'string') {
    return body as unknown as ProjectRecord
  }
  return null
}

/**
 * Lists projects matching an optional search query.
 */
export async function listProjects(
  request: APIRequestContext,
  token: string,
  options?: { search?: string; bookingNumber?: string; blNumber?: string }
): Promise<Array<ProjectRecord>> {
  const params = new URLSearchParams()
  if (options?.search) params.set('q', options.search)
  if (options?.bookingNumber) params.set('bookingNumber', options.bookingNumber)
  if (options?.blNumber) params.set('blNumber', options.blNumber)

  const queryString = params.toString()
  const url = `${BASE_URL}/api/fms_projects/projects${queryString ? `?${queryString}` : ''}`

  const response = await request.fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok()) {
    return []
  }

  const body = (await response.json()) as { items?: ProjectRecord[] }
  return body.items ?? []
}

/**
 * Deletes a project by ID if it exists. Safe for use in cleanup/finally blocks.
 */
export async function deleteProjectIfExists(
  request: APIRequestContext,
  token: string | null,
  projectId: string | null
): Promise<void> {
  if (!token || !projectId) return

  try {
    await request.fetch(`${BASE_URL}/api/fms_projects/projects/${projectId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    // Best-effort cleanup - ignore errors
  }
}

/**
 * Deletes multiple projects. Useful for cleanup after batch operations.
 */
export async function deleteProjectsIfExist(
  request: APIRequestContext,
  token: string | null,
  projectIds: string[]
): Promise<void> {
  if (!token) return
  for (const id of projectIds) {
    await deleteProjectIfExists(request, token, id)
  }
}

/**
 * Finds a project by booking number.
 */
export async function findProjectByBookingNumber(
  request: APIRequestContext,
  token: string,
  bookingNumber: string
): Promise<ProjectRecord | null> {
  const projects = await listProjects(request, token, { search: bookingNumber })
  return projects.find((p) => p.bookingNumber === bookingNumber) ?? null
}

/**
 * Waits for a project to be created (polling).
 * Useful when waiting for auto-creation from document upload.
 */
export async function waitForProjectWithBookingNumber(
  request: APIRequestContext,
  token: string,
  bookingNumber: string,
  options?: { maxAttempts?: number; delayMs?: number }
): Promise<ProjectRecord | null> {
  const maxAttempts = options?.maxAttempts ?? 30
  const delayMs = options?.delayMs ?? 2000

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const project = await findProjectByBookingNumber(request, token, bookingNumber)
    if (project) {
      return project
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  return null
}
