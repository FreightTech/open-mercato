import { NextRequest, NextResponse } from 'next/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { FrcProject } from '../../data/entities'
import { FrcRfq } from '../../../frc_rfqs/data/entities'
import { FrcOffer } from '../../../frc_offers/data/entities'
import { createProjectSchema, projectFilterSchema } from '../../data/validators'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['frc_projects.view'] },
  POST: { requireAuth: true, requireFeatures: ['frc_projects.manage'] },
}

// Field mapping for DynamicTable filters (table column name -> ORM field name)
const FIELD_MAP: Record<string, string> = {
  id: 'id',
  projectNumber: 'projectNumber',
  rfqId: 'rfqId',
  offerId: 'offerId',
  accountId: 'accountId',
  assignedToId: 'assignedToId',
  status: 'status',
  totalValue: 'totalValue',
  currencyCode: 'currencyCode',
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
    // This allows viewing all projects across all organizations
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
    projectNumber: url.searchParams.get('projectNumber') || undefined,
    accountId: url.searchParams.get('accountId') || undefined,
    assignedToId: url.searchParams.get('assignedToId') || undefined,
    status: url.searchParams.get('status') || undefined,
    limit: url.searchParams.get('limit') || '50',
    offset: url.searchParams.get('offset') || '0',
    sortField: url.searchParams.get('sortField') || 'createdAt',
    sortDir: url.searchParams.get('sortDir') || 'desc',
  }

  const parse = projectFilterSchema.safeParse(query)
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
      { projectNumber: { $ilike: term } },
    ]
  }

  if (parse.data.projectNumber) {
    filters.projectNumber = { $ilike: `%${escapeLikePattern(parse.data.projectNumber)}%` }
  }

  if (parse.data.accountId) {
    filters.accountId = parse.data.accountId
  }

  if (parse.data.status) {
    filters.status = parse.data.status
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
    projectNumber: 'projectNumber',
    status: 'status',
    totalValue: 'totalValue',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  }

  const sortField = sortFieldMap[parse.data.sortField] || 'createdAt'
  const sortDir = parse.data.sortDir

  const [items, total] = await em.findAndCount(FrcProject, filters, {
    orderBy: { [sortField]: sortDir },
    limit: parse.data.limit,
    offset: parse.data.offset,
  })

  // Fetch RFQ and Offer names separately
  const rfqIds = [...new Set(items.map((item) => item.rfqId).filter(Boolean))] as string[]
  const offerIds = [...new Set(items.map((item) => item.offerId).filter(Boolean))] as string[]

  const rfqMap = new Map<string, string>()
  const offerMap = new Map<string, string>()

  if (rfqIds.length > 0) {
    const rfqs = await em.find(FrcRfq, { id: { $in: rfqIds } }, { fields: ['id', 'name'] })
    rfqs.forEach((rfq) => rfqMap.set(rfq.id, rfq.name))
  }

  if (offerIds.length > 0) {
    const offers = await em.find(FrcOffer, { id: { $in: offerIds } }, { fields: ['id', 'name'] })
    offers.forEach((offer) => offerMap.set(offer.id, offer.name))
  }

  // Fetch assigned user names
  const assignedToIds = [...new Set(items.map((item) => item.assignedToId).filter(Boolean))] as string[]
  const userMap = new Map<string, { id: string; name: string }>()

  if (assignedToIds.length > 0) {
    const users = await knex('users')
      .select('id', knex.raw('COALESCE(name, email) as name'))
      .whereIn('id', assignedToIds)
      .whereNull('deleted_at')
    for (const u of users) {
      userMap.set(u.id, { id: u.id, name: u.name })
    }
  }

  return NextResponse.json({
    items: items.map((item) => ({
      id: item.id,
      projectNumber: item.projectNumber,
      rfqId: item.rfqId ?? null,
      rfqName: item.rfqId ? rfqMap.get(item.rfqId) ?? null : null,
      offerId: item.offerId ?? null,
      offerName: item.offerId ? offerMap.get(item.offerId) ?? null : null,
      accountId: item.accountId ?? null,
      assignedToId: item.assignedToId ?? null,
      assignedToName: item.assignedToId ? userMap.get(item.assignedToId)?.name ?? null : null,
      status: item.status,
      totalValue: item.totalValue ?? null,
      currencyCode: item.currencyCode,
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
  const parse = createProjectSchema.safeParse(body)

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

  // Determine organizationId/tenantId by inheriting from parent entity
  // Priority: offerId > rfqId > fallback to user's selected org
  let organizationId: string | null = null
  let tenantId: string | null = null

  if (parse.data.offerId) {
    // Inherit from offer
    const offer = await em.findOne(FrcOffer, {
      id: parse.data.offerId,
      deletedAt: null,
      ...scopeFilters,
    })
    if (!offer) {
      return NextResponse.json({ error: 'Offer not found or not accessible' }, { status: 400 })
    }
    organizationId = offer.organizationId
    tenantId = offer.tenantId
  } else if (parse.data.rfqId) {
    // Inherit from RFQ
    const rfq = await em.findOne(FrcRfq, {
      id: parse.data.rfqId,
      deletedAt: null,
      ...scopeFilters,
    })
    if (!rfq) {
      return NextResponse.json({ error: 'Opportunity not found or not accessible' }, { status: 400 })
    }
    organizationId = rfq.organizationId
    tenantId = rfq.tenantId
  } else {
    // Fallback to user's org from token (matching GET behavior)
    const fallbackTenantId = auth.actorTenantId || auth.tenantId
    const fallbackOrgId = auth.actorOrgId || auth.orgId
    tenantId = typeof fallbackTenantId === 'string' ? fallbackTenantId : null
    organizationId = typeof fallbackOrgId === 'string' ? fallbackOrgId : null
  }

  if (!tenantId || !organizationId) {
    return NextResponse.json({ error: 'Missing tenant or organization context' }, { status: 400 })
  }

  // Get current user ID for auto-assignment
  const currentUserId = (auth.userId ?? auth.id ?? null) as string | null

  // Generate project number if not provided
  let projectNumber = parse.data.projectNumber
  if (!projectNumber || projectNumber.trim().length === 0) {
    projectNumber = await generateProjectNumber(em, tenantId, organizationId)
  }

  const now = new Date()
  const project = em.create(FrcProject, {
    organizationId,
    tenantId,
    projectNumber,
    rfqId: parse.data.rfqId ?? null,
    offerId: parse.data.offerId ?? null,
    accountId: parse.data.accountId ?? null,
    status: parse.data.status,
    totalValue: parse.data.totalValue ?? null,
    currencyCode: parse.data.currencyCode,
    // New fields
    originAirportId: parse.data.originAirportId ?? null,
    destinationAirportId: parse.data.destinationAirportId ?? null,
    shipmentReadyDate: parse.data.shipmentReadyDate ? new Date(parse.data.shipmentReadyDate) : null,
    requiredDeliveryDate: parse.data.requiredDeliveryDate ? new Date(parse.data.requiredDeliveryDate) : null,
    awbNumbers: parse.data.awbNumbers ?? null,
    notes: parse.data.notes ?? null,
    // Auto-assign to current user if not specified
    assignedToId: parse.data.assignedToId ?? currentUserId,
    createdAt: now,
    updatedAt: now,
  })

  await em.persistAndFlush(project)

  // Link offer to project if provided
  if (parse.data.offerId) {
    const offer = await em.findOne(FrcOffer, { id: parse.data.offerId, deletedAt: null })
    if (offer) {
      offer.projectId = project.id
      offer.updatedAt = now
      await em.flush()
    }
  }

  return NextResponse.json(
    {
      id: project.id,
      projectNumber: project.projectNumber,
    },
    { status: 201 }
  )
}

async function generateProjectNumber(
  em: EntityManager,
  tenantId: string,
  organizationId: string
): Promise<string> {
  // Simple project number generation: PRJ-YYYYMMDD-XXXX
  const now = new Date()
  const datePrefix = now.toISOString().slice(0, 10).replace(/-/g, '')

  // Count existing projects for this org today to generate sequence
  const count = await em.count(FrcProject, {
    tenantId,
    organizationId,
    createdAt: { $gte: new Date(now.toISOString().slice(0, 10)) },
  })

  const sequence = String(count + 1).padStart(4, '0')
  return `PRJ-${datePrefix}-${sequence}`
}
