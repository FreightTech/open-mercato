import { NextRequest, NextResponse } from 'next/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FmsLocation } from '@open-mercato/fms/modules/fms_locations/data/entities'
import { FrcRfq } from '../../../data/entities'
import type { FrcRfqBoardCard, TaskAssignee } from '../../../lib/board-types'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['frc_rfqs.view'] },
}

type BoardApiItem = Omit<FrcRfqBoardCard, 'chip'>

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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const em = container.resolve('em') as EntityManager
  const knex = em.getKnex()

  const scopeFilters = buildScopeFilters(auth, scope)

  // Fetch RFQs (no longer populate airports - they're UUIDs now)
  const rfqs = await em.find(
    FrcRfq,
    {
      deletedAt: null,
      ...scopeFilters,
    },
    {
      orderBy: { updatedAt: 'DESC' },
    }
  )

  if (rfqs.length === 0) {
    return NextResponse.json({ items: [] })
  }

  // Collect IDs for batch fetching
  const rfqIds = rfqs.map((r) => r.id)
  const assignedToIds = rfqs.map((r) => r.assignedToId).filter(Boolean) as string[]
  const accountIds = rfqs.map((r) => r.accountId).filter(Boolean) as string[]

  // Fetch airports from FmsLocation (type: 'airport')
  const airportIds = rfqs
    .flatMap((r) => [r.originAirportId, r.destinationAirportId])
    .filter((id): id is string => Boolean(id))

  const airports =
    airportIds.length > 0
      ? await em.find(FmsLocation, { id: { $in: [...new Set(airportIds)] }, type: 'airport' })
      : []
  const airportMap = new Map(airports.map((a) => [a.id, a]))

  // Batch fetch users for assignees
  const userMap = new Map<string, { name: string; email: string }>()
  if (assignedToIds.length > 0) {
    const users = await knex('users')
      .select('id', 'name', 'email')
      .whereIn('id', assignedToIds)
      .whereNull('deleted_at')
    for (const u of users) {
      userMap.set(u.id, { name: u.name, email: u.email })
    }
  }

  // Batch fetch contractors for account names
  const accountMap = new Map<string, string>()
  if (accountIds.length > 0) {
    const contractors = await knex('contractors')
      .select('id', 'name')
      .whereIn('id', accountIds)
      .whereNull('deleted_at')
    for (const c of contractors) {
      accountMap.set(c.id, c.name)
    }
  }

  // Batch fetch offer counts and latest offer status
  const offerStats = await knex('frc_offers')
    .select('rfq_id')
    .count('* as offer_count')
    .max('created_at as latest_created_at')
    .whereIn('rfq_id', rfqIds)
    .whereNull('deleted_at')
    .groupBy('rfq_id')

  const offerCountMap = new Map<string, { count: number; latestCreatedAt: Date | null }>()
  for (const stat of offerStats) {
    offerCountMap.set(stat.rfq_id, {
      count: Number(stat.offer_count),
      latestCreatedAt: stat.latest_created_at,
    })
  }

  // Get latest offer details for RFQs that have offers
  const rfqIdsWithOffers = [...offerCountMap.keys()]
  const latestOfferMap = new Map<string, { id: string; status: string }>()
  if (rfqIdsWithOffers.length > 0) {
    // For each RFQ, get the latest offer
    const latestOffers = await knex('frc_offers as o1')
      .select('o1.id', 'o1.rfq_id', 'o1.status')
      .whereIn('o1.rfq_id', rfqIdsWithOffers)
      .whereNull('o1.deleted_at')
      .whereRaw(`o1.created_at = (
        SELECT MAX(o2.created_at)
        FROM frc_offers o2
        WHERE o2.rfq_id = o1.rfq_id AND o2.deleted_at IS NULL
      )`)

    for (const o of latestOffers) {
      latestOfferMap.set(o.rfq_id, { id: o.id, status: o.status })
    }
  }

  // Build response items
  const items: BoardApiItem[] = rfqs.map((rfq) => {
    const assigneeData = rfq.assignedToId ? userMap.get(rfq.assignedToId) : null
    const displayName = assigneeData ? (assigneeData.name || assigneeData.email) : null
    const assignee: TaskAssignee | null = assigneeData && displayName
      ? {
          id: rfq.assignedToId!,
          name: displayName,
          initials: getInitials(displayName),
        }
      : null

    const offerStat = offerCountMap.get(rfq.id)
    const latestOffer = latestOfferMap.get(rfq.id)

    const originAirport = rfq.originAirportId ? airportMap.get(rfq.originAirportId) : null
    const destinationAirport = rfq.destinationAirportId ? airportMap.get(rfq.destinationAirportId) : null

    return {
      id: rfq.id,
      name: rfq.name,
      salesStage: rfq.salesStage,
      deliveryStatus: rfq.deliveryStatus,
      probability: rfq.probability,
      amount: rfq.amount ?? null,
      currencyCode: rfq.currencyCode,
      originAirportCode: originAirport?.code ?? null,
      originAirportName: originAirport ? `${originAirport.code} - ${originAirport.name}` : null,
      destinationAirportCode: destinationAirport?.code ?? null,
      destinationAirportName: destinationAirport ? `${destinationAirport.code} - ${destinationAirport.name}` : null,
      product: rfq.product ?? null,
      commodity: rfq.commodity ?? null,
      totalPieces: rfq.totalPieces,
      totalChargeableWeight: rfq.totalChargeableWeight,
      accountId: rfq.accountId ?? null,
      accountName: rfq.accountId ? (accountMap.get(rfq.accountId) ?? null) : null,
      contactId: rfq.contactId ?? null,
      description: rfq.description ?? null,
      assignee,
      offerCount: offerStat?.count ?? 0,
      latestOfferStatus: latestOffer?.status ?? null,
      latestOfferId: latestOffer?.id ?? null,
      createdAt: rfq.createdAt.toISOString(),
      updatedAt: rfq.updatedAt.toISOString(),
    }
  })

  return NextResponse.json({ items })
}
