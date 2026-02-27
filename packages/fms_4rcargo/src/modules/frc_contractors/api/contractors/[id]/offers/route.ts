import { NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { FrcOffer } from '../../../../../frc_offers/data/entities'

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

  // Fetch Offers where carrier_id matches contractor
  // Use tenant-only scoping for contractors (shared across orgs within tenant)
  const filters: Record<string, unknown> = {
    carrierId: contractorId,
    deletedAt: null,
    tenantId: auth.tenantId,
  }

  const [items, total] = await em.findAndCount(FrcOffer, filters, {
    orderBy: { createdAt: 'desc' },
    limit: queryParse.data.limit,
    offset: queryParse.data.offset,
  })

  // Get RFQ names
  const rfqIds = items.map((o) => o.rfqId).filter((id): id is string => Boolean(id))
  let rfqMap = new Map<string, string>()

  if (rfqIds.length > 0) {
    const rfqs = await knex('frc_rfqs')
      .select('id', 'name')
      .whereIn('id', rfqIds)
    for (const r of rfqs) {
      rfqMap.set(r.id, r.name)
    }
  }

  // Get assigned user names
  const assignedToIds = items.map((o) => o.assignedToId).filter(Boolean) as string[]
  let userMap = new Map<string, string>()

  if (assignedToIds.length > 0) {
    const users = await knex('users')
      .select('id', 'name', 'email')
      .whereIn('id', assignedToIds)
    for (const u of users) {
      userMap.set(u.id, u.name || u.email || 'Unknown')
    }
  }

  return NextResponse.json({
    items: items.map((offer) => ({
      id: offer.id,
      name: offer.name,
      rfqId: offer.rfqId,
      rfqName: offer.rfqId ? rfqMap.get(offer.rfqId) ?? null : null,
      status: offer.status,
      awbNumber: offer.awbNumber ?? null,
      connectionMethod: offer.connectionMethod ?? null,
      departureDate: offer.departureDate ?? null,
      connectionRatePerKg: offer.connectionRatePerKg ?? null,
      connectionRateTotal: offer.connectionRateTotal ?? null,
      airfreightRatePerKg: offer.airfreightRatePerKg ?? null,
      airfreightRateTotal: offer.airfreightRateTotal ?? null,
      totalRatePerKg: offer.totalRatePerKg ?? null,
      totalRate: offer.totalRate ?? null,
      currencyCode: offer.currencyCode,
      assignedToId: offer.assignedToId ?? null,
      assignedToName: offer.assignedToId ? userMap.get(offer.assignedToId) ?? null : null,
      createdAt: offer.createdAt,
      updatedAt: offer.updatedAt,
    })),
    total,
    limit: queryParse.data.limit,
    offset: queryParse.data.offset,
  })
}
