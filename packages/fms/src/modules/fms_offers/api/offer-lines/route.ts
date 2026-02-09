import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { FmsOfferLine, FmsOfferCalculation, FmsOffer } from '../../data/entities'
import { fmsOfferLineCreateSchema } from '../../data/validators'

const listSchema = z.object({
  offerId: z.string().uuid().optional(),
  calculationId: z.string().uuid().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
})

export async function GET(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const query = {
    offerId: url.searchParams.get('offerId') || undefined,
    calculationId: url.searchParams.get('calculationId') || undefined,
    page: url.searchParams.get('page') || '1',
    limit: url.searchParams.get('limit') || '50',
  }

  const parse = listSchema.safeParse(query)
  if (!parse.success) {
    return NextResponse.json({ error: 'Invalid query parameters', details: parse.error }, { status: 400 })
  }

  if (!parse.data.offerId && !parse.data.calculationId) {
    return NextResponse.json({ error: 'Either offerId or calculationId is required' }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const tenantId = auth.actorTenantId || auth.tenantId

  // If offerId is provided, first find all calculation IDs for that offer
  let calculationIds: string[] = []
  if (parse.data.calculationId) {
    calculationIds = [parse.data.calculationId]
  } else if (parse.data.offerId) {
    const calcs = await em.find(FmsOfferCalculation, {
      offer: parse.data.offerId,
      deletedAt: null,
    })
    calculationIds = calcs.map(c => c.id)
  }

  if (calculationIds.length === 0) {
    return NextResponse.json({ items: [], total: 0, page: 1, limit: parse.data.limit, totalPages: 0 })
  }

  const filters: Record<string, unknown> = {
    calculation: calculationIds.length === 1 ? calculationIds[0] : { $in: calculationIds },
    deletedAt: null,
  }

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

  const [items, total] = await em.findAndCount(FmsOfferLine, filters, {
    orderBy: { lineNumber: 'ASC', createdAt: 'ASC' },
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

export async function POST(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const validation = fmsOfferLineCreateSchema.partial().safeParse(body)
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid input', details: validation.error }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager
  const commandBus = container.resolve('commandBus') as CommandBus

  const data = validation.data

  if (!data.calculationId) {
    return NextResponse.json({ error: 'calculationId is required' }, { status: 400 })
  }

  // Verify the calculation and its parent offer exist
  const calculation = await em.findOne(FmsOfferCalculation, { id: data.calculationId, deletedAt: null })
  if (!calculation) {
    return NextResponse.json({ error: 'Calculation not found' }, { status: 404 })
  }

  const offerId = typeof calculation.offer === 'string' ? calculation.offer : calculation.offer?.id
  const offer = await em.findOne(FmsOffer, { id: offerId, deletedAt: null })
  if (!offer) {
    return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
  }

  const tenantId = auth.actorTenantId as string || auth.tenantId
  const selectedOrgId = typeof scope?.selectedId === 'string' ? scope.selectedId : auth.orgId

  try {
    const { result } = await commandBus.execute('fms_offers.offer_lines.create', {
      input: {
        ...data,
        organizationId: offer.organizationId,
        tenantId: offer.tenantId,
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
        resourceKind: 'fms_offers.offer_line',
      },
    })

    // Reload line for response
    const line = await em.findOne(FmsOfferLine, { id: (result as { lineId: string }).lineId })

    return NextResponse.json(line, { status: 201 })
  } catch (error: any) {
    console.error('[offer-lines/create] error:', error)
    if (error?.status) {
      return NextResponse.json(error.body || { error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to create offer line', message: error.message }, { status: 500 })
  }
}

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_offers.offers.view'] },
  POST: { requireAuth: true, requireFeatures: ['fms_offers.offers.manage'] },
}
