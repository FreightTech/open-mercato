import { NextRequest, NextResponse } from 'next/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { FrcAirCargo, FrcRfq } from '../../../frc_rfqs/data/entities'
import { airCargoFilterSchema, createAirCargoSchema } from '../../data/validators'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['air_cargo.view'] },
  POST: { requireAuth: true, requireFeatures: ['air_cargo.create'] },
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
  const query = {
    q: url.searchParams.get('q') || undefined,
    rfqId: url.searchParams.get('rfqId') || undefined,
    hasRfq: url.searchParams.get('hasRfq') || undefined,
    limit: url.searchParams.get('limit') || '50',
    offset: url.searchParams.get('offset') || '0',
    sortField: url.searchParams.get('sortField') || 'createdAt',
    sortDir: url.searchParams.get('sortDir') || 'desc',
  }

  const parse = airCargoFilterSchema.safeParse(query)
  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', details: parse.error },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)

  const filters: Record<string, unknown> = {
    deletedAt: null,
    ...scopeFilters,
  }

  if (parse.data.q && parse.data.q.trim().length > 0) {
    const term = `%${escapeLikePattern(parse.data.q.trim())}%`
    filters.$or = [{ name: { $ilike: term } }]
  }

  if (parse.data.rfqId) {
    filters.rfq = parse.data.rfqId
  }

  if (parse.data.hasRfq === 'true') {
    filters.rfq = { $ne: null }
  } else if (parse.data.hasRfq === 'false') {
    filters.rfq = null
  }

  const sortFieldMap: Record<string, string> = {
    id: 'id',
    name: 'name',
    numberOfPieces: 'numberOfPieces',
    stackableType: 'stackableType',
    volumeM3: 'volumeM3',
    actualWeightKg: 'actualWeightKg',
    chargeableWeightKg: 'chargeableWeightKg',
    loadingMetres: 'loadingMetres',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  }

  const sortField = sortFieldMap[parse.data.sortField] || 'createdAt'
  const sortDir = parse.data.sortDir

  const [items, total] = await em.findAndCount(FrcAirCargo, filters, {
    orderBy: { [sortField]: sortDir },
    limit: parse.data.limit,
    offset: parse.data.offset,
    populate: ['rfq'],
  })

  // Fetch RFQ names separately for display
  const rfqIds = [...new Set(items.map((item) => item.rfq?.id).filter(Boolean))] as string[]
  const rfqMap = new Map<string, string>()

  if (rfqIds.length > 0) {
    const rfqs = await em.find(FrcRfq, { id: { $in: rfqIds } }, { fields: ['id', 'name'] })
    rfqs.forEach((rfq) => rfqMap.set(rfq.id, rfq.name))
  }

  return NextResponse.json({
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      rfqId: item.rfq?.id ?? null,
      rfqName: item.rfq?.id ? rfqMap.get(item.rfq.id) ?? null : null,
      numberOfPieces: item.numberOfPieces,
      stackableType: item.stackableType,
      lengthCm: item.lengthCm,
      widthCm: item.widthCm,
      heightCm: item.heightCm,
      volumeM3: item.volumeM3,
      actualWeightKg: item.actualWeightKg,
      chargeableWeightKg: item.chargeableWeightKg,
      loadingMetres: item.loadingMetres,
      organizationId: item.organizationId,
      tenantId: item.tenantId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
    total,
    limit: parse.data.limit,
    offset: parse.data.offset,
  })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parse = createAirCargoSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parse.error },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const em = container.resolve('em') as EntityManager

  // Determine organizationId/tenantId
  let organizationId: string | null = null
  let tenantId: string | null = null

  // If rfqId is provided, inherit from RFQ
  if (parse.data.rfqId) {
    const scopeFilters = buildScopeFilters(auth, scope)
    const rfq = await em.findOne(FrcRfq, {
      id: parse.data.rfqId,
      deletedAt: null,
      ...scopeFilters,
    })
    if (!rfq) {
      return NextResponse.json({ error: 'RFQ not found or not accessible' }, { status: 400 })
    }
    organizationId = rfq.organizationId
    tenantId = rfq.tenantId
  } else {
    // Fallback to user's selected org
    const fallbackTenantId = auth.actorTenantId || auth.tenantId
    const fallbackOrgId = scope?.selectedId || auth.actorOrgId || auth.orgId
    tenantId = typeof fallbackTenantId === 'string' ? fallbackTenantId : null
    organizationId = typeof fallbackOrgId === 'string' ? fallbackOrgId : null
  }

  if (!tenantId || !organizationId) {
    return NextResponse.json({ error: 'Missing tenant or organization context' }, { status: 400 })
  }

  const commandBus = container.resolve('commandBus') as CommandBus

  try {
    const { result } = await commandBus.execute('air_cargo.create', {
      input: {
        ...parse.data,
        organizationId,
        tenantId,
      },
      ctx: {
        container,
        auth,
        organizationScope: scope,
        selectedOrganizationId: organizationId,
        organizationIds: scope?.filterIds ?? (organizationId ? [organizationId] : null),
        request,
      },
      metadata: {
        tenantId,
        organizationId,
        resourceKind: 'air_cargo',
        resourceId: null,
      },
    })

    return NextResponse.json({ id: (result as { airCargoId: string }).airCargoId }, { status: 201 })
  } catch (error: any) {
    console.error('[air-cargo/create] error:', error)
    if (error?.status) {
      return NextResponse.json(error.body || { error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : 'Failed to create air cargo'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
