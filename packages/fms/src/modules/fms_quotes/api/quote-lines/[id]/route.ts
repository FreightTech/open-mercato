import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { FmsQuoteLine } from '../../../data/entities'
import { fmsQuoteLineCreateSchema } from '../../../data/validators'

// Body schema for PUT - id comes from URL, scope from auth
const updateBodySchema = fmsQuoteLineCreateSchema
  .omit({ quoteId: true, organizationId: true, tenantId: true })
  .partial()

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

  const line = await em.findOne(FmsQuoteLine, filters)

  if (!line) return NextResponse.json({ error: 'Line not found' }, { status: 404 })

  return NextResponse.json(line)
}

export async function PUT(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parse = paramsSchema.safeParse({ id: ctx.params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid line id' }, { status: 400 })

  const body = await req.json()
  const validation = updateBodySchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid input', details: validation.error }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const commandBus = container.resolve('commandBus') as CommandBus

  const selectedOrgId = typeof scope?.selectedId === 'string' ? scope.selectedId : auth.orgId
  const tenantId = auth.actorTenantId as string || auth.tenantId

  try {
    const { result } = await commandBus.execute('fms_quotes.quote_lines.update', {
      input: {
        id: parse.data.id,
        ...validation.data,
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
        resourceKind: 'fms_quotes.quote_line',
        resourceId: parse.data.id,
      },
    })

    // Reload line for response
    const em = container.resolve('em') as EntityManager
    const line = await em.findOne(FmsQuoteLine, { id: (result as { lineId: string }).lineId })

    return NextResponse.json(line)
  } catch (error: any) {
    console.error('[quote-lines/update] error:', error)
    if (error?.status) {
      return NextResponse.json(error.body || { error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to update quote line', message: error.message }, { status: 500 })
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
    await commandBus.execute('fms_quotes.quote_lines.delete', {
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
        resourceKind: 'fms_quotes.quote_line',
        resourceId: parse.data.id,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[quote-lines/delete] error:', error)
    if (error?.status) {
      return NextResponse.json(error.body || { error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to delete quote line', message: error.message }, { status: 500 })
  }
}

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_quotes.quotes.view'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_quotes.quotes.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_quotes.quotes.manage'] },
}
