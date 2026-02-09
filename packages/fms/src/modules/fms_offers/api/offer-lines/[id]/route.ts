import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { FmsOfferLine } from '../../../data/entities'
import { fmsOfferLineUpdateSchema } from '../../../data/validators'

const paramsSchema = z.object({
  id: z.string().uuid(),
})

export async function GET(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parse = paramsSchema.safeParse({ id: ctx.params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid line id' }, { status: 400 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const filters: Record<string, unknown> = {
    id: parse.data.id,
    deletedAt: null,
  }

  const tenantId = auth.actorTenantId || auth.tenantId
  if (tenantId) {
    filters.tenantId = tenantId
  }

  const allowedOrgIds = new Set<string>()
  if (scope?.filterIds?.length) {
    scope.filterIds.forEach((id) => { if (typeof id === 'string') allowedOrgIds.add(id) })
  } else if (typeof auth.actorOrgId === 'string') {
    allowedOrgIds.add(auth.actorOrgId)
  } else if (typeof auth.orgId === 'string') {
    allowedOrgIds.add(auth.orgId)
  }

  if (allowedOrgIds.size) {
    filters.organizationId = { $in: [...allowedOrgIds] }
  }

  const line = await em.findOne(FmsOfferLine, filters)

  if (!line) return NextResponse.json({ error: 'Line not found' }, { status: 404 })

  return NextResponse.json(line)
}

export async function PUT(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parse = paramsSchema.safeParse({ id: ctx.params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid line id' }, { status: 400 })

  const body = await req.json()
  const validation = fmsOfferLineUpdateSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid input', details: validation.error }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const commandBus = container.resolve('commandBus') as CommandBus

  const selectedOrgId = typeof scope?.selectedId === 'string' ? scope.selectedId : auth.orgId
  const tenantId = auth.actorTenantId as string|| auth.tenantId

  try {
    const { result } = await commandBus.execute('fms_offers.offer_lines.update', {
      input: {
        ...validation.data,
        id: parse.data.id,
      },
      ctx: {
        container,
        auth,
        organizationScope: scope,
        selectedOrganizationId: selectedOrgId ?? null,
        organizationIds: scope?.filterIds ?? (selectedOrgId ? [selectedOrgId] : null),
        request: req,
      },
      metadata: {
        tenantId: tenantId ?? null,
        organizationId: selectedOrgId ?? undefined,
        resourceKind: 'fms_offers.offer_line',
        resourceId: parse.data.id,
      },
    })

    // Reload line for response
    const em = container.resolve('em') as EntityManager
    const line = await em.findOne(FmsOfferLine, { id: (result as { lineId: string }).lineId })

    return NextResponse.json(line)
  } catch (error: any) {
    console.error('[offer-lines/update] error:', error)
    if (error?.status) {
      return NextResponse.json(error.body || { error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to update offer line', message: error.message }, { status: 500 })
  }
}

export async function DELETE(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parse = paramsSchema.safeParse({ id: ctx.params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid line id' }, { status: 400 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const commandBus = container.resolve('commandBus') as CommandBus

  const selectedOrgId = typeof scope?.selectedId === 'string' ? scope.selectedId : auth.orgId
  const tenantId = auth.actorTenantId as string || auth.tenantId

  try {
    await commandBus.execute('fms_offers.offer_lines.delete', {
      input: {
        id: parse.data.id,
      },
      ctx: {
        container,
        auth,
        organizationScope: scope,
        selectedOrganizationId: selectedOrgId ?? null,
        organizationIds: scope?.filterIds ?? (selectedOrgId ? [selectedOrgId] : null),
        request: req,
      },
      metadata: {
        tenantId: tenantId ?? null,
        organizationId: selectedOrgId ?? undefined,
        resourceKind: 'fms_offers.offer_line',
        resourceId: parse.data.id,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[offer-lines/delete] error:', error)
    if (error?.status) {
      return NextResponse.json(error.body || { error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to delete offer line', message: error.message }, { status: 500 })
  }
}

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_offers.offers.view'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_offers.offers.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_offers.offers.manage'] },
}
