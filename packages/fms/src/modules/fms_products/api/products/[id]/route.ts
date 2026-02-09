import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FmsProduct } from '../../../data/entities'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
// Import to register commands
import '../../../commands'

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  chargeCodeId: z.string().uuid().optional().nullable(),
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

  if (tenantId) {
    filters.tenantId = tenantId
  }

  if (allowedOrgIds.size) {
    filters.organizationId = { $in: [...allowedOrgIds] }
  }

  const product = await em.findOne(FmsProduct, filters, {
    populate: ['chargeCode'],
  })

  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  const chargeCode = product.chargeCode

  return NextResponse.json({
    id: product.id,
    name: product.name,
    chargeCodeCode: chargeCode?.code || null,
    chargeCodeName: chargeCode?.description || chargeCode?.code || null,
    chargeCodeId: chargeCode?.id || null,
    chargeUnit: chargeCode?.chargeUnit || null,
    isActive: product.isActive,
    createdAt: product.createdAt?.toISOString() || null,
    updatedAt: product.updatedAt?.toISOString() || null,
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
        isActive?: boolean
        updatedBy?: string | null
      },
      { id: string }
    >('fms_products.products.update', {
      input: {
        id,
        name: parse.data.name,
        chargeCodeId: parse.data.chargeCodeId,
        isActive: parse.data.isActive,
        updatedBy: typeof auth.userId === 'string' ? auth.userId : null,
      },
      ctx,
    })

    // Fetch updated product for response
    const em = container.resolve('em') as EntityManager
    const product = await em.findOne(FmsProduct, { id: result.id }, { populate: ['chargeCode'] })

    return NextResponse.json({
      id: result.id,
      name: product?.name ?? parse.data.name,
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
