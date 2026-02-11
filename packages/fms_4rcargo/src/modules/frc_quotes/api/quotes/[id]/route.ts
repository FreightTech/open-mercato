import { NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FrcQuote } from '../../../data/entities'
import { FrcRfq } from '../../../../frc_rfqs/data/entities'
import { updateQuoteSchema } from '../../../data/validators'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['frc_quotes.view'] },
  PUT: { requireAuth: true, requireFeatures: ['frc_quotes.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['frc_quotes.manage'] },
}

const paramsSchema = z.object({
  id: z.string().uuid(),
})

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

export async function GET(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid quote id' }, { status: 400 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)
  const filters: Record<string, unknown> = {
    id: parse.data.id,
    deletedAt: null,
    ...scopeFilters,
  }

  const quote = await em.findOne(FrcQuote, filters, {
    populate: ['airRouting'],
  })

  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 })

  // Fetch RFQ data separately
  let rfqData: { id: string; name: string } | null = null
  if (quote.rfqId) {
    const rfq = await em.findOne(FrcRfq, { id: quote.rfqId }, { fields: ['id', 'name'] })
    if (rfq) {
      rfqData = { id: rfq.id, name: rfq.name }
    }
  }

  return NextResponse.json({
    id: quote.id,
    name: quote.name,
    rfqId: rfqData?.id ?? null,
    rfqName: rfqData?.name ?? null,
    carrierId: quote.carrierId ?? null,
    status: quote.status,
    awbNumber: quote.awbNumber ?? null,
    connectionMethod: quote.connectionMethod ?? null,
    departureDate: quote.departureDate ?? null,
    connectionRatePerKg: quote.connectionRatePerKg ?? null,
    connectionRateTotal: quote.connectionRateTotal ?? null,
    airfreightRatePerKg: quote.airfreightRatePerKg ?? null,
    airfreightRateTotal: quote.airfreightRateTotal ?? null,
    totalRatePerKg: quote.totalRatePerKg ?? null,
    totalRate: quote.totalRate ?? null,
    currencyCode: quote.currencyCode,
    assignedToId: quote.assignedToId ?? null,
    organizationId: quote.organizationId,
    tenantId: quote.tenantId,
    createdAt: quote.createdAt,
    updatedAt: quote.updatedAt,
    airRouting: quote.airRouting.getItems().map((routing) => ({
      id: routing.id,
      name: routing.name,
      type: routing.type,
      flightNumber: routing.flightNumber ?? null,
      departureDate: routing.departureDate ?? null,
      departureTime: routing.departureTime ?? null,
      arrivalDate: routing.arrivalDate ?? null,
      arrivalTime: routing.arrivalTime ?? null,
    })),
  })
}

export async function PUT(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid quote id' }, { status: 400 })

  const body = await req.json()
  const validation = updateQuoteSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid input', details: validation.error }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)
  const filters: Record<string, unknown> = {
    id: parse.data.id,
    deletedAt: null,
    ...scopeFilters,
  }

  const quote = await em.findOne(FrcQuote, filters)

  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 })

  // Update fields
  const data = validation.data
  if (data.name !== undefined) quote.name = data.name
  if (data.carrierId !== undefined) quote.carrierId = data.carrierId ?? null
  if (data.status !== undefined) quote.status = data.status
  if (data.awbNumber !== undefined) quote.awbNumber = data.awbNumber ?? null
  if (data.connectionMethod !== undefined) quote.connectionMethod = data.connectionMethod ?? null
  if (data.departureDate !== undefined) quote.departureDate = data.departureDate ?? null
  if (data.connectionRatePerKg !== undefined) quote.connectionRatePerKg = data.connectionRatePerKg ?? null
  if (data.connectionRateTotal !== undefined) quote.connectionRateTotal = data.connectionRateTotal ?? null
  if (data.airfreightRatePerKg !== undefined) quote.airfreightRatePerKg = data.airfreightRatePerKg ?? null
  if (data.airfreightRateTotal !== undefined) quote.airfreightRateTotal = data.airfreightRateTotal ?? null
  if (data.totalRatePerKg !== undefined) quote.totalRatePerKg = data.totalRatePerKg ?? null
  if (data.totalRate !== undefined) quote.totalRate = data.totalRate ?? null
  if (data.currencyCode !== undefined) quote.currencyCode = data.currencyCode
  if (data.assignedToId !== undefined) quote.assignedToId = data.assignedToId ?? null

  quote.updatedAt = new Date()

  await em.flush()

  return NextResponse.json({ id: quote.id, name: quote.name })
}

export async function DELETE(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid quote id' }, { status: 400 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)
  const filters: Record<string, unknown> = {
    id: parse.data.id,
    deletedAt: null,
    ...scopeFilters,
  }

  const quote = await em.findOne(FrcQuote, filters)

  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 })

  // Soft delete
  quote.deletedAt = new Date()
  await em.flush()

  return NextResponse.json({ success: true })
}
