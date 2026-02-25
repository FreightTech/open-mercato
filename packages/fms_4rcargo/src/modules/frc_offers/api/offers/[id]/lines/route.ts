import { NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FrcOffer, FrcOfferLine } from '../../../../data/entities'
import { FrcRfq, FrcAirCargo } from '../../../../../frc_rfqs/data/entities'
import { createOfferLineSchema } from '../../../../data/validators'
import { resolvePricingParams, type PricingParams } from '../../../../../frc_settings/lib/pricing-settings'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['frc_offers.view'] },
  POST: { requireAuth: true, requireFeatures: ['frc_offers.manage'] },
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

/**
 * Recalculate offer pricing totals based on current cargo lines.
 * Called after any cargo add/edit/delete operation.
 */
async function recalculateOfferPricing(em: EntityManager, offerId: string): Promise<void> {
  // Get the offer
  const offer = await em.findOne(FrcOffer, { id: offerId })
  if (!offer) return

  // Sum chargeable weight from all active offer lines
  const lines = await em.find(FrcOfferLine, {
    offer: { id: offerId },
    deletedAt: null,
  })

  const totalChargeableWeight = lines.reduce((sum, line) => {
    return sum + (parseFloat(line.chargeableWeightKg) || 0)
  }, 0)

  // Recalculate totals from Per KG rates
  const connectionPerKg = parseFloat(offer.connectionRatePerKg ?? '0') || 0
  const airfreightPerKg = parseFloat(offer.airfreightRatePerKg ?? '0') || 0

  const connectionTotal = (connectionPerKg * totalChargeableWeight).toFixed(2)
  const airfreightTotal = (airfreightPerKg * totalChargeableWeight).toFixed(2)
  const totalRate = (parseFloat(connectionTotal) + parseFloat(airfreightTotal)).toFixed(2)
  const totalPerKg = totalChargeableWeight > 0
    ? ((parseFloat(totalRate) / totalChargeableWeight)).toFixed(2)
    : '0.00'

  // Update offer pricing
  offer.connectionRateTotal = connectionTotal
  offer.airfreightRateTotal = airfreightTotal
  offer.totalRate = totalRate
  offer.totalRatePerKg = totalPerKg

  await em.flush()
}

/**
 * Recalculate RFQ totals based on current air cargo items.
 * Called after adding/editing/deleting cargo from an offer.
 */
async function recalculateRfqTotals(em: EntityManager, rfqId: string): Promise<void> {
  const rfq = await em.findOne(FrcRfq, { id: rfqId })
  if (!rfq) return

  // Fetch all active cargo items for this RFQ
  const cargoItems = await em.find(FrcAirCargo, {
    rfq: { id: rfqId },
    deletedAt: null,
  })

  let totalPieces = 0
  let totalVolume = 0
  let totalActualWeight = 0
  let totalChargeableWeight = 0
  let totalLoadingMetres = 0

  for (const cargo of cargoItems) {
    totalPieces += cargo.numberOfPieces
    totalVolume += parseFloat(cargo.volumeM3)
    totalActualWeight += parseFloat(cargo.actualWeightKg ?? '0') * cargo.numberOfPieces
    totalChargeableWeight += parseFloat(cargo.chargeableWeightKg)
    totalLoadingMetres += parseFloat(cargo.loadingMetres)
  }

  rfq.totalPieces = totalPieces
  rfq.totalVolume = totalVolume.toFixed(4)
  rfq.totalActualWeight = totalActualWeight.toFixed(4)
  rfq.totalChargeableWeight = totalChargeableWeight.toFixed(4)
  rfq.totalLoadingMetres = totalLoadingMetres.toFixed(4)
  rfq.updatedAt = new Date()

  await em.flush()
}

/**
 * Calculate cargo metrics from dimensions and weight.
 * Uses configurable volumetric factor from pricing settings.
 *
 * @param data - Cargo dimensions and weight
 * @param pricing - Optional pricing params from settings (if not provided, uses defaults)
 */
function calculateCargoMetrics(
  data: {
    numberOfPieces: number
    lengthCm: string | null
    widthCm: string | null
    heightCm: string | null
    actualWeightKg: string | null
  },
  pricing?: PricingParams
): {
  volumeM3: string
  chargeableWeightKg: string
  loadingMetres: string
} {
  const lengthCm = parseFloat(data.lengthCm || '0') || 0
  const widthCm = parseFloat(data.widthCm || '0') || 0
  const heightCm = parseFloat(data.heightCm || '0') || 0
  const pieces = data.numberOfPieces || 1
  const actualWeightKg = parseFloat(data.actualWeightKg || '0') || 0

  // Use pricing params or defaults
  const volumetricFactor = pricing?.volumetricFactor ?? 167
  const truckWidth = pricing?.truckWidthMetres ?? 2.4
  const minChargeableWeight = pricing?.minChargeableWeightKg ?? null

  // Volume = L x W x H x pieces / 1,000,000 (cm3 to m3)
  const volumeM3 = (lengthCm * widthCm * heightCm * pieces) / 1_000_000

  // Volumetric weight using configurable factor
  const volumetricWeightKg = volumeM3 * volumetricFactor

  // Chargeable weight = max(actual total weight, volumetric weight)
  const actualTotalWeight = actualWeightKg * pieces
  let chargeableWeightKg = Math.max(actualTotalWeight, volumetricWeightKg)

  // Apply minimum chargeable weight if configured
  if (minChargeableWeight !== null && chargeableWeightKg < minChargeableWeight) {
    chargeableWeightKg = minChargeableWeight
  }

  // Loading metres using configurable truck width
  const loadingMetres = (lengthCm / 100) * (widthCm / 100 / truckWidth) * pieces

  return {
    volumeM3: volumeM3.toFixed(4),
    chargeableWeightKg: chargeableWeightKg.toFixed(2),
    loadingMetres: loadingMetres.toFixed(4),
  }
}

export async function GET(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid offer id' }, { status: 400 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)

  // Verify the offer exists and user has access
  const offer = await em.findOne(FrcOffer, {
    id: parse.data.id,
    deletedAt: null,
    ...scopeFilters,
  })

  if (!offer) return NextResponse.json({ error: 'Offer not found' }, { status: 404 })

  // Fetch offer lines
  const lines = await em.find(
    FrcOfferLine,
    {
      offer: { id: offer.id },
      deletedAt: null,
    },
    { orderBy: { createdAt: 'asc' } }
  )

  return NextResponse.json({
    items: lines.map((line) => ({
      id: line.id,
      name: line.name,
      numberOfPieces: line.numberOfPieces,
      stackableType: line.stackableType,
      lengthCm: line.lengthCm ?? null,
      widthCm: line.widthCm ?? null,
      heightCm: line.heightCm ?? null,
      volumeM3: line.volumeM3,
      actualWeightKg: line.actualWeightKg,
      chargeableWeightKg: line.chargeableWeightKg,
      loadingMetres: line.loadingMetres,
    })),
    total: lines.length,
  })
}

export async function POST(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid offer id' }, { status: 400 })

  const body = await req.json()

  const validation = createOfferLineSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid input', details: validation.error }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)

  // Verify the offer exists and user has access
  const offer = await em.findOne(FrcOffer, {
    id: parse.data.id,
    deletedAt: null,
    ...scopeFilters,
  })

  if (!offer) return NextResponse.json({ error: 'Offer not found' }, { status: 404 })

  const data = validation.data

  // Fetch the associated RFQ to link the new air cargo
  const rfq = await em.findOne(FrcRfq, { id: offer.rfqId, deletedAt: null })
  if (!rfq) {
    return NextResponse.json({ error: 'Associated RFQ not found' }, { status: 404 })
  }

  // Load pricing settings (with carrier override if carrier is set on offer)
  const pricingParams = await resolvePricingParams(em, {
    tenantId: offer.tenantId,
    organizationId: offer.organizationId,
  }, {
    carrierId: offer.carrierId ?? null,
    transportMode: 'air',
  })

  // Calculate cargo metrics using pricing settings
  const metrics = calculateCargoMetrics({
    numberOfPieces: data.numberOfPieces,
    lengthCm: data.lengthCm ?? null,
    widthCm: data.widthCm ?? null,
    heightCm: data.heightCm ?? null,
    actualWeightKg: data.actualWeightKg ?? null,
  }, pricingParams)

  const computedVolumeM3 = data.volumeM3 ?? metrics.volumeM3
  const computedChargeableWeightKg = data.chargeableWeightKg ?? metrics.chargeableWeightKg
  const computedLoadingMetres = data.loadingMetres ?? metrics.loadingMetres

  // Create FrcAirCargo entity first (linked to the RFQ)
  const cargo = new FrcAirCargo()
  cargo.organizationId = offer.organizationId
  cargo.tenantId = offer.tenantId
  cargo.rfq = rfq
  cargo.name = data.name
  cargo.numberOfPieces = data.numberOfPieces
  cargo.stackableType = data.stackableType
  cargo.lengthCm = data.lengthCm ?? null
  cargo.widthCm = data.widthCm ?? null
  cargo.heightCm = data.heightCm ?? null
  cargo.actualWeightKg = data.actualWeightKg ?? '0'
  cargo.volumeM3 = computedVolumeM3
  cargo.chargeableWeightKg = computedChargeableWeightKg
  cargo.loadingMetres = computedLoadingMetres

  em.persist(cargo)

  // Create the offer line linked to the new air cargo
  const line = new FrcOfferLine()
  line.organizationId = offer.organizationId
  line.tenantId = offer.tenantId
  line.offer = em.getReference(FrcOffer, offer.id)
  line.sourceAirCargoId = cargo.id
  line.name = data.name
  line.numberOfPieces = data.numberOfPieces
  line.stackableType = data.stackableType
  line.lengthCm = data.lengthCm ?? null
  line.widthCm = data.widthCm ?? null
  line.heightCm = data.heightCm ?? null
  line.actualWeightKg = data.actualWeightKg ?? '0'
  line.volumeM3 = computedVolumeM3
  line.chargeableWeightKg = computedChargeableWeightKg
  line.loadingMetres = computedLoadingMetres

  em.persist(line)
  await em.flush()

  // Recalculate RFQ totals based on new cargo
  await recalculateRfqTotals(em, rfq.id)

  // Recalculate offer pricing totals based on new cargo
  await recalculateOfferPricing(em, offer.id)

  return NextResponse.json(
    {
      id: line.id,
      name: line.name,
      numberOfPieces: line.numberOfPieces,
      stackableType: line.stackableType,
      lengthCm: line.lengthCm,
      widthCm: line.widthCm,
      heightCm: line.heightCm,
      volumeM3: line.volumeM3,
      actualWeightKg: line.actualWeightKg,
      chargeableWeightKg: line.chargeableWeightKg,
      loadingMetres: line.loadingMetres,
    },
    { status: 201 }
  )
}
