/**
 * FMS Projects Module - Composite Detail API
 * Returns all project data in a single request to reduce HTTP overhead
 *
 * CHAME-30: Performance optimization - consolidate 8-9 parallel API calls into one
 */

import { z } from 'zod'
import { NextResponse } from 'next/server'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import {
  FmsProject,
  FmsProjectLeg,
  FmsSeaContainer,
  FmsAirUnit,
  FmsRoadUnit,
  FmsProjectCargo,
  FmsProjectLine,
  FmsProjectNote,
} from '../../../../data/entities'

const paramsSchema = z.object({
  id: z.string().uuid(),
})

export const metadata = {
  requireAuth: true,
  requireFeatures: ['fms_projects.projects.view'],
}

// OpenAPI specification for API route discovery
export const openApi = {
  get: {
    operationId: 'getProjectDetail',
    summary: 'Get project composite detail',
    description: 'Returns all project data in a single request (project + legs + containers + cargo + lines + notes)',
    tags: ['FMS Projects'],
    parameters: [
      {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
        description: 'Project ID',
      },
    ],
    responses: {
      200: {
        description: 'Project detail with all nested resources',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                project: { type: 'object' },
                legs: { type: 'array', items: { type: 'object' } },
                seaContainers: { type: 'array', items: { type: 'object' } },
                airUnits: { type: 'array', items: { type: 'object' } },
                roadUnits: { type: 'array', items: { type: 'object' } },
                cargo: { type: 'array', items: { type: 'object' } },
                lines: { type: 'array', items: { type: 'object' } },
                notes: { type: 'array', items: { type: 'object' } },
              },
            },
          },
        },
      },
      401: { description: 'Unauthorized' },
      404: { description: 'Project not found' },
    },
  },
}

/**
 * GET /api/fms_projects/projects/[id]/detail
 * Returns composite data for project detail page:
 * - project (main entity with relations)
 * - legs (route segments)
 * - seaContainers (FCL containers)
 * - airUnits (air cargo units)
 * - roadUnits (road cargo units)
 * - cargo (LCL cargo items)
 * - lines (financial lines)
 * - documents (NOT included - fetched separately due to large size)
 * - notes (internal notes)
 */
export async function GET(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parse = paramsSchema.safeParse({ id: ctx.params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid project id' }, { status: 400 })

  const container = await createRequestContainer()
  const em = container.resolve('em')
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })

  // Organization scope filters
  const rawSelectedOrgId = scope?.selectedId ?? auth.orgId
  const selectedOrgId = typeof rawSelectedOrgId === 'string' ? rawSelectedOrgId : null
  const rawTenantId = auth.actorTenantId || auth.tenantId
  const tenantId = typeof rawTenantId === 'string' ? rawTenantId : null
  const orgIds = scope?.filterIds ?? (selectedOrgId ? [selectedOrgId] : null)

  const scopeFilters: Record<string, unknown> = {}
  if (tenantId) scopeFilters.tenantId = tenantId
  if (orgIds?.length) scopeFilters.organizationId = { $in: orgIds }

  const projectId = parse.data.id

  // Use a single transaction to fetch all data for consistency
  try {
    const result = await em.transactional(async (tem: EntityManager) => {
      // 1. Fetch main project with relations
      const project = await tem.findOne(
        FmsProject,
        { id: projectId, deletedAt: null, ...scopeFilters },
        {
          populate: [
            'client',
            'rfq',
            'offer',
            'offer.rfq',
            'originLocation',
            'destinationLocation',
            'shipper',
            'consignee',
            'carrier',
          ],
        }
      )

      if (!project) {
        return null
      }

      // 2. Fetch nested resources in parallel
      const [legs, seaContainers, airUnits, roadUnits, cargo, lines, notes] = await Promise.all([
        // Legs
        tem.find(
          FmsProjectLeg,
          { project: projectId, deletedAt: null },
          { orderBy: { legSequence: 'ASC' } }
        ),

        // Sea containers
        tem.find(
          FmsSeaContainer,
          { project: projectId, deletedAt: null },
          { orderBy: { createdAt: 'DESC' } }
        ),

        // Air units
        tem.find(
          FmsAirUnit,
          { project: projectId, deletedAt: null },
          { orderBy: { createdAt: 'DESC' } }
        ),

        // Road units
        tem.find(
          FmsRoadUnit,
          { project: projectId, deletedAt: null },
          { orderBy: { createdAt: 'DESC' } }
        ),

        // Cargo
        tem.find(
          FmsProjectCargo,
          { project: projectId, deletedAt: null },
          { orderBy: { createdAt: 'ASC' } }
        ),

        // Lines
        tem.find(
          FmsProjectLine,
          { project: projectId, deletedAt: null },
          { orderBy: { createdAt: 'ASC' } }
        ),

        // Notes
        tem.find(
          FmsProjectNote,
          { project: projectId, deletedAt: null },
          { orderBy: { createdAt: 'DESC' } }
        ),
      ])

      return {
        project,
        legs,
        seaContainers,
        airUnits,
        roadUnits,
        cargo,
        lines,
        notes,
      }
    })

    if (!result) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 })
    }

    // Transform to response format (snake_case for frontend compatibility)
    const response = {
      // Main project
      project: {
        id: result.project.id,
        organization_id: result.project.organizationId,
        tenant_id: result.project.tenantId,
        project_number: result.project.projectNumber,
        client_id: result.project.client?.id ?? null,
        client_name: result.project.client?.name ?? null,
        rfq_id: result.project.rfq?.id ?? null,
        offer_id: result.project.offer?.id ?? null,
        shipment_id: result.project.shipmentId,
        workflow_instance_id: result.project.workflowInstanceId,
        current_step: result.project.currentStep,
        shipment_type: result.project.shipmentType,
        transport_modes: result.project.transportModes ?? null,
        direction: result.project.direction,
        cargo_type: result.project.cargoType,
        incoterm: result.project.incoterm,
        origin_location_id: result.project.originLocation?.id ?? null,
        origin_location_name: result.project.originLocation?.name ?? null,
        destination_location_id: result.project.destinationLocation?.id ?? null,
        destination_location_name: result.project.destinationLocation?.name ?? null,
        origin_address: result.project.originAddress,
        destination_address: result.project.destinationAddress,
        project_date: result.project.projectDate,
        requested_pickup_date: result.project.requestedPickupDate,
        requested_delivery_date: result.project.requestedDeliveryDate,
        etd: result.project.etd,
        eta: result.project.eta,
        atd: result.project.atd,
        ata: result.project.ata,
        cargo_ready_date: result.project.cargoReadyDate,
        vgm_cutoff_date: result.project.vgmCutoffDate,
        doc_cutoff_date: result.project.docCutoffDate,
        gate_in_date: result.project.gateInDate,
        gate_close_date: result.project.gateCloseDate,
        carrier_id: result.project.carrier?.id ?? null,
        carrier_name: result.project.carrier?.name ?? null,
        client_reference: result.project.clientReference,
        internal_reference: result.project.internalReference,
        commodity_description: result.project.commodityDescription,
        hs_code: result.project.hsCode,
        container_count: result.project.containerCount,
        total_gross_weight: result.project.totalGrossWeight,
        total_volume: result.project.totalVolume,
        weight_unit: result.project.weightUnit,
        volume_unit: result.project.volumeUnit,
        estimated_cost: result.project.estimatedCost,
        actual_cost: result.project.actualCost,
        currency_code: result.project.currencyCode,
        requires_insurance: result.project.requiresInsurance,
        requires_customs: result.project.requiresCustoms,
        is_dangerous_goods: result.project.isDangerousGoods,
        special_instructions: result.project.specialInstructions,
        assigned_to_name: result.project.assignedToName,
        sales_person_name: result.project.salesPersonName,
        shipper_id: result.project.shipper?.id ?? null,
        shipper_name: result.project.shipper?.name ?? null,
        consignee_id: result.project.consignee?.id ?? null,
        consignee_name: result.project.consignee?.name ?? null,
        created_at: result.project.createdAt,
        updated_at: result.project.updatedAt,
        offer_exchange_rates: result.project.offer?.exchangeRates ?? null,
        offer_base_currency: (result.project.offer?.rfq as any)?.currencyCode ?? null,
      },

      // Nested collections
      legs: result.legs.map((leg: FmsProjectLeg) => ({
        id: leg.id,
        leg_sequence: leg.legSequence,
        transport_mode: leg.transportMode,
        carrier_name: leg.carrierName,
        origin_address: leg.originAddress,
        destination_address: leg.destinationAddress,
        estimated_departure: leg.estimatedDeparture,
        estimated_arrival: leg.estimatedArrival,
      })),

      seaContainers: result.seaContainers.map((container: FmsSeaContainer) => ({
        id: container.id,
        container_type: container.containerType,
        container_number: container.containerNumber,
        ownership_type: container.ownershipType,
        booking_number: container.bookingNumber,
        bol_number: container.bolNumber,
        vessel_name: container.vesselName,
        origin_location: container.originLocation,
        destination_location: container.destinationLocation,
        status: container.status,
      })),

      airUnits: result.airUnits.map((unit: FmsAirUnit) => ({
        id: unit.id,
        pieces: unit.pieces,
        gross_weight: unit.grossWeight,
        chargeable_weight: unit.chargeableWeight,
        volume: unit.volume,
        commodity: unit.commodity,
        delivery_status: unit.deliveryStatus,
      })),

      roadUnits: result.roadUnits.map((unit: FmsRoadUnit) => ({
        id: unit.id,
        vehicle_type: unit.vehicleType,
        truck_number: unit.truckNumber,
        driver_name: unit.driverName,
        carrier_name: unit.carrierName,
        origin_address: unit.originAddress,
        destination_address: unit.destinationAddress,
      })),

      cargo: result.cargo.map((item: FmsProjectCargo) => ({
        id: item.id,
        // Additional fields can be added as needed
      })),

      lines: result.lines.map((line: FmsProjectLine) => ({
        id: line.id,
        line_number: line.lineNumber,
        // Additional fields can be added as needed
      })),

      notes: result.notes.map((note: FmsProjectNote) => ({
        id: note.id,
        body: note.body,
        author_name: note.authorName,
        created_at: note.createdAt,
      })),
    }

    return NextResponse.json(response)
  } catch (error: any) {
    console.error('[Project Detail API] Error fetching composite data:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
