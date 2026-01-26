import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FmsProduct, FmsProductVariant, FmsPriceType } from '../../../../data/entities'
import { Contractor } from '../../../../../contractors/data/entities'

/**
 * GET: List all variants for a product
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: productId } = await params
  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const em = container.resolve('em') as EntityManager

  const tenantId = auth.actorTenantId || auth.tenantId

  if (!tenantId) {
    return NextResponse.json({ error: 'Missing tenant context' }, { status: 400 })
  }

  // Build filters for product lookup
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

  const productFilters: Record<string, unknown> = {
    id: productId,
    deletedAt: null,
  }
  if (tenantId) productFilters.tenantId = tenantId
  if (allowedOrgIds.size) productFilters.organizationId = { $in: [...allowedOrgIds] }

  // Load product with variants
  const product = await em.findOne(
    FmsProduct,
    productFilters,
    {
      populate: ['chargeCode', 'carrier', 'variants', 'variants.provider', 'variants.priceType'],
    }
  )

  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  // Map variants with flattened pricing
  const variants = product.variants.getItems()
    .filter((v) => !v.deletedAt)
    .map((variant) => ({
      id: variant.id,
      providerId: variant.provider?.id || null,
      providerName: variant.provider?.name || variant.provider?.shortName || null,
      priceTypeId: variant.priceType?.id || null,
      priceTypeCode: variant.priceType?.code || null,
      priceTypeName: variant.priceType?.name || null,
      isActive: variant.isActive,
      containerSize: variant.containerSize || null,
      // Pricing fields (flattened)
      validityStart: variant.validityStart || null,
      validityEnd: variant.validityEnd || null,
      price: variant.price || null,
      currencyCode: variant.currencyCode,
      reference: variant.reference || null,
    }))

  return NextResponse.json({
    product: {
      id: product.id,
      name: product.name,
      productType: product.productType,
      chargeCodeId: product.chargeCode?.id || null,
      chargeCode: product.chargeCode?.code || null,
      carrierId: product.carrier?.id || null,
      carrierName: product.carrier?.name || null,
      carrierCode: product.carrier?.code || null,
    },
    variants,
  })
}

const createVariantSchema = z.object({
  providerId: z.string().uuid().optional().nullable(),
  priceTypeId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().optional().default(true),
  containerSize: z.string().max(20).optional().nullable(),
  // Pricing fields
  validityStart: z.coerce.date().optional().nullable(),
  validityEnd: z.coerce.date().optional().nullable(),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Price must be a valid decimal').optional().nullable(),
  currencyCode: z.string().length(3).regex(/^[A-Z]{3}$/).optional().default('USD'),
  reference: z.string().max(255).optional().nullable(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: productId } = await params
  const body = await request.json()
  const parse = createVariantSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parse.error },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const em = container.resolve('em') as EntityManager

  const tenantId = auth.actorTenantId || auth.tenantId
  const organizationId = auth.actorOrgId || auth.orgId

  if (!tenantId || !organizationId) {
    return NextResponse.json({ error: 'Missing tenant or organization context' }, { status: 400 })
  }

  // Build filters for product lookup
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

  const productFilters: Record<string, unknown> = {
    id: productId,
    deletedAt: null,
  }
  if (tenantId) productFilters.tenantId = tenantId
  if (allowedOrgIds.size) productFilters.organizationId = { $in: [...allowedOrgIds] }

  // Verify product exists
  const product = await em.findOne(FmsProduct, productFilters)
  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  // Load provider if specified
  let provider: Contractor | null = null
  if (parse.data.providerId) {
    provider = await em.findOne(Contractor, { id: parse.data.providerId })
    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
    }
  }

  // Load price type if specified
  let priceType: FmsPriceType | null = null
  if (parse.data.priceTypeId) {
    priceType = await em.findOne(FmsPriceType, { id: parse.data.priceTypeId, deletedAt: null })
    if (!priceType) {
      return NextResponse.json({ error: 'Price type not found' }, { status: 404 })
    }
  }

  // Create variant with flattened pricing
  const variant = new FmsProductVariant()
  variant.organizationId = organizationId as string
  variant.tenantId = tenantId as string
  variant.product = product
  variant.isActive = parse.data.isActive ?? true
  variant.containerSize = parse.data.containerSize ?? null
  variant.createdBy = typeof auth.userId === 'string' ? auth.userId : null

  if (provider) {
    variant.provider = provider
  }
  if (priceType) {
    variant.priceType = priceType
  }

  // Pricing fields
  variant.validityStart = parse.data.validityStart ?? null
  variant.validityEnd = parse.data.validityEnd ?? null
  variant.price = parse.data.price ?? null
  variant.currencyCode = parse.data.currencyCode ?? 'USD'
  variant.reference = parse.data.reference ?? null

  await em.persistAndFlush(variant)

  return NextResponse.json({
    id: variant.id,
    providerId: variant.provider?.id || null,
    providerName: variant.provider?.name || variant.provider?.shortName || null,
    priceTypeId: variant.priceType?.id || null,
    priceTypeCode: variant.priceType?.code || null,
    isActive: variant.isActive,
    containerSize: variant.containerSize || null,
    validityStart: variant.validityStart || null,
    validityEnd: variant.validityEnd || null,
    price: variant.price || null,
    currencyCode: variant.currencyCode,
    reference: variant.reference || null,
  })
}

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_products.products.view'] },
  POST: { requireAuth: true, requireFeatures: ['fms_products.products.manage'] },
}
