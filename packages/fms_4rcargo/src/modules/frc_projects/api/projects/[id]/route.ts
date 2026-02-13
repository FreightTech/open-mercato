import { NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FrcProject } from '../../../data/entities'
import { FrcRfq, FrcAirCargo } from '../../../../frc_rfqs/data/entities'
import { FrcOffer, FrcAirRouting } from '../../../../frc_offers/data/entities'
import { updateProjectSchema } from '../../../data/validators'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['frc_projects.view'] },
  PUT: { requireAuth: true, requireFeatures: ['frc_projects.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['frc_projects.manage'] },
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
  if (!parse.success) return NextResponse.json({ error: 'Invalid project id' }, { status: 400 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)
  const filters: Record<string, unknown> = {
    id: parse.data.id,
    deletedAt: null,
    ...scopeFilters,
  }

  const project = await em.findOne(FrcProject, filters)

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Fetch RFQ with full details and air cargo
  let rfqData: {
    id: string
    name: string
    salesStage: string
    originAirport: { id: string; code: string; city: string | null } | null
    destinationAirport: { id: string; code: string; city: string | null } | null
    shipmentReadyDate: Date | null
    requiredAtDestinationDate: Date | null
    product: string | null
    commodity: string | null
    totalPieces: number
    totalVolume: string
    totalActualWeight: string
    totalChargeableWeight: string
  } | null = null
  let airCargoData: Array<{
    id: string
    name: string
    numberOfPieces: number
    lengthCm: string | null
    widthCm: string | null
    heightCm: string | null
    volumeM3: string
    actualWeightKg: string
    chargeableWeightKg: string
  }> = []

  if (project.rfqId) {
    const rfq = await em.findOne(
      FrcRfq,
      { id: project.rfqId, deletedAt: null },
      { populate: ['originAirport', 'destinationAirport', 'airCargo'] }
    )
    if (rfq) {
      rfqData = {
        id: rfq.id,
        name: rfq.name,
        salesStage: rfq.salesStage,
        originAirport: rfq.originAirport
          ? { id: rfq.originAirport.id, code: rfq.originAirport.code, city: rfq.originAirport.city ?? null }
          : null,
        destinationAirport: rfq.destinationAirport
          ? { id: rfq.destinationAirport.id, code: rfq.destinationAirport.code, city: rfq.destinationAirport.city ?? null }
          : null,
        shipmentReadyDate: rfq.shipmentReadyDate ?? null,
        requiredAtDestinationDate: rfq.requiredAtDestinationDate ?? null,
        product: rfq.product ?? null,
        commodity: rfq.commodity ?? null,
        totalPieces: rfq.totalPieces,
        totalVolume: rfq.totalVolume,
        totalActualWeight: rfq.totalActualWeight,
        totalChargeableWeight: rfq.totalChargeableWeight,
      }
      airCargoData = rfq.airCargo.getItems()
        .filter((cargo) => !cargo.deletedAt)
        .map((cargo) => ({
          id: cargo.id,
          name: cargo.name,
          numberOfPieces: cargo.numberOfPieces,
          lengthCm: cargo.lengthCm ?? null,
          widthCm: cargo.widthCm ?? null,
          heightCm: cargo.heightCm ?? null,
          volumeM3: cargo.volumeM3,
          actualWeightKg: cargo.actualWeightKg,
          chargeableWeightKg: cargo.chargeableWeightKg,
        }))
    }
  }

  // Fetch Offer with full details and air routing
  let offerData: {
    id: string
    name: string
    status: string
    awbNumber: string | null
    departureDate: Date | null
    connectionMethod: string | null
    connectionRateTotal: string | null
    airfreightRateTotal: string | null
    totalRate: string | null
    currencyCode: string
  } | null = null
  let airRoutingData: Array<{
    id: string
    name: string
    type: string
    flightNumber: string | null
    originAirport: { id: string; code: string } | null
    destinationAirport: { id: string; code: string } | null
    departureDate: Date | null
    departureTime: string | null
    arrivalDate: Date | null
    arrivalTime: string | null
  }> = []

  if (project.offerId) {
    const offer = await em.findOne(
      FrcOffer,
      { id: project.offerId, deletedAt: null },
      { populate: ['airRouting', 'airRouting.originAirport', 'airRouting.destinationAirport'] }
    )
    if (offer) {
      offerData = {
        id: offer.id,
        name: offer.name,
        status: offer.status,
        awbNumber: offer.awbNumber ?? null,
        departureDate: offer.departureDate ?? null,
        connectionMethod: offer.connectionMethod ?? null,
        connectionRateTotal: offer.connectionRateTotal ?? null,
        airfreightRateTotal: offer.airfreightRateTotal ?? null,
        totalRate: offer.totalRate ?? null,
        currencyCode: offer.currencyCode,
      }
      airRoutingData = offer.airRouting.getItems()
        .filter((routing) => !routing.deletedAt)
        .map((routing) => ({
          id: routing.id,
          name: routing.name,
          type: routing.type,
          flightNumber: routing.flightNumber ?? null,
          originAirport: routing.originAirport
            ? { id: routing.originAirport.id, code: routing.originAirport.code }
            : null,
          destinationAirport: routing.destinationAirport
            ? { id: routing.destinationAirport.id, code: routing.destinationAirport.code }
            : null,
          departureDate: routing.departureDate ?? null,
          departureTime: routing.departureTime ?? null,
          arrivalDate: routing.arrivalDate ?? null,
          arrivalTime: routing.arrivalTime ?? null,
        }))
    }
  }

  return NextResponse.json({
    id: project.id,
    projectNumber: project.projectNumber,
    rfqId: rfqData?.id ?? null,
    rfqName: rfqData?.name ?? null,
    offerId: offerData?.id ?? null,
    offerName: offerData?.name ?? null,
    accountId: project.accountId ?? null,
    status: project.status,
    totalValue: project.totalValue ?? null,
    currencyCode: project.currencyCode,
    organizationId: project.organizationId,
    tenantId: project.tenantId,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    // Extended data for project detail view
    awbNumber: offerData?.awbNumber ?? null,
    offer: offerData,
    rfq: rfqData,
    airCargo: airCargoData,
    airRouting: airRoutingData,
  })
}

export async function PUT(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid project id' }, { status: 400 })

  const body = await req.json()
  const validation = updateProjectSchema.safeParse(body)
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

  const project = await em.findOne(FrcProject, filters)

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Update fields
  const data = validation.data
  if (data.projectNumber !== undefined) project.projectNumber = data.projectNumber
  if (data.accountId !== undefined) project.accountId = data.accountId ?? null
  if (data.status !== undefined) project.status = data.status
  if (data.totalValue !== undefined) project.totalValue = data.totalValue ?? null
  if (data.currencyCode !== undefined) project.currencyCode = data.currencyCode

  project.updatedAt = new Date()

  await em.flush()

  return NextResponse.json({ id: project.id, projectNumber: project.projectNumber })
}

export async function DELETE(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid project id' }, { status: 400 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)
  const filters: Record<string, unknown> = {
    id: parse.data.id,
    deletedAt: null,
    ...scopeFilters,
  }

  const project = await em.findOne(FrcProject, filters)

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Soft delete
  project.deletedAt = new Date()
  await em.flush()

  return NextResponse.json({ success: true })
}
