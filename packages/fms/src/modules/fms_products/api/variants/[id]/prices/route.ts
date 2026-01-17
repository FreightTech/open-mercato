import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@/lib/di/container'
import { getAuthFromRequest } from '@/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import {
  FmsProductVariant,
  FmsProductPrice,
} from '../../../../data/entities'

const createPriceSchema = z.object({
  validityStart: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  validityEnd: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional().nullable(),
  contractType: z.enum(['SPOT', 'NAC', 'BASKET']),
  contractNumber: z.string().max(100).optional().nullable(),
  price: z.number().or(z.string()),
  currencyCode: z.string().length(3).optional().default('USD'),
  isActive: z.boolean().optional().default(true),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: variantId } = await params
  const body = await request.json()
  const parse = createPriceSchema.safeParse(body)

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

  // Build filters for variant lookup
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

  const variantFilters: Record<string, unknown> = {
    id: variantId,
    deletedAt: null,
  }
  if (tenantId) variantFilters.tenantId = tenantId
  if (allowedOrgIds.size) variantFilters.organizationId = { $in: [...allowedOrgIds] }

  // Verify variant exists
  const variant = await em.findOne(FmsProductVariant, variantFilters)
  if (!variant) {
    return NextResponse.json({ error: 'Variant not found' }, { status: 404 })
  }

  // Create price
  const price = new FmsProductPrice()
  price.organizationId = organizationId as string
  price.tenantId = tenantId as string
  price.variant = variant
  price.validityStart = new Date(parse.data.validityStart)
  price.validityEnd = parse.data.validityEnd ? new Date(parse.data.validityEnd) : null
  price.contractType = parse.data.contractType
  price.contractNumber = parse.data.contractNumber ?? null
  price.price = String(parse.data.price)
  price.currencyCode = parse.data.currencyCode || 'USD'
  price.isActive = parse.data.isActive ?? true
  price.createdBy = typeof auth.userId === 'string' ? auth.userId : null

  await em.persistAndFlush(price)

  return NextResponse.json({
    id: price.id,
    variantId: variant.id,
    validityStart: price.validityStart.toISOString(),
    validityEnd: price.validityEnd?.toISOString() || null,
    contractType: price.contractType,
    contractNumber: price.contractNumber,
    price: price.price,
    currencyCode: price.currencyCode,
    isActive: price.isActive,
    createdAt: price.createdAt.toISOString(),
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: variantId } = await params

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

  const variantFilters: Record<string, unknown> = {
    id: variantId,
    deletedAt: null,
  }
  if (tenantId) variantFilters.tenantId = tenantId
  if (allowedOrgIds.size) variantFilters.organizationId = { $in: [...allowedOrgIds] }

  const variant = await em.findOne(FmsProductVariant, variantFilters, {
    populate: ['prices'],
  })

  if (!variant) {
    return NextResponse.json({ error: 'Variant not found' }, { status: 404 })
  }

  const prices = variant.prices.isInitialized()
    ? variant.prices.getItems().filter((p) => !p.deletedAt)
    : []

  return NextResponse.json({
    variantId: variant.id,
    prices: prices.map((p) => ({
      id: p.id,
      validityStart: p.validityStart?.toISOString() || null,
      validityEnd: p.validityEnd?.toISOString() || null,
      contractType: p.contractType,
      contractNumber: p.contractNumber,
      price: p.price,
      currencyCode: p.currencyCode,
      isActive: p.isActive,
      createdAt: p.createdAt?.toISOString() || null,
      updatedAt: p.updatedAt?.toISOString() || null,
    })),
  })
}

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_products.products.view'] },
  POST: { requireAuth: true, requireFeatures: ['fms_products.products.manage'] },
}
