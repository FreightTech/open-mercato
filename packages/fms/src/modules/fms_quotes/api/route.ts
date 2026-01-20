import { z } from 'zod'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import type { CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsQuote } from '../data/entities'
import { fmsQuoteCreateSchema, fmsQuoteUpdateSchema } from '../data/validators'
import type { SearchService } from '@open-mercato/search'
import { E } from '@open-mercato/fms/generated/entities.ids.generated'
import { AuthContext } from '@/lib/auth/server'

// Type for list items in afterList hook
type QuoteListItem = {
  id: string
  clientId?: string | null
  assignedToId?: string | null
  [key: string]: unknown
}

const listSchema = z
  .object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    q: z.string().optional(),
    status: z.string().optional(),
    direction: z.string().optional(),
    cargo_type: z.string().optional(),
    clientId: z.string().uuid().optional(),
    sortField: z.string().optional(),
    sortDir: z.enum(['asc', 'desc']).optional(),
  })
  .passthrough()

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_quotes.quotes.view'] },
  POST: { requireAuth: true, requireFeatures: ['fms_quotes.quotes.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_quotes.quotes.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_quotes.quotes.manage'] },
}

export const metadata = routeMetadata

async function buildSearchFilters(
  query: z.infer<typeof listSchema>,
  ctx: { container: { resolve: (key: string) => unknown }; auth?: AuthContext | null }
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

  if (query.clientId) {
    filters.client_id = query.clientId
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
      'client_id',
      'assigned_to_id',
      'container_count',
      'status',
      'direction',
      'incoterm',
      'cargo_type',
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
      quoteNumber: item.quote_number ?? null,
      clientId: item.client_id ?? null,
      clientName: null, // Will be enriched in afterList hook
      assignedToId: item.assigned_to_id ?? null,
      assignedToName: null, // Will be enriched in afterList hook
      containerCount: item.container_count ?? null,
      status: item.status ?? 'draft',
      direction: item.direction ?? null,
      incoterm: item.incoterm ?? null,
      cargoType: item.cargo_type ?? null,
      validUntil: item.valid_until ?? null,
      currencyCode: item.currency_code ?? 'USD',
      notes: item.notes ?? null,
      organizationId: item.organization_id ?? null,
      tenantId: item.tenant_id ?? null,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }),
  },
  hooks: {
    afterList: async (res, ctx) => {
      if (!res.items || res.items.length === 0) return

      const em = ctx.container.resolve('em') as EntityManager
      const knex = (em as any).getConnection().getKnex()

      // Collect unique IDs
      const clientIds = new Set<string>()
      const userIds = new Set<string>()
      const items = res.items as QuoteListItem[]
      const quoteIds = items.map((item) => item.id)

      for (const item of items) {
        if (item.clientId) clientIds.add(item.clientId)
        if (item.assignedToId) userIds.add(item.assignedToId)
      }

      // Batch fetch names
      const clientMap = new Map<string, string>()
      const userMap = new Map<string, string>()

      if (clientIds.size > 0) {
        const clients = await knex('contractors')
          .select('id', 'name')
          .whereIn('id', Array.from(clientIds))
        for (const c of clients) {
          clientMap.set(c.id, c.name)
        }
      }

      if (userIds.size > 0) {
        const users = await knex('users')
          .select('id', 'name', 'email')
          .whereIn('id', Array.from(userIds))
        console.log('[fms_quotes:afterList] Fetched users:', users)
        for (const u of users) {
          // Fallback to email if name is null
          const displayName = u.name || u.email
          console.log(`[fms_quotes:afterList] User ${u.id}: name=${u.name}, email=${u.email}, displayName=${displayName}`)
          userMap.set(u.id, displayName)
        }
      }

      // Fetch ports and lines for all quotes
      const originPortsMap = new Map<
        string,
        Array<{ id: string; locode: string | null; name: string | null }>
      >()
      const destinationPortsMap = new Map<
        string,
        Array<{ id: string; locode: string | null; name: string | null }>
      >()
      const quoteTotalsMap = new Map<string, { totalCost: string; totalSales: string }>()

      if (quoteIds.length > 0) {
        // Fetch origin ports
        const originPortRows = await knex('fms_quote_origin_ports as qop')
          .join('fms_locations as l', 'qop.location_id', 'l.id')
          .select('qop.quote_id', 'l.id', 'l.locode', 'l.name')
          .whereIn('qop.quote_id', quoteIds)

        for (const row of originPortRows) {
          if (!originPortsMap.has(row.quote_id)) {
            originPortsMap.set(row.quote_id, [])
          }
          originPortsMap.get(row.quote_id)!.push({
            id: row.id,
            locode: row.locode,
            name: row.name,
          })
        }

        // Fetch destination ports
        const destPortRows = await knex('fms_quote_destination_ports as qdp')
          .join('fms_locations as l', 'qdp.location_id', 'l.id')
          .select('qdp.quote_id', 'l.id', 'l.locode', 'l.name')
          .whereIn('qdp.quote_id', quoteIds)

        for (const row of destPortRows) {
          if (!destinationPortsMap.has(row.quote_id)) {
            destinationPortsMap.set(row.quote_id, [])
          }
          destinationPortsMap.get(row.quote_id)!.push({
            id: row.id,
            locode: row.locode,
            name: row.name,
          })
        }

        // Fetch quote lines and calculate totals
        const lineRows = await knex('fms_quote_lines')
          .select('quote_id', 'quantity', 'unit_cost', 'unit_sales')
          .whereIn('quote_id', quoteIds)
          .whereNull('deleted_at')

        const lineTotals = new Map<string, { cost: number; sales: number }>()
        for (const row of lineRows) {
          if (!lineTotals.has(row.quote_id)) {
            lineTotals.set(row.quote_id, { cost: 0, sales: 0 })
          }
          const totals = lineTotals.get(row.quote_id)!
          const qty = parseFloat(row.quantity) || 0
          const unitCost = parseFloat(row.unit_cost) || 0
          const unitSales = parseFloat(row.unit_sales) || 0
          totals.cost += qty * unitCost
          totals.sales += qty * unitSales
        }

        for (const [quoteId, totals] of lineTotals) {
          quoteTotalsMap.set(quoteId, {
            totalCost: totals.cost.toFixed(2),
            totalSales: totals.sales.toFixed(2),
          })
        }
      }

      // Enrich items
      console.log('[fms_quotes:afterList] Enriching items, userMap size:', userMap.size)
      for (const item of items) {
        if (item.clientId) {
          item.clientName = clientMap.get(item.clientId) ?? null
        }
        if (item.assignedToId) {
          const resolvedName = userMap.get(item.assignedToId) ?? null
          console.log(`[fms_quotes:afterList] Quote ${item.id}: assignedToId=${item.assignedToId}, resolvedName=${resolvedName}`)
          item.assignedToName = resolvedName
        }

        // Add ports
        item.originPorts = originPortsMap.get(item.id) || []
        item.destinationPorts = destinationPortsMap.get(item.id) || []

        // Add totals
        const totals = quoteTotalsMap.get(item.id)
        item.totalCost = totals?.totalCost ?? null
        item.totalSales = totals?.totalSales ?? null
      }
    },
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
