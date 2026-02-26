import { NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FmsLocation } from '@open-mercato/fms/modules/fms_locations/data/entities'
import { FrcRfq } from '../../../data/entities'
import { FrcOffer } from '../../../../frc_offers/data/entities'
import { updateRfqSchema } from '../../../data/validators'
import { loadPricingConfig, getVolumetricFactor } from '../../../../frc_settings/lib/pricing-settings'

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
  const knex = em.getKnex()

  const scopeFilters = buildScopeFilters(auth, scope)
  const filters: Record<string, unknown> = {
    id: parse.data.id,
    deletedAt: null,
    ...scopeFilters,
  }

  const rfq = await em.findOne(FrcRfq, filters, {
    populate: ['airCargo'],
  })

  if (!rfq) return NextResponse.json({ error: 'RFQ not found' }, { status: 404 })

  // Fetch assigned user name
  let assignedToName: string | null = null
  if (rfq.assignedToId) {
    const userResult = await knex('users')
      .select(knex.raw('COALESCE(name, email) as name'))
      .where('id', rfq.assignedToId)
      .whereNull('deleted_at')
      .first()
    if (userResult) {
      assignedToName = userResult.name
    }
  }

  // Fetch airports from FmsLocation (type: 'airport')
  const airportIds = [rfq.originAirportId, rfq.destinationAirportId].filter(
    (id): id is string => Boolean(id)
  )

  const airports =
    airportIds.length > 0
      ? await em.find(FmsLocation, { id: { $in: airportIds }, type: 'airport' })
      : []
  const airportMap = new Map(airports.map((a) => [a.id, a]))

  const originAirport = rfq.originAirportId ? airportMap.get(rfq.originAirportId) : null
  const destinationAirport = rfq.destinationAirportId ? airportMap.get(rfq.destinationAirportId) : null

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
    originAirport: originAirport
      ? {
          id: originAirport.id,
          code: originAirport.code,
          longCode: `${originAirport.code} - ${originAirport.name}`,
        }
      : null,
    destinationAirport: destinationAirport
      ? {
          id: destinationAirport.id,
          code: destinationAirport.code,
          longCode: `${destinationAirport.code} - ${destinationAirport.name}`,
        }
      : null,
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
    assignedToName,
    requestDate: rfq.requestDate,
    organizationId: rfq.organizationId,
    tenantId: rfq.tenantId,
    createdAt: rfq.createdAt,
    updatedAt: rfq.updatedAt,
    airCargo: await (async () => {
      // Load pricing config to get volumetric factor for display
      const pricingConfig = await loadPricingConfig(em, {
        tenantId: rfq.tenantId,
        organizationId: rfq.organizationId,
      })
      const volumetricFactor = getVolumetricFactor(pricingConfig, null, 'air')

      return rfq.airCargo.getItems().filter((cargo) => !cargo.deletedAt).map((cargo) => {
        const volume = parseFloat(cargo.volumeM3 || '0')
        const volumetricWeightKg = (volume * volumetricFactor).toFixed(2)
        return {
          id: cargo.id,
          name: cargo.name,
          numberOfPieces: cargo.numberOfPieces,
          stackableType: cargo.stackableType,
          lengthCm: cargo.lengthCm ?? null,
          widthCm: cargo.widthCm ?? null,
          heightCm: cargo.heightCm ?? null,
          volumeM3: cargo.volumeM3,
          volumetricWeightKg,
          actualWeightKg: cargo.actualWeightKg,
          chargeableWeightKg: cargo.chargeableWeightKg,
          loadingMetres: cargo.loadingMetres,
        }
      })
    })(),
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

  // Update fields - only update if field was explicitly provided in body
  // (not filled in by zod defaults from .partial() schema)
  const data = validation.data
  if ('name' in body) rfq.name = data.name!
  if ('accountId' in body) rfq.accountId = data.accountId ?? null
  if ('contactId' in body) rfq.contactId = data.contactId ?? null
  if ('salesStage' in body) rfq.salesStage = data.salesStage!
  if ('probability' in body) rfq.probability = data.probability!
  if ('amount' in body) rfq.amount = data.amount ?? null
  if ('currencyCode' in body) rfq.currencyCode = data.currencyCode!
  if ('deliveryStatus' in body) rfq.deliveryStatus = data.deliveryStatus!
  if ('isDelayed' in body) rfq.isDelayed = data.isDelayed!
  if ('originType' in body) rfq.originType = data.originType!
  if ('shipmentReadyDate' in body) rfq.shipmentReadyDate = data.shipmentReadyDate ?? null
  if ('requiredAtDestinationDate' in body) rfq.requiredAtDestinationDate = data.requiredAtDestinationDate ?? null
  if ('looseOrUnitised' in body) rfq.looseOrUnitised = data.looseOrUnitised ?? null
  if ('targetRate' in body) rfq.targetRate = data.targetRate ?? null
  if ('product' in body) rfq.product = data.product ?? null
  if ('commodity' in body) rfq.commodity = data.commodity ?? null
  if ('description' in body) rfq.description = data.description ?? null
  if ('assignedToId' in body) rfq.assignedToId = data.assignedToId ?? null

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
