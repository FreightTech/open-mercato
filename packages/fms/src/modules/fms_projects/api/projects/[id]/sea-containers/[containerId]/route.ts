/**
 * FMS Projects Module - Sea Container Detail API
 * Handle individual sea container operations (GET, PUT, DELETE)
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsSeaContainer, FmsProject } from '../../../../../data/entities'
import { fmsSeaContainerUpdateSchema } from '../../../../../data/validators'

const paramsSchema = z.object({
  id: z.string().uuid(),
  containerId: z.string().uuid(),
})

// Helper to build scope-aware filters
function buildScopeFilters(
  auth: { tenantId?: string | null; orgId?: string | null },
  scope: { tenantId?: string | null; selectedId?: string | null; filterIds?: string[] | null; allowedIds?: string[] | null } | null
): { tenantId?: string; organizationId?: { $in: string[] } } {
  const filters: { tenantId?: string; organizationId?: { $in: string[] } } = {}

  if (typeof auth.tenantId === 'string') {
    filters.tenantId = auth.tenantId
  }

  const orgIdsSet = new Set<string>()
  const filterIds = scope?.filterIds
  const allowedIds = scope?.allowedIds
  const fallbackOrgId = scope?.selectedId ?? auth.orgId ?? null

  if (Array.isArray(filterIds) && filterIds.length > 0) {
    filterIds.forEach((id) => {
      if (typeof id === 'string') orgIdsSet.add(id)
    })
  } else if (Array.isArray(allowedIds) && allowedIds.length > 0) {
    allowedIds.forEach((id) => {
      if (typeof id === 'string') orgIdsSet.add(id)
    })
  } else if (fallbackOrgId) {
    orgIdsSet.add(fallbackOrgId)
  }

  if (orgIdsSet.size > 0) {
    filters.organizationId = { $in: [...orgIdsSet] }
  }

  return filters
}

export async function GET(req: Request, ctx: { params?: { id?: string; containerId?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const paramsResult = paramsSchema.safeParse({ id: ctx.params?.id, containerId: ctx.params?.containerId })
  if (!paramsResult.success) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
  }

  const { id: projectId, containerId } = paramsResult.data

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager
  const scopeFilters = buildScopeFilters(auth, scope)

  // First verify the project is accessible
  const project = await em.findOne(FmsProject, {
    id: projectId,
    deletedAt: null,
    ...scopeFilters,
  })

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Then find the container belonging to this project
  const seaContainer = await em.findOne(FmsSeaContainer, {
    id: containerId,
    project: projectId,
    deletedAt: null,
  })

  if (!seaContainer) {
    return NextResponse.json({ error: 'Sea container not found' }, { status: 404 })
  }

  return NextResponse.json(seaContainer)
}

export async function PUT(req: Request, ctx: { params?: { id?: string; containerId?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const paramsResult = paramsSchema.safeParse({ id: ctx.params?.id, containerId: ctx.params?.containerId })
  if (!paramsResult.success) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
  }

  const { id: projectId, containerId } = paramsResult.data

  const body = await req.json()
  const bodyResult = fmsSeaContainerUpdateSchema.safeParse(body)
  if (!bodyResult.success) {
    return NextResponse.json({ error: 'Invalid request body', details: bodyResult.error }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager
  const scopeFilters = buildScopeFilters(auth, scope)

  // First verify the project is accessible
  const project = await em.findOne(FmsProject, {
    id: projectId,
    deletedAt: null,
    ...scopeFilters,
  })

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Then find the container belonging to this project
  const seaContainer = await em.findOne(FmsSeaContainer, {
    id: containerId,
    project: projectId,
    deletedAt: null,
  })

  if (!seaContainer) {
    return NextResponse.json({ error: 'Sea container not found' }, { status: 404 })
  }

  const updates = bodyResult.data

  // Explicitly update each field if provided
  if (updates.containerType !== undefined) seaContainer.containerType = updates.containerType
  if (updates.containerNumber !== undefined) seaContainer.containerNumber = updates.containerNumber || null
  if (updates.sealNumber !== undefined) seaContainer.sealNumber = updates.sealNumber || null
  if (updates.ownershipType !== undefined) seaContainer.ownershipType = updates.ownershipType
  if (updates.bookingNumber !== undefined) seaContainer.bookingNumber = updates.bookingNumber || null
  if (updates.blNumber !== undefined) seaContainer.blNumber = updates.blNumber || null
  if (updates.vesselName !== undefined) seaContainer.vesselName = updates.vesselName || null
  if (updates.vesselImo !== undefined) seaContainer.vesselImo = updates.vesselImo || null
  if (updates.voyageNumber !== undefined) seaContainer.voyageNumber = updates.voyageNumber || null
  if (updates.originPort !== undefined) seaContainer.originPort = updates.originPort || null
  if (updates.destinationPort !== undefined) seaContainer.destinationPort = updates.destinationPort || null
  if (updates.etd !== undefined) seaContainer.etd = updates.etd || null
  if (updates.eta !== undefined) seaContainer.eta = updates.eta || null
  if (updates.atd !== undefined) seaContainer.atd = updates.atd || null
  if (updates.ata !== undefined) seaContainer.ata = updates.ata || null
  if (updates.status !== undefined) seaContainer.status = updates.status
  if (updates.customsClearanceStatus !== undefined) seaContainer.customsClearanceStatus = updates.customsClearanceStatus || null
  if (updates.isHazardous !== undefined) seaContainer.isHazardous = updates.isHazardous
  if (updates.notes !== undefined) seaContainer.notes = updates.notes || null

  seaContainer.updatedAt = new Date()

  await em.flush()

  return NextResponse.json(seaContainer)
}

export async function DELETE(req: Request, ctx: { params?: { id?: string; containerId?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const paramsResult = paramsSchema.safeParse({ id: ctx.params?.id, containerId: ctx.params?.containerId })
  if (!paramsResult.success) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
  }

  const { id: projectId, containerId } = paramsResult.data

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager
  const scopeFilters = buildScopeFilters(auth, scope)

  // First verify the project is accessible
  const project = await em.findOne(FmsProject, {
    id: projectId,
    deletedAt: null,
    ...scopeFilters,
  })

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Then find the container belonging to this project
  const seaContainer = await em.findOne(FmsSeaContainer, {
    id: containerId,
    project: projectId,
    deletedAt: null,
  })

  if (!seaContainer) {
    return NextResponse.json({ error: 'Sea container not found' }, { status: 404 })
  }

  // Soft delete
  seaContainer.deletedAt = new Date()
  await em.flush()

  return NextResponse.json({ success: true })
}

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_projects.containers.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_projects.containers.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_projects.containers.manage'] },
}
