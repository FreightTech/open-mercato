import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { FmsQuoteLine, FmsQuote } from '../../data/entities'
import { FmsLocation } from '../../../fms_locations/data/entities'
import { fmsQuoteLineCreateSchema } from '../../data/validators'

const listSchema = z.object({
  quoteId: z.string().uuid(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
})

export async function GET(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const query = {
    quoteId: url.searchParams.get('quoteId'),
    page: url.searchParams.get('page') || '1',
    limit: url.searchParams.get('limit') || '50',
  }

  const parse = listSchema.safeParse(query)
  if (!parse.success) {
    return NextResponse.json({ error: 'Invalid query parameters', details: parse.error }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const filters: Record<string, unknown> = {
    quote: parse.data.quoteId,
    deletedAt: null,
  }

  const tenantId = auth.actorTenantId || auth.tenantId
  if (tenantId) {
    filters.tenantId = tenantId
  }

  const allowedOrgIds = new Set<string>()
  if (scope?.filterIds?.length) {
    scope.filterIds.forEach((id) => { if (typeof id === 'string') allowedOrgIds.add(id) })
  } else if (typeof auth.actorOrgId === 'string') {
    allowedOrgIds.add(auth.actorOrgId)
  } else if (typeof auth.orgId === 'string') {
    allowedOrgIds.add(auth.orgId)
  }

  if (allowedOrgIds.size) {
    filters.organizationId = { $in: [...allowedOrgIds] }
  }

  const [items, total] = await em.findAndCount(FmsQuoteLine, filters, {
    orderBy: { lineNumber: 'ASC', createdAt: 'ASC' },
    limit: parse.data.limit,
    offset: (parse.data.page - 1) * parse.data.limit,
  })

  // Collect unique location IDs to resolve names
  const locationIds = new Set<string>()
  for (const item of items) {
    if (item.originLocationId) locationIds.add(item.originLocationId)
    if (item.destinationLocationId) locationIds.add(item.destinationLocationId)
  }

  // Fetch locations if we have any IDs
  const locationMap = new Map<string, string>()
  if (locationIds.size > 0) {
    const locations = await em.find(FmsLocation, { id: { $in: [...locationIds] } })
    for (const loc of locations) {
      locationMap.set(loc.id, loc.name)
    }
  }

  // Map items to include resolved location names
  const enrichedItems = items.map((item) => ({
    ...item,
    origin: item.originLocationId ? locationMap.get(item.originLocationId) || null : null,
    destination: item.destinationLocationId ? locationMap.get(item.destinationLocationId) || null : null,
  }))

  return NextResponse.json({
    items: enrichedItems,
    total,
    page: parse.data.page,
    limit: parse.data.limit,
    totalPages: Math.ceil(total / parse.data.limit),
  })
}

export async function POST(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const validation = fmsQuoteLineCreateSchema.partial().safeParse(body)
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid input', details: validation.error }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager
  const commandBus = container.resolve('commandBus') as CommandBus

  const data = validation.data

  // Verify the quote exists and get its scope info
  const quote = await em.findOne(FmsQuote, { id: data.quoteId, deletedAt: null })
  if (!quote) {
    return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
  }

  const tenantId = auth.actorTenantId as string || auth.tenantId
  const selectedOrgId = typeof scope?.selectedId === 'string' ? scope.selectedId : auth.orgId

  try {
    const { result } = await commandBus.execute('fms_quotes.quote_lines.create', {
      input: {
        ...data,
        organizationId: quote.organizationId,
        tenantId: quote.tenantId,
      },
      ctx: {
        container,
        auth,
        organizationScope: scope,
        selectedOrganizationId: selectedOrgId ?? null,
        organizationIds: scope?.filterIds ?? (selectedOrgId ? [selectedOrgId] : null),
        request: req,
      },
      metadata: {
        tenantId: tenantId ?? null,
        organizationId: selectedOrgId ?? undefined,
        resourceKind: 'fms_quotes.quote_line',
      },
    })

    // Reload line for response
    const line = await em.findOne(FmsQuoteLine, { id: (result as { lineId: string }).lineId })

    return NextResponse.json(line, { status: 201 })
  } catch (error: any) {
    console.error('[quote-lines/create] error:', error)
    if (error?.status) {
      return NextResponse.json(error.body || { error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to create quote line', message: error.message }, { status: 500 })
  }
}

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_quotes.quotes.view'] },
  POST: { requireAuth: true, requireFeatures: ['fms_quotes.quotes.manage'] },
}
