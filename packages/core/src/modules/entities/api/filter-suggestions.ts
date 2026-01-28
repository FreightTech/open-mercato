import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { QueryEngine } from '@open-mercato/shared/lib/query/types'
import type { EntityId } from '@open-mercato/shared/modules/entities'
import { resolveOrganizationScope, getSelectedOrganizationFromRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'

// Convert camelCase to snake_case
function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

export const metadata = {
  GET: { requireAuth: true },
}

const querySchema = z.object({
  entityId: z.string().min(1, 'entityId is required'),
  field: z.string().min(1, 'field is required'),
  query: z.string().optional().default(''),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
})

const responseSchema = z.object({
  items: z.array(z.string()),
})

/**
 * Generic filter suggestions API endpoint.
 * Returns distinct values for a specific field from any entity.
 * Respects tenant/organization scoping.
 *
 * Query parameters:
 * - entityId: The entity type (e.g., 'catalog:products', 'customers:people')
 * - field: The field/column name to get suggestions for
 * - query: Optional search term to filter suggestions
 * - limit: Max number of suggestions to return (default: 50, max: 100)
 */
export async function GET(req: Request) {
  const url = new URL(req.url)

  // Parse and validate query parameters
  const parsed = querySchema.safeParse({
    entityId: url.searchParams.get('entityId') ?? '',
    field: url.searchParams.get('field') ?? '',
    query: url.searchParams.get('query') ?? url.searchParams.get('q') ?? '',
    limit: url.searchParams.get('limit') ?? 50,
  })

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid parameters', items: [] },
      { status: 400 }
    )
  }

  const { entityId, field, query, limit } = parsed.data

  // Authenticate and get tenant context
  const auth = await getAuthFromRequest(req)
  if (!auth || !auth.tenantId) {
    return NextResponse.json({ error: 'Unauthorized', items: [] }, { status: 401 })
  }

  try {
    const { resolve } = await createRequestContainer()
    const queryEngine = resolve('queryEngine') as QueryEngine
    const em = resolve('em') as any
    const rbac = resolve('rbacService') as RbacService

    // Resolve organization scope for proper data filtering
    const scope = await resolveOrganizationScope({
      em,
      rbac,
      auth,
      selectedId: getSelectedOrganizationFromRequest(req),
    })

    const organizationIds = scope.filterIds

    // If user has no organization access, return empty
    if (organizationIds && organizationIds.length === 0) {
      return NextResponse.json({ items: [] })
    }

    // Determine if this is a custom field (cf_* or cf:*)
    const isCustomField = field.startsWith('cf_') || field.startsWith('cf:')

    // Convert field name to snake_case for query engine (database uses snake_case)
    const snakeCaseField = toSnakeCase(field)

    // Build filter for the search query
    const filters: Record<string, any> = {}

    if (query.trim()) {
      // Use snake_case field name for filters
      filters[snakeCaseField] = { $ilike: `%${query}%` }
    }

    // Query the entity using the query engine
    const result = await queryEngine.query<Record<string, unknown>>(entityId as EntityId, {
      tenantId: auth.tenantId,
      organizationIds: organizationIds ?? undefined,
      filters,
      // Don't specify fields - let the query engine return all fields
      // This avoids issues with field name mapping
      includeCustomFields: isCustomField ? [field.replace(/^cf[_:]/, '')] : undefined,
      page: { page: 1, pageSize: limit * 2 }, // Fetch extra to account for duplicates
    })

    // Extract unique values from the results
    const uniqueValues = new Set<string>()

    for (const item of result.items ?? []) {
      if (!item || typeof item !== 'object') continue

      let value: unknown
      const record = item as Record<string, unknown>

      if (isCustomField) {
        // For custom fields, the value might be in a nested structure
        const cfKey = field.replace(/^cf[_:]/, '')
        value = record[field] ?? record[`cf_${cfKey}`] ?? record[`cf:${cfKey}`]
      } else {
        // Try both camelCase and snake_case field names
        value = record[field] ?? record[snakeCaseField]
      }

      // Handle different value types
      if (value == null) continue

      if (Array.isArray(value)) {
        // For array values (e.g., multi-select fields), add each item
        for (const v of value) {
          if (v != null) {
            const str = String(v).trim()
            if (str) uniqueValues.add(str)
          }
        }
      } else {
        const str = String(value).trim()
        if (str) uniqueValues.add(str)
      }

      // Stop if we have enough unique values
      if (uniqueValues.size >= limit) break
    }

    // Sort and limit the results
    const items = Array.from(uniqueValues)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, limit)

    return NextResponse.json({ items })
  } catch (error) {
    console.error('[filter-suggestions] Error fetching suggestions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch suggestions', items: [] },
      { status: 500 }
    )
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Entities',
  summary: 'Filter suggestions',
  methods: {
    GET: {
      summary: 'Get filter suggestions for a field',
      description:
        'Returns distinct values for a specific field from any entity. Used by DynamicTable filter popover to provide autocomplete suggestions for large datasets.',
      query: querySchema,
      responses: [
        {
          status: 200,
          description: 'List of unique values for the field',
          schema: responseSchema,
        },
        {
          status: 400,
          description: 'Invalid parameters',
          schema: z.object({ error: z.string(), items: z.array(z.string()) }),
        },
        {
          status: 401,
          description: 'Unauthorized',
          schema: z.object({ error: z.string(), items: z.array(z.string()) }),
        },
        {
          status: 500,
          description: 'Server error',
          schema: z.object({ error: z.string(), items: z.array(z.string()) }),
        },
      ],
    },
  },
}
