import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { FmsRfq } from '../../../data/entities'
import { FMS_RFQ_STATUSES, FMS_DIRECTIONS, FMS_TRANSPORT_MODES, FMS_RFQ_CARGO_TYPES, FMS_OFFER_STATUSES } from '../../../data/types'

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
    populate: ['offers', 'items'],
  })

  // Collect assignee user IDs
  const userIds = new Set<string>()
  for (const rfq of rfqs) {
    if (rfq.assignedToId) userIds.add(rfq.assignedToId)
  }

  const userMap = new Map<string, { id: string; name?: string | null; email: string }>()
  if (userIds.size > 0) {
    const db = em.getKysely<any>()
    const users = await db.selectFrom('users').select(['id', 'name', 'email']).where('id', 'in', Array.from(userIds)).execute()
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
      originLocationId: rfq.originLocationId ?? null,
      destinationLocationId: rfq.destinationLocationId ?? null,
      placeOfLoading: rfq.placeOfLoading ?? null,
      placeOfLoadingId: rfq.placeOfLoadingId ?? null,
      placeOfDelivery: rfq.placeOfDelivery ?? null,
      placeOfDeliveryId: rfq.placeOfDeliveryId ?? null,
      companyName: rfq.companyName ?? null,
      contractorId: rfq.contractorId ?? null,
      contactPerson: rfq.contactPerson ?? null,
      contactPersonId: rfq.contactPersonId ?? null,
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
      latestOfferId: latestOffer?.id ?? null,
      latestOfferNumber: latestOffer?.offerNumber ?? null,
      latestOfferVersion: latestOffer?.version ?? null,
      latestOfferCreatedAt: latestOffer?.createdAt?.toISOString() ?? null,
      items: (rfq.items?.getItems() || [])
        .filter((item) => !item.deletedAt)
        .sort((a, b) => a.itemNumber - b.itemNumber)
        .map((item) => ({
          containerType: item.containerType ?? null,
          containerCount: item.containerCount ?? null,
          origin: item.origin ?? null,
          destination: item.destination ?? null,
          readinessDate: item.readinessDate ?? null,
        })),
    }
  })

  return NextResponse.json({ items: cards })
}

const rfqBoardAssigneeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  initials: z.string(),
})

const rfqBoardItemSchema = z.object({
  containerType: z.string().nullable(),
  containerCount: z.number().int().nullable(),
  origin: z.string().nullable(),
  destination: z.string().nullable(),
  readinessDate: z.string().nullable(),
})

const rfqBoardCardSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  referenceNumber: z.string(),
  status: z.enum(FMS_RFQ_STATUSES),
  direction: z.enum(FMS_DIRECTIONS).nullable(),
  transportMode: z.enum(FMS_TRANSPORT_MODES).nullable(),
  cargoType: z.enum(FMS_RFQ_CARGO_TYPES).nullable(),
  containerCount: z.number().int().nullable(),
  origin: z.string().nullable(),
  destination: z.string().nullable(),
  originLocationId: z.string().uuid().nullable(),
  destinationLocationId: z.string().uuid().nullable(),
  placeOfLoading: z.string().nullable(),
  placeOfLoadingId: z.string().uuid().nullable(),
  placeOfDelivery: z.string().nullable(),
  placeOfDeliveryId: z.string().uuid().nullable(),
  companyName: z.string().nullable(),
  contractorId: z.string().uuid().nullable(),
  contactPerson: z.string().nullable(),
  contactPersonId: z.string().uuid().nullable(),
  context: z.string().nullable(),
  assignee: rfqBoardAssigneeSchema.nullable(),
  updatedAt: z.string(),
  createdAt: z.string(),
  offerCount: z.number().int(),
  latestOfferStatus: z.enum(FMS_OFFER_STATUSES).nullable(),
  latestOfferId: z.string().uuid().nullable(),
  latestOfferNumber: z.string().nullable(),
  latestOfferVersion: z.number().int().nullable(),
  latestOfferCreatedAt: z.string().nullable(),
  items: z.array(rfqBoardItemSchema),
})

const rfqBoardResponseSchema = z.object({
  items: z.array(rfqBoardCardSchema),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'FMS Offers',
  summary: 'RFQ board view',
  methods: {
    GET: {
      summary: 'Get RFQ board cards',
      description: 'Returns all RFQs formatted as board cards with assignee info and latest offer details.',
      responses: [
        { status: 200, description: 'Board card list', schema: rfqBoardResponseSchema },
        { status: 401, description: 'Unauthorized', schema: z.object({ error: z.string() }) },
      ],
    },
  },
}

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_offers.rfq.view'] },
}
