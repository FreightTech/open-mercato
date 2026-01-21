import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsChargeCode } from '../../../data/entities'
import { updateChargeCodeSchema } from '../../../data/validators'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
// Import to register commands
import '../../../commands'

const updateBodySchema = updateChargeCodeSchema.omit({ updatedBy: true })

const paramsSchema = z.object({
  id: z.string().uuid(),
})

function buildScopeFilters(
  auth: { tenantId?: string | null; orgId?: string | null },
  scope: { tenantId?: string | null; selectedId?: string | null; filterIds?: string[] | null } | null
): { tenantId?: string; organizationId?: { $in: string[] } } {
  const filters: { tenantId?: string; organizationId?: { $in: string[] } } = {}

  if (typeof auth.tenantId === 'string') {
    filters.tenantId = auth.tenantId
  }

  const allowedOrgIds = new Set<string>()
  const filterIds = scope?.filterIds
  if (Array.isArray(filterIds) && filterIds.length > 0) {
    filterIds.forEach((id) => {
      if (typeof id === 'string') allowedOrgIds.add(id)
    })
  } else {
    const fallbackOrgId = scope?.selectedId ?? auth.orgId
    if (typeof fallbackOrgId === 'string') {
      allowedOrgIds.add(fallbackOrgId)
    }
  }

  if (allowedOrgIds.size > 0) {
    filters.organizationId = { $in: [...allowedOrgIds] }
  }

  return filters
}

export async function GET(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parse = paramsSchema.safeParse({ id: ctx.params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid charge code id' }, { status: 400 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)
  const filters: Record<string, unknown> = {
    id: parse.data.id,
    deletedAt: null,
    ...scopeFilters,
  }

  const chargeCode = await em.findOne(FmsChargeCode, filters)

  if (!chargeCode) return NextResponse.json({ error: 'Charge code not found' }, { status: 404 })

  return NextResponse.json(chargeCode)
}

export async function PUT(req: Request, routeCtx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parse = paramsSchema.safeParse({ id: routeCtx.params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid charge code id' }, { status: 400 })

  const body = await req.json()
  const validation = updateBodySchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid input', details: validation.error }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })

  const organizationId = auth.actorOrgId || auth.orgId

  const ctx: CommandRuntimeContext = {
    container,
    auth,
    organizationScope: scope,
    selectedOrganizationId: organizationId as string,
    organizationIds: scope?.filterIds ?? null,
    request: req,
  }

  const bus = new CommandBus()

  try {
    const { result } = await bus.execute('fms_products.charge_codes.update', {
      input: {
        id: parse.data.id,
        description: validation.data.description,
        chargeUnit: validation.data.chargeUnit,
        fieldSchema: validation.data.fieldSchema,
        isActive: validation.data.isActive,
        updatedBy: typeof auth.userId === 'string' ? auth.userId : null,
      },
      ctx,
    })

    // Fetch updated charge code for response
    const em = container.resolve('em') as EntityManager
    const chargeCode = await em.findOne(FmsChargeCode, { id: (result as { id: string }).id })

    return NextResponse.json(chargeCode)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update charge code'
    const status = message.includes('not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(req: Request, routeCtx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parse = paramsSchema.safeParse({ id: routeCtx.params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid charge code id' }, { status: 400 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })

  const organizationId = auth.actorOrgId || auth.orgId

  const ctx: CommandRuntimeContext = {
    container,
    auth,
    organizationScope: scope,
    selectedOrganizationId: organizationId as string,
    organizationIds: scope?.filterIds ?? null,
    request: req,
  }

  const bus = new CommandBus()

  try {
    await bus.execute('fms_products.charge_codes.delete', {
      input: { id: parse.data.id },
      ctx,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete charge code'
    const status = message.includes('not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_products.charge_codes.view'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_products.charge_codes.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_products.charge_codes.manage'] },
}
