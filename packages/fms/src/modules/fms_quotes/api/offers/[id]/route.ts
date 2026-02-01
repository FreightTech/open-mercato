import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { FmsOffer } from '../../../data/entities'
import { FMS_OFFER_STATUSES } from '../../../data/types'

const updateSchema = z.object({
  status: z.enum(FMS_OFFER_STATUSES).optional(),
  validUntil: z.coerce.date().optional(),
  paymentTerms: z.string().trim().max(255).optional().nullable(),
  specialTerms: z.string().trim().max(2000).optional().nullable(),
  customerNotes: z.string().trim().max(2000).optional().nullable(),
  assignedToId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  version: z.coerce.number().int().min(1).optional(),
  quoteId: z.string().uuid().optional(),
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

  const offer = await em.findOne(FmsOffer, filters, { populate: ['quote.client', 'quote.originPorts', 'quote.destinationPorts', 'lines'] })

  if (!offer) {
    return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
  }

  // Fetch assignedTo user separately (module isomorphism - no direct User relationship)
  let assignedToUser: { id: string; name?: string | null; email: string } | null = null
  if (offer.assignedToId) {
    const user = await em.findOne('User', { id: offer.assignedToId })
    if (user) {
      assignedToUser = {
        id: (user as any).id,
        name: (user as any).name ?? null,
        email: (user as any).email,
      }
    }
  }

  // Transform response to include assignedTo and client info
  // Extract port codes from collections
  const originPorts = offer.quote?.originPorts?.getItems() || []
  const destinationPorts = offer.quote?.destinationPorts?.getItems() || []

  const response = {
    ...offer,
    assignedTo: assignedToUser
      ? {
          id: assignedToUser.id,
          name: assignedToUser.name || assignedToUser.email,
          email: assignedToUser.email,
        }
      : null,
    quote: offer.quote ? {
      ...offer.quote,
      client: offer.quote.client ? {
        id: offer.quote.client.id,
        name: offer.quote.client.name,
      } : null,
      clientName: offer.quote.client?.name || null,
      // Add port names for display
      originPortCode: originPorts.length > 0 ? originPorts.map(p => p.name).join(', ') : null,
      destinationPortCode: destinationPorts.length > 0 ? destinationPorts.map(p => p.name).join(', ') : null,
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
  const commandBus = container.resolve('commandBus') as CommandBus

  const selectedOrgId = scope?.selectedId ?? auth.orgId
  const tenantId = auth.tenantId

  try {
    const { result, logEntry } = await commandBus.execute('fms_quotes.offers.update', {
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
        resourceKind: 'fms_quotes.offer',
        resourceId: id,
      },
    })

    // Reload offer for response
    const em = container.resolve('em') as EntityManager
    const updated = await em.findOne(FmsOffer, { id: (result as { offerId: string }).offerId })

    // Fetch assignedTo user separately (module isomorphism - no direct User relationship)
    let assignedToUserPut: { id: string; name?: string | null; email: string } | null = null
    if (updated?.assignedToId) {
      const user = await em.findOne('User', { id: updated.assignedToId })
      if (user) {
        assignedToUserPut = {
          id: (user as any).id,
          name: (user as any).name ?? null,
          email: (user as any).email,
        }
      }
    }

    return NextResponse.json({
      ...updated,
      assignedTo: assignedToUserPut
        ? {
            id: assignedToUserPut.id,
            name: assignedToUserPut.name || assignedToUserPut.email,
            email: assignedToUserPut.email,
          }
        : null,
    })
  } catch (error: any) {
    console.error('[offers/update] error:', error)
    if (error?.status) {
      return NextResponse.json(error.body || { error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to update offer', message: error.message }, { status: 500 })
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
    await commandBus.execute('fms_quotes.offers.delete', {
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
        resourceKind: 'fms_quotes.offer',
        resourceId: id,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[offers/delete] error:', error)
    if (error?.status) {
      return NextResponse.json(error.body || { error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to delete offer', message: error.message }, { status: 500 })
  }
}

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_quotes.offers.view'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_quotes.offers.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_quotes.offers.manage'] },
}
