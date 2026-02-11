import { NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FrcAirport } from '../../../data/entities'
import { updateAirportSchema } from '../../../data/validators'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['frc_airports.view'] },
  PUT: { requireAuth: true, requireFeatures: ['frc_airports.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['frc_airports.manage'] },
}

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
    deletedAt: null,
    ...scopeFilters,
  }

  const airport = await em.findOne(FrcAirport, filters)

  if (!airport) return NextResponse.json({ error: 'Airport not found' }, { status: 404 })

  return NextResponse.json({
    id: airport.id,
    code: airport.code,
    longCode: airport.longCode,
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
  const validation = updateAirportSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid input', details: validation.error }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)
  const filters: Record<string, unknown> = {
    id: parse.data.id,
    deletedAt: null,
    ...scopeFilters,
  }

  const airport = await em.findOne(FrcAirport, filters)

  if (!airport) return NextResponse.json({ error: 'Airport not found' }, { status: 404 })

  // Update fields
  if (validation.data.code !== undefined) airport.code = validation.data.code
  if (validation.data.longCode !== undefined) airport.longCode = validation.data.longCode
  if (validation.data.city !== undefined) airport.city = validation.data.city ?? null
  if (validation.data.country !== undefined) airport.country = validation.data.country ?? null
  if (validation.data.isActive !== undefined) airport.isActive = validation.data.isActive

  airport.updatedAt = new Date()

  await em.flush()

  return NextResponse.json({
    id: airport.id,
    code: airport.code,
    longCode: airport.longCode,
    city: airport.city ?? null,
    country: airport.country ?? null,
    isActive: airport.isActive,
  })
}

export async function DELETE(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
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
    deletedAt: null,
    ...scopeFilters,
  }

  const airport = await em.findOne(FrcAirport, filters)

  if (!airport) return NextResponse.json({ error: 'Airport not found' }, { status: 404 })

  // Soft delete
  airport.deletedAt = new Date()
  await em.flush()

  return NextResponse.json({ success: true })
}
