import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { FmsOffer, FmsOfferLine, FmsQuoteLine } from '../../../data/entities'
import { FmsLocation } from '../../../../fms_locations/data/entities'
import { FmsProject } from '../../../../fms_projects/data/entities'
import { FmsProduct } from '../../../../fms_products/data/entities'
import { FMS_OFFER_STATUSES } from '../../../data/types'

const updateSchema = z.object({
  status: z.enum(FMS_OFFER_STATUSES).optional(),
  validUntil: z.coerce.date().optional(),
  paymentTerms: z.string().trim().max(255).optional().nullable(),
  specialTerms: z.string().trim().max(2000).optional().nullable(),
  customerNotes: z.string().trim().max(2000).optional().nullable(),
  assignedToId: z.string().uuid().optional().nullable(),
  operationalGuardianId: z.string().uuid().optional().nullable(),
  businessGuardianId: z.string().uuid().optional().nullable(),
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

  // Fetch guardian users separately (module isomorphism - no direct User relationship)
  const guardianIds = [offer.operationalGuardianId, offer.businessGuardianId].filter(Boolean) as string[]
  const guardianUsers = guardianIds.length > 0
    ? await em.find('User', { id: { $in: guardianIds } })
    : []
  const guardianMap = new Map(guardianUsers.map((u: any) => [u.id, { id: u.id, name: u.name ?? null, email: u.email }]))

  // Transform response to include guardians and client info
  // Extract port codes from collections
  const originPorts = offer.quote?.originPorts?.getItems() || []
  const destinationPorts = offer.quote?.destinationPorts?.getItems() || []

  // Fetch offer lines to get source quote line IDs and container sizes
  const offerLines = offer.lines?.getItems() || []
  const sourceQuoteLineIds = offerLines
    .map(line => line.sourceQuoteLineId)
    .filter((id): id is string => Boolean(id))

  // Fetch quote lines to get location IDs
  const quoteLines = sourceQuoteLineIds.length > 0
    ? await em.find(FmsQuoteLine, { id: { $in: sourceQuoteLineIds }, deletedAt: null })
    : []

  // Create a map of quote line ID to quote line for quick lookup
  const quoteLineMap = new Map(quoteLines.map(ql => [ql.id, ql]))

  // Collect unique location IDs from quote lines
  const locationIds = new Set<string>()
  for (const line of quoteLines) {
    if (line.originLocationId) locationIds.add(line.originLocationId)
    if (line.destinationLocationId) locationIds.add(line.destinationLocationId)
  }

  // Also add quote-level origin and destination ports
  for (const port of originPorts) {
    locationIds.add(port.id)
  }
  for (const port of destinationPorts) {
    locationIds.add(port.id)
  }

  // Fetch all unique locations
  const locations = locationIds.size > 0
    ? await em.find(FmsLocation, { id: { $in: [...locationIds] } })
    : []
  const locationMap = new Map(locations.map(loc => [loc.id, {
    id: loc.id,
    name: loc.name,
    code: loc.locode || loc.code || null,
    type: loc.type || null,
  }]))

  // Fetch products with chargeCode to get chargeUnit information
  const productIds = offerLines
    .map(line => line.productId)
    .filter((id): id is string => Boolean(id))

  const products = productIds.length > 0
    ? await em.find(FmsProduct, { id: { $in: productIds } }, { populate: ['chargeCode'] })
    : []
  const productMap = new Map(products.map(p => [p.id, p]))

  // Build lines array for convert dialog with chargeUnit info
  const convertDialogLines = offerLines.map(line => {
    const product = line.productId ? productMap.get(line.productId) : null
    const sourceQuoteLine = line.sourceQuoteLineId ? quoteLineMap.get(line.sourceQuoteLineId) : null

    // Get origin/destination names from locations
    const originLocationId = sourceQuoteLine?.originLocationId
    const destLocationId = sourceQuoteLine?.destinationLocationId
    const originLocation = originLocationId ? locationMap.get(originLocationId) : null
    const destLocation = destLocationId ? locationMap.get(destLocationId) : null

    return {
      id: line.id,
      productId: line.productId || null,
      productName: line.productName || null,
      chargeCode: line.chargeCode || null,
      containerSize: line.containerSize || null,
      chargeUnit: product?.chargeCode?.chargeUnit || null,
      unitPrice: line.unitPrice,
      amount: line.amount,
      currencyCode: line.currencyCode,
      origin: originLocation?.name || null,
      originLocationId: originLocationId || null,
      destination: destLocation?.name || null,
      destinationLocationId: destLocationId || null,
    }
  })

  // Build location options for the convert dialog
  const quoteLineLocations = quoteLines.map(line => ({
    quoteLineId: line.id,
    originLocationId: line.originLocationId || null,
    originLocation: line.originLocationId ? locationMap.get(line.originLocationId) || null : null,
    destinationLocationId: line.destinationLocationId || null,
    destinationLocation: line.destinationLocationId ? locationMap.get(line.destinationLocationId) || null : null,
  }))

  const opGuardian = offer.operationalGuardianId ? guardianMap.get(offer.operationalGuardianId) : null
  const bizGuardian = offer.businessGuardianId ? guardianMap.get(offer.businessGuardianId) : null

  // Find linked projects (one offer can be converted to multiple projects)
  const linkedProjects = await em.find(FmsProject, {
    offer: offer.id,
    deletedAt: null,
  }, { orderBy: { createdAt: 'desc' } })

  const response = {
    ...offer,
    operationalGuardian: opGuardian
      ? {
          id: opGuardian.id,
          name: opGuardian.name || opGuardian.email,
          email: opGuardian.email,
        }
      : null,
    businessGuardian: bizGuardian
      ? {
          id: bizGuardian.id,
          name: bizGuardian.name || bizGuardian.email,
          email: bizGuardian.email,
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
    // Data for convert-to-project dialog
    convertDialogData: {
      // All unique locations from quote lines and quote ports
      locations: [...locationMap.values()],
      // Lines with chargeUnit info for line selection
      lines: convertDialogLines,
      // Quote line location mappings (legacy, kept for compatibility)
      quoteLineLocations,
      // Quote-level port IDs as defaults
      defaultOriginLocationId: originPorts.length > 0 ? originPorts[0].id : null,
      defaultDestinationLocationId: destinationPorts.length > 0 ? destinationPorts[0].id : null,
    },
    // Linked projects (one offer can have multiple projects)
    projects: linkedProjects.map(p => ({
      id: p.id,
      projectNumber: p.projectNumber,
    })),
    // Backward compatibility: first linked project
    project: linkedProjects.length > 0 ? {
      id: linkedProjects[0].id,
      projectNumber: linkedProjects[0].projectNumber,
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

    // Fetch guardians separately (module isomorphism - no direct User relationship)
    const guardianIdsPut = [updated?.operationalGuardianId, updated?.businessGuardianId].filter(Boolean) as string[]
    const guardianUsersPut = guardianIdsPut.length > 0
      ? await em.find('User', { id: { $in: guardianIdsPut } })
      : []
    const guardianMapPut = new Map(guardianUsersPut.map((u: any) => [u.id, { id: u.id, name: u.name ?? null, email: u.email }]))

    const opGuardianPut = updated?.operationalGuardianId ? guardianMapPut.get(updated.operationalGuardianId) : null
    const bizGuardianPut = updated?.businessGuardianId ? guardianMapPut.get(updated.businessGuardianId) : null

    return NextResponse.json({
      ...updated,
      operationalGuardian: opGuardianPut
        ? {
            id: opGuardianPut.id,
            name: opGuardianPut.name || opGuardianPut.email,
            email: opGuardianPut.email,
          }
        : null,
      businessGuardian: bizGuardianPut
        ? {
            id: bizGuardianPut.id,
            name: bizGuardianPut.name || bizGuardianPut.email,
            email: bizGuardianPut.email,
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
