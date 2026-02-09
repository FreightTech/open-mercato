/**
 * FMS Projects Module - Main API Route
 * CRUD operations for projects with workflow integration
 */

import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { FmsProject } from '../../data/entities'
import { fmsProjectCreateSchema, fmsProjectUpdateSchema } from '../../data/validators'
import type { SearchService } from '@open-mercato/search'
import { E } from '#generated/entities.ids.generated'
import type { AuthContext } from '@open-mercato/shared/lib/auth/server'
import { generateProjectNumber } from '../../lib/activity-handlers'
import { Contractor } from '../../../contractors/data/entities'
import type { EntityManager } from '@mikro-orm/postgresql'

const listSchema = z
  .object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(50),
    q: z.string().optional(),
    currentStep: z.string().optional(),
    clientId: z.string().uuid().optional(),
    cargoType: z.enum(['fcl', 'lcl']).optional(),
    shipmentType: z.string().optional(),
    sortField: z.string().optional().default('createdAt'),
    sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
  })
  .passthrough()

// Field mapping from frontend camelCase to database snake_case column names
const FIELD_MAP: Record<string, string> = {
  id: 'id',
  organizationId: 'organization_id',
  tenantId: 'tenant_id',
  projectNumber: 'project_number',
  clientId: 'client_id',
  rfqId: 'rfq_id',
  offerId: 'offer_id',
  shipmentId: 'shipment_id',
  workflowInstanceId: 'workflow_instance_id',
  currentStep: 'current_step',
  shipmentType: 'shipment_type',
  direction: 'direction',
  cargoType: 'cargo_type',
  incoterm: 'incoterm',
  originLocationId: 'origin_location_id',
  destinationLocationId: 'destination_location_id',
  originAddress: 'origin_address',
  destinationAddress: 'destination_address',
  projectDate: 'project_date',
  requestedPickupDate: 'requested_pickup_date',
  requestedDeliveryDate: 'requested_delivery_date',
  clientReference: 'client_reference',
  internalReference: 'internal_reference',
  commodityDescription: 'commodity_description',
  hsCode: 'hs_code',
  containerCount: 'container_count',
  transportUnitCount: 'transport_unit_count',
  totalGrossWeight: 'total_gross_weight',
  totalVolume: 'total_volume',
  weightUnit: 'weight_unit',
  volumeUnit: 'volume_unit',
  currencyCode: 'currency_code',
  estimatedCost: 'estimated_cost',
  requiresInsurance: 'requires_insurance',
  requiresCustomsBrokerage: 'requires_customs_brokerage',
  isHazardous: 'is_hazardous',
  hazmatDetails: 'hazmat_details',
  specialInstructions: 'special_instructions',
  internalNotes: 'internal_notes',
  isActive: 'is_active',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  deletedAt: 'deleted_at',
}

// Parse DynamicTable FilterRow into query engine filter format
// The query engine expects { field: { $op: value } } format (flat, not nested in $and)
function parseFilterRow(row: { field: string; operator: string; values: unknown[] }): { field: string; filter: Record<string, unknown> } | null {
  const field = FIELD_MAP[row.field]
  if (!field) return null

  const val = row.values[0]
  const hasValue = val !== undefined && val !== null && val !== ''
  const hasValues = Array.isArray(row.values) && row.values.length > 0

  switch (row.operator) {
    case 'is_any_of':
      if (!hasValues) return null
      return { field, filter: { $in: row.values } }
    case 'is_not_any_of':
      if (!hasValues) return null
      return { field, filter: { $nin: row.values } }
    case 'contains':
      if (!hasValue) return null
      return { field, filter: { $ilike: `%${val}%` } }
    case 'is_empty':
      return { field, filter: { $eq: null } }
    case 'is_not_empty':
      return { field, filter: { $ne: null } }
    case 'equals':
      if (!hasValue) return null
      return { field, filter: { $eq: val } }
    case 'not_equals':
      if (!hasValue) return null
      return { field, filter: { $ne: val } }
    case 'is_true':
      return { field, filter: { $eq: true } }
    case 'is_false':
      return { field, filter: { $eq: false } }
    case 'greater_than':
      if (!hasValue) return null
      return { field, filter: { $gt: val } }
    case 'less_than':
      if (!hasValue) return null
      return { field, filter: { $lt: val } }
    default:
      return null
  }
}

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_projects.projects.view'] },
  POST: { requireAuth: true, requireFeatures: ['fms_projects.projects.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_projects.projects.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_projects.projects.manage'] },
}

export const metadata = routeMetadata

/**
 * Build search filters for list queries
 */
async function buildSearchFilters(
  query: z.infer<typeof listSchema>,
  ctx: { container: { resolve: (key: string) => unknown }; auth?: AuthContext | null; request?: Request }
): Promise<Record<string, unknown>> {
  const filters: Record<string, unknown> = {}
  const tenantId = ctx.auth?.tenantId

  // Search integration
  if (query.q && query.q.trim().length > 0 && tenantId) {
    try {
      const searchService = ctx.container.resolve('searchService') as SearchService | undefined

      if (searchService) {
        const results = await searchService.search(query.q.trim(), {
          tenantId,
          organizationId: null,
          limit: 100,
          strategies: ['fulltext'],
          entityTypes: ['fms_projects:fms_project'],
        })

        if (results.length > 0) {
          filters.id = { $in: results.map((r) => r.recordId) }
        } else {
          // No results - return empty set
          filters.id = { $in: ['00000000-0000-0000-0000-000000000000'] }
        }
      }
    } catch (error) {
      console.error('[fms_projects:search] Search service error:', error)
    }
  }

  // Filter by workflow step
  if (query.currentStep) {
    filters.currentStep = query.currentStep
  }

  // Filter by client
  if (query.clientId) {
    filters.client = query.clientId
  }

  // Filter by cargo type
  if (query.cargoType) {
    filters.cargoType = query.cargoType
  }

  // Filter by shipment type
  if (query.shipmentType) {
    filters.shipmentType = query.shipmentType
  }

  // Parse DynamicTable filters from request
  // The query engine expects flat filters like { field: { $op: value } }
  // It does NOT support compound operators like $and or $or
  if (ctx.request) {
    const url = new URL(ctx.request.url)
    const filtersParam = url.searchParams.get('filters')
    if (filtersParam) {
      try {
        const dynamicFilters: Array<{ field: string; operator: string; values: unknown[] }> = JSON.parse(filtersParam)
        for (const filterRow of dynamicFilters) {
          const parsed = parseFilterRow(filterRow)
          if (parsed) {
            // Merge filter into filters object
            // Note: If multiple filters on same field, last one wins
            filters[parsed.field] = parsed.filter
          }
        }
      } catch {
        // Ignore invalid JSON
      }
    }
  }

  return filters
}

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: FmsProject,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: listSchema,
    entityId: E.fms_projects.fms_project, // CRITICAL for search indexing
    fields: [
      'id',
      'project_number',
      'project_date',
      'current_step',
      'cargo_type',
      'shipment_type',
      'direction',
      'incoterm',
      'origin_address',
      'destination_address',
      'requested_pickup_date',
      'requested_delivery_date',
      'client_reference',
      'internal_reference',
      'organization_id',
      'tenant_id',
      'created_at',
      'updated_at',
      'client_id',  // FK field
    ],
    sortFieldMap: {
      id: 'id',
      projectNumber: 'project_number',
      projectDate: 'project_date',
      currentStep: 'current_step',
      cargoType: 'cargo_type',
      shipmentType: 'shipment_type',
      direction: 'direction',
      originAddress: 'origin_address',
      destinationAddress: 'destination_address',
      requestedPickupDate: 'requested_pickup_date',
      clientReference: 'client_reference',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    buildFilters: async (query: any, ctx: any) => buildSearchFilters(query, ctx),
    transformItem: (item: any) => ({
      id: item.id,
      project_number: item.project_number,
      project_date: item.project_date,
      current_step: item.current_step,
      cargo_type: item.cargo_type,
      shipment_type: item.shipment_type,
      direction: item.direction,
      incoterm: item.incoterm,
      origin_address: item.origin_address,
      destination_address: item.destination_address,
      requested_pickup_date: item.requested_pickup_date,
      requested_delivery_date: item.requested_delivery_date,
      client_reference: item.client_reference,
      internal_reference: item.internal_reference,
      organization_id: item.organization_id,
      tenant_id: item.tenant_id,
      created_at: item.created_at,
      updated_at: item.updated_at,
      // Client info - client field returns UUID from FK
      client_id: item.client ?? null,
      client_name: item._clientName ?? null,  // Populated by afterList hook
    }),
  },
  hooks: {
    afterList: async (response: any, ctx: any) => {
      // Fetch client names for all projects that have a client_id
      const clientIds = response.items
        .map((item: any) => item.client_id)
        .filter((id: string | null) => id !== null)

      if (clientIds.length === 0) return

      // Fetch clients in batch
      const em = ctx.container.resolve('em') as EntityManager
      const uniqueClientIds = [...new Set(clientIds)] as string[]
      const clients = await em.find(Contractor, { id: { $in: uniqueClientIds } } as any)
      const clientMap = new Map(clients.map((c: any) => [c.id, c.name || c.shortName || null]))

      // Update items with client names
      for (const item of response.items) {
        if (item.client_id) {
          item.client_name = clientMap.get(item.client_id) ?? null
        }
      }
    },
  },
  // Use command bus actions for create/update/delete
  actions: {
    create: {
      commandId: 'fms_projects.projects.create',
      schema: fmsProjectCreateSchema,
      mapInput: async ({ parsed, ctx }: any) => ({
        ...parsed,
        // Use org/tenant from body, fallback to context
        organizationId: parsed.organizationId ?? ctx.selectedOrganizationId ?? ctx.auth?.orgId,
        tenantId: parsed.tenantId ?? ctx.auth?.tenantId,
      }),
      response: ({ result }: any) => ({ id: result.projectId, projectNumber: result.projectNumber }),
    },
    update: {
      commandId: 'fms_projects.projects.update',
      schema: fmsProjectUpdateSchema,
      mapInput: async ({ parsed, ctx }: any) => ({
        ...parsed,
      }),
      response: ({ result }: any) => ({ id: result.projectId, success: true }),
    },
    delete: {
      commandId: 'fms_projects.projects.delete',
      mapInput: async ({ parsed }: any) => ({
        id: parsed.id,
      }),
      response: () => ({ success: true }),
    },
  },
})

export const GET = crud.GET
export const POST = crud.POST
export const PUT = crud.PUT
export const DELETE = crud.DELETE
