import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { FmsRfq } from '../../../data/entities'
import { FMS_RFQ_STATUSES, FMS_DIRECTIONS, FMS_TRANSPORT_MODES, FMS_RFQ_CARGO_TYPES, FMS_OFFER_STATUSES } from '../../../data/types'

const updateSchema = z.object({
  title: z.string().trim().max(255).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  origin: z.string().trim().max(255).optional().nullable(),
  destination: z.string().trim().max(255).optional().nullable(),
  originLocationId: z.string().uuid().optional().nullable(),
  destinationLocationId: z.string().uuid().optional().nullable(),
  placeOfLoading: z.string().trim().max(255).optional().nullable(),
  placeOfLoadingId: z.string().uuid().optional().nullable(),
  placeOfDelivery: z.string().trim().max(255).optional().nullable(),
  placeOfDeliveryId: z.string().uuid().optional().nullable(),
  containerCount: z.coerce.number().int().min(1).optional().nullable(),
  direction: z.enum(['import', 'export', 'both'] as const).optional().nullable(),
  transportMode: z.enum(['sea', 'air', 'road', 'rail', 'barge'] as const).optional().nullable(),
  cargoType: z.enum(['general', 'dangerous', 'perishable', 'oog'] as const).optional().nullable(),
  companyName: z.string().trim().max(255).optional().nullable(),
  contactPerson: z.string().trim().max(255).optional().nullable(),
  context: z.string().trim().max(5000).optional().nullable(),
  status: z.enum(FMS_RFQ_STATUSES).optional(),
  assignedToId: z.string().uuid().optional().nullable(),
})

type Params = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Params) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const filters: Record<string, unknown> = {
    id,
    deletedAt: null,
  }

  if (auth.tenantId) {
    filters.tenantId = auth.tenantId
  }

  const allowedOrgIds = new Set<string>()
  if (scope?.filterIds?.length) scope.filterIds.forEach((oid) => allowedOrgIds.add(oid))
  else if (auth.orgId) allowedOrgIds.add(auth.orgId)

  if (allowedOrgIds.size) {
    filters.organizationId = { $in: [...allowedOrgIds] }
  }

  const rfq = await em.findOne(FmsRfq, filters, { populate: ['offers'] })

  if (!rfq) {
    return NextResponse.json({ error: 'RFQ not found' }, { status: 404 })
  }

  const offers = rfq.offers?.getItems() || []

  return NextResponse.json({
    ...rfq,
    offers: offers.map((offer) => ({
      id: offer.id,
      offerNumber: offer.offerNumber,
      status: offer.status,
      version: offer.version,
      createdAt: offer.createdAt,
    })),
  })
}

export async function PUT(req: Request, { params }: Params) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const body = await req.json()
  const validation = updateSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid input', details: validation.error }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const commandBus = container.resolve('commandBus') as CommandBus

  const selectedOrgId = scope?.selectedId ?? auth.orgId
  const tenantId = auth.tenantId

  try {
    const { result } = await commandBus.execute('fms_offers.rfq.update', {
      input: {
        id,
        ...validation.data,
      },
      ctx: {
        container,
        auth,
        organizationScope: scope,
        selectedOrganizationId: selectedOrgId ?? null,
        organizationIds: scope?.filterIds ?? (selectedOrgId ? [selectedOrgId] : null),
        request: req,
      },
      metadata: {
        tenantId: tenantId ?? null,
        organizationId: selectedOrgId ?? null,
        resourceKind: 'fms_offers.rfq',
        resourceId: id,
      },
    })

    const em = container.resolve('em') as EntityManager
    const updated = await em.findOne(FmsRfq, { id: (result as { rfqId: string }).rfqId })

    return NextResponse.json(updated)
  } catch (error: any) {
    console.error('[rfq/update] error:', error)
    if (error?.status) {
      return NextResponse.json(error.body || { error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to update RFQ', message: error.message }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const commandBus = container.resolve('commandBus') as CommandBus

  const selectedOrgId = scope?.selectedId ?? auth.orgId
  const tenantId = auth.tenantId

  try {
    await commandBus.execute('fms_offers.rfq.delete', {
      input: {
        body: {},
        query: { id },
      },
      ctx: {
        container,
        auth,
        organizationScope: scope,
        selectedOrganizationId: selectedOrgId ?? null,
        organizationIds: scope?.filterIds ?? (selectedOrgId ? [selectedOrgId] : null),
        request: req,
      },
      metadata: {
        tenantId: tenantId ?? null,
        organizationId: selectedOrgId ?? null,
        resourceKind: 'fms_offers.rfq',
        resourceId: id,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[rfq/delete] error:', error)
    if (error?.status) {
      return NextResponse.json(error.body || { error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to delete RFQ', message: error.message }, { status: 500 })
  }
}

const rfqOfferSchema = z.object({
  id: z.string().uuid(),
  offerNumber: z.string().nullable(),
  status: z.enum(FMS_OFFER_STATUSES),
  version: z.number().int(),
  createdAt: z.string(),
})

const rfqDetailSchema = z.object({
  id: z.string().uuid(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  origin: z.string().nullable(),
  destination: z.string().nullable(),
  originLocationId: z.string().uuid().nullable(),
  destinationLocationId: z.string().uuid().nullable(),
  placeOfLoading: z.string().nullable(),
  placeOfLoadingId: z.string().uuid().nullable(),
  placeOfDelivery: z.string().nullable(),
  placeOfDeliveryId: z.string().uuid().nullable(),
  containerCount: z.number().int().nullable(),
  direction: z.enum(FMS_DIRECTIONS).nullable(),
  transportMode: z.enum(FMS_TRANSPORT_MODES).nullable(),
  cargoType: z.enum(FMS_RFQ_CARGO_TYPES).nullable(),
  companyName: z.string().nullable(),
  contactPerson: z.string().nullable(),
  context: z.string().nullable(),
  status: z.enum(FMS_RFQ_STATUSES),
  assignedToId: z.string().uuid().nullable(),
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
  offers: z.array(rfqOfferSchema),
})

const idPathParams = z.object({ id: z.string().uuid() })

export const openApi: OpenApiRouteDoc = {
  tag: 'FMS Offers',
  summary: 'RFQ detail operations',
  pathParams: idPathParams,
  methods: {
    GET: {
      summary: 'Get RFQ by ID',
      description: 'Returns a single RFQ with its associated offers.',
      responses: [
        { status: 200, description: 'RFQ detail with offers', schema: rfqDetailSchema },
        { status: 401, description: 'Unauthorized', schema: z.object({ error: z.string() }) },
        { status: 404, description: 'RFQ not found', schema: z.object({ error: z.string() }) },
      ],
    },
    PUT: {
      summary: 'Update RFQ',
      description: 'Updates an existing RFQ by ID.',
      requestBody: {
        contentType: 'application/json',
        schema: updateSchema,
      },
      responses: [
        { status: 200, description: 'Updated RFQ', schema: rfqDetailSchema },
        { status: 400, description: 'Invalid input', schema: z.object({ error: z.string() }) },
        { status: 401, description: 'Unauthorized', schema: z.object({ error: z.string() }) },
      ],
    },
    DELETE: {
      summary: 'Delete RFQ',
      description: 'Soft-deletes an RFQ by ID.',
      responses: [
        { status: 200, description: 'Deletion confirmed', schema: z.object({ success: z.boolean() }) },
        { status: 401, description: 'Unauthorized', schema: z.object({ error: z.string() }) },
      ],
    },
  },
}

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_offers.rfq.view'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_offers.rfq.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_offers.rfq.manage'] },
}
