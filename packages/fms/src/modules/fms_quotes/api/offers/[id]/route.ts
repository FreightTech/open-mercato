import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@/lib/di/container'
import { getAuthFromRequest } from '@/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsOffer, FmsOfferLine } from '../../../data/entities'
import { FMS_OFFER_STATUSES } from '../../../data/types'
import { User } from '@open-mercato/core/modules/auth/data/entities'
import { Contractor } from '../../../../contractors/data/entities'

const updateSchema = z.object({
  status: z.enum(FMS_OFFER_STATUSES).optional(),
  validUntil: z.coerce.date().optional(),
  paymentTerms: z.string().trim().max(255).optional().nullable(),
  specialTerms: z.string().trim().max(2000).optional().nullable(),
  customerNotes: z.string().trim().max(2000).optional().nullable(),
  assignedToId: z.string().uuid().optional().nullable(),
  clientId: z.string().uuid().optional().nullable(),
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

  const offer = await em.findOne(FmsOffer, filters, { populate: ['quote.client', 'lines', 'assignedTo'] })

  if (!offer) {
    return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
  }

  // Transform response to include assignedTo and client info
  const response = {
    ...offer,
    assignedTo: offer.assignedTo
      ? {
          id: offer.assignedTo.id,
          name: offer.assignedTo.name || offer.assignedTo.email,
          email: offer.assignedTo.email,
        }
      : null,
    quote: offer.quote ? {
      ...offer.quote,
      client: offer.quote.client ? {
        id: offer.quote.client.id,
        name: offer.quote.client.name,
      } : null,
      clientName: offer.quote.client?.name || null,
    } : null,
  }

  return NextResponse.json(response)
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

  const offer = await em.findOne(FmsOffer, filters)

  if (!offer) {
    return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
  }

  const data = validation.data

  if (data.status !== undefined) offer.status = data.status
  if (data.validUntil !== undefined) offer.validUntil = new Date(data.validUntil)
  if (data.paymentTerms !== undefined) offer.paymentTerms = data.paymentTerms
  if (data.specialTerms !== undefined) offer.specialTerms = data.specialTerms
  if (data.customerNotes !== undefined) offer.customerNotes = data.customerNotes

  // Handle assignedTo relationship
  if (data.assignedToId !== undefined) {
    if (data.assignedToId === null) {
      offer.assignedTo = null
    } else {
      const user = await em.findOne(User, { id: data.assignedToId })
      if (user) {
        offer.assignedTo = user
      }
    }
  }

  offer.updatedAt = new Date()

  await em.flush()

  // Re-fetch with populated relations for response
  const updated = await em.findOne(FmsOffer, { id: offer.id }, { populate: ['assignedTo'] })

  return NextResponse.json({
    ...updated,
    assignedTo: updated?.assignedTo
      ? {
          id: updated.assignedTo.id,
          name: updated.assignedTo.name || updated.assignedTo.email,
          email: updated.assignedTo.email,
        }
      : null,
  })
}

export async function DELETE(req: Request, { params }: Params) {
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

  const offer = await em.findOne(FmsOffer, filters, { populate: ['lines'] })

  if (!offer) {
    return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
  }

  // Only allow deleting draft offers
  if (offer.status !== 'draft') {
    return NextResponse.json({ error: 'Only draft offers can be deleted' }, { status: 400 })
  }

  // Soft delete offer and its lines
  offer.deletedAt = new Date()
  for (const line of offer.lines) {
    line.deletedAt = new Date()
  }

  await em.flush()

  return NextResponse.json({ success: true })
}

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_quotes.offers.view'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_quotes.offers.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_quotes.offers.manage'] },
}
