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

export async function GET(req: Request, ctx: { params?: Promise<{ id?: string; containerId?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const paramsResult = paramsSchema.safeParse({ id: params?.id, containerId: params?.containerId })
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

export async function PUT(req: Request, ctx: { params?: Promise<{ id?: string; containerId?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const paramsResult = paramsSchema.safeParse({ id: params?.id, containerId: params?.containerId })

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
  if (updates.bolNumber !== undefined) seaContainer.bolNumber = updates.bolNumber || null
  if (updates.carrierCode !== undefined) seaContainer.carrierCode = updates.carrierCode || null
  if (updates.vesselName !== undefined) seaContainer.vesselName = updates.vesselName || null
  if (updates.vesselImo !== undefined) seaContainer.vesselImo = updates.vesselImo || null
  if (updates.voyageNumber !== undefined) seaContainer.voyageNumber = updates.voyageNumber || null
  // Rich location data
  if (updates.originLocation !== undefined) seaContainer.originLocation = updates.originLocation || null
  if (updates.destinationLocation !== undefined) seaContainer.destinationLocation = updates.destinationLocation || null
  // Multi-source timestamps
  if (updates.etdTimestamps !== undefined) seaContainer.etdTimestamps = updates.etdTimestamps || null
  if (updates.etaTimestamps !== undefined) seaContainer.etaTimestamps = updates.etaTimestamps || null
  if (updates.atdTimestamps !== undefined) seaContainer.atdTimestamps = updates.atdTimestamps || null
  if (updates.ataTimestamps !== undefined) seaContainer.ataTimestamps = updates.ataTimestamps || null
  // Route and events
  if (updates.routeStops !== undefined) seaContainer.routeStops = updates.routeStops || null
  if (updates.cargoEvents !== undefined) seaContainer.cargoEvents = updates.cargoEvents || null
  if (updates.eventCount !== undefined) seaContainer.eventCount = updates.eventCount ?? 0
  if (updates.lastEventAt !== undefined) seaContainer.lastEventAt = updates.lastEventAt || null
  // Tracking integration
  if (updates.trackedShipmentId !== undefined) seaContainer.trackedShipmentId = updates.trackedShipmentId || null
  if (updates.lastSyncedAt !== undefined) seaContainer.lastSyncedAt = updates.lastSyncedAt || null
  if (updates.syncStatus !== undefined) seaContainer.syncStatus = updates.syncStatus || null
  // Status and flags
  if (updates.status !== undefined) seaContainer.status = updates.status
  if (updates.isActive !== undefined) seaContainer.isActive = updates.isActive
  if (updates.extra !== undefined) seaContainer.extra = updates.extra || null
  if (updates.isHazardous !== undefined) seaContainer.isHazardous = updates.isHazardous
  if (updates.notes !== undefined) seaContainer.notes = updates.notes || null
  // VGM & Customs
  if (updates.vgmStatus !== undefined) seaContainer.vgmStatus = updates.vgmStatus || null
  if (updates.vgmWeight !== undefined) seaContainer.vgmWeight = updates.vgmWeight?.toString() ?? null
  if (updates.customsClearanceStatus !== undefined) seaContainer.customsClearanceStatus = updates.customsClearanceStatus || null
  if (updates.customsClearanceLocation !== undefined) seaContainer.customsClearanceLocation = updates.customsClearanceLocation || null
  if (updates.pinCode !== undefined) seaContainer.pinCode = updates.pinCode || null
  if (updates.deliveryTime !== undefined) seaContainer.deliveryTime = updates.deliveryTime || null
  if (updates.dropOffLocation !== undefined) seaContainer.dropOffLocation = updates.dropOffLocation || null
  if (updates.cutOffDate !== undefined) seaContainer.cutOffDate = updates.cutOffDate || null
  // CargoWise-aligned fields
  if (updates.packsCount !== undefined) seaContainer.packsCount = updates.packsCount || null
  if (updates.packType !== undefined) seaContainer.packType = updates.packType || null
  if (updates.innersCount !== undefined) seaContainer.innersCount = updates.innersCount || null
  if (updates.innerType !== undefined) seaContainer.innerType = updates.innerType || null
  if (updates.loadingMeters !== undefined) seaContainer.loadingMeters = updates.loadingMeters?.toString() ?? null
  if (updates.chargeableWeight !== undefined) seaContainer.chargeableWeight = updates.chargeableWeight?.toString() ?? null
  if (updates.wvRatio !== undefined) seaContainer.wvRatio = updates.wvRatio?.toString() ?? null
  if (updates.marksAndNumbers !== undefined) seaContainer.marksAndNumbers = updates.marksAndNumbers || null
  if (updates.hsCode !== undefined) seaContainer.hsCode = updates.hsCode || null
  if (updates.onBoardStatus !== undefined) seaContainer.onBoardStatus = updates.onBoardStatus || null
  if (updates.onBoardDate !== undefined) seaContainer.onBoardDate = updates.onBoardDate || null
  if (updates.blIssueDate !== undefined) seaContainer.blIssueDate = updates.blIssueDate || null
  if (updates.originalsCount !== undefined) seaContainer.originalsCount = updates.originalsCount || null
  if (updates.expressBillsCount !== undefined) seaContainer.expressBillsCount = updates.expressBillsCount || null
  if (updates.carrierScac !== undefined) seaContainer.carrierScac = updates.carrierScac || null
  if (updates.imoNumber !== undefined) seaContainer.imoNumber = updates.imoNumber || null
  if (updates.ctoReceivalDate !== undefined) seaContainer.ctoReceivalDate = updates.ctoReceivalDate || null
  if (updates.ctoCutOffDate !== undefined) seaContainer.ctoCutOffDate = updates.ctoCutOffDate || null
  if (updates.docsDueDate !== undefined) seaContainer.docsDueDate = updates.docsDueDate || null
  if (updates.co2Emissions !== undefined) seaContainer.co2Emissions = updates.co2Emissions?.toString() ?? null
  // Pickup planning
  if (updates.pickupRequiredFrom !== undefined) seaContainer.pickupRequiredFrom = updates.pickupRequiredFrom || null
  if (updates.pickupRequiredBy !== undefined) seaContainer.pickupRequiredBy = updates.pickupRequiredBy || null
  if (updates.estimatedPickup !== undefined) seaContainer.estimatedPickup = updates.estimatedPickup || null
  if (updates.actualPickup !== undefined) seaContainer.actualPickup = updates.actualPickup || null
  if (updates.pickupLocationId !== undefined) seaContainer.pickupLocationId = updates.pickupLocationId || null
  if (updates.pickupNotes !== undefined) seaContainer.pickupNotes = updates.pickupNotes || null
  // Delivery planning
  if (updates.deliveryRequiredBy !== undefined) seaContainer.deliveryRequiredBy = updates.deliveryRequiredBy || null
  if (updates.estimatedDelivery !== undefined) seaContainer.estimatedDelivery = updates.estimatedDelivery || null
  if (updates.actualDelivery !== undefined) seaContainer.actualDelivery = updates.actualDelivery || null
  if (updates.deliveryLocationId !== undefined) seaContainer.deliveryLocationId = updates.deliveryLocationId || null
  if (updates.deliveryNotes !== undefined) seaContainer.deliveryNotes = updates.deliveryNotes || null

  seaContainer.updatedAt = new Date()

  await em.flush()

  return NextResponse.json(seaContainer)
}

export async function DELETE(req: Request, ctx: { params?: Promise<{ id?: string; containerId?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const paramsResult = paramsSchema.safeParse({ id: params?.id, containerId: params?.containerId })
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
