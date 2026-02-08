import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { z } from 'zod'
import { ShipmentTrackingCompany } from '../../data/entities'
import { companyListSchema, companyCreateSchema, companyUpdateSchema } from '../../data/validators'
import { parseBooleanToken } from '@open-mercato/shared/lib/boolean'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import {
  createShipmentTrackingCrudOpenApi,
  createPagedListResponseSchema,
  defaultOkResponseSchema,
} from '../openapi'
import { withScopedPayload } from '../utils'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'

const rawBodySchema = z.object({}).passthrough()

type CompanyListQuery = z.infer<typeof companyListSchema>

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['shipment_tracking.companies.view'] },
  POST: { requireAuth: true, requireFeatures: ['shipment_tracking.companies.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['shipment_tracking.companies.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['shipment_tracking.companies.manage'] },
}

const listFields = [
  'id',
  'name',
  'description',
  'isActive',
  'createdAt',
  'updatedAt',
]

const buildFilters = (query: CompanyListQuery): Record<string, unknown> => {
  const filters: Record<string, unknown> = { deletedAt: null }

  const search = query.search?.trim()
  if (search && search.length > 0) {
    const escaped = escapeLikePattern(search)
    const pattern = `%${escaped}%`
    filters.$or = [
      { name: { $ilike: pattern } },
      { description: { $ilike: pattern } },
    ]
  }

  if (query.isActive !== undefined) {
    const parsed = parseBooleanToken(query.isActive)
    if (parsed !== null) {
      filters.isActive = parsed
    }
  }

  return filters
}

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: ShipmentTrackingCompany,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: companyListSchema,
    fields: listFields,
    sortFieldMap: {
      id: 'id',
      name: 'name',
      isActive: 'is_active',
      createdAt: 'created_at',
    },
    buildFilters: async (query) => buildFilters(query),
  },
  actions: {
    create: {
      commandId: 'shipment_tracking.company.create',
      schema: rawBodySchema,
      mapInput: async ({ raw, ctx }) => {
        const { translate } = await resolveTranslations()
        const scoped = withScopedPayload(raw ?? {}, ctx, translate)
        return companyCreateSchema.parse(scoped)
      },
      response: ({ result }) => ({ id: result?.id ?? null }),
      status: 201,
    },
    update: {
      commandId: 'shipment_tracking.company.update',
      schema: rawBodySchema,
      mapInput: async ({ raw, ctx }) => {
        const { translate } = await resolveTranslations()
        const scoped = withScopedPayload(raw ?? {}, ctx, translate)
        return companyUpdateSchema.parse(scoped)
      },
      response: ({ result }) => ({ id: result?.id ?? null }),
      status: 200,
    },
    delete: {
      commandId: 'shipment_tracking.company.delete',
      schema: rawBodySchema,
      mapInput: async ({ raw, ctx }) => {
        const { translate } = await resolveTranslations()
        const scoped = withScopedPayload(raw ?? {}, ctx, translate)
        return { id: (raw as any)?.id, ...scoped }
      },
      response: ({ result }) => ({ id: result?.id ?? null }),
      status: 200,
    },
  },
})

export const openApi = createShipmentTrackingCrudOpenApi({
  resourceName: 'Company',
  pluralName: 'Companies',
  querySchema: companyListSchema,
  listResponseSchema: createPagedListResponseSchema(z.object({
    id: z.string().uuid(),
    name: z.string(),
    description: z.string().nullable(),
    isActive: z.boolean(),
  })),
  create: {
    schema: rawBodySchema,
    description: 'Creates a new company.',
  },
  update: {
    schema: rawBodySchema,
    responseSchema: defaultOkResponseSchema,
    description: 'Updates an existing company.',
  },
  del: {
    schema: z.object({ id: z.string().uuid() }),
    responseSchema: defaultOkResponseSchema,
    description: 'Deletes a company.',
  },
})

export const metadata = crud.metadata
export const GET = crud.GET
export const POST = crud.POST
export const PUT = crud.PUT
export const DELETE = crud.DELETE
