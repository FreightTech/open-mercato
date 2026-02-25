import { NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FrcRfq, FrcAirCargo } from '../../../../../data/entities'
import { numericString } from '../../../../../../../lib/validators'

export const metadata = {
  PUT: { requireAuth: true, requireFeatures: ['frc_rfqs.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['frc_rfqs.manage'] },
}

const paramsSchema = z.object({
  id: z.string().uuid(),
  cargoId: z.string().uuid(),
})

const updateCargoSchema = z.object({
  name: z.string().optional(),
  numberOfPieces: z.coerce.number().int().min(1).optional(),
  stackableType: z.enum(['fully_stackable', 'non_stackable']).optional(),
  lengthCm: numericString,
  widthCm: numericString,
  heightCm: numericString,
  actualWeightKg: numericString,
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
 * Calculate cargo metrics from dimensions and weight
 * Air cargo: 1 m3 = 167 kg volumetric weight
 */
function calculateCargoMetrics(cargo: {
  numberOfPieces: number
  lengthCm?: string | null
  widthCm?: string | null
  heightCm?: string | null
  actualWeightKg?: string | null
}): {
  volumeM3: string
  chargeableWeightKg: string
  loadingMetres: string
} {
  const lengthCm = parseFloat(cargo.lengthCm || '0') || 0
  const widthCm = parseFloat(cargo.widthCm || '0') || 0
  const heightCm = parseFloat(cargo.heightCm || '0') || 0
  const pieces = cargo.numberOfPieces || 1
  const actualWeightKg = parseFloat(cargo.actualWeightKg || '0') || 0

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

/**
 * Recalculate RFQ totals from all cargo items
 */
async function recalculateRfqTotals(em: EntityManager, rfq: FrcRfq): Promise<void> {
  const cargoItems = await em.find(
    FrcAirCargo,
    { rfq: { id: rfq.id }, deletedAt: null },
    { orderBy: { createdAt: 'asc' } }
  )

  let totalPieces = 0
  let totalVolume = 0
  let totalActualWeight = 0
  let totalChargeableWeight = 0
  let totalLoadingMetres = 0

  for (const cargo of cargoItems) {
    totalPieces += cargo.numberOfPieces
    totalVolume += parseFloat(cargo.volumeM3 || '0')
    totalActualWeight += parseFloat(cargo.actualWeightKg || '0') * cargo.numberOfPieces
    totalChargeableWeight += parseFloat(cargo.chargeableWeightKg || '0')
    totalLoadingMetres += parseFloat(cargo.loadingMetres || '0')
  }

  rfq.totalPieces = totalPieces
  rfq.totalVolume = totalVolume.toFixed(4)
  rfq.totalActualWeight = totalActualWeight.toFixed(4)
  rfq.totalChargeableWeight = totalChargeableWeight.toFixed(2)
  rfq.totalLoadingMetres = totalLoadingMetres.toFixed(4)
  rfq.updatedAt = new Date()
}

export async function PUT(req: Request, ctx: { params?: Promise<{ id?: string; cargoId?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id, cargoId: params?.cargoId })
  if (!parse.success) return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })

  const body = await req.json()
  const validation = updateCargoSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid input', details: validation.error }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)

  // Verify RFQ exists and belongs to user's scope
  const rfq = await em.findOne(FrcRfq, {
    id: parse.data.id,
    deletedAt: null,
    ...scopeFilters,
  })

  if (!rfq) return NextResponse.json({ error: 'RFQ not found' }, { status: 404 })

  // Find the cargo item
  const cargo = await em.findOne(FrcAirCargo, {
    id: parse.data.cargoId,
    rfq: { id: rfq.id },
    deletedAt: null,
  })

  if (!cargo) return NextResponse.json({ error: 'Cargo item not found' }, { status: 404 })

  // Update fields
  const data = validation.data
  if (data.name !== undefined) cargo.name = data.name
  if (data.numberOfPieces !== undefined) cargo.numberOfPieces = data.numberOfPieces
  if (data.stackableType !== undefined) cargo.stackableType = data.stackableType
  if (data.lengthCm !== undefined) cargo.lengthCm = data.lengthCm
  if (data.widthCm !== undefined) cargo.widthCm = data.widthCm
  if (data.heightCm !== undefined) cargo.heightCm = data.heightCm
  if (data.actualWeightKg !== undefined) cargo.actualWeightKg = data.actualWeightKg ?? '0'

  // Recalculate computed fields
  const metrics = calculateCargoMetrics({
    numberOfPieces: cargo.numberOfPieces,
    lengthCm: cargo.lengthCm,
    widthCm: cargo.widthCm,
    heightCm: cargo.heightCm,
    actualWeightKg: cargo.actualWeightKg,
  })
  cargo.volumeM3 = metrics.volumeM3
  cargo.chargeableWeightKg = metrics.chargeableWeightKg
  cargo.loadingMetres = metrics.loadingMetres
  cargo.updatedAt = new Date()

  // Recalculate RFQ totals
  await recalculateRfqTotals(em, rfq)

  await em.flush()

  return NextResponse.json({
    id: cargo.id,
    name: cargo.name,
    numberOfPieces: cargo.numberOfPieces,
    stackableType: cargo.stackableType,
    lengthCm: cargo.lengthCm,
    widthCm: cargo.widthCm,
    heightCm: cargo.heightCm,
    actualWeightKg: cargo.actualWeightKg,
    volumeM3: cargo.volumeM3,
    chargeableWeightKg: cargo.chargeableWeightKg,
    loadingMetres: cargo.loadingMetres,
  })
}

export async function DELETE(req: Request, ctx: { params?: Promise<{ id?: string; cargoId?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id, cargoId: params?.cargoId })
  if (!parse.success) return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)

  // Verify RFQ exists and belongs to user's scope
  const rfq = await em.findOne(FrcRfq, {
    id: parse.data.id,
    deletedAt: null,
    ...scopeFilters,
  })

  if (!rfq) return NextResponse.json({ error: 'RFQ not found' }, { status: 404 })

  // Find the cargo item
  const cargo = await em.findOne(FrcAirCargo, {
    id: parse.data.cargoId,
    rfq: { id: rfq.id },
    deletedAt: null,
  })

  if (!cargo) return NextResponse.json({ error: 'Cargo item not found' }, { status: 404 })

  // Soft delete
  cargo.deletedAt = new Date()

  // Recalculate RFQ totals (without the deleted item)
  await recalculateRfqTotals(em, rfq)

  await em.flush()

  return NextResponse.json({ success: true })
}
