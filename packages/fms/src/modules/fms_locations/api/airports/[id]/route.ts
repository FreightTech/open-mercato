import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsLocation } from '../../../data/entities'
import { updateAirportSchema } from '../../../data/validators'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
// Import to register commands
import '../../../commands'

const updateBodySchema = updateAirportSchema.omit({ updatedBy: true })

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

export async function GET(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid airport id' }, { status: 400 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)
  const filters: Record<string, unknown> = {
    id: parse.data.id,
    type: 'airport',
    deletedAt: null,
    ...scopeFilters,
  }

  const airport = await em.findOne(FmsLocation, filters)

  if (!airport) return NextResponse.json({ error: 'Airport not found' }, { status: 404 })

  return NextResponse.json({
    id: airport.id,
    code: airport.code,
    name: airport.name,
    lat: airport.lat ?? null,
    lng: airport.lng ?? null,
    city: airport.city ?? null,
    country: airport.country ?? null,
    isActive: airport.isActive,
    organizationId: airport.organizationId,
    tenantId: airport.tenantId,
    createdAt: airport.createdAt,
    updatedAt: airport.updatedAt,
  })
}

export async function PUT(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid airport id' }, { status: 400 })

  const body = await req.json()
  const validation = updateBodySchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid input', details: validation.error }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })

  const organizationId = auth.actorOrgId || auth.orgId

  const runtimeCtx: CommandRuntimeContext = {
    container,
    auth,
    organizationScope: scope,
    selectedOrganizationId: organizationId as string,
    organizationIds: scope?.filterIds ?? null,
    request: req,
  }

  const bus = new CommandBus()

  try {
    const { result } = await bus.execute<
      {
        id: string
        code?: string | null
        name?: string
        lat?: number | null
        lng?: number | null
        city?: string | null
        country?: string | null
        isActive?: boolean
      },
      { id: string }
    >('fms_locations.airports.update', {
      input: {
        id: parse.data.id,
        ...validation.data,
      },
      ctx: runtimeCtx,
    })

    // Fetch updated airport to return
    const em = container.resolve('em') as EntityManager
    const airport = await em.findOne(FmsLocation, { id: result.id })

    return NextResponse.json(airport)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update airport'
    const status = message.includes('not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid airport id' }, { status: 400 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })

  const organizationId = auth.actorOrgId || auth.orgId

  const runtimeCtx: CommandRuntimeContext = {
    container,
    auth,
    organizationScope: scope,
    selectedOrganizationId: organizationId as string,
    organizationIds: scope?.filterIds ?? null,
    request: req,
  }

  const bus = new CommandBus()

  try {
    await bus.execute<{ id: string }, { id: string }>('fms_locations.airports.delete', {
      input: { id: parse.data.id },
      ctx: runtimeCtx,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete airport'
    const status = message.includes('not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_locations.airports.view'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_locations.airports.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_locations.airports.manage'] },
}
