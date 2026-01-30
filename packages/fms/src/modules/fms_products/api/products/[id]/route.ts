import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FmsProduct, FmsProductVariant } from '../../../data/entities'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
// Import to register commands
import '../../../commands'

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  chargeCodeId: z.string().uuid().optional().nullable(),
  carrierId: z.string().uuid().optional().nullable(),
  internalNotes: z.string().max(5000).optional().nullable(),
  isActive: z.boolean().optional(),
  description: z.string().max(2000).optional().nullable(),
  // Type-specific fields
  loop: z.string().optional().nullable(),
  sourceId: z.string().uuid().optional().nullable(),
  destinationId: z.string().uuid().optional().nullable(),
  transitTime: z.number().int().positive().optional().nullable(),
  locationId: z.string().uuid().optional().nullable(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const em = container.resolve('em') as EntityManager

  const tenantId = auth.actorTenantId || auth.tenantId

  const allowedOrgIds = new Set<string>()
  if (scope?.filterIds?.length) {
    scope.filterIds.forEach((orgId) => {
      if (typeof orgId === 'string') allowedOrgIds.add(orgId)
    })
  } else if (typeof auth.actorOrgId === 'string') {
    allowedOrgIds.add(auth.actorOrgId)
  } else if (typeof auth.orgId === 'string') {
    allowedOrgIds.add(auth.orgId)
  }

  const filters: Record<string, unknown> = {
    id,
    deletedAt: null,
  }

  if (tenantId) {
    filters.tenantId = tenantId
  }

  if (allowedOrgIds.size) {
    filters.organizationId = { $in: [...allowedOrgIds] }
  }

  const product = await em.findOne(FmsProduct, filters, {
    populate: ['chargeCode', 'carrier', 'source', 'destination', 'location'],
  })

  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  // Explicitly query variants with proper filters to ensure correct scope
  const variantFilters: Record<string, unknown> = {
    product: product.id,
    deletedAt: null,
  }
  if (tenantId) {
    variantFilters.tenantId = tenantId
  }
  if (allowedOrgIds.size) {
    variantFilters.organizationId = { $in: [...allowedOrgIds] }
  }

  const variants = await em.find(FmsProductVariant, variantFilters, {
    populate: ['provider'],
    orderBy: { createdAt: 'ASC' },
  })

  const chargeCode = product.chargeCode
  const carrier = product.carrier
  const source = product.source
  const destination = product.destination
  const location = product.location

  // Helper to derive product type from charge code
  const deriveProductType = (code: string | null | undefined): string => {
    const systemTypes = ['GFRT', 'GBAF', 'GBAF_PIECE', 'GBOL', 'GTHC', 'GCUS']
    if (code && systemTypes.includes(code)) return code
    return 'CUSTOM'
  }

  return NextResponse.json({
    id: product.id,
    name: product.name,
    productType: deriveProductType(chargeCode?.code),
    chargeCodeCode: chargeCode?.code || null,
    chargeCodeName: chargeCode?.description || chargeCode?.code || null,
    chargeCodeId: chargeCode?.id || null,
    carrierName: carrier?.name || null,
    carrierCode: carrier?.code || null,
    carrierId: carrier?.id || null,
    internalNotes: product.internalNotes || null,
    isActive: product.isActive,
    createdAt: product.createdAt?.toISOString() || null,
    updatedAt: product.updatedAt?.toISOString() || null,
    // Type-specific fields
    loop: product.loop || null,
    transitTime: product.transitTime || null,
    description: product.description || null,
    // Location fields for GFRT products
    sourceId: source?.id || null,
    sourceName: source?.name || null,
    destinationId: destination?.id || null,
    destinationName: destination?.name || null,
    // Location field for GTHC products
    locationId: location?.id || null,
    locationName: location?.name || null,
    variants: variants.map((v) => {
      // Handle validityStart/validityEnd - may be Date objects or strings
      const formatDate = (val: unknown): string | null => {
        if (!val) return null
        if (val instanceof Date) return val.toISOString()
        if (typeof val === 'string') return val
        return null
      }

      return {
        id: v.id,
        containerSize: v.containerSize || null,
        providerId: v.provider?.id || null,
        providerName: v.provider?.name || v.provider?.shortName || null,
        isActive: v.isActive,
        price: v.price || null,
        currencyCode: v.currencyCode,
        validityStart: formatDate(v.validityStart),
        validityEnd: formatDate(v.validityEnd),
        reference: v.reference || null,
      }
    }),
  })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const parse = updateSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parse.error },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })

  const organizationId = auth.actorOrgId || auth.orgId

  const ctx: CommandRuntimeContext = {
    container,
    auth,
    organizationScope: scope,
    selectedOrganizationId: organizationId as string,
    organizationIds: scope?.filterIds ?? null,
    request,
  }

  const bus = new CommandBus()

  try {
    const { result } = await bus.execute<
      {
        id: string
        name?: string
        chargeCodeId?: string | null
        carrierId?: string | null
        internalNotes?: string | null
        isActive?: boolean
        loop?: string | null
        sourceId?: string | null
        destinationId?: string | null
        transitTime?: number | null
        locationId?: string | null
        description?: string | null
        updatedBy?: string | null
      },
      { id: string }
    >('fms_products.products.update', {
      input: {
        id,
        name: parse.data.name,
        chargeCodeId: parse.data.chargeCodeId,
        carrierId: parse.data.carrierId,
        internalNotes: parse.data.internalNotes,
        isActive: parse.data.isActive,
        loop: parse.data.loop,
        sourceId: parse.data.sourceId,
        destinationId: parse.data.destinationId,
        transitTime: parse.data.transitTime,
        locationId: parse.data.locationId,
        description: parse.data.description,
        updatedBy: typeof auth.userId === 'string' ? auth.userId : null,
      },
      ctx,
    })

    // Fetch updated product for response
    const em = container.resolve('em') as EntityManager
    const product = await em.findOne(FmsProduct, { id: result.id }, { populate: ['chargeCode'] })

    // Derive product type from charge code
    const chargeCodeValue = product?.chargeCode
      ? typeof product.chargeCode === 'string'
        ? null
        : product.chargeCode.code
      : null
    const systemTypes = ['GFRT', 'GBAF', 'GBAF_PIECE', 'GBOL', 'GTHC', 'GCUS']
    const productType = chargeCodeValue && systemTypes.includes(chargeCodeValue) ? chargeCodeValue : 'CUSTOM'

    return NextResponse.json({
      id: result.id,
      name: product?.name ?? parse.data.name,
      productType,
      isActive: product?.isActive,
      updatedAt: product?.updatedAt?.toISOString() ?? new Date().toISOString(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update product'
    const status = message.includes('not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })

  const organizationId = auth.actorOrgId || auth.orgId

  const ctx: CommandRuntimeContext = {
    container,
    auth,
    organizationScope: scope,
    selectedOrganizationId: organizationId as string,
    organizationIds: scope?.filterIds ?? null,
    request,
  }

  const bus = new CommandBus()

  try {
    await bus.execute<{ id: string }, { id: string }>('fms_products.products.delete', {
      input: { id },
      ctx,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete product'
    const status = message.includes('not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_products.products.view'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_products.products.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_products.products.manage'] },
}
