import { NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FrcOffer, FrcOfferLine } from '../../../../../data/entities'
import { updateOfferLineSchema } from '../../../../../data/validators'
import { resolvePricingParams, type PricingParams } from '../../../../../../frc_settings/lib/pricing-settings'

export const metadata = {
  PUT: { requireAuth: true, requireFeatures: ['frc_offers.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['frc_offers.manage'] },
}

const paramsSchema = z.object({
  id: z.string().uuid(),
  lineId: z.string().uuid(),
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
 * Calculate cargo metrics from dimensions and weight.
 * Uses configurable volumetric factor from pricing settings.
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

export async function PUT(
  req: Request,
  ctx: { params?: Promise<{ id?: string; lineId?: string }> }
) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id, lineId: params?.lineId })
  if (!parse.success) return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })

  const body = await req.json()
  const validation = updateOfferLineSchema.safeParse(body)
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

  // Find the offer line
  const line = await em.findOne(FrcOfferLine, {
    id: parse.data.lineId,
    offer: { id: offer.id },
    deletedAt: null,
  })

  if (!line) return NextResponse.json({ error: 'Offer line not found' }, { status: 404 })

  const data = validation.data

  // Track if we need to recalculate computed fields
  let shouldRecalculate = false

  // Update fields
  if (data.name !== undefined) line.name = data.name
  if (data.numberOfPieces !== undefined) {
    line.numberOfPieces = data.numberOfPieces
    shouldRecalculate = true
  }
  if (data.stackableType !== undefined) line.stackableType = data.stackableType
  if (data.lengthCm !== undefined) {
    line.lengthCm = data.lengthCm ?? null
    shouldRecalculate = true
  }
  if (data.widthCm !== undefined) {
    line.widthCm = data.widthCm ?? null
    shouldRecalculate = true
  }
  if (data.heightCm !== undefined) {
    line.heightCm = data.heightCm ?? null
    shouldRecalculate = true
  }
  if (data.actualWeightKg !== undefined) {
    line.actualWeightKg = data.actualWeightKg ?? '0'
    shouldRecalculate = true
  }

  // Recalculate computed fields if needed
  if (shouldRecalculate) {
    // Load pricing settings (with carrier override if carrier is set on offer)
    const pricingParams = await resolvePricingParams(em, {
      tenantId: offer.tenantId,
      organizationId: offer.organizationId,
    }, {
      carrierId: offer.carrierId ?? null,
      transportMode: 'air',
    })

    const metrics = calculateCargoMetrics({
      numberOfPieces: line.numberOfPieces,
      lengthCm: line.lengthCm ?? null,
      widthCm: line.widthCm ?? null,
      heightCm: line.heightCm ?? null,
      actualWeightKg: line.actualWeightKg ?? null,
    }, pricingParams)
    line.volumeM3 = metrics.volumeM3
    line.chargeableWeightKg = metrics.chargeableWeightKg
    line.loadingMetres = metrics.loadingMetres
  }

  line.updatedAt = new Date()

  await em.flush()

  // Recalculate offer pricing if cargo metrics changed
  if (shouldRecalculate) {
    await recalculateOfferPricing(em, offer.id)
  }

  return NextResponse.json({
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
  })
}

export async function DELETE(
  req: Request,
  ctx: { params?: Promise<{ id?: string; lineId?: string }> }
) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id, lineId: params?.lineId })
  if (!parse.success) return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })

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

  // Find the offer line
  const line = await em.findOne(FrcOfferLine, {
    id: parse.data.lineId,
    offer: { id: offer.id },
    deletedAt: null,
  })

  if (!line) return NextResponse.json({ error: 'Offer line not found' }, { status: 404 })

  // Soft delete
  line.deletedAt = new Date()
  await em.flush()

  // Recalculate offer pricing after removing cargo
  await recalculateOfferPricing(em, offer.id)

  return NextResponse.json({ success: true })
}
