import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@/lib/di/container'
import { getAuthFromRequest } from '@/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FmsProduct } from '../../../data/entities'

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  internalNotes: z.string().max(5000).optional().nullable(),
  isActive: z.boolean().optional(),
  description: z.string().max(2000).optional().nullable(),
  // Type-specific fields
  loop: z.string().optional(),
  transitTime: z.number().int().positive().optional().nullable(),
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
    populate: ['chargeCode', 'serviceProvider', 'variants', 'variants.prices'],
  })

  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  const chargeCode = product.chargeCode
  const serviceProvider = product.serviceProvider
  const variants = product.variants.isInitialized() ? product.variants.getItems() : []

  return NextResponse.json({
    id: product.id,
    name: product.name,
    productType: product.productType,
    chargeCodeCode: chargeCode?.code || null,
    chargeCodeId: chargeCode?.id || null,
    serviceProviderName: serviceProvider?.name || serviceProvider?.shortName || null,
    serviceProviderId: serviceProvider?.id || null,
    internalNotes: product.internalNotes || null,
    isActive: product.isActive,
    createdAt: product.createdAt?.toISOString() || null,
    updatedAt: product.updatedAt?.toISOString() || null,
    // Type-specific fields
    loop: product.loop || null,
    transitTime: product.transitTime || null,
    description: product.description || null,
    variants: variants.map((v) => ({
      id: v.id,
      name: v.name,
      variantType: v.variantType,
      containerSize: v.containerSize || null,
      containerType: v.containerType || null,
      isDefault: v.isDefault,
      isActive: v.isActive,
      priceCount: v.prices.isInitialized() ? v.prices.count() : 0,
    })),
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

  const product = await em.findOne(FmsProduct, filters)

  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  // Apply updates
  if (parse.data.name !== undefined) {
    product.name = parse.data.name
  }
  if (parse.data.internalNotes !== undefined) {
    product.internalNotes = parse.data.internalNotes
  }
  if (parse.data.isActive !== undefined) {
    product.isActive = parse.data.isActive
  }
  if (parse.data.description !== undefined) {
    product.description = parse.data.description
  }

  // Type-specific updates (GFRT only)
  if (product.productType === 'GFRT') {
    if (parse.data.loop !== undefined) {
      product.loop = parse.data.loop
    }
    if (parse.data.transitTime !== undefined) {
      product.transitTime = parse.data.transitTime
    }
  }

  product.updatedBy = typeof auth.userId === 'string' ? auth.userId : null
  product.updatedAt = new Date()

  await em.flush()

  return NextResponse.json({
    id: product.id,
    name: product.name,
    productType: product.productType,
    isActive: product.isActive,
    updatedAt: product.updatedAt.toISOString(),
  })
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

  const product = await em.findOne(FmsProduct, filters)

  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  // Soft delete
  product.deletedAt = new Date()
  product.updatedBy = typeof auth.userId === 'string' ? auth.userId : null

  await em.flush()

  return NextResponse.json({ success: true })
}

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_products.products.view'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_products.products.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_products.products.manage'] },
}
