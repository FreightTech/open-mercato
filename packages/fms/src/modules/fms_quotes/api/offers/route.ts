import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@/lib/di/container'
import { getAuthFromRequest } from '@/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { FmsOffer } from '../../data/entities'

const listSchema = z.object({
  quoteId: z.string().uuid().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
  q: z.string().optional(),
  sortField: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
})

// Field mapping from frontend camelCase to database field names
const FIELD_MAP: Record<string, string> = {
  id: 'id',
  offerNumber: 'offerNumber',
  version: 'version',
  status: 'status',
  validUntil: 'validUntil',
  currencyCode: 'currencyCode',
  totalAmount: 'totalAmount',
  paymentTerms: 'paymentTerms',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
}

// Parse DynamicTable FilterRow into MikroORM filter format
function parseFilterRow(row: { field: string; operator: string; values: unknown[] }): Record<string, unknown> | null {
  const field = FIELD_MAP[row.field]
  if (!field) return null

  switch (row.operator) {
    case 'is_any_of':
      return { [field]: { $in: row.values } }
    case 'is_not_any_of':
      return { [field]: { $nin: row.values } }
    case 'contains':
      return { [field]: { $ilike: `%${row.values[0] || ''}%` } }
    case 'is_empty':
      return { [field]: { $eq: null } }
    case 'is_not_empty':
      return { [field]: { $ne: null } }
    case 'equals':
      return { [field]: { $eq: row.values[0] } }
    case 'not_equals':
      return { [field]: { $ne: row.values[0] } }
    case 'is_true':
      return { [field]: { $eq: true } }
    case 'is_false':
      return { [field]: { $eq: false } }
    default:
      return null
  }
}

export async function GET(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const query = {
    quoteId: url.searchParams.get('quoteId') || undefined,
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

  // Optional quoteId filter
  if (parse.data.quoteId) {
    filters.quote = parse.data.quoteId
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

  // Search filter
  if (parse.data.q && parse.data.q.trim().length > 0) {
    const searchTerm = `%${parse.data.q.trim()}%`
    filters.$or = [
      { offerNumber: { $ilike: searchTerm } },
    ]
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

  // Build sort
  const sortFieldMap: Record<string, string> = {
    offerNumber: 'offerNumber',
    version: 'version',
    status: 'status',
    validUntil: 'validUntil',
    totalAmount: 'totalAmount',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  }
  const sortField = sortFieldMap[parse.data.sortField || 'createdAt'] || 'createdAt'
  const sortDir = parse.data.sortDir || 'desc'

  const [items, total] = await em.findAndCount(FmsOffer, filters, {
    orderBy: { [sortField]: sortDir },
    limit: parse.data.limit,
    offset: (parse.data.page - 1) * parse.data.limit,
    populate: ['quote', 'lines', 'assignedTo'],
  })

  // Transform items to include properly formatted assignedTo
  const transformedItems = items.map((offer) => ({
    ...offer,
    assignedTo: offer.assignedTo
      ? {
          id: offer.assignedTo.id,
          name: offer.assignedTo.name || offer.assignedTo.email,
          email: offer.assignedTo.email,
        }
      : null,
    assignedToId: offer.assignedTo?.id ?? null,
    assignedToName: offer.assignedTo?.name ?? offer.assignedTo?.email ?? null,
  }))

  return NextResponse.json({
    items: transformedItems,
    total,
    page: parse.data.page,
    limit: parse.data.limit,
    totalPages: Math.ceil(total / parse.data.limit),
  })
}

// Schema for creating offer with line selection
const createOfferSchema = z.object({
  quoteId: z.string().uuid(),
  lineIds: z.array(z.string().uuid()).optional(),
  validUntil: z.coerce.date(),
  paymentTerms: z.string().trim().max(255).optional().nullable(),
  specialTerms: z.string().trim().max(2000).optional().nullable(),
  customerNotes: z.string().trim().max(2000).optional().nullable(),
})

export async function POST(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const validation = createOfferSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid input', details: validation.error }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const commandBus = container.resolve('commandBus') as CommandBus

  const data = validation.data

  const selectedOrgId = scope?.selectedId ?? auth.orgId
  const tenantId = auth.tenantId

  if (!selectedOrgId || !tenantId) {
    return NextResponse.json({ error: 'Organization and tenant context required' }, { status: 400 })
  }

  try {
    const { result, logEntry } = await commandBus.execute('fms_quotes.offers.create', {
      input: {
        ...data,
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
        resourceKind: 'fms_quotes.offer',
      },
    })

    // Reload offer with lines for response
    const em = container.resolve('em') as EntityManager
    const offer = await em.findOne(FmsOffer, { id: (result as { offerId: string }).offerId }, { populate: ['lines', 'quote'] })

    return NextResponse.json(offer, { status: 201 })
  } catch (error: any) {
    console.error('[offers/create] error:', error)
    if (error?.status) {
      return NextResponse.json(error.body || { error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to create offer', message: error.message }, { status: 500 })
  }
}

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_quotes.offers.view'] },
  POST: { requireAuth: true, requireFeatures: ['fms_quotes.offers.manage'] },
}
