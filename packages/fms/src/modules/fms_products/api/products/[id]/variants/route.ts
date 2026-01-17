import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@/lib/di/container'
import { getAuthFromRequest } from '@/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FmsProduct, FmsProductVariant } from '../../../../data/entities'
import { Contractor } from '../../../../../contractors/data/entities'
import { getVariantTypeFromProductType } from '../../../../lib/productFactory'

const createVariantSchema = z.object({
  variantType: z.enum(['container', 'simple']).optional(),
  name: z.string().max(255).optional().nullable(),
  providerId: z.string().uuid().optional().nullable(),
  isDefault: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  // Container variant fields
  containerSize: z.string().max(20).optional(),
  containerType: z.string().max(50).optional().nullable(),
  weightLimit: z.number().positive().optional().nullable(),
  weightUnit: z.string().max(10).optional().nullable(),
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

  // Determine variant type based on product type or explicit request
  const variantType = parse.data.variantType || getVariantTypeFromProductType(product.productType)

  // Load provider if specified
  let provider: Contractor | null = null
  if (parse.data.providerId) {
    provider = await em.findOne(Contractor, { id: parse.data.providerId })
    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
    }
  }

  // Create variant
  const variant = new FmsProductVariant()
  variant.organizationId = organizationId as string
  variant.tenantId = tenantId as string
  variant.product = product
  variant.variantType = variantType
  variant.name = parse.data.name ?? null
  variant.isDefault = parse.data.isDefault ?? false
  variant.isActive = parse.data.isActive ?? true
  variant.createdBy = typeof auth.userId === 'string' ? auth.userId : null

  if (provider) {
    variant.provider = provider
  }

  // Container-specific fields
  if (variantType === 'container') {
    variant.containerSize = parse.data.containerSize || '40HC'
    variant.containerType = parse.data.containerType ?? null
    variant.weightLimit = parse.data.weightLimit ?? null
    variant.weightUnit = parse.data.weightUnit ?? null
  }

  await em.persistAndFlush(variant)

  return NextResponse.json({
    id: variant.id,
    variantType: variant.variantType,
    name: variant.name,
    providerId: variant.provider?.id || null,
    providerName: variant.provider?.name || variant.provider?.shortName || null,
    isDefault: variant.isDefault,
    isActive: variant.isActive,
    containerSize: variant.containerSize || null,
    containerType: variant.containerType || null,
    weightLimit: variant.weightLimit || null,
    weightUnit: variant.weightUnit || null,
  })
}

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['fms_products.products.manage'] },
}
