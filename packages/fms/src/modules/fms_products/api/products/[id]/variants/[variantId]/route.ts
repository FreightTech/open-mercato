import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FmsProduct, FmsProductVariant } from '../../../../../data/entities'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
// Import to register commands
import '../../../../../commands'

// Helper to format date values that may be Date objects or strings
const formatDate = (val: unknown): string | null => {
  if (!val) return null
  if (val instanceof Date) return val.toISOString()
  if (typeof val === 'string') return val
  return null
}

const updateSchema = z.object({
  providerId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().optional(),
  containerSize: z.string().max(20).optional().nullable(),
  validityStart: z.coerce.date().optional().nullable(),
  validityEnd: z.coerce.date().optional().nullable(),
  price: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Price must be a valid decimal')
    .optional()
    .nullable(),
  currencyCode: z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/)
    .optional(),
  reference: z.string().max(255).optional().nullable(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; variantId: string }> }
) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: productId, variantId } = await params

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

  // Verify product exists and belongs to tenant/org
  const productFilters: Record<string, unknown> = {
    id: productId,
    deletedAt: null,
  }

  if (tenantId) {
    productFilters.tenantId = tenantId
  }

  if (allowedOrgIds.size) {
    productFilters.organizationId = { $in: [...allowedOrgIds] }
  }

  const product = await em.findOne(FmsProduct, productFilters)
  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  // Find the variant
  const variant = await em.findOne(
    FmsProductVariant,
    {
      id: variantId,
      product,
      deletedAt: null,
    },
    {
      populate: ['provider'],
    }
  )

  if (!variant) {
    return NextResponse.json({ error: 'Variant not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: variant.id,
    productId: product.id,
    providerId: variant.provider?.id || null,
    providerName: variant.provider?.name || variant.provider?.shortName || null,
    isActive: variant.isActive,
    containerSize: variant.containerSize || null,
    validityStart: formatDate(variant.validityStart),
    validityEnd: formatDate(variant.validityEnd),
    price: variant.price || null,
    currencyCode: variant.currencyCode,
    reference: variant.reference || null,
    createdAt: formatDate(variant.createdAt),
    updatedAt: formatDate(variant.updatedAt),
  })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; variantId: string }> }
) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: productId, variantId } = await params
  const body = await request.json()

  // Handle the special case where the field name from flat view is "variantIsActive"
  // but the variant command expects "isActive"
  if ('variantIsActive' in body) {
    body.isActive = body.variantIsActive
    delete body.variantIsActive
  }

  const parse = updateSchema.safeParse(body)

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

  // Verify product exists and belongs to tenant/org
  const productFilters: Record<string, unknown> = {
    id: productId,
    deletedAt: null,
  }

  if (tenantId) {
    productFilters.tenantId = tenantId
  }

  if (allowedOrgIds.size) {
    productFilters.organizationId = { $in: [...allowedOrgIds] }
  }

  const product = await em.findOne(FmsProduct, productFilters)
  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  // Verify variant exists under this product
  const variant = await em.findOne(FmsProductVariant, {
    id: variantId,
    product,
    deletedAt: null,
  })
  if (!variant) {
    return NextResponse.json({ error: 'Variant not found' }, { status: 404 })
  }

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
        providerId?: string | null
        isActive?: boolean
        containerSize?: string | null
        validityStart?: Date | null
        validityEnd?: Date | null
        price?: string | null
        currencyCode?: string
        reference?: string | null
        updatedBy?: string | null
      },
      { id: string }
    >('fms_products.variants.update', {
      input: {
        id: variantId,
        providerId: parse.data.providerId,
        isActive: parse.data.isActive,
        containerSize: parse.data.containerSize,
        validityStart: parse.data.validityStart,
        validityEnd: parse.data.validityEnd,
        price: parse.data.price,
        currencyCode: parse.data.currencyCode,
        reference: parse.data.reference,
        updatedBy: typeof auth.userId === 'string' ? auth.userId : null,
      },
      ctx,
    })

    // Fetch updated variant for response
    const updatedVariant = await em.findOne(
      FmsProductVariant,
      { id: result.id },
      { populate: ['provider'] }
    )

    return NextResponse.json({
      id: result.id,
      productId,
      providerId: updatedVariant?.provider?.id || null,
      providerName: updatedVariant?.provider?.name || null,
      isActive: updatedVariant?.isActive,
      containerSize: updatedVariant?.containerSize || null,
      validityStart: formatDate(updatedVariant?.validityStart),
      validityEnd: formatDate(updatedVariant?.validityEnd),
      price: updatedVariant?.price || null,
      currencyCode: updatedVariant?.currencyCode,
      reference: updatedVariant?.reference || null,
      updatedAt: formatDate(updatedVariant?.updatedAt) ?? new Date().toISOString(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update variant'
    const status = message.includes('not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; variantId: string }> }
) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: productId, variantId } = await params

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

  // Verify product exists and belongs to tenant/org
  const productFilters: Record<string, unknown> = {
    id: productId,
    deletedAt: null,
  }

  if (tenantId) {
    productFilters.tenantId = tenantId
  }

  if (allowedOrgIds.size) {
    productFilters.organizationId = { $in: [...allowedOrgIds] }
  }

  const product = await em.findOne(FmsProduct, productFilters)
  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  // Verify variant exists under this product
  const variant = await em.findOne(FmsProductVariant, {
    id: variantId,
    product,
    deletedAt: null,
  })
  if (!variant) {
    return NextResponse.json({ error: 'Variant not found' }, { status: 404 })
  }

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
    await bus.execute<{ id: string }, { id: string }>('fms_products.variants.delete', {
      input: { id: variantId },
      ctx,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete variant'
    const status = message.includes('not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_products.products.view'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_products.products.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_products.products.manage'] },
}
