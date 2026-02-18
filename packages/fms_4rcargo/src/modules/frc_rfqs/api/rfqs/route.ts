import { NextRequest, NextResponse } from 'next/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { FmsLocation } from '@open-mercato/fms/modules/fms_locations/data/entities'
import { FrcRfq } from '../../data/entities'
import { createRfqSchema, rfqFilterSchema } from '../../data/validators'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['frc_rfqs.view'] },
  POST: { requireAuth: true, requireFeatures: ['frc_rfqs.manage'] },
}

function buildScopeFilters(
  auth: { tenantId?: string | null; orgId?: string | null },
  scope: { tenantId?: string | null; selectedId?: string | null; filterIds?: string[] | null; allowedIds?: string[] | null } | null
): { tenantId?: string; organizationId?: { $in: string[] } } {
  const filters: { tenantId?: string; organizationId?: { $in: string[] } } = {}

  if (typeof auth.tenantId === 'string') {
    filters.tenantId = auth.tenantId
  }

  // Determine organization IDs to filter by, matching the widget's behavior:
  // 1. If filterIds has values, use them
  // 2. If filterIds is empty but allowedIds is null (superadmin "All orgs"), no org filter
  // 3. Otherwise fall back to auth.orgId
  const filterIds = scope?.filterIds
  if (Array.isArray(filterIds) && filterIds.length > 0) {
    filters.organizationId = { $in: filterIds }
  } else if (scope?.allowedIds === null) {
    // Superadmin with "All organizations" selected - no org filter needed
    // This allows viewing all RFQs across all organizations
  } else if (auth.orgId) {
    // Fall back to user's default organization
    filters.organizationId = { $in: [auth.orgId] }
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
    accountId: url.searchParams.get('accountId') || undefined,
    salesStage: url.searchParams.get('salesStage') || undefined,
    deliveryStatus: url.searchParams.get('deliveryStatus') || undefined,
    assignedToId: url.searchParams.get('assignedToId') || undefined,
    limit: url.searchParams.get('limit') || '50',
    offset: url.searchParams.get('offset') || '0',
    sortField: url.searchParams.get('sortField') || 'createdAt',
    sortDir: url.searchParams.get('sortDir') || 'desc',
  }

  const parse = rfqFilterSchema.safeParse(query)
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
    filters.$or = [
      { name: { $ilike: term } },
      { commodity: { $ilike: term } },
    ]
  }

  if (parse.data.accountId) {
    filters.accountId = parse.data.accountId
  }

  if (parse.data.salesStage) {
    filters.salesStage = parse.data.salesStage
  }

  if (parse.data.deliveryStatus) {
    filters.deliveryStatus = parse.data.deliveryStatus
  }

  if (parse.data.assignedToId) {
    filters.assignedToId = parse.data.assignedToId
  }

  const sortFieldMap: Record<string, string> = {
    id: 'id',
    name: 'name',
    salesStage: 'salesStage',
    deliveryStatus: 'deliveryStatus',
    amount: 'amount',
    requestDate: 'requestDate',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  }

  const sortField = sortFieldMap[parse.data.sortField] || 'createdAt'
  const sortDir = parse.data.sortDir

  const [items, total] = await em.findAndCount(FrcRfq, filters, {
    populate: ['airCargo'],
    orderBy: { [sortField]: sortDir },
    limit: parse.data.limit,
    offset: parse.data.offset,
  })

  // Fetch airports from FmsLocation (type: 'airport')
  const airportIds = items
    .flatMap((i) => [i.originAirportId, i.destinationAirportId])
    .filter((id): id is string => Boolean(id))

  const airports = airportIds.length > 0
    ? await em.find(FmsLocation, { id: { $in: [...new Set(airportIds)] }, type: 'airport' })
    : []
  const airportMap = new Map(airports.map((a) => [a.id, a]))

  return NextResponse.json({
    items: items.map((item) => {
      const originAirport = item.originAirportId ? airportMap.get(item.originAirportId) : null
      const destinationAirport = item.destinationAirportId ? airportMap.get(item.destinationAirportId) : null

      return {
        id: item.id,
        name: item.name,
        accountId: item.accountId ?? null,
        contactId: item.contactId ?? null,
        salesStage: item.salesStage,
        probability: item.probability,
        amount: item.amount ?? null,
        currencyCode: item.currencyCode,
        deliveryStatus: item.deliveryStatus,
        isDelayed: item.isDelayed,
        originType: item.originType,
        originAirport: originAirport
          ? {
              id: originAirport.id,
              code: originAirport.code,
              longCode: `${originAirport.code} - ${originAirport.name}`,
            }
          : null,
        destinationAirport: destinationAirport
          ? {
              id: destinationAirport.id,
              code: destinationAirport.code,
              longCode: `${destinationAirport.code} - ${destinationAirport.name}`,
            }
          : null,
        shipmentReadyDate: item.shipmentReadyDate ?? null,
        requiredAtDestinationDate: item.requiredAtDestinationDate ?? null,
        looseOrUnitised: item.looseOrUnitised ?? null,
        targetRate: item.targetRate ?? null,
        product: item.product ?? null,
        commodity: item.commodity ?? null,
        totalPieces: item.totalPieces,
        totalVolume: item.totalVolume,
        totalActualWeight: item.totalActualWeight,
        totalChargeableWeight: item.totalChargeableWeight,
        totalLoadingMetres: item.totalLoadingMetres,
        description: item.description ?? null,
        assignedToId: item.assignedToId ?? null,
        requestDate: item.requestDate,
        organizationId: item.organizationId,
        tenantId: item.tenantId,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        airCargoCount: item.airCargo.length,
      }
    }),
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
  const parse = createRfqSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parse.error },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  // Use direct auth properties (from JWT) - matching the FMS pattern
  // This avoids issues with stale/invalid cookie values
  const tenantId = auth.actorTenantId || auth.tenantId
  const organizationId = auth.actorOrgId || auth.orgId

  if (!tenantId || !organizationId) {
    return NextResponse.json({ error: 'Missing tenant or organization context' }, { status: 400 })
  }

  const now = new Date()
  const rfq = em.create(FrcRfq, {
    organizationId: organizationId as string,
    tenantId: tenantId as string,
    name: parse.data.name,
    accountId: parse.data.accountId ?? null,
    contactId: parse.data.contactId ?? null,
    salesStage: parse.data.salesStage,
    probability: parse.data.probability,
    amount: parse.data.amount ?? null,
    currencyCode: parse.data.currencyCode,
    deliveryStatus: parse.data.deliveryStatus,
    isDelayed: parse.data.isDelayed,
    originType: parse.data.originType,
    originAirportId: parse.data.originAirportId ?? null,
    destinationAirportId: parse.data.destinationAirportId ?? null,
    shipmentReadyDate: parse.data.shipmentReadyDate ?? null,
    requiredAtDestinationDate: parse.data.requiredAtDestinationDate ?? null,
    looseOrUnitised: parse.data.looseOrUnitised ?? null,
    targetRate: parse.data.targetRate ?? null,
    product: parse.data.product ?? null,
    commodity: parse.data.commodity ?? null,
    totalPieces: 0,
    totalVolume: '0',
    totalActualWeight: '0',
    totalChargeableWeight: '0',
    totalLoadingMetres: '0',
    description: parse.data.description ?? null,
    assignedToId: parse.data.assignedToId ?? null,
    requestDate: now,
    createdAt: now,
    updatedAt: now,
  })

  await em.persistAndFlush(rfq)

  return NextResponse.json(
    {
      id: rfq.id,
      name: rfq.name,
    },
    { status: 201 }
  )
}
