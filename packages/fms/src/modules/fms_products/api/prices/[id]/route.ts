import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@/lib/di/container'
import { getAuthFromRequest } from '@/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FmsProductPrice } from '../../../data/entities'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
// Import to register commands
import '../../../commands'

const updatePriceSchema = z.object({
  validityStart: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  validityEnd: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional().nullable(),
  contractType: z.enum(['SPOT', 'NAC', 'BASKET']).optional(),
  contractNumber: z.string().max(100).optional().nullable(),
  price: z.number().or(z.string()).optional(),
  currencyCode: z.string().length(3).optional(),
  isActive: z.boolean().optional(),
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

  const price = await em.findOne(FmsProductPrice, filters, {
    populate: ['variant'],
  })

  if (!price) {
    return NextResponse.json({ error: 'Price not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: price.id,
    variantId: price.variant.id,
    validityStart: price.validityStart?.toISOString() || null,
    validityEnd: price.validityEnd?.toISOString() || null,
    contractType: price.contractType,
    contractNumber: price.contractNumber,
    price: price.price,
    currencyCode: price.currencyCode,
    isActive: price.isActive,
    createdAt: price.createdAt?.toISOString() || null,
    updatedAt: price.updatedAt?.toISOString() || null,
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
  const parse = updatePriceSchema.safeParse(body)

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
    const { result } = await bus.execute('fms_products.prices.update', {
      input: {
        id,
        validityStart: parse.data.validityStart ? new Date(parse.data.validityStart) : undefined,
        validityEnd: parse.data.validityEnd ? new Date(parse.data.validityEnd) : parse.data.validityEnd,
        contractType: parse.data.contractType,
        contractNumber: parse.data.contractNumber,
        price: parse.data.price !== undefined ? String(parse.data.price) : undefined,
        currencyCode: parse.data.currencyCode,
        isActive: parse.data.isActive,
        updatedBy: typeof auth.userId === 'string' ? auth.userId : null,
      },
      ctx,
    })

    // Fetch updated price for response
    const em = container.resolve('em') as EntityManager
    const price = await em.findOne(FmsProductPrice, { id: (result as { id: string }).id })

    if (!price) {
      return NextResponse.json({ id: (result as { id: string }).id })
    }

    return NextResponse.json({
      id: price.id,
      validityStart: price.validityStart?.toISOString() || null,
      validityEnd: price.validityEnd?.toISOString() || null,
      contractType: price.contractType,
      contractNumber: price.contractNumber,
      price: price.price,
      currencyCode: price.currencyCode,
      isActive: price.isActive,
      updatedAt: price.updatedAt?.toISOString(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update price'
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
    await bus.execute('fms_products.prices.delete', {
      input: { id },
      ctx,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete price'
    const status = message.includes('not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_products.products.view'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_products.products.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_products.products.manage'] },
}
