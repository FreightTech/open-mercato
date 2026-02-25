import { NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FrcProject, FrcProjectAirCargo } from '../../../../data/entities'
import { FrcAirCargo } from '../../../../../frc_rfqs/data/entities'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['frc_projects.view'] },
  POST: { requireAuth: true, requireFeatures: ['frc_projects.manage'] },
}

const paramsSchema = z.object({
  id: z.string().uuid(),
})

const createAssignmentSchema = z.object({
  airCargoId: z.string().uuid(),
  quantity: z.number().int().min(1),
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
  const projectFilters: Record<string, unknown> = {
    id: parse.data.id,
    deletedAt: null,
    ...scopeFilters,
  }

  const project = await em.findOne(FrcProject, projectFilters)
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Fetch existing cargo assignments for this project
  const assignments = await em.find(FrcProjectAirCargo, {
    projectId: project.id,
    organizationId: project.organizationId,
    tenantId: project.tenantId,
  })

  // Fetch cargo details for all assignments
  const cargoIds = assignments.map(a => a.airCargoId)
  const cargoRecords = cargoIds.length > 0
    ? await em.find(FrcAirCargo, {
        id: { $in: cargoIds },
        organizationId: project.organizationId,
        tenantId: project.tenantId,
        deletedAt: null,
      })
    : []

  // Build map of cargo by id
  const cargoMap = new Map(cargoRecords.map(c => [c.id, c]))

  // Build response with assignment data merged with cargo details
  const items = assignments.map(assignment => {
    const cargo = cargoMap.get(assignment.airCargoId)
    return {
      id: assignment.id,
      airCargoId: assignment.airCargoId,
      cargoName: cargo?.name ?? 'Unknown',
      numberOfPieces: cargo?.numberOfPieces ?? 0,
      assignedQuantity: assignment.quantity,
      lengthCm: cargo?.lengthCm ?? null,
      widthCm: cargo?.widthCm ?? null,
      heightCm: cargo?.heightCm ?? null,
      volumeM3: cargo?.volumeM3 ?? '0',
      actualWeightKg: cargo?.actualWeightKg ?? '0',
    }
  })

  return NextResponse.json({
    items,
  })
}

export async function POST(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid project id' }, { status: 400 })

  const body = await req.json()
  const validation = createAssignmentSchema.safeParse(body)
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

  // Check if cargo exists (any cargo within the same org/tenant scope)
  const cargo = await em.findOne(FrcAirCargo, {
    id: validation.data.airCargoId,
    organizationId: project.organizationId,
    tenantId: project.tenantId,
    deletedAt: null,
  })
  if (!cargo) {
    return NextResponse.json({ error: 'Cargo not found' }, { status: 400 })
  }

  // Check if assignment already exists
  const existingAssignment = await em.findOne(FrcProjectAirCargo, {
    projectId: project.id,
    airCargoId: validation.data.airCargoId,
  })
  if (existingAssignment) {
    return NextResponse.json({ error: 'Cargo already assigned to this project' }, { status: 400 })
  }

  // Create assignment
  const assignment = em.create(FrcProjectAirCargo, {
    organizationId: project.organizationId,
    tenantId: project.tenantId,
    projectId: project.id,
    airCargoId: validation.data.airCargoId,
    quantity: validation.data.quantity,
    createdAt: new Date(),
  })

  await em.persistAndFlush(assignment)

  return NextResponse.json({ id: assignment.id }, { status: 201 })
}
