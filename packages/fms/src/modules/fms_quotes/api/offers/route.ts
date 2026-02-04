import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
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
  organizationId: 'organizationId',
  tenantId: 'tenantId',
  quoteId: 'quoteId',
  offerNumber: 'offerNumber',
  version: 'version',
  status: 'status',
  validUntil: 'validUntil',
  paymentTerms: 'paymentTerms',
  specialTerms: 'specialTerms',
  customerNotes: 'customerNotes',
  notes: 'notes',
  supersededById: 'supersededById',
  assignedToId: 'assignedToId',
  documentId: 'documentId',
  sentAt: 'sentAt',
  sentToEmail: 'sentToEmail',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt',
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
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  }
  const sortField = sortFieldMap[parse.data.sortField || 'createdAt'] || 'createdAt'
  const sortDir = parse.data.sortDir || 'desc'

  const [items, total] = await em.findAndCount(FmsOffer, filters, {
    orderBy: { [sortField]: sortDir },
    limit: parse.data.limit,
    offset: (parse.data.page - 1) * parse.data.limit,
    populate: ['quote', 'quote.client', 'lines'],
  })

  // Fetch users separately (module isomorphism - no direct User relationship)
  // Includes: assignedTo, operationalGuardian, businessGuardian
  const userIds = new Set<string>()
  for (const offer of items) {
    if (offer.assignedToId) userIds.add(offer.assignedToId)
    if (offer.operationalGuardianId) userIds.add(offer.operationalGuardianId)
    if (offer.businessGuardianId) userIds.add(offer.businessGuardianId)
  }

  const userMap = new Map<string, { id: string; name?: string | null; email: string }>()
  if (userIds.size > 0) {
    const knex = (em as any).getConnection().getKnex()
    const users = await knex('users').select('id', 'name', 'email').whereIn('id', Array.from(userIds))
    for (const u of users) {
      userMap.set(u.id, { id: u.id, name: u.name, email: u.email })
    }
  }

  // Transform items to include properly formatted users and client
  const transformedItems = items.map((offer) => {
    const assignedToUser = offer.assignedToId ? userMap.get(offer.assignedToId) : null
    const operationalGuardian = offer.operationalGuardianId ? userMap.get(offer.operationalGuardianId) : null
    const businessGuardian = offer.businessGuardianId ? userMap.get(offer.businessGuardianId) : null

    // Get client name from quote's client relationship (prefer shortName for display, fallback to name)
    const clientName = offer.quote?.client?.shortName || offer.quote?.client?.name || null

    return {
      ...offer,
      clientId: offer.quote?.client?.id ?? null,
      clientName,
      assignedTo: assignedToUser
        ? {
            id: assignedToUser.id,
            name: assignedToUser.name || assignedToUser.email,
            email: assignedToUser.email,
          }
        : null,
      assignedToId: offer.assignedToId ?? null,
      assignedToName: assignedToUser?.name ?? assignedToUser?.email ?? null,
      operationalGuardianId: offer.operationalGuardianId ?? null,
      operationalGuardianName: operationalGuardian?.name ?? operationalGuardian?.email ?? null,
      businessGuardianId: offer.businessGuardianId ?? null,
      businessGuardianName: businessGuardian?.name ?? businessGuardian?.email ?? null,
    }
  })

  return NextResponse.json({
    items: transformedItems,
    total,
    page: parse.data.page,
    limit: parse.data.limit,
    totalPages: Math.ceil(total / parse.data.limit),
  })
}

// Exchange rate snapshot schema
const exchangeRateSnapshotSchema = z.object({
  fromCurrencyCode: z.string().trim().regex(/^[A-Z]{3}$/),
  toCurrencyCode: z.string().trim().regex(/^[A-Z]{3}$/),
  rate: z.string().trim(),
  date: z.string().trim(),
  source: z.string().trim(),
})

// Schema for creating offer with line selection
const createOfferSchema = z.object({
  quoteId: z.string().uuid(),
  lineIds: z.array(z.string().uuid()).optional(),
  validUntil: z.coerce.date(),
  paymentTerms: z.string().trim().max(255).optional().nullable(),
  specialTerms: z.string().trim().max(2000).optional().nullable(),
  customerNotes: z.string().trim().max(2000).optional().nullable(),
  exchangeRates: z.array(exchangeRateSnapshotSchema).optional().nullable(),
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
