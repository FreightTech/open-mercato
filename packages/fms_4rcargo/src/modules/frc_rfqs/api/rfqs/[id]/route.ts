import { NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FrcRfq } from '../../../data/entities'
import { FrcOffer } from '../../../../frc_offers/data/entities'
import { updateRfqSchema } from '../../../data/validators'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['frc_rfqs.view'] },
  PUT: { requireAuth: true, requireFeatures: ['frc_rfqs.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['frc_rfqs.manage'] },
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
  if (!parse.success) return NextResponse.json({ error: 'Invalid RFQ id' }, { status: 400 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)
  const filters: Record<string, unknown> = {
    id: parse.data.id,
    deletedAt: null,
    ...scopeFilters,
  }

  const rfq = await em.findOne(FrcRfq, filters, {
    populate: ['originAirport', 'destinationAirport', 'airCargo'],
  })

  if (!rfq) return NextResponse.json({ error: 'RFQ not found' }, { status: 404 })

  // Fetch offers for this RFQ separately (since FrcOffer uses rfqId foreign key, not a relation)
  const offers = await em.find(
    FrcOffer,
    { rfqId: rfq.id, deletedAt: null },
    { fields: ['id', 'name', 'status'] }
  )

  return NextResponse.json({
    id: rfq.id,
    name: rfq.name,
    accountId: rfq.accountId ?? null,
    contactId: rfq.contactId ?? null,
    salesStage: rfq.salesStage,
    probability: rfq.probability,
    amount: rfq.amount ?? null,
    currencyCode: rfq.currencyCode,
    deliveryStatus: rfq.deliveryStatus,
    isDelayed: rfq.isDelayed,
    originType: rfq.originType,
    originAirport: rfq.originAirport ? {
      id: rfq.originAirport.id,
      code: rfq.originAirport.code,
      longCode: rfq.originAirport.longCode,
    } : null,
    destinationAirport: rfq.destinationAirport ? {
      id: rfq.destinationAirport.id,
      code: rfq.destinationAirport.code,
      longCode: rfq.destinationAirport.longCode,
    } : null,
    shipmentReadyDate: rfq.shipmentReadyDate ?? null,
    requiredAtDestinationDate: rfq.requiredAtDestinationDate ?? null,
    looseOrUnitised: rfq.looseOrUnitised ?? null,
    targetRate: rfq.targetRate ?? null,
    product: rfq.product ?? null,
    commodity: rfq.commodity ?? null,
    totalPieces: rfq.totalPieces,
    totalVolume: rfq.totalVolume,
    totalActualWeight: rfq.totalActualWeight,
    totalChargeableWeight: rfq.totalChargeableWeight,
    totalLoadingMetres: rfq.totalLoadingMetres,
    description: rfq.description ?? null,
    assignedToId: rfq.assignedToId ?? null,
    requestDate: rfq.requestDate,
    organizationId: rfq.organizationId,
    tenantId: rfq.tenantId,
    createdAt: rfq.createdAt,
    updatedAt: rfq.updatedAt,
    airCargo: rfq.airCargo.getItems().map((cargo) => ({
      id: cargo.id,
      name: cargo.name,
      numberOfPieces: cargo.numberOfPieces,
      stackableType: cargo.stackableType,
      lengthCm: cargo.lengthCm ?? null,
      widthCm: cargo.widthCm ?? null,
      heightCm: cargo.heightCm ?? null,
      volumeM3: cargo.volumeM3,
      actualWeightKg: cargo.actualWeightKg,
      chargeableWeightKg: cargo.chargeableWeightKg,
      loadingMetres: cargo.loadingMetres,
    })),
    offers: offers.map((offer) => ({
      id: offer.id,
      name: offer.name,
      status: offer.status,
    })),
  })
}

export async function PUT(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid RFQ id' }, { status: 400 })

  const body = await req.json()
  const validation = updateRfqSchema.safeParse(body)
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

  const rfq = await em.findOne(FrcRfq, filters)

  if (!rfq) return NextResponse.json({ error: 'RFQ not found' }, { status: 404 })

  // Update fields
  const data = validation.data
  if (data.name !== undefined) rfq.name = data.name
  if (data.accountId !== undefined) rfq.accountId = data.accountId ?? null
  if (data.contactId !== undefined) rfq.contactId = data.contactId ?? null
  if (data.salesStage !== undefined) rfq.salesStage = data.salesStage
  if (data.probability !== undefined) rfq.probability = data.probability
  if (data.amount !== undefined) rfq.amount = data.amount ?? null
  if (data.currencyCode !== undefined) rfq.currencyCode = data.currencyCode
  if (data.deliveryStatus !== undefined) rfq.deliveryStatus = data.deliveryStatus
  if (data.isDelayed !== undefined) rfq.isDelayed = data.isDelayed
  if (data.originType !== undefined) rfq.originType = data.originType
  if (data.shipmentReadyDate !== undefined) rfq.shipmentReadyDate = data.shipmentReadyDate ?? null
  if (data.requiredAtDestinationDate !== undefined) rfq.requiredAtDestinationDate = data.requiredAtDestinationDate ?? null
  if (data.looseOrUnitised !== undefined) rfq.looseOrUnitised = data.looseOrUnitised ?? null
  if (data.targetRate !== undefined) rfq.targetRate = data.targetRate ?? null
  if (data.product !== undefined) rfq.product = data.product ?? null
  if (data.commodity !== undefined) rfq.commodity = data.commodity ?? null
  if (data.description !== undefined) rfq.description = data.description ?? null
  if (data.assignedToId !== undefined) rfq.assignedToId = data.assignedToId ?? null

  rfq.updatedAt = new Date()

  await em.flush()

  return NextResponse.json({ id: rfq.id, name: rfq.name })
}

export async function DELETE(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid RFQ id' }, { status: 400 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)
  const filters: Record<string, unknown> = {
    id: parse.data.id,
    deletedAt: null,
    ...scopeFilters,
  }

  const rfq = await em.findOne(FrcRfq, filters)

  if (!rfq) return NextResponse.json({ error: 'RFQ not found' }, { status: 404 })

  // Soft delete
  rfq.deletedAt = new Date()
  await em.flush()

  return NextResponse.json({ success: true })
}
