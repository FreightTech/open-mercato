import { NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FrcProject } from '../../../data/entities'
import { FrcRfq } from '../../../../frc_rfqs/data/entities'
import { FrcQuote } from '../../../../frc_quotes/data/entities'
import { updateProjectSchema } from '../../../data/validators'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['frc_projects.view'] },
  PUT: { requireAuth: true, requireFeatures: ['frc_projects.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['frc_projects.manage'] },
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
  if (!parse.success) return NextResponse.json({ error: 'Invalid project id' }, { status: 400 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)
  const filters: Record<string, unknown> = {
    id: parse.data.id,
    deletedAt: null,
    ...scopeFilters,
  }

  const project = await em.findOne(FrcProject, filters)

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Fetch RFQ and Quote data separately (using foreign key IDs)
  let rfqData: { id: string; name: string } | null = null
  let quoteData: { id: string; name: string } | null = null

  if (project.rfqId) {
    const rfq = await em.findOne(FrcRfq, { id: project.rfqId }, { fields: ['id', 'name'] })
    if (rfq) {
      rfqData = { id: rfq.id, name: rfq.name }
    }
  }

  if (project.quoteId) {
    const quote = await em.findOne(FrcQuote, { id: project.quoteId }, { fields: ['id', 'name'] })
    if (quote) {
      quoteData = { id: quote.id, name: quote.name }
    }
  }

  return NextResponse.json({
    id: project.id,
    projectNumber: project.projectNumber,
    rfqId: rfqData?.id ?? null,
    rfqName: rfqData?.name ?? null,
    quoteId: quoteData?.id ?? null,
    quoteName: quoteData?.name ?? null,
    accountId: project.accountId ?? null,
    status: project.status,
    totalValue: project.totalValue ?? null,
    currencyCode: project.currencyCode,
    organizationId: project.organizationId,
    tenantId: project.tenantId,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  })
}

export async function PUT(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid project id' }, { status: 400 })

  const body = await req.json()
  const validation = updateProjectSchema.safeParse(body)
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

  const project = await em.findOne(FrcProject, filters)

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Update fields
  const data = validation.data
  if (data.projectNumber !== undefined) project.projectNumber = data.projectNumber
  if (data.accountId !== undefined) project.accountId = data.accountId ?? null
  if (data.status !== undefined) project.status = data.status
  if (data.totalValue !== undefined) project.totalValue = data.totalValue ?? null
  if (data.currencyCode !== undefined) project.currencyCode = data.currencyCode

  project.updatedAt = new Date()

  await em.flush()

  return NextResponse.json({ id: project.id, projectNumber: project.projectNumber })
}

export async function DELETE(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid project id' }, { status: 400 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)
  const filters: Record<string, unknown> = {
    id: parse.data.id,
    deletedAt: null,
    ...scopeFilters,
  }

  const project = await em.findOne(FrcProject, filters)

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Soft delete
  project.deletedAt = new Date()
  await em.flush()

  return NextResponse.json({ success: true })
}
