import { NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { FrcRfq } from '../../../../../frc_rfqs/data/entities'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['contractors.view'] },
}

const paramsSchema = z.object({
  id: z.string().uuid(),
})

const querySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
})

export async function GET(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid contractor id' }, { status: 400 })

  const url = new URL(req.url)
  const queryParse = querySchema.safeParse({
    limit: url.searchParams.get('limit') || '50',
    offset: url.searchParams.get('offset') || '0',
  })
  if (!queryParse.success) {
    return NextResponse.json({ error: 'Invalid query parameters' }, { status: 400 })
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager
  const knex = em.getKnex()

  const contractorId = parse.data.id

  // Fetch RFQs where account_id matches contractor (tenant-only scoping)
  const filters: Record<string, unknown> = {
    accountId: contractorId,
    deletedAt: null,
    tenantId: auth.tenantId,
  }

  const [items, total] = await em.findAndCount(FrcRfq, filters, {
    orderBy: { createdAt: 'desc' },
    limit: queryParse.data.limit,
    offset: queryParse.data.offset,
  })

  // Get assigned user names
  const assignedToIds = items.map((r) => r.assignedToId).filter(Boolean) as string[]
  let userMap = new Map<string, string>()

  if (assignedToIds.length > 0) {
    const users = await knex('users')
      .select('id', 'name', 'email')
      .whereIn('id', assignedToIds)
    for (const u of users) {
      userMap.set(u.id, u.name || u.email || 'Unknown')
    }
  }

  // Get airport codes
  const airportIds = [
    ...items.map((r) => r.originAirportId),
    ...items.map((r) => r.destinationAirportId),
  ].filter(Boolean) as string[]
  let airportMap = new Map<string, string>()

  if (airportIds.length > 0) {
    const airports = await knex('fms_locations')
      .select('id', 'code', 'name')
      .whereIn('id', airportIds)
    for (const a of airports) {
      airportMap.set(a.id, a.code || a.name || 'Unknown')
    }
  }

  return NextResponse.json({
    items: items.map((rfq) => ({
      id: rfq.id,
      name: rfq.name,
      salesStage: rfq.salesStage,
      probability: rfq.probability,
      amount: rfq.amount ?? null,
      currencyCode: rfq.currencyCode,
      deliveryStatus: rfq.deliveryStatus,
      isDelayed: rfq.isDelayed,
      originAirportId: rfq.originAirportId ?? null,
      originAirportCode: rfq.originAirportId ? airportMap.get(rfq.originAirportId) ?? null : null,
      destinationAirportId: rfq.destinationAirportId ?? null,
      destinationAirportCode: rfq.destinationAirportId ? airportMap.get(rfq.destinationAirportId) ?? null : null,
      shipmentReadyDate: rfq.shipmentReadyDate ?? null,
      requiredAtDestinationDate: rfq.requiredAtDestinationDate ?? null,
      totalPieces: rfq.totalPieces,
      totalVolume: rfq.totalVolume,
      totalActualWeight: rfq.totalActualWeight,
      totalChargeableWeight: rfq.totalChargeableWeight,
      assignedToId: rfq.assignedToId ?? null,
      assignedToName: rfq.assignedToId ? userMap.get(rfq.assignedToId) ?? null : null,
      createdAt: rfq.createdAt,
      updatedAt: rfq.updatedAt,
    })),
    total,
    limit: queryParse.data.limit,
    offset: queryParse.data.offset,
  })
}
