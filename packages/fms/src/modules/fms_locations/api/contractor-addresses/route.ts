import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FmsLocation } from '../../data/entities'
import { createContractorAddressSchema, contractorAddressFilterSchema } from '../../data/validators'
import { CONTRACTOR_ADDRESS_TYPES } from '../../data/types'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
// Import to register commands
import '../../commands'

const listSchema = z
  .object({
    contractorId: z.string().uuid(),
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(50),
    type: z.enum(CONTRACTOR_ADDRESS_TYPES as unknown as [string, ...string[]]).optional(),
    includeInactive: z.preprocess((val) => val === 'true' || val === true, z.boolean().optional()),
    sortField: z.string().optional(),
    sortDir: z.enum(['asc', 'desc']).optional(),
  })
  .passthrough()

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['contractors.view'] },
  POST: { requireAuth: true, requireFeatures: ['contractors.manage'] },
}

function buildScopeFilters(
  auth: { tenantId?: string | null; orgId?: string | null },
  scope: { tenantId?: string | null; selectedId?: string | null; filterIds?: string[] | null } | null
): { tenantId?: string; organizationId?: { $in: string[] } } {
  const filters: { tenantId?: string; organizationId?: { $in: string[] } } = {}

  if (typeof auth.tenantId === 'string') {
    filters.tenantId = auth.tenantId
  }

  const allowedOrgIds = new Set<string>()
  const filterIds = scope?.filterIds
  if (Array.isArray(filterIds) && filterIds.length > 0) {
    filterIds.forEach((id) => {
      if (typeof id === 'string') allowedOrgIds.add(id)
    })
  } else {
    const fallbackOrgId = scope?.selectedId ?? auth.orgId
    if (typeof fallbackOrgId === 'string') {
      allowedOrgIds.add(fallbackOrgId)
    }
  }

  if (allowedOrgIds.size > 0) {
    filters.organizationId = { $in: [...allowedOrgIds] }
  }

  return filters
}

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const rawParams = Object.fromEntries(url.searchParams.entries())

  const parse = listSchema.safeParse(rawParams)
  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', details: parse.error },
      { status: 400 }
    )
  }

  const { contractorId, page, limit, type, includeInactive, sortField, sortDir } = parse.data

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)

  // Build filters for contractor addresses
  const filters: Record<string, unknown> = {
    contractorId,
    type: { $in: CONTRACTOR_ADDRESS_TYPES },
    deletedAt: null,
    ...scopeFilters,
  }

  if (type) {
    filters.type = type
  }

  if (!includeInactive) {
    filters.isActive = true
  }

  // Build sort
  const sortFieldMap: Record<string, string> = {
    id: 'id',
    type: 'type',
    name: 'name',
    city: 'city',
    country: 'country',
    isPrimary: 'isPrimary',
    isActive: 'isActive',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  }

  const sortColumn = sortFieldMap[sortField || 'createdAt'] || 'createdAt'
  const sortDirection = sortDir || 'desc'

  const [items, total] = await em.findAndCount(FmsLocation, filters, {
    orderBy: { [sortColumn]: sortDirection },
    limit,
    offset: (page - 1) * limit,
  })

  const transformedItems = items.map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    type: item.type,
    addressLine1: item.addressLine1,
    addressLine2: item.addressLine2,
    city: item.city,
    state: item.state,
    postalCode: item.postalCode,
    country: item.country,
    lat: item.lat,
    lng: item.lng,
    isPrimary: item.isPrimary,
    isActive: item.isActive,
    googlePlaceId: item.googlePlaceId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }))

  return NextResponse.json({
    items: transformedItems,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()

  // Validate the request body (without org/tenant which we'll add)
  const inputSchema = createContractorAddressSchema.omit({
    organizationId: true,
    tenantId: true,
  })

  const parse = inputSchema.safeParse(body)
  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parse.error },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })

  const tenantId = auth.actorTenantId || auth.tenantId
  const organizationId = auth.actorOrgId || auth.orgId

  if (!tenantId || !organizationId) {
    return NextResponse.json({ error: 'Missing tenant or organization context' }, { status: 400 })
  }

  const ctx: CommandRuntimeContext = {
    container,
    auth,
    organizationScope: scope,
    selectedOrganizationId: organizationId as string,
    organizationIds: scope?.filterIds ?? null,
    request,
  }

  const bus = new CommandBus()

  // Generate a code if not provided
  const code =
    body.code ||
    `ADDR-${parse.data.contractorId.substring(0, 4).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`

  try {
    const { result } = await bus.execute<Record<string, unknown>, { id: string }>(
      'fms_locations.unified.create',
      {
        input: {
          organizationId: organizationId as string,
          tenantId: tenantId as string,
          code,
          name: parse.data.name,
          type: parse.data.type,
          contractorId: parse.data.contractorId,
          addressLine1: parse.data.addressLine1 ?? null,
          addressLine2: parse.data.addressLine2 ?? null,
          city: parse.data.city ?? null,
          state: parse.data.state ?? null,
          postalCode: parse.data.postalCode ?? null,
          country: parse.data.country ?? null,
          lat: parse.data.lat ?? null,
          lng: parse.data.lng ?? null,
          isPrimary: parse.data.isPrimary ?? false,
          isActive: parse.data.isActive ?? true,
          googlePlaceId: parse.data.googlePlaceId ?? null,
        },
        ctx,
      }
    )

    return NextResponse.json({
      id: result.id,
      code,
      name: parse.data.name,
      type: parse.data.type,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create contractor address'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
