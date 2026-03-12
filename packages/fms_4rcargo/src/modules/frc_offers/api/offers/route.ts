import { NextRequest, NextResponse } from 'next/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { FrcOffer, FrcOfferLine, FrcAirRouting } from '../../data/entities'
import { FrcRfq, FrcAirCargo } from '../../../frc_rfqs/data/entities'
import { createOfferSchema, offerFilterSchema } from '../../data/validators'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['frc_offers.view'] },
  POST: { requireAuth: true, requireFeatures: ['frc_offers.manage'] },
}

// Field mapping for DynamicTable filters (table column name -> ORM field name)
const FIELD_MAP: Record<string, string> = {
  id: 'id',
  name: 'name',
  rfqId: 'rfqId',
  carrierId: 'carrierId',
  status: 'status',
  awbNumber: 'awbNumber',
  departureDate: 'departureDate',
  totalRate: 'totalRate',
  totalRatePerKg: 'totalRatePerKg',
  totalAmount: 'totalRate', // Frontend uses totalAmount, maps to totalRate in DB
  currencyCode: 'currencyCode',
  assignedToId: 'assignedToId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
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
    status: url.searchParams.get('status') || undefined,
    carrierId: url.searchParams.get('carrierId') || undefined,
    assignedToId: url.searchParams.get('assignedToId') || undefined,
    limit: url.searchParams.get('limit') || '50',
    offset: url.searchParams.get('offset') || '0',
    sortField: url.searchParams.get('sortField') || 'createdAt',
    sortDir: url.searchParams.get('sortDir') || 'desc',
  }

  const parse = offerFilterSchema.safeParse(query)
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
      { awbNumber: { $ilike: term } },
    ]
  }

  if (parse.data.rfqId) {
    filters.rfqId = parse.data.rfqId
  }

  if (parse.data.status) {
    filters.status = parse.data.status
  }

  if (parse.data.carrierId) {
    filters.carrierId = parse.data.carrierId
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
        // Separate rfqName filters (joined field) from regular filters
        const rfqNameFilters = dynamicFilters.filter((f) => f.field === 'rfqName')
        const regularFilters = dynamicFilters.filter((f) => f.field !== 'rfqName')

        // Handle rfqName filters by querying RFQ table first
        if (rfqNameFilters.length > 0) {
          const rfqConditions: Record<string, unknown>[] = []
          for (const row of rfqNameFilters) {
            const val = row.values[0]
            const hasValue = val !== undefined && val !== null && val !== ''

            switch (row.operator) {
              case 'contains':
                if (hasValue) {
                  rfqConditions.push({ name: { $ilike: `%${val}%` } })
                }
                break
              case 'equals':
                if (hasValue) {
                  rfqConditions.push({ name: { $eq: val } })
                }
                break
              case 'is_any_of':
                if (Array.isArray(row.values) && row.values.length > 0) {
                  rfqConditions.push({ name: { $in: row.values } })
                }
                break
              case 'is_empty':
                rfqConditions.push({ name: { $eq: null } })
                break
              case 'is_not_empty':
                rfqConditions.push({ name: { $ne: null } })
                break
            }
          }

          if (rfqConditions.length > 0) {
            // Find matching RFQ IDs
            const matchingRfqs = await em.find(
              FrcRfq,
              { $and: rfqConditions, deletedAt: null, ...scopeFilters },
              { fields: ['id'] }
            )
            const matchingRfqIds = matchingRfqs.map((r) => r.id)

            if (matchingRfqIds.length > 0) {
              filters.rfqId = { $in: matchingRfqIds }
            } else {
              // No matching RFQs - return empty result
              filters.rfqId = { $in: [] }
            }
          }
        }

        // Handle regular filters
        const parsedFilters = regularFilters
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
    status: 'status',
    departureDate: 'departureDate',
    totalRate: 'totalRate',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  }

  const sortField = sortFieldMap[parse.data.sortField] || 'createdAt'
  const sortDir = parse.data.sortDir

  const [items, total] = await em.findAndCount(FrcOffer, filters, {
    populate: ['airRouting'],
    orderBy: { [sortField]: sortDir },
    limit: parse.data.limit,
    offset: parse.data.offset,
  })

  // Fetch RFQ names for display
  const rfqIds = [...new Set(items.map((item) => item.rfqId).filter((id): id is string => Boolean(id)))]
  const rfqMap = new Map<string, string>()
  if (rfqIds.length > 0) {
    const rfqs = await em.find(FrcRfq, { id: { $in: rfqIds } }, { fields: ['id', 'name'] })
    rfqs.forEach((rfq) => rfqMap.set(rfq.id, rfq.name))
  }

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
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      rfqId: item.rfqId ?? null,
      rfqName: item.rfqId ? rfqMap.get(item.rfqId) ?? null : null,
      carrierId: item.carrierId ?? null,
      status: item.status,
      awbNumber: item.awbNumber ?? null,
      connectionMethod: item.connectionMethod ?? null,
      departureDate: item.departureDate ?? null,
      connectionRatePerKg: item.connectionRatePerKg ?? null,
      connectionRateTotal: item.connectionRateTotal ?? null,
      airfreightRatePerKg: item.airfreightRatePerKg ?? null,
      airfreightRateTotal: item.airfreightRateTotal ?? null,
      totalRatePerKg: item.totalRatePerKg ?? null,
      totalRate: item.totalRate ?? null,
      // Map totalRate to totalAmount for frontend compatibility
      totalAmount: item.totalRate ? parseFloat(item.totalRate) : null,
      currencyCode: item.currencyCode,
      assignedToId: item.assignedToId ?? null,
      assignedToName: item.assignedToId ? userMap.get(item.assignedToId)?.name ?? null : null,
      validUntil: item.validUntil ?? null,
      notes: item.notes ?? null,
      organizationId: item.organizationId,
      tenantId: item.tenantId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      airRoutingCount: item.airRouting.length,
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
  const parse = createOfferSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parse.error },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)

  const now = new Date()

  // RFQ is required - fetch within user's scope and inherit organizationId/tenantId
  let rfq: FrcRfq | null = null
  let airCargoItems: FrcAirCargo[] = []

  rfq = await em.findOne(FrcRfq, {
    id: parse.data.rfqId,
    deletedAt: null,
    ...scopeFilters,
  })

  // If RFQ not found within user's accessible organizations, return error
  if (!rfq) {
    return NextResponse.json(
      { error: 'Opportunity not found or not accessible' },
      { status: 400 }
    )
  }

  // Inherit organizationId and tenantId from the parent RFQ
  const organizationId = rfq.organizationId
  const tenantId = rfq.tenantId

  airCargoItems = await em.find(FrcAirCargo, {
    rfq: { id: rfq.id },
    deletedAt: null,
  })

  // Create offer with inherited org/tenant from RFQ
  const offer = em.create(FrcOffer, {
    organizationId,
    tenantId,
    rfqId: parse.data.rfqId,
    name: parse.data.name,
    carrierId: parse.data.carrierId ?? null,
    status: parse.data.status,
    awbNumber: parse.data.awbNumber ?? null,
    connectionMethod: parse.data.connectionMethod ?? null,
    // Auto-populate departure date from RFQ's shipmentReadyDate if not provided
    departureDate: parse.data.departureDate ?? rfq?.shipmentReadyDate ?? null,
    connectionRatePerKg: parse.data.connectionRatePerKg ?? null,
    connectionRateTotal: parse.data.connectionRateTotal ?? null,
    airfreightRatePerKg: parse.data.airfreightRatePerKg ?? null,
    airfreightRateTotal: parse.data.airfreightRateTotal ?? null,
    totalRatePerKg: parse.data.totalRatePerKg ?? null,
    totalRate: parse.data.totalRate ?? null,
    // Auto-populate currency from RFQ if not provided (or use default)
    currencyCode: parse.data.currencyCode || rfq?.currencyCode || 'EUR',
    assignedToId: parse.data.assignedToId ?? null,
    validUntil: parse.data.validUntil ?? null,
    notes: parse.data.notes ?? null,
    createdAt: now,
    updatedAt: now,
  })

  em.persist(offer)

  // Auto-populate offer lines from RFQ air cargo (inherit org/tenant from RFQ)
  if (airCargoItems.length > 0) {
    for (const cargo of airCargoItems) {
      const offerLine = em.create(FrcOfferLine, {
        organizationId,
        tenantId,
        offer: offer,
        sourceAirCargoId: cargo.id,
        name: cargo.name,
        numberOfPieces: cargo.numberOfPieces,
        stackableType: cargo.stackableType,
        lengthCm: cargo.lengthCm,
        widthCm: cargo.widthCm,
        heightCm: cargo.heightCm,
        volumeM3: cargo.volumeM3,
        actualWeightKg: cargo.actualWeightKg,
        chargeableWeightKg: cargo.chargeableWeightKg,
        loadingMetres: cargo.loadingMetres,
        createdAt: now,
        updatedAt: now,
      })
      em.persist(offerLine)
    }
  }

  // Auto-populate initial air routing leg from RFQ airports (inherit org/tenant from RFQ)
  if (rfq.originAirportId || rfq.destinationAirportId) {
    const routing = em.create(FrcAirRouting, {
      organizationId,
      tenantId,
      offer: offer,
      name: 'Route 1',
      type: 'direct_flight',
      originAirportId: rfq.originAirportId ?? null,
      destinationAirportId: rfq.destinationAirportId ?? null,
      departureDate: rfq.shipmentReadyDate ?? null,
      arrivalDate: rfq.requiredAtDestinationDate ?? null,
      currencyCode: rfq.currencyCode,
      createdAt: now,
      updatedAt: now,
    })
    em.persist(routing)
  }

  await em.flush()

  return NextResponse.json(
    {
      id: offer.id,
      name: offer.name,
      autoPopulated: {
        offerLines: airCargoItems.length,
        airRouting: (rfq.originAirportId || rfq.destinationAirportId) ? 1 : 0,
      },
    },
    { status: 201 }
  )
}
