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

// Field mapping for DynamicTable filters (table column name -> ORM field name)
const FIELD_MAP: Record<string, string> = {
  id: 'id',
  name: 'name',
  salesStage: 'salesStage',
  deliveryStatus: 'deliveryStatus',
  probability: 'probability',
  amount: 'amount',
  currencyCode: 'currencyCode',
  totalPieces: 'totalPieces',
  totalChargeableWeight: 'totalChargeableWeight',
  requestDate: 'requestDate',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  accountId: 'accountId',
  assignedToId: 'assignedToId',
  commodity: 'commodity',
  product: 'product',
}

// Parse DynamicTable FilterRow into MikroORM filter format
function parseFilterRow(row: { field: string; operator: string; values: unknown[] }): Record<string, unknown> | null {
  const field = FIELD_MAP[row.field]
  if (!field) return null

  const val = row.values[0]
  const hasValue = val !== undefined && val !== null && val !== ''
  const hasValues = Array.isArray(row.values) && row.values.length > 0

  switch (row.operator) {
    case 'is_any_of':
      if (!hasValues) return null
      return { [field]: { $in: row.values } }
    case 'is_not_any_of':
      if (!hasValues) return null
      return { [field]: { $nin: row.values } }
    case 'contains':
      if (!hasValue) return null
      return { [field]: { $ilike: `%${val}%` } }
    case 'is_empty':
      return { [field]: { $eq: null } }
    case 'is_not_empty':
      return { [field]: { $ne: null } }
    case 'equals':
      if (!hasValue) return null
      return { [field]: { $eq: val } }
    case 'not_equals':
      if (!hasValue) return null
      return { [field]: { $ne: val } }
    case 'is_true':
      return { [field]: { $eq: true } }
    case 'is_false':
      return { [field]: { $eq: false } }
    case 'greater_than':
      if (!hasValue) return null
      return { [field]: { $gt: val } }
    case 'less_than':
      if (!hasValue) return null
      return { [field]: { $lt: val } }
    default:
      return null
  }
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
  const knex = em.getKnex()

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

  // Parse DynamicTable filters from query string
  const filtersParam = url.searchParams.get('filters')
  if (filtersParam) {
    try {
      const dynamicFilters: Array<{ field: string; operator: string; values: unknown[] }> = JSON.parse(filtersParam)
      if (dynamicFilters.length > 0) {
        const parsedFilters = dynamicFilters
          .map(parseFilterRow)
          .filter((f): f is Record<string, unknown> => f !== null)

        if (parsedFilters.length > 0) {
          filters.$and = [...(filters.$and as Record<string, unknown>[] || []), ...parsedFilters]
        }
      }
    } catch {
      // Ignore invalid JSON
    }
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

  // Batch fetch users for assignees
  const assignedToIds = [...new Set(items.map((i) => i.assignedToId).filter(Boolean))] as string[]
  const userMap = new Map<string, { name: string }>()
  if (assignedToIds.length > 0) {
    const users = await knex('users')
      .select('id', knex.raw('COALESCE(name, email) as name'))
      .whereIn('id', assignedToIds)
      .whereNull('deleted_at')
    for (const u of users) {
      userMap.set(u.id, { name: u.name })
    }
  }

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
        assignedToName: item.assignedToId ? userMap.get(item.assignedToId)?.name ?? null : null,
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

  // Resolve organization scope to ensure we create in the same context
  // the list view is filtering by (handles org switcher widget)
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })

  // Use scope if available, otherwise fall back to auth properties
  const tenantId = scope?.tenantId || auth.actorTenantId || auth.tenantId
  const organizationId = scope?.selectedId || auth.actorOrgId || auth.orgId

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
