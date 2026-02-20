import { NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FrcProject, FrcProjectAirCargo } from '../../../../../data/entities'

export const metadata = {
  PUT: { requireAuth: true, requireFeatures: ['frc_projects.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['frc_projects.manage'] },
}

const paramsSchema = z.object({
  id: z.string().uuid(),
  assignmentId: z.string().uuid(),
})

const updateAssignmentSchema = z.object({
  quantity: z.number().int().min(0),
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

export async function PUT(req: Request, ctx: { params?: Promise<{ id?: string; assignmentId?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id, assignmentId: params?.assignmentId })
  if (!parse.success) return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })

  const body = await req.json()
  const validation = updateAssignmentSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid input', details: validation.error }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)
  const projectFilters: Record<string, unknown> = {
    id: parse.data.id,
    deletedAt: null,
    ...scopeFilters,
  }

  const project = await em.findOne(FrcProject, projectFilters)
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Find the assignment
  const assignment = await em.findOne(FrcProjectAirCargo, {
    id: parse.data.assignmentId,
    projectId: project.id,
  })
  if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })

  // Update quantity
  assignment.quantity = validation.data.quantity

  await em.flush()

  return NextResponse.json({ id: assignment.id, quantity: assignment.quantity })
}

export async function DELETE(req: Request, ctx: { params?: Promise<{ id?: string; assignmentId?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id, assignmentId: params?.assignmentId })
  if (!parse.success) return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)
  const projectFilters: Record<string, unknown> = {
    id: parse.data.id,
    deletedAt: null,
    ...scopeFilters,
  }

  const project = await em.findOne(FrcProject, projectFilters)
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Find and delete the assignment
  const assignment = await em.findOne(FrcProjectAirCargo, {
    id: parse.data.assignmentId,
    projectId: project.id,
  })
  if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })

  await em.removeAndFlush(assignment)

  return NextResponse.json({ success: true })
}
