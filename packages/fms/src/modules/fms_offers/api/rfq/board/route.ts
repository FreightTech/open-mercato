import { NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsRfq } from '../../../data/entities'

export async function GET(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const filters: Record<string, unknown> = {
    deletedAt: null,
  }

  if (auth.tenantId) {
    filters.tenantId = auth.tenantId
  }

  const allowedOrgIds = new Set<string>()
  if (scope?.filterIds?.length) scope.filterIds.forEach((id) => allowedOrgIds.add(id))
  else if (auth.orgId) allowedOrgIds.add(auth.orgId)

  if (allowedOrgIds.size) {
    filters.organizationId = { $in: [...allowedOrgIds] }
  }

  const rfqs = await em.find(FmsRfq, filters, {
    orderBy: { updatedAt: 'desc' },
    limit: 200,
    populate: ['offers'],
  })

  // Collect assignee user IDs
  const userIds = new Set<string>()
  for (const rfq of rfqs) {
    if (rfq.assignedToId) userIds.add(rfq.assignedToId)
  }

  const userMap = new Map<string, { id: string; name?: string | null; email: string }>()
  if (userIds.size > 0) {
    const knex = (em as any).getConnection().getKnex()
    const users = await knex('users').select('id', 'name', 'email').whereIn('id', Array.from(userIds))
    for (const u of users) {
      userMap.set(u.id, { id: u.id, name: u.name, email: u.email })
    }
  }

  const cards = rfqs.map((rfq) => {
    const offers = rfq.offers?.getItems() || []
    const offerCount = offers.filter((o) => !o.deletedAt).length
    const latestOffer = offers
      .filter((o) => !o.deletedAt)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]

    const assigneeUser = rfq.assignedToId ? userMap.get(rfq.assignedToId) : null
    const assigneeName = assigneeUser?.name || assigneeUser?.email || null
    const assigneeInitials = assigneeName
      ? assigneeName
          .split(' ')
          .map((part) => part[0])
          .join('')
          .toUpperCase()
          .slice(0, 2)
      : null

    return {
      id: rfq.id,
      title: rfq.companyName || rfq.title || 'Untitled RFQ',
      description: rfq.origin && rfq.destination
        ? `${rfq.direction ? rfq.direction.charAt(0).toUpperCase() + rfq.direction.slice(1) : ''}: ${rfq.origin} - ${rfq.destination}`.trim().replace(/^:\s*/, '')
        : rfq.description || '',
      referenceNumber: rfq.title || 'RFQ',
      status: rfq.status,
      direction: rfq.direction ?? null,
      transportMode: rfq.transportMode ?? null,
      cargoType: rfq.cargoType ?? null,
      containerCount: rfq.containerCount ?? null,
      origin: rfq.origin ?? null,
      destination: rfq.destination ?? null,
      companyName: rfq.companyName ?? null,
      contactPerson: rfq.contactPerson ?? null,
      context: rfq.context ?? null,
      assignee: assigneeUser
        ? {
            id: assigneeUser.id,
            name: assigneeName!,
            initials: assigneeInitials!,
          }
        : null,
      updatedAt: rfq.updatedAt.toISOString(),
      createdAt: rfq.createdAt.toISOString(),
      offerCount,
      latestOfferStatus: latestOffer?.status ?? null,
    }
  })

  return NextResponse.json({ items: cards })
}

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_offers.rfq.view'] },
}
