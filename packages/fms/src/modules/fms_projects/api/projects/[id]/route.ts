import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { FmsProject } from '../../../data/entities'
import { fmsProjectUpdateSchema } from '../../../data/validators'

// Schema for PUT body - id comes from URL params, not body
const updateBodySchema = fmsProjectUpdateSchema.omit({ id: true })

const paramsSchema = z.object({
  id: z.string().uuid(),
})

// Helper to build scope-aware filters matching CRUD factory behavior
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

  // Logic matching CRUD factory:
  // 1. If filterIds is provided and non-empty, use those
  // 2. Otherwise, if allowedIds exists (user has org access), use fallback
  // 3. Otherwise, use fallback if available
  if (Array.isArray(filterIds) && filterIds.length > 0) {
    filterIds.forEach((id) => {
      if (typeof id === 'string') orgIdsSet.add(id)
    })
  } else if (Array.isArray(allowedIds) && allowedIds.length > 0) {
    // User has access to specific orgs - use all of them
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

export async function GET(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parse = paramsSchema.safeParse({ id: ctx.params?.id })
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

  let project: FmsProject | null = null
  try {
    project = await em.findOne(FmsProject, filters, {
      populate: ['client', 'quote', 'offer', 'originLocation', 'destinationLocation', 'legs', 'seaContainers', 'cargo'],
    })
  } catch (error: any) {
    // Handle MikroORM hydration errors (can occur during HMR or when entity metadata is stale)
    if (error?.message?.includes('Cannot set properties of undefined')) {
      console.error('[FmsProject GET] Hydration error, retrying without populate:', error.message)
      // Clear the entity manager and retry with minimal populate
      em.clear()
      project = await em.findOne(FmsProject, filters)
      if (project) {
        // Manually load relations
        await em.populate(project, ['client', 'quote', 'offer', 'originLocation', 'destinationLocation', 'legs', 'seaContainers', 'cargo'])
      }
    } else {
      throw error
    }
  }

  if (!project) {
    // Also try to find without scope filters to see if project exists
    const projectWithoutScope = await em.findOne(FmsProject, { id: parse.data.id, deletedAt: null })
    console.log('[FmsProject GET] Project without scope filters:', projectWithoutScope ? { id: projectWithoutScope.id, organizationId: projectWithoutScope.organizationId, tenantId: projectWithoutScope.tenantId } : null)
    return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  }

  // Transform the response to include related entity data (snake_case for frontend compatibility)
  const response = {
    id: project.id,
    organization_id: project.organizationId,
    tenant_id: project.tenantId,
    project_number: project.projectNumber,
    client_id: project.client?.id ?? null,
    client_name: project.client?.name ?? null,
    quote_id: project.quote?.id ?? null,
    offer_id: project.offer?.id ?? null,
    shipment_id: project.shipmentId,
    workflow_instance_id: project.workflowInstanceId,
    current_step: project.currentStep,
    shipment_type: project.shipmentType,
    transport_modes: project.transportModes ?? null,
    direction: project.direction,
    cargo_type: project.cargoType,
    incoterm: project.incoterm,
    origin_location_id: project.originLocation?.id ?? null,
    destination_location_id: project.destinationLocation?.id ?? null,
    origin_address: project.originAddress,
    destination_address: project.destinationAddress,
    project_date: project.projectDate,
    requested_pickup_date: project.requestedPickupDate,
    requested_delivery_date: project.requestedDeliveryDate,
    client_reference: project.clientReference,
    internal_reference: project.internalReference,
    commodity_description: project.commodityDescription,
    hs_code: project.hsCode,
    container_count: project.containerCount,
    total_gross_weight: project.totalGrossWeight,
    total_volume: project.totalVolume,
    weight_unit: project.weightUnit,
    volume_unit: project.volumeUnit,
    currency_code: project.currencyCode,
    estimated_cost: project.estimatedCost,
    requires_insurance: project.requiresInsurance,
    requires_customs_brokerage: project.requiresCustomsBrokerage,
    is_hazardous: project.isHazardous,
    hazmat_details: project.hazmatDetails,
    special_instructions: project.specialInstructions,
    internal_notes: project.internalNotes,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
    // Related collections
    legs: project.legs.getItems().map((leg) => ({
      id: leg.id,
      leg_sequence: leg.legSequence,
      transport_mode: leg.transportMode,
      carrier_name: leg.carrierName,
      origin_address: leg.originAddress,
      destination_address: leg.destinationAddress,
      estimated_departure: leg.estimatedDeparture,
      estimated_arrival: leg.estimatedArrival,
    })),
    containers: project.seaContainers.getItems().map((container) => ({
      id: container.id,
      container_type: container.containerType,
      container_number: container.containerNumber,
      ownership_type: container.ownershipType,
      booking_number: container.bookingNumber,
      bl_number: container.blNumber,
      vessel_name: container.vesselName,
      origin_port: container.originPort,
      destination_port: container.destinationPort,
      status: container.status,
    })),
    cargo: project.cargo.getItems().map((cargo) => ({
      id: cargo.id,
      commodity_description: cargo.commodityDescription,
      package_type: cargo.packageType,
      package_count: cargo.packageCount,
      gross_weight: cargo.grossWeight,
      weight_unit: cargo.weightUnit,
      status: cargo.status,
    })),
  }

  return NextResponse.json(response)
}

export async function PUT(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parse = paramsSchema.safeParse({ id: ctx.params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid project id' }, { status: 400 })

  const body = await req.json()
  const validation = updateBodySchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid input', details: validation.error }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const commandBus = container.resolve('commandBus') as CommandBus

  const rawSelectedOrgId = scope?.selectedId ?? auth.orgId
  const selectedOrgId = typeof rawSelectedOrgId === 'string' ? rawSelectedOrgId : null
  const rawTenantId = auth.actorTenantId || auth.tenantId
  const tenantId = typeof rawTenantId === 'string' ? rawTenantId : null

  try {
    const { result } = await commandBus.execute('fms_projects.projects.update', {
      input: {
        id: parse.data.id,
        ...validation.data,
      },
      ctx: {
        container,
        auth,
        organizationScope: scope,
        selectedOrganizationId: selectedOrgId,
        organizationIds: scope?.filterIds ?? (selectedOrgId ? [selectedOrgId] : null),
        request: req,
      },
      metadata: {
        tenantId,
        organizationId: selectedOrgId ?? undefined,
        resourceKind: 'fms_projects.project',
        resourceId: parse.data.id,
      },
    })

    return NextResponse.json({ id: (result as { projectId: string }).projectId, success: true })
  } catch (error: any) {
    console.error('[projects/update] error:', error)
    if (error?.status) {
      return NextResponse.json(error.body || { error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to update project', message: error.message }, { status: 500 })
  }
}

export async function DELETE(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parse = paramsSchema.safeParse({ id: ctx.params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid project id' }, { status: 400 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const commandBus = container.resolve('commandBus') as CommandBus

  const rawSelectedOrgId = scope?.selectedId ?? auth.orgId
  const selectedOrgId = typeof rawSelectedOrgId === 'string' ? rawSelectedOrgId : null
  const rawTenantId = auth.actorTenantId || auth.tenantId
  const tenantId = typeof rawTenantId === 'string' ? rawTenantId : null

  try {
    await commandBus.execute('fms_projects.projects.delete', {
      input: {
        id: parse.data.id,
      },
      ctx: {
        container,
        auth,
        organizationScope: scope,
        selectedOrganizationId: selectedOrgId,
        organizationIds: scope?.filterIds ?? (selectedOrgId ? [selectedOrgId] : null),
        request: req,
      },
      metadata: {
        tenantId,
        organizationId: selectedOrgId ?? undefined,
        resourceKind: 'fms_projects.project',
        resourceId: parse.data.id,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[projects/delete] error:', error)
    if (error?.status) {
      return NextResponse.json(error.body || { error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to delete project', message: error.message }, { status: 500 })
  }
}

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_projects.projects.view'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_projects.projects.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_projects.projects.manage'] },
}
