import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@/lib/di/container'
import { getAuthFromRequest } from '@/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { EntityManager } from '@mikro-orm/postgresql'
import { FmsDocument, DocumentCategory } from '../../data/entities'
import { documentListQuerySchema } from '../../data/validators'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
// Import to register commands
import '../../commands'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_documents.view'] },
  POST: { requireAuth: true, requireFeatures: ['fms_documents.manage'] },
}

export const metadata = routeMetadata

// Field mapping from frontend camelCase to database field names
const FIELD_MAP: Record<string, string> = {
  id: 'id',
  name: 'name',
  category: 'category',
  description: 'description',
  attachmentId: 'attachmentId',
  relatedEntityId: 'relatedEntityId',
  relatedEntityType: 'relatedEntityType',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  createdBy: 'createdBy',
  updatedBy: 'updatedBy',
}

// Parse DynamicTable FilterRow into MikroORM filter format
function parseFilterRow(row: { field: string; operator: string; values: unknown[] }): Record<string, unknown> | null {
  const field = FIELD_MAP[row.field]
  if (!field) return null

  switch (row.operator) {
    case 'is_any_of':
      return { [field]: { $in: row.values } }
    case 'is_not_any_of':
      return { [field]: { $nin: row.values } }
    case 'contains':
      return { [field]: { $ilike: `%${row.values[0] || ''}%` } }
    case 'is_empty':
      return { [field]: { $eq: null } }
    case 'is_not_empty':
      return { [field]: { $ne: null } }
    case 'equals':
      return { [field]: { $eq: row.values[0] } }
    case 'not_equals':
      return { [field]: { $ne: row.values[0] } }
    case 'is_true':
      return { [field]: { $eq: true } }
    case 'is_false':
      return { [field]: { $eq: false } }
    default:
      return null
  }
}

function buildSearchFilters(query: z.infer<typeof documentListQuerySchema>): Record<string, unknown> {
  const filters: Record<string, unknown> = {}

  if (!query.includeDeleted) {
    filters.deletedAt = null
  }

  if (query.category) {
    filters.category = query.category
  }

  if (query.relatedEntityId) {
    filters.relatedEntityId = query.relatedEntityId
  }

  if (query.relatedEntityType) {
    filters.relatedEntityType = query.relatedEntityType
  }

  if (query.search && query.search.trim().length > 0) {
    const term = `%${escapeLikePattern(query.search.trim())}%`
    filters.$or = [
      { name: { $ilike: term } },
      { description: { $ilike: term } },
    ]
  }

  return filters
}

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const query: Record<string, string | undefined> = {}
  url.searchParams.forEach((value, key) => {
    query[key] = value
  })

  const parse = documentListQuerySchema.safeParse(query)
  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', details: parse.error },
      { status: 400 }
    )
  }

  try {
    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')

    const tenantId = auth.actorTenantId || auth.tenantId
    const organizationId = auth.actorOrgId || auth.orgId

    const filters = buildSearchFilters(parse.data)

    // Parse DynamicTable filters from query string
    const filtersParam = url.searchParams.get('filters')
    if (filtersParam) {
      try {
        const dynamicFilters: Array<{ field: string; operator: string; values: unknown[] }> = JSON.parse(filtersParam)
        if (dynamicFilters.length > 0) {
          const parsedFilters = dynamicFilters
            .map(parseFilterRow)
            .filter((f): f is Record<string, unknown> => f !== null)

          if (parsedFilters.length > 0) {
            filters.$and = [...(filters.$and as Record<string, unknown>[] || []), ...parsedFilters]
          }
        }
      } catch {
        // Ignore invalid JSON
      }
    }

    const page = parse.data.page || 1
    const pageSize = parse.data.limit || 20
    const offset = (page - 1) * pageSize

    const [items, total] = await em.findAndCount(
      FmsDocument,
      {
        ...filters,
        tenantId: tenantId as string,
        organizationId: organizationId as string,
      },
      {
        limit: pageSize,
        offset,
        orderBy: { [parse.data.sortField || 'createdAt']: parse.data.sortDir || 'desc' },
      }
    )

    return NextResponse.json({
      items: items.map((item) => ({
        id: item.id,
        name: item.name ?? null,
        category: item.category ?? 'other',
        description: item.description ?? null,
        attachmentId: item.attachmentId ?? null,
        relatedEntityId: item.relatedEntityId ?? null,
        relatedEntityType: item.relatedEntityType ?? null,
        organizationId: item.organizationId ?? null,
        tenantId: item.tenantId ?? null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        createdBy: item.createdBy ?? null,
        updatedBy: item.updatedBy ?? null,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    })
  } catch (error: any) {
    console.error('[fms-documents] list error:', error)
    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 })
  }
}

const createDocumentSchema = z.object({
  name: z.string().min(1).max(500),
  category: z.enum(['offer', 'invoice', 'customs', 'bill_of_lading', 'other']).optional().default('other'),
  description: z.string().max(2000).optional().nullable(),
  attachmentId: z.string().uuid(),
  relatedEntityId: z.string().uuid().optional().nullable(),
  relatedEntityType: z.string().max(100).optional().nullable(),
})

export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parse = createDocumentSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parse.error },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })

  const tenantId = auth.actorTenantId || auth.tenantId
  const organizationId = auth.actorOrgId || auth.orgId

  if (!tenantId || !organizationId) {
    return NextResponse.json({ error: 'Missing tenant or organization context' }, { status: 400 })
  }

  const ctx: CommandRuntimeContext = {
    container,
    auth,
    organizationScope: scope,
    selectedOrganizationId: organizationId as string,
    organizationIds: scope?.filterIds ?? null,
    request,
  }

  const bus = new CommandBus()

  try {
    const { result } = await bus.execute<
      Record<string, unknown>,
      { id: string }
    >('fms_documents.documents.create', {
      input: {
        organizationId: organizationId as string,
        tenantId: tenantId as string,
        ...parse.data,
      },
      ctx,
    })

    // Fetch created document
    const em = container.resolve<EntityManager>('em')
    const document = await em.findOne(FmsDocument, { id: result.id })

    return NextResponse.json({
      ok: true,
      item: document ? {
        id: document.id,
        name: document.name,
        category: document.category,
        attachmentId: document.attachmentId,
        createdAt: document.createdAt,
      } : { id: result.id },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create document'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
