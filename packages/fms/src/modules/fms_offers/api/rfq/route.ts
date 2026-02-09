import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { FmsRfq } from '../../data/entities'
import { FMS_RFQ_STATUSES } from '../../data/types'

const listSchema = z.object({
  status: z.enum(FMS_RFQ_STATUSES).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
  q: z.string().optional(),
  sortField: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
})

export async function GET(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const query = {
    status: url.searchParams.get('status') || undefined,
    page: url.searchParams.get('page') || '1',
    limit: url.searchParams.get('limit') || '50',
    q: url.searchParams.get('q') || undefined,
    sortField: url.searchParams.get('sortField') || undefined,
    sortDir: url.searchParams.get('sortDir') || undefined,
  }

  const parse = listSchema.safeParse(query)
  if (!parse.success) {
    return NextResponse.json({ error: 'Invalid query parameters', details: parse.error }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const filters: Record<string, unknown> = {
    deletedAt: null,
  }

  if (parse.data.status) {
    filters.status = parse.data.status
  }

  if (auth.tenantId) {
    filters.tenantId = auth.tenantId
  }

  const allowedOrgIds = new Set<string>()
  if (scope?.filterIds?.length) scope.filterIds.forEach((id) => allowedOrgIds.add(id))
  else if (auth.orgId) allowedOrgIds.add(auth.orgId)

  if (allowedOrgIds.size) {
    filters.organizationId = { $in: [...allowedOrgIds] }
  }

  if (parse.data.q && parse.data.q.trim().length > 0) {
    const searchTerm = `%${parse.data.q.trim()}%`
    filters.$or = [
      { title: { $ilike: searchTerm } },
      { companyName: { $ilike: searchTerm } },
      { origin: { $ilike: searchTerm } },
      { destination: { $ilike: searchTerm } },
    ]
  }

  const sortFieldMap: Record<string, string> = {
    title: 'title',
    companyName: 'companyName',
    status: 'status',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  }
  const sortField = sortFieldMap[parse.data.sortField || 'updatedAt'] || 'updatedAt'
  const sortDir = parse.data.sortDir || 'desc'

  const [items, total] = await em.findAndCount(FmsRfq, filters, {
    orderBy: { [sortField]: sortDir },
    limit: parse.data.limit,
    offset: (parse.data.page - 1) * parse.data.limit,
  })

  return NextResponse.json({
    items,
    total,
    page: parse.data.page,
    limit: parse.data.limit,
    totalPages: Math.ceil(total / parse.data.limit),
  })
}

const createSchema = z.object({
  title: z.string().trim().max(255).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  origin: z.string().trim().max(255).optional().nullable(),
  destination: z.string().trim().max(255).optional().nullable(),
  containerCount: z.coerce.number().int().min(1).optional().nullable(),
  direction: z.enum(['import', 'export', 'both'] as const).optional().nullable(),
  transportMode: z.enum(['sea', 'air', 'road', 'rail', 'barge'] as const).optional().nullable(),
  cargoType: z.enum(['general', 'dangerous', 'perishable', 'oog'] as const).optional().nullable(),
  companyName: z.string().trim().max(255).optional().nullable(),
  contactPerson: z.string().trim().max(255).optional().nullable(),
  context: z.string().trim().max(5000).optional().nullable(),
  status: z.enum(FMS_RFQ_STATUSES).optional(),
  assignedToId: z.string().uuid().optional().nullable(),
})

export async function POST(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const validation = createSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid input', details: validation.error }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const commandBus = container.resolve('commandBus') as CommandBus

  const selectedOrgId = scope?.selectedId ?? auth.orgId
  const tenantId = auth.tenantId

  if (!selectedOrgId || !tenantId) {
    return NextResponse.json({ error: 'Organization and tenant context required' }, { status: 400 })
  }

  try {
    const { result } = await commandBus.execute('fms_offers.rfq.create', {
      input: {
        ...validation.data,
        organizationId: selectedOrgId,
        tenantId,
      },
      ctx: {
        container,
        auth,
        organizationScope: scope,
        selectedOrganizationId: selectedOrgId,
        organizationIds: scope?.filterIds ?? (selectedOrgId ? [selectedOrgId] : null),
        request: req,
      },
      metadata: {
        tenantId,
        organizationId: selectedOrgId,
        resourceKind: 'fms_offers.rfq',
      },
    })

    const em = container.resolve('em') as EntityManager
    const rfq = await em.findOne(FmsRfq, { id: (result as { rfqId: string }).rfqId })

    return NextResponse.json(rfq, { status: 201 })
  } catch (error: any) {
    console.error('[rfq/create] error:', error)
    if (error?.status) {
      return NextResponse.json(error.body || { error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to create RFQ', message: error.message }, { status: 500 })
  }
}

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_offers.rfq.view'] },
  POST: { requireAuth: true, requireFeatures: ['fms_offers.rfq.manage'] },
}
