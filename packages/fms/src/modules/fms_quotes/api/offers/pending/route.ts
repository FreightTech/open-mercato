import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@/lib/di/container'
import { getAuthFromRequest } from '@/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsOffer } from '../../../data/entities'

const listSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
  status: z.string().optional(), // Comma-separated statuses (default: 'sent')
})

export async function GET(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const query = {
    page: url.searchParams.get('page') || '1',
    limit: url.searchParams.get('limit') || '50',
    status: url.searchParams.get('status') || undefined,
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

  // Status filter - support multiple statuses via comma-separated values
  const statuses = parse.data.status
    ? parse.data.status.split(',').map(s => s.trim())
    : ['sent'] // Default to 'sent' for pending offers page

  if (statuses.length === 1) {
    filters.status = statuses[0]
  } else {
    filters.status = { $in: statuses }
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

  const [items, total] = await em.findAndCount(FmsOffer, filters, {
    orderBy: { sentAt: 'ASC', createdAt: 'ASC' }, // Oldest first
    limit: parse.data.limit,
    offset: (parse.data.page - 1) * parse.data.limit,
    populate: ['quote', 'quote.client', 'quote.originPorts', 'quote.destinationPorts', 'assignedTo'],
  })

  // Transform items to include computed daysSinceSent
  const now = new Date()
  const transformedItems = items.map((offer) => {
    const sentDate = offer.sentAt || offer.updatedAt
    const daysSinceSent = Math.floor((now.getTime() - sentDate.getTime()) / (1000 * 60 * 60 * 24))

    // Get first origin/destination ports for display
    const originPorts = offer.quote?.originPorts?.getItems?.() || []
    const destPorts = offer.quote?.destinationPorts?.getItems?.() || []

    return {
      id: offer.id,
      offer_number: offer.offerNumber,
      offerNumber: offer.offerNumber,
      version: offer.version,
      status: offer.status,
      quoteId: offer.quote?.id,
      quote_number: offer.quote?.quoteNumber,
      quoteNumber: offer.quote?.quoteNumber,
      clientId: offer.quote?.client?.id,
      client_name: offer.quote?.client?.name || null,
      clientName: offer.quote?.client?.name || null,
      originPortCode: originPorts[0]?.locode || originPorts[0]?.name || null,
      destinationPortCode: destPorts[0]?.locode || destPorts[0]?.name || null,
      validUntil: offer.validUntil,
      currency_code: offer.currencyCode,
      currencyCode: offer.currencyCode,
      total_amount: offer.totalAmount,
      totalAmount: offer.totalAmount,
      sentAt: offer.sentAt,
      daysSinceSent,
      created_at: offer.createdAt,
      createdAt: offer.createdAt,
      lines_count: 0,
      assignedTo: offer.assignedTo ? {
        id: offer.assignedTo.id,
        name: offer.assignedTo.name,
        email: offer.assignedTo.email,
      } : null,
      quote: {
        id: offer.quote?.id,
        quoteNumber: offer.quote?.quoteNumber,
        clientName: offer.quote?.client?.name,
        originPortCode: originPorts[0]?.locode || originPorts[0]?.name || null,
        destinationPortCode: destPorts[0]?.locode || destPorts[0]?.name || null,
      },
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

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_quotes.offers.view'] },
}
