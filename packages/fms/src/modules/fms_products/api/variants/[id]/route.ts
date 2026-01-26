import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FmsProductVariant, FmsPriceType } from '../../../data/entities'
import { Contractor } from '../../../../contractors/data/entities'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
// Import to register commands
import '../../../commands'

const updateVariantSchema = z.object({
  providerId: z.string().uuid().optional().nullable(),
  priceTypeId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().optional(),
  containerSize: z.string().max(20).optional().nullable(),
  // Flattened pricing fields
  validityStart: z.coerce.date().optional().nullable(),
  validityEnd: z.coerce.date().optional().nullable(),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Price must be a valid decimal').optional().nullable(),
  currencyCode: z.string().length(3).regex(/^[A-Z]{3}$/).optional(),
  reference: z.string().max(255).optional().nullable(),
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
    populate: ['provider', 'priceType'],
  })

  if (!variant) {
    return NextResponse.json({ error: 'Variant not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: variant.id,
    providerId: variant.provider?.id || null,
    providerName: variant.provider?.name || variant.provider?.shortName || null,
    priceTypeId: variant.priceType?.id || null,
    priceTypeCode: variant.priceType?.code || null,
    priceTypeName: variant.priceType?.name || null,
    isActive: variant.isActive,
    containerSize: variant.containerSize || null,
    // Flattened pricing fields
    validityStart: variant.validityStart?.toISOString() || null,
    validityEnd: variant.validityEnd?.toISOString() || null,
    price: variant.price,
    currencyCode: variant.currencyCode,
    reference: variant.reference,
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
    const { result } = await bus.execute('fms_products.variants.update', {
      input: {
        id,
        providerId: parse.data.providerId,
        priceTypeId: parse.data.priceTypeId,
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
    const em = container.resolve('em') as EntityManager
    const variant = await em.findOne(FmsProductVariant, { id: (result as { id: string }).id }, {
      populate: ['provider', 'priceType'],
    })

    if (!variant) {
      return NextResponse.json({ id: (result as { id: string }).id })
    }

    return NextResponse.json({
      id: variant.id,
      providerId: variant.provider?.id || null,
      providerName: variant.provider?.name || variant.provider?.shortName || null,
      priceTypeId: variant.priceType?.id || null,
      priceTypeCode: variant.priceType?.code || null,
      priceTypeName: variant.priceType?.name || null,
      isActive: variant.isActive,
      containerSize: variant.containerSize || null,
      validityStart: variant.validityStart?.toISOString() || null,
      validityEnd: variant.validityEnd?.toISOString() || null,
      price: variant.price,
      currencyCode: variant.currencyCode,
      reference: variant.reference,
      updatedAt: variant.updatedAt?.toISOString(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update variant'
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
    await bus.execute('fms_products.variants.delete', {
      input: { id },
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
