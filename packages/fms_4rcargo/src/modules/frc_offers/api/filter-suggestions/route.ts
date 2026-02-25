import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import type { Knex } from 'knex'
import type { EntityManager } from '@mikro-orm/postgresql'
import { FrcOffer } from '../../data/entities'
import { FrcRfq } from '../../../frc_rfqs/data/entities'

export const metadata = {
  GET: { requireAuth: true },
}

const querySchema = z.object({
  field: z.string().min(1, 'field is required'),
  query: z.string().optional().default(''),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
})

const responseSchema = z.object({
  items: z.array(z.string()),
})

/**
 * Build scope filters for MikroORM queries.
 * Uses the same pattern as frc_projects for consistent organization scoping.
 */
function buildScopeFilters(
  auth: { tenantId?: string | null; orgId?: string | null },
  scope: { tenantId?: string | null; selectedId?: string | null; filterIds?: string[] | null; allowedIds?: string[] | null } | null
): { tenantId?: string; organizationId?: { $in: string[] } } {
  const filters: { tenantId?: string; organizationId?: { $in: string[] } } = {}

  if (typeof auth.tenantId === 'string') {
    filters.tenantId = auth.tenantId
  }

  // Determine organization IDs to filter by:
  // 1. If filterIds has values, use them
  // 2. If filterIds is empty but allowedIds is null (superadmin "All orgs"), no org filter
  // 3. Otherwise fall back to auth.orgId
  const filterIds = scope?.filterIds
  if (Array.isArray(filterIds) && filterIds.length > 0) {
    filters.organizationId = { $in: filterIds }
  } else if (scope?.allowedIds === null) {
    // Superadmin with "All organizations" selected - no org filter needed
  } else if (auth.orgId) {
    // Fall back to user's default organization
    filters.organizationId = { $in: [auth.orgId] }
  }

  return filters
}

/**
 * Filter suggestions endpoint for FRC Offers.
 * Handles special cases like rfqName which requires joining with frc_rfqs table.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)

  const parsed = querySchema.safeParse({
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

  const { field, query, limit } = parsed.data

  const auth = await getAuthFromRequest(req)
  if (!auth || !auth.tenantId) {
    return NextResponse.json({ error: 'Unauthorized', items: [] }, { status: 401 })
  }

  try {
    const container = await createRequestContainer()
    const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
    const em = container.resolve('em') as EntityManager

    const scopeFilters = buildScopeFilters(auth, scope)

    // Handle rfqName specially - get RFQ names that are linked to offers
    if (field === 'rfq_name' || field === 'rfqName') {
      // Get distinct rfqIds from offers with scope filters
      const offerFilter: Record<string, unknown> = {
        ...scopeFilters,
        deletedAt: null,
      }

      const offers = await em.find(
        FrcOffer,
        offerFilter,
        { fields: ['rfqId'] }
      )
      const rfqIds = [...new Set(offers.map((o) => o.rfqId).filter(Boolean))]

      if (rfqIds.length === 0) {
        return NextResponse.json({ items: [] })
      }

      // Get RFQ names for those IDs (also apply scope filters for security)
      const rfqFilter: Record<string, unknown> = {
        ...scopeFilters,
        id: { $in: rfqIds },
        name: { $ne: null },
        deletedAt: null,
      }
      if (query.trim()) {
        rfqFilter.name = { $ilike: `%${query}%` }
      }

      const rfqs = await em.find(
        FrcRfq,
        rfqFilter,
        { fields: ['name'], limit, orderBy: { name: 'ASC' } }
      )

      const items = [...new Set(rfqs.map((r) => r.name).filter((n): n is string => n != null && n.trim() !== ''))]
        .slice(0, limit)

      return NextResponse.json({ items })
    }

    // For other fields, query entity_indexes
    const knex = (em as any).getConnection().getKnex() as Knex
    const snakeCaseField = field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)

    const result = await knex('entity_indexes')
      .select(knex.raw(`DISTINCT doc->>'${snakeCaseField}' as value`))
      .where('entity_type', 'frc_offers:frc_offer')
      .where('tenant_id', auth.tenantId)
      .whereRaw(`doc->>'${snakeCaseField}' IS NOT NULL`)
      .whereRaw(`doc->>'${snakeCaseField}' != ''`)
      .modify((qb: any) => {
        // Apply organization filter from scope
        if (scopeFilters.organizationId) {
          qb.whereIn('organization_id', scopeFilters.organizationId.$in)
        }
        if (query.trim()) {
          qb.whereRaw(`LOWER(doc->>'${snakeCaseField}') LIKE ?`, [`%${query.toLowerCase()}%`])
        }
      })
      .orderBy('value')
      .limit(limit)

    const items = result
      .map((row: { value: string | null }) => row.value)
      .filter((v: string | null): v is string => v != null && v.trim() !== '')

    return NextResponse.json({ items })
  } catch (error) {
    console.error('[frc-offers/filter-suggestions] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch suggestions', items: [] },
      { status: 500 }
    )
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'FRC Offers',
  summary: 'Filter suggestions for offers',
  methods: {
    GET: {
      summary: 'Get filter suggestions for offer fields',
      description:
        'Returns distinct values for a specific field. Handles rfqName specially by joining with frc_rfqs to get RFQ names for offers.',
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
