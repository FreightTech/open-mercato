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
    projectNumber: url.searchParams.get('projectNumber') || undefined,
    accountId: url.searchParams.get('accountId') || undefined,
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

  return NextResponse.json({
    items: items.map((item) => ({
      id: item.id,
      projectNumber: item.projectNumber,
      rfqId: item.rfqId ?? null,
      rfqName: item.rfqId ? rfqMap.get(item.rfqId) ?? null : null,
      offerId: item.offerId ?? null,
      offerName: item.offerId ? offerMap.get(item.offerId) ?? null : null,
      accountId: item.accountId ?? null,
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
    // Fallback to user's selected org (no parent entity)
    const fallbackTenantId = auth.actorTenantId || auth.tenantId
    const fallbackOrgId = scope?.selectedId || auth.actorOrgId || auth.orgId
    tenantId = typeof fallbackTenantId === 'string' ? fallbackTenantId : null
    organizationId = typeof fallbackOrgId === 'string' ? fallbackOrgId : null
  }

  if (!tenantId || !organizationId) {
    return NextResponse.json({ error: 'Missing tenant or organization context' }, { status: 400 })
  }

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
