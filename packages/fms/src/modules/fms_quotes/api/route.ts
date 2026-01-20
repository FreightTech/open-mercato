import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import type { CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import { FmsQuote } from '../data/entities'
import { fmsQuoteCreateSchema, fmsQuoteUpdateSchema } from '../data/validators'
import type { SearchService } from '@open-mercato/search'
import { E } from '@open-mercato/fms/generated/entities.ids.generated'
import { AuthContext } from '@/lib/auth/server'

const listSchema = z
  .object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    q: z.string().optional(),
    status: z.string().optional(),
    direction: z.string().optional(),
    cargo_type: z.string().optional(),
    sortField: z.string().optional(),
    sortDir: z.enum(['asc', 'desc']).optional(),
  })
  .passthrough()

// Field mapping from frontend camelCase to database field names
const FIELD_MAP: Record<string, string> = {
  id: 'id',
  quoteNumber: 'quote_number',
  clientName: 'client_name',
  status: 'status',
  direction: 'direction',
  incoterm: 'incoterm',
  cargoType: 'cargo_type',
  originPortCode: 'origin_port_code',
  destinationPortCode: 'destination_port_code',
  validUntil: 'valid_until',
  currencyCode: 'currency_code',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
}

// Parse DynamicTable FilterRow into query engine filter format
// The query engine expects { field: { $op: value } } format (flat, not nested in $and)
function parseFilterRow(row: { field: string; operator: string; values: unknown[] }): { field: string; filter: Record<string, unknown> } | null {
  const field = FIELD_MAP[row.field]
  if (!field) return null

  switch (row.operator) {
    case 'is_any_of':
      return { field, filter: { $in: row.values } }
    case 'is_not_any_of':
      return { field, filter: { $nin: row.values } }
    case 'contains':
      return { field, filter: { $ilike: `%${row.values[0] || ''}%` } }
    case 'is_empty':
      return { field, filter: { $eq: null } }
    case 'is_not_empty':
      return { field, filter: { $ne: null } }
    case 'equals':
      return { field, filter: { $eq: row.values[0] } }
    case 'not_equals':
      return { field, filter: { $ne: row.values[0] } }
    case 'is_true':
      return { field, filter: { $eq: true } }
    case 'is_false':
      return { field, filter: { $eq: false } }
    default:
      return null
  }
}

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_quotes.quotes.view'] },
  POST: { requireAuth: true, requireFeatures: ['fms_quotes.quotes.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_quotes.quotes.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_quotes.quotes.manage'] },
}

export const metadata = routeMetadata

async function buildSearchFilters(
  query: z.infer<typeof listSchema>,
  ctx: { container: { resolve: (key: string) => unknown }; auth?: AuthContext | null; request?: Request }
): Promise<Record<string, unknown>> {
  const filters: Record<string, unknown> = {}
  const tenantId = ctx.auth?.tenantId

  if (query.q && query.q.trim().length > 0 && tenantId) {
    try {
      const searchService = ctx.container.resolve('searchService') as SearchService | undefined

      if (searchService) {
        const results = await searchService.search(query.q.trim(), {
          tenantId,
          organizationId: null,
          limit: 100,
          strategies: ['fulltext'],
          entityTypes: ['fms_quotes:fms_quote'],
        })

        if (results.length > 0) {
          filters.id = { $in: results.map((r) => r.recordId) }
        } else {
          filters.id = { $in: ['00000000-0000-0000-0000-000000000000'] }
        }
      }
    } catch (error) {
      console.error('[fms_quotes:search] Search service error:', error)
    }
  }

  if (query.status) {
    filters.status = query.status
  }

  if (query.direction) {
    filters.direction = query.direction
  }

  if (query.cargo_type) {
    filters.cargo_type = query.cargo_type
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
    entity: FmsQuote,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: listSchema,
    entityId: E.fms_quotes.fms_quote,
    fields: [
      'id',
      'quote_number',
      'client_name',
      'container_count',
      'status',
      'direction',
      'incoterm',
      'cargo_type',
      'origin_port_code',
      'destination_port_code',
      'valid_until',
      'currency_code',
      'notes',
      'organization_id',
      'tenant_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: {
      id: 'id',
      quoteNumber: 'quote_number',
      status: 'status',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    buildFilters: async (query, ctx) => buildSearchFilters(query, ctx),
    transformItem: (item: any) => ({
      id: item.id,
      quote_number: item.quote_number ?? null,
      client_name: item.client_name ?? null,
      container_count: item.container_count ?? null,
      status: item.status ?? 'draft',
      direction: item.direction ?? null,
      incoterm: item.incoterm ?? null,
      cargo_type: item.cargo_type ?? null,
      origin_port_code: item.origin_port_code ?? null,
      destination_port_code: item.destination_port_code ?? null,
      valid_until: item.valid_until ?? null,
      currency_code: item.currency_code ?? 'USD',
      notes: item.notes ?? null,
      organization_id: item.organization_id ?? null,
      tenant_id: item.tenant_id ?? null,
      created_at: item.created_at,
      updated_at: item.updated_at,
    }),
  },
  actions: {
    create: {
      commandId: 'fms_quotes.quotes.create',
      schema: fmsQuoteCreateSchema.partial(),
      mapInput: async ({ parsed, ctx }) => ({
        ...parsed,
        organizationId: ctx.selectedOrganizationId ?? ctx.auth?.orgId,
        tenantId: ctx.auth?.tenantId,
      }),
      response: ({ result }) => ({ id: result.quoteId }),
    },
    update: {
      commandId: 'fms_quotes.quotes.update',
      schema: fmsQuoteUpdateSchema,
      mapInput: async ({ parsed }) => parsed,
      response: ({ result }) => ({ id: result.quoteId }),
    },
    delete: {
      commandId: 'fms_quotes.quotes.delete',
      mapInput: async ({ raw }) => raw,
      response: () => ({ success: true }),
    },
  },
  indexer: {
    entityType: E.fms_quotes.fms_quote,
  },
})

export const GET = crud.GET
export const POST = crud.POST
export const PUT = crud.PUT
export const DELETE = crud.DELETE
