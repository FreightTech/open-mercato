import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { z } from 'zod'
import { CargoEvent } from '../../data/entities'
import { cargoEventListSchema } from '../../data/validators'
import {
  createShipmentTrackingCrudOpenApi,
  createPagedListResponseSchema,
} from '../openapi'

type CargoEventListQuery = z.infer<typeof cargoEventListSchema>

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['shipment_tracking.shipments.view'] },
}

const listFields = [
  'id',
  'shipment',
  'eventId',
  'eventType',
  'eventCode',
  'eventClassification',
  'eventDateTime',
  'description',
  'locationName',
  'locationUnlocode',
  'locationCountry',
  'vesselName',
  'vesselImo',
  'voyageNumber',
  'createdAt',
]

const buildFilters = (query: CargoEventListQuery): Record<string, unknown> => {
  const filters: Record<string, unknown> = {}

  if (query.shipmentId) {
    filters.shipment = query.shipmentId
  }

  if (query.eventType) {
    filters.eventType = query.eventType
  }

  if (query.eventCode) {
    filters.eventCode = query.eventCode
  }

  return filters
}

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: CargoEvent,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: null,
  },
  list: {
    schema: cargoEventListSchema,
    fields: listFields,
    sortFieldMap: {
      id: 'id',
      eventDateTime: 'event_date_time',
      eventType: 'event_type',
      eventCode: 'event_code',
      createdAt: 'created_at',
    },
    buildFilters: async (query) => buildFilters(query),
  },
})

export const openApi = createShipmentTrackingCrudOpenApi({
  resourceName: 'CargoEvent',
  pluralName: 'CargoEvents',
  querySchema: cargoEventListSchema,
  listResponseSchema: createPagedListResponseSchema(z.object({
    id: z.string().uuid(),
    eventType: z.string(),
    eventCode: z.string(),
    eventDateTime: z.string(),
    locationName: z.string().nullable(),
  })),
})

export const metadata = crud.metadata
export const GET = crud.GET
