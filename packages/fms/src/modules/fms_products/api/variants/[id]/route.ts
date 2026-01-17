import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@/lib/di/container'
import { getAuthFromRequest } from '@/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FmsProductVariant } from '../../../data/entities'
import { Contractor } from '../../../../contractors/data/entities'

const updateVariantSchema = z.object({
  name: z.string().max(255).optional().nullable(),
  providerId: z.string().uuid().optional().nullable(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  // Container variant fields
  containerSize: z.string().max(20).optional(),
  containerType: z.string().max(50).optional().nullable(),
  weightLimit: z.number().positive().optional().nullable(),
  weightUnit: z.string().max(10).optional().nullable(),
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
  if (tenantId) filters.tenantId = tenantId
  if (allowedOrgIds.size) filters.organizationId = { $in: [...allowedOrgIds] }

  const variant = await em.findOne(FmsProductVariant, filters, {
    populate: ['provider', 'prices'],
  })

  if (!variant) {
    return NextResponse.json({ error: 'Variant not found' }, { status: 404 })
  }

  const prices = variant.prices.isInitialized()
    ? variant.prices.getItems().filter((p) => !p.deletedAt)
    : []

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
    prices: prices.map((p) => ({
      id: p.id,
      validityStart: p.validityStart?.toISOString() || null,
      validityEnd: p.validityEnd?.toISOString() || null,
      contractType: p.contractType,
      contractNumber: p.contractNumber,
      price: p.price,
      currencyCode: p.currencyCode,
      isActive: p.isActive,
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
  const parse = updateVariantSchema.safeParse(body)

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
  if (tenantId) filters.tenantId = tenantId
  if (allowedOrgIds.size) filters.organizationId = { $in: [...allowedOrgIds] }

  const variant = await em.findOne(FmsProductVariant, filters, {
    populate: ['provider'],
  })

  if (!variant) {
    return NextResponse.json({ error: 'Variant not found' }, { status: 404 })
  }

  // Apply updates
  if (parse.data.name !== undefined) {
    variant.name = parse.data.name
  }
  if (parse.data.isDefault !== undefined) {
    variant.isDefault = parse.data.isDefault
  }
  if (parse.data.isActive !== undefined) {
    variant.isActive = parse.data.isActive
  }

  // Update provider if specified
  if (parse.data.providerId !== undefined) {
    if (parse.data.providerId === null) {
      variant.provider = null
    } else {
      const provider = await em.findOne(Contractor, { id: parse.data.providerId })
      if (!provider) {
        return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
      }
      variant.provider = provider
    }
  }

  // Container-specific updates (for container variants)
  if (variant.variantType === 'container') {
    if (parse.data.containerSize !== undefined) {
      variant.containerSize = parse.data.containerSize
    }
    if (parse.data.containerType !== undefined) {
      variant.containerType = parse.data.containerType
    }
    if (parse.data.weightLimit !== undefined) {
      variant.weightLimit = parse.data.weightLimit
    }
    if (parse.data.weightUnit !== undefined) {
      variant.weightUnit = parse.data.weightUnit
    }
  }

  variant.updatedBy = typeof auth.userId === 'string' ? auth.userId : null
  variant.updatedAt = new Date()

  await em.flush()

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
    updatedAt: variant.updatedAt.toISOString(),
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
  if (tenantId) filters.tenantId = tenantId
  if (allowedOrgIds.size) filters.organizationId = { $in: [...allowedOrgIds] }

  const variant = await em.findOne(FmsProductVariant, filters)

  if (!variant) {
    return NextResponse.json({ error: 'Variant not found' }, { status: 404 })
  }

  // Soft delete
  variant.deletedAt = new Date()
  variant.updatedBy = typeof auth.userId === 'string' ? auth.userId : null

  await em.flush()

  return NextResponse.json({ success: true })
}

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_products.products.view'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_products.products.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_products.products.manage'] },
}
