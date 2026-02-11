import { NextRequest, NextResponse } from 'next/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { FrcQuote } from '../../data/entities'
import { FrcRfq } from '../../../frc_rfqs/data/entities'
import { createQuoteSchema, quoteFilterSchema } from '../../data/validators'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['frc_quotes.view'] },
  POST: { requireAuth: true, requireFeatures: ['frc_quotes.manage'] },
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

  const parse = quoteFilterSchema.safeParse(query)
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

  const [items, total] = await em.findAndCount(FrcQuote, filters, {
    populate: ['airRouting'],
    orderBy: { [sortField]: sortDir },
    limit: parse.data.limit,
    offset: parse.data.offset,
  })

  // Fetch RFQ names for display
  const rfqIds = [...new Set(items.map((item) => item.rfqId).filter(Boolean))]
  const rfqMap = new Map<string, string>()
  if (rfqIds.length > 0) {
    const rfqs = await em.find(FrcRfq, { id: { $in: rfqIds } }, { fields: ['id', 'name'] })
    rfqs.forEach((rfq) => rfqMap.set(rfq.id, rfq.name))
  }

  return NextResponse.json({
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      rfqId: item.rfqId ?? null,
      rfqName: rfqMap.get(item.rfqId) ?? null,
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
      currencyCode: item.currencyCode,
      assignedToId: item.assignedToId ?? null,
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
  const parse = createQuoteSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parse.error },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const em = container.resolve('em') as EntityManager

  const tenantId = auth.actorTenantId || auth.tenantId
  const organizationId = scope?.selectedId || auth.actorOrgId || auth.orgId

  if (!tenantId || !organizationId) {
    return NextResponse.json({ error: 'Missing tenant or organization context' }, { status: 400 })
  }

  const now = new Date()
  const quote = em.create(FrcQuote, {
    organizationId: organizationId as string,
    tenantId: tenantId as string,
    rfqId: parse.data.rfqId,
    name: parse.data.name,
    carrierId: parse.data.carrierId ?? null,
    status: parse.data.status,
    awbNumber: parse.data.awbNumber ?? null,
    connectionMethod: parse.data.connectionMethod ?? null,
    departureDate: parse.data.departureDate ?? null,
    connectionRatePerKg: parse.data.connectionRatePerKg ?? null,
    connectionRateTotal: parse.data.connectionRateTotal ?? null,
    airfreightRatePerKg: parse.data.airfreightRatePerKg ?? null,
    airfreightRateTotal: parse.data.airfreightRateTotal ?? null,
    totalRatePerKg: parse.data.totalRatePerKg ?? null,
    totalRate: parse.data.totalRate ?? null,
    currencyCode: parse.data.currencyCode,
    assignedToId: parse.data.assignedToId ?? null,
    createdAt: now,
    updatedAt: now,
  })

  await em.persistAndFlush(quote)

  return NextResponse.json(
    {
      id: quote.id,
      name: quote.name,
    },
    { status: 201 }
  )
}
