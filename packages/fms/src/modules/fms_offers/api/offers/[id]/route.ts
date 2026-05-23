import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { FmsOffer, FmsOfferCalculation, FmsOfferLine } from '../../../data/entities'
import { FmsProject } from '../../../../fms_projects/data/entities'
import { FmsProduct } from '../../../../fms_products/data/entities'
import { FMS_OFFER_STATUSES } from '../../../data/types'

const exchangeRateSnapshotSchema = z.object({
  fromCurrencyCode: z.string().trim().regex(/^[A-Z]{3}$/),
  toCurrencyCode: z.string().trim().regex(/^[A-Z]{3}$/),
  rate: z.string().trim(),
  date: z.string().trim(),
  source: z.string().trim(),
})

const updateSchema = z.object({
  type: z.string().optional(),
  status: z.enum(FMS_OFFER_STATUSES).optional(),
  contractorId: z.string().uuid().optional().nullable(),
  carrierId: z.string().uuid().optional().nullable(),
  carrierIds: z.array(z.string().uuid()).optional().nullable(),
  providerIds: z.array(z.string().uuid()).optional().nullable(),
  incoterm: z.string().optional().nullable(),
  contactPersonId: z.string().uuid().optional().nullable(),
  billingAddressId: z.string().uuid().optional().nullable(),
  validUntil: z.coerce.date().optional(),
  direction: z.string().optional().nullable(),
  transportMode: z.string().optional().nullable(),
  cargoType: z.string().optional().nullable(),
  paymentTerms: z.string().trim().max(255).optional().nullable(),
  specialTerms: z.string().trim().optional().nullable(),
  customerNotes: z.string().trim().max(2000).optional().nullable(),
  assignedToId: z.string().uuid().optional().nullable(),
  operationalGuardianId: z.string().uuid().optional().nullable(),
  businessGuardianId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  version: z.coerce.number().int().min(1).optional(),
  rfqId: z.string().uuid().optional().nullable(),
  baseCurrency: z.string().trim().regex(/^[A-Z]{3}$/).optional().nullable(),
  exchangeRates: z.array(exchangeRateSnapshotSchema).optional().nullable(),
  costGroupingMode: z.string().optional().nullable(),
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

  if (scope?.filterIds) {
    filters.organizationId = { $in: scope.filterIds }
  } else if (!scope?.filterIds && scope?.selectedId) {
    filters.organizationId = scope.selectedId
  } else if (auth.orgId) {
    filters.organizationId = auth.orgId
  }

  const offer = await em.findOne(FmsOffer, filters, { populate: ['rfq', 'calculations', 'calculations.lines'] })

  if (!offer) {
    return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
  }

  // Fetch guardian users separately (module isomorphism - no direct User relationship)
  const guardianIds = [offer.operationalGuardianId, offer.businessGuardianId].filter(Boolean) as string[]
  const guardianUsers = guardianIds.length > 0
    ? await em.find('User' as any, { id: { $in: guardianIds } })
    : []
  const guardianMap = new Map(guardianUsers.map((u: any) => [u.id, { id: u.id, name: u.name ?? null, email: u.email }]))

  // Collect all product IDs from calculation lines (exclude soft-deleted calculations and lines)
  const sortedCalcs = (offer.calculations?.getItems() || []).filter(c => !c.deletedAt).sort((a, b) => a.calculationNumber - b.calculationNumber)
  const allLines = sortedCalcs.flatMap(c => (c.lines?.getItems() || []).filter(l => !l.deletedAt).sort((a, b) => a.lineNumber - b.lineNumber))
  const productIds = allLines
    .map(line => line.productId)
    .filter((pid): pid is string => Boolean(pid))

  const products = productIds.length > 0
    ? await em.find(FmsProduct, { id: { $in: [...new Set(productIds)] } })
    : []
  const productMap = new Map(products.map(p => [p.id, p]))

  // Build calculations with lines for response (sorted by calculationNumber to match item order)
  // Filter out soft-deleted calculations so they don't create ghost items in the wizard
  const calculationsResponse = (offer.calculations?.getItems() || []).filter(calc => !calc.deletedAt).sort((a, b) => a.calculationNumber - b.calculationNumber).map(calc => ({
    id: calc.id,
    calculationNumber: calc.calculationNumber,
    sectionType: calc.sectionType || null,
    label: calc.label,
    containers: calc.containers,
    originLocationId: calc.originLocationId,
    destinationLocationId: calc.destinationLocationId,
    placeOfLoadingId: calc.placeOfLoadingId,
    placeOfDeliveryId: calc.placeOfDeliveryId,
    lines: (calc.lines?.getItems() || []).filter(line => !line.deletedAt).sort((a, b) => a.lineNumber - b.lineNumber).map(line => {
      const product = line.productId ? productMap.get(line.productId) : null
      return {
        id: line.id,
        lineNumber: line.lineNumber,
        productId: line.productId || null,
        productName: line.productName || null,
        chargeCode: line.chargeCode || null,
        chargeBasis: line.chargeBasis || null,
        chargeUnit: (product as any)?.chargeUnit || null,
        containerType: line.containerType || null,
        currencyCode: line.currencyCode,
        rate: line.rate,
        buyPrice: line.buyPrice,
        sellPrice: line.sellPrice,
        isEnabled: line.isEnabled,
        sectionType: line.sectionType || null,
      }
    }),
  }))

  const opGuardian = offer.operationalGuardianId ? guardianMap.get(offer.operationalGuardianId) : null
  const bizGuardian = offer.businessGuardianId ? guardianMap.get(offer.businessGuardianId) : null

  // Find linked projects (one offer can be converted to multiple projects)
  const linkedProjects = await em.find(FmsProject, {
    offer: offer.id,
    deletedAt: null,
  }, { orderBy: { createdAt: 'desc' } })

  // Build convertDialogData from calculation lines for the Convert to Project dialog
  const convertDialogLines = allLines.filter(line => !line.deletedAt).map(line => ({
    id: line.id,
    productId: line.productId || null,
    productName: line.productName || null,
    chargeCode: line.chargeCode || null,
    chargeBasis: line.chargeBasis || null,
    containerType: line.containerType || null,
    currencyCode: line.currencyCode,
    rate: line.rate,
    buyPrice: line.buyPrice,
    sellPrice: line.sellPrice,
    isEnabled: line.isEnabled,
    originLocationId: null,
    destinationLocationId: null,
  }))

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
    rfq: offer.rfq ? {
      id: offer.rfq.id,
      title: offer.rfq.title,
      origin: offer.rfq.origin,
      destination: offer.rfq.destination,
      companyName: offer.rfq.companyName,
      contractorId: offer.rfq.contractorId ?? null,
      contactPerson: offer.rfq.contactPerson,
      contactPersonId: offer.rfq.contactPersonId ?? null,
      containerCount: offer.rfq.containerCount,
      direction: offer.rfq.direction,
      transportMode: offer.rfq.transportMode,
      cargoType: offer.rfq.cargoType,
    } : null,
    calculations: calculationsResponse,
    convertDialogData: {
      locations: [],
      lines: convertDialogLines,
      defaultOriginLocationId: null,
      defaultDestinationLocationId: null,
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
    const { result } = await commandBus.execute('fms_offers.offers.update', {
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
        resourceKind: 'fms_offers.offer',
        resourceId: id,
      },
    })

    // Reload offer for response
    const em = container.resolve('em') as EntityManager
    const updated = await em.findOne(FmsOffer, { id: (result as { offerId: string }).offerId })

    // Fetch guardians separately (module isomorphism - no direct User relationship)
    const guardianIdsPut = [updated?.operationalGuardianId, updated?.businessGuardianId].filter(Boolean) as string[]
    const guardianUsersPut = guardianIdsPut.length > 0
      ? await em.find('User' as any, { id: { $in: guardianIdsPut } })
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
    await commandBus.execute('fms_offers.offers.delete', {
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
        resourceKind: 'fms_offers.offer',
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
  GET: { requireAuth: true, requireFeatures: ['fms_offers.offers.view'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_offers.offers.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_offers.offers.manage'] },
}
