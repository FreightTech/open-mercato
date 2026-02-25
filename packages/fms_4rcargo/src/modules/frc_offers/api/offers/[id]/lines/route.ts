import { NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FrcOffer, FrcOfferLine } from '../../../../data/entities'
import { createOfferLineSchema } from '../../../../data/validators'

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
 * Calculate cargo metrics from dimensions and weight
 * Air cargo: 1 m3 = 167 kg volumetric weight
 */
function calculateCargoMetrics(data: {
  numberOfPieces: number
  lengthCm: string | null
  widthCm: string | null
  heightCm: string | null
  actualWeightKg: string | null
}): {
  volumeM3: string
  chargeableWeightKg: string
  loadingMetres: string
} {
  const lengthCm = parseFloat(data.lengthCm || '0') || 0
  const widthCm = parseFloat(data.widthCm || '0') || 0
  const heightCm = parseFloat(data.heightCm || '0') || 0
  const pieces = data.numberOfPieces || 1
  const actualWeightKg = parseFloat(data.actualWeightKg || '0') || 0

  // Volume = L x W x H x pieces / 1,000,000 (cm3 to m3)
  const volumeM3 = (lengthCm * widthCm * heightCm * pieces) / 1_000_000

  // Volumetric weight (air cargo: 1 m3 = 167 kg)
  const volumetricWeightKg = volumeM3 * 167

  // Chargeable weight = max(actual total weight, volumetric weight)
  const actualTotalWeight = actualWeightKg * pieces
  const chargeableWeightKg = Math.max(actualTotalWeight, volumetricWeightKg)

  // Loading metres (for trucking): length / 100 * width / 240 * pieces
  const loadingMetres = (lengthCm / 100) * (widthCm / 240) * pieces

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

  // Calculate cargo metrics
  const metrics = calculateCargoMetrics({
    numberOfPieces: data.numberOfPieces,
    lengthCm: data.lengthCm ?? null,
    widthCm: data.widthCm ?? null,
    heightCm: data.heightCm ?? null,
    actualWeightKg: data.actualWeightKg ?? null,
  })

  // Create the offer line
  const line = new FrcOfferLine()
  line.organizationId = offer.organizationId
  line.tenantId = offer.tenantId
  line.offer = em.getReference(FrcOffer, offer.id)
  line.name = data.name
  line.numberOfPieces = data.numberOfPieces
  line.stackableType = data.stackableType
  line.lengthCm = data.lengthCm ?? null
  line.widthCm = data.widthCm ?? null
  line.heightCm = data.heightCm ?? null
  line.actualWeightKg = data.actualWeightKg ?? '0'
  // Use provided computed values or calculate them
  line.volumeM3 = data.volumeM3 ?? metrics.volumeM3
  line.chargeableWeightKg = data.chargeableWeightKg ?? metrics.chargeableWeightKg
  line.loadingMetres = data.loadingMetres ?? metrics.loadingMetres

  em.persist(line)
  await em.flush()

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
