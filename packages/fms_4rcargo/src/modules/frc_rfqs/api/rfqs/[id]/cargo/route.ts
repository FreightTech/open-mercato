import { NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FrcRfq, FrcAirCargo } from '../../../../data/entities'
import { numericString, numericStringWithDefault } from '../../../../../../lib/validators'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['frc_rfqs.view'] },
  POST: { requireAuth: true, requireFeatures: ['frc_rfqs.manage'] },
}

const paramsSchema = z.object({
  id: z.string().uuid(),
})

const cargoItemSchema = z.object({
  name: z.string().optional().default(''),
  numberOfPieces: z.coerce.number().int().min(1).optional().default(1),
  stackableType: z.enum(['fully_stackable', 'non_stackable']).optional().default('fully_stackable'),
  lengthCm: numericString,
  widthCm: numericString,
  heightCm: numericString,
  actualWeightKg: numericString,
  volumeM3: numericStringWithDefault('0'),
  chargeableWeightKg: numericStringWithDefault('0'),
  loadingMetres: numericStringWithDefault('0'),
})

const createCargoSchema = z.object({
  items: z.array(cargoItemSchema).min(1),
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

  // Verify RFQ exists and belongs to user's scope
  const rfq = await em.findOne(FrcRfq, {
    id: parse.data.id,
    deletedAt: null,
    ...scopeFilters,
  })

  if (!rfq) return NextResponse.json({ error: 'RFQ not found' }, { status: 404 })

  // Fetch cargo items
  const cargoItems = await em.find(
    FrcAirCargo,
    {
      rfq: { id: rfq.id },
      deletedAt: null,
    },
    { orderBy: { createdAt: 'asc' } }
  )

  return NextResponse.json({
    items: cargoItems.map((cargo) => ({
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
      createdAt: cargo.createdAt,
      updatedAt: cargo.updatedAt,
    })),
  })
}

export async function POST(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid RFQ id' }, { status: 400 })

  const body = await req.json()
  const validation = createCargoSchema.safeParse(body)
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

  // Create cargo items
  const createdItems: FrcAirCargo[] = []
  let totalPieces = 0
  let totalVolume = 0
  let totalActualWeight = 0
  let totalChargeableWeight = 0
  let totalLoadingMetres = 0

  for (const item of validation.data.items) {
    const cargo = new FrcAirCargo()
    cargo.organizationId = rfq.organizationId
    cargo.tenantId = rfq.tenantId
    cargo.rfq = rfq
    cargo.name = item.name || rfq.name
    cargo.numberOfPieces = item.numberOfPieces
    cargo.stackableType = item.stackableType
    cargo.lengthCm = item.lengthCm ?? null
    cargo.widthCm = item.widthCm ?? null
    cargo.heightCm = item.heightCm ?? null
    cargo.actualWeightKg = item.actualWeightKg ?? '0'
    cargo.volumeM3 = item.volumeM3
    cargo.chargeableWeightKg = item.chargeableWeightKg
    cargo.loadingMetres = item.loadingMetres

    em.persist(cargo)
    createdItems.push(cargo)

    // Accumulate totals
    totalPieces += item.numberOfPieces
    totalVolume += parseFloat(item.volumeM3)
    totalActualWeight += parseFloat(item.actualWeightKg ?? '0') * item.numberOfPieces
    totalChargeableWeight += parseFloat(item.chargeableWeightKg)
    totalLoadingMetres += parseFloat(item.loadingMetres)
  }

  // Update RFQ totals
  rfq.totalPieces = totalPieces
  rfq.totalVolume = totalVolume.toFixed(4)
  rfq.totalActualWeight = totalActualWeight.toFixed(4)
  rfq.totalChargeableWeight = totalChargeableWeight.toFixed(4)
  rfq.totalLoadingMetres = totalLoadingMetres.toFixed(4)
  rfq.updatedAt = new Date()

  await em.flush()

  return NextResponse.json({
    success: true,
    items: createdItems.map((cargo) => ({
      id: cargo.id,
      name: cargo.name,
    })),
  })
}
