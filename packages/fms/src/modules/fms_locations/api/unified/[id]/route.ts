import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsLocation } from '../../../data/entities'
import { updateLocationSchema } from '../../../data/validators'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
// Import to register commands
import '../../../commands'

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

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_locations.ports.view'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_locations.ports.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_locations.ports.manage'] },
}

export async function GET(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parse = paramsSchema.safeParse({ id: ctx.params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid location id' }, { status: 400 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)
  const filters: Record<string, unknown> = {
    id: parse.data.id,
    deletedAt: null,
    ...scopeFilters,
  }

  const location = await em.findOne(FmsLocation, filters)

  if (!location) return NextResponse.json({ error: 'Location not found' }, { status: 404 })

  return NextResponse.json({
    id: location.id,
    code: location.code,
    name: location.name,
    type: location.type,
    locode: location.locode,
    portId: location.portId,
    lat: location.lat,
    lng: location.lng,
    city: location.city,
    country: location.country,
    contractorId: location.contractorId,
    addressLine1: location.addressLine1,
    addressLine2: location.addressLine2,
    state: location.state,
    postalCode: location.postalCode,
    isPrimary: location.isPrimary,
    isActive: location.isActive,
    googlePlaceId: location.googlePlaceId,
    createdAt: location.createdAt,
    updatedAt: location.updatedAt,
  })
}

export async function PUT(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parse = paramsSchema.safeParse({ id: ctx.params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid location id' }, { status: 400 })

  const body = await req.json()
  const updateSchema = updateLocationSchema.omit({ id: true, updatedBy: true })
  const validation = updateSchema.safeParse(body)
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
    const { result } = await bus.execute<Record<string, unknown>, { id: string }>(
      'fms_locations.unified.update',
      {
        input: {
          id: parse.data.id,
          ...validation.data,
        },
        ctx: runtimeCtx,
      }
    )

    // Fetch updated location to return
    const em = container.resolve('em') as EntityManager
    const location = await em.findOne(FmsLocation, { id: result.id })

    if (!location) {
      return NextResponse.json({ error: 'Location not found after update' }, { status: 404 })
    }

    return NextResponse.json({
      id: location.id,
      code: location.code,
      name: location.name,
      type: location.type,
      locode: location.locode,
      portId: location.portId,
      lat: location.lat,
      lng: location.lng,
      city: location.city,
      country: location.country,
      contractorId: location.contractorId,
      addressLine1: location.addressLine1,
      addressLine2: location.addressLine2,
      state: location.state,
      postalCode: location.postalCode,
      isPrimary: location.isPrimary,
      isActive: location.isActive,
      googlePlaceId: location.googlePlaceId,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update location'
    const status = message.includes('not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parse = paramsSchema.safeParse({ id: ctx.params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid location id' }, { status: 400 })

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
    await bus.execute<{ id: string }, { id: string }>('fms_locations.unified.delete', {
      input: { id: parse.data.id },
      ctx: runtimeCtx,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete location'
    const status = message.includes('not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
