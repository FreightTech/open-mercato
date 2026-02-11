import { NextRequest, NextResponse } from 'next/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { FrcProject } from '../../data/entities'
import { FrcRfq } from '../../../frc_rfqs/data/entities'
import { FrcQuote } from '../../../frc_quotes/data/entities'
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

  // Fetch RFQ and Quote names separately
  const rfqIds = [...new Set(items.map((item) => item.rfqId).filter(Boolean))] as string[]
  const quoteIds = [...new Set(items.map((item) => item.quoteId).filter(Boolean))] as string[]

  const rfqMap = new Map<string, string>()
  const quoteMap = new Map<string, string>()

  if (rfqIds.length > 0) {
    const rfqs = await em.find(FrcRfq, { id: { $in: rfqIds } }, { fields: ['id', 'name'] })
    rfqs.forEach((rfq) => rfqMap.set(rfq.id, rfq.name))
  }

  if (quoteIds.length > 0) {
    const quotes = await em.find(FrcQuote, { id: { $in: quoteIds } }, { fields: ['id', 'name'] })
    quotes.forEach((quote) => quoteMap.set(quote.id, quote.name))
  }

  return NextResponse.json({
    items: items.map((item) => ({
      id: item.id,
      projectNumber: item.projectNumber,
      rfqId: item.rfqId ?? null,
      rfqName: item.rfqId ? rfqMap.get(item.rfqId) ?? null : null,
      quoteId: item.quoteId ?? null,
      quoteName: item.quoteId ? quoteMap.get(item.quoteId) ?? null : null,
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

  const tenantId = auth.actorTenantId || auth.tenantId
  const organizationId = scope?.selectedId || auth.actorOrgId || auth.orgId

  if (!tenantId || !organizationId) {
    return NextResponse.json({ error: 'Missing tenant or organization context' }, { status: 400 })
  }

  const now = new Date()
  const project = em.create(FrcProject, {
    organizationId: organizationId as string,
    tenantId: tenantId as string,
    projectNumber: parse.data.projectNumber,
    rfqId: parse.data.rfqId ?? null,
    quoteId: parse.data.quoteId ?? null,
    accountId: parse.data.accountId ?? null,
    status: parse.data.status,
    totalValue: parse.data.totalValue ?? null,
    currencyCode: parse.data.currencyCode,
    createdAt: now,
    updatedAt: now,
  })

  await em.persistAndFlush(project)

  return NextResponse.json(
    {
      id: project.id,
      projectNumber: project.projectNumber,
    },
    { status: 201 }
  )
}
