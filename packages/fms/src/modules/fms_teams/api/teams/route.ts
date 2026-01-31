import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { FmsTeam, FmsUserTeam } from '../../data/entities'
import { teamListQuerySchema, teamCreateSchema } from '../../data/validators'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_teams.view'] },
  POST: { requireAuth: true, requireFeatures: ['fms_teams.manage'] },
}

const listSchema = teamListQuerySchema.extend({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
  sortField: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
})

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const organizationId = scope.selectedId
  const tenantId = scope.tenantId

  if (!organizationId || !tenantId) {
    return NextResponse.json({ error: 'Organization scope required' }, { status: 400 })
  }

  const url = new URL(request.url)
  const queryRaw: Record<string, string> = {}
  url.searchParams.forEach((value, key) => {
    queryRaw[key] = value
  })

  const query = listSchema.parse(queryRaw)
  const page = query.page
  const limit = query.pageSize
  const offset = (page - 1) * limit

  const em = container.resolve('em') as EntityManager
  const knex = (em.getConnection() as unknown as { getKnex(): import('knex').Knex }).getKnex()

  // Build base query
  let baseQuery = knex('fms_teams as t')
    .where('t.organization_id', organizationId)
    .where('t.tenant_id', tenantId)
    .whereNull('t.deleted_at')

  // Apply search filter
  if (query.search) {
    const pattern = `%${escapeLikePattern(query.search)}%`
    baseQuery = baseQuery.where('t.name', 'ilike', pattern)
  }

  // Apply isActive filter
  if (typeof query.isActive === 'boolean') {
    baseQuery = baseQuery.where('t.is_active', query.isActive)
  }

  // Get total count
  const countResult = await baseQuery.clone().count('* as count').first()
  const total = Number(countResult?.count ?? 0)

  // Get member counts per team
  const memberCountsQuery = knex('fms_user_teams')
    .select('team_id')
    .count('* as member_count')
    .where('organization_id', organizationId)
    .whereNotNull('team_id')
    .groupBy('team_id')
    .as('mc')

  // Apply sorting
  const sortField = query.sortField || query.sortBy || 'name'
  const sortDir = query.sortDir || query.sortOrder || 'asc'
  const sortFieldMap: Record<string, string> = {
    name: 't.name',
    createdAt: 't.created_at',
    isActive: 't.is_active',
  }
  const sortColumn = sortFieldMap[sortField] || 't.name'

  // Get teams with member count
  const rows = await baseQuery
    .clone()
    .select(
      't.id',
      't.name',
      't.is_active as isActive',
      't.created_at as createdAt',
      knex.raw('COALESCE(mc.member_count, 0)::int as "memberCount"')
    )
    .leftJoin(memberCountsQuery, 'mc.team_id', 't.id')
    .orderBy(sortColumn, sortDir)
    .limit(limit)
    .offset(offset)

  const items = rows.map((row) => ({
    id: row.id,
    name: row.name,
    isActive: row.isActive,
    memberCount: row.memberCount,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  }))

  return NextResponse.json({
    items,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const organizationId = scope.selectedId
  const tenantId = scope.tenantId

  if (!organizationId || !tenantId) {
    return NextResponse.json({ error: 'Organization scope required' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = teamCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  const commandBus = container.resolve('commandBus') as CommandBus
  const ctx: CommandRuntimeContext = {
    container,
    auth,
    selectedOrganizationId: organizationId,
  }

  try {
    const { result } = await commandBus.execute('fms_teams.create', {
      input: {
        ...parsed.data,
        organizationId,
        tenantId,
      },
      ctx,
    })

    return NextResponse.json({ id: result.teamId }, { status: 201 })
  } catch (error) {
    if (error instanceof CrudHttpError) {
      return NextResponse.json(error.payload, { status: error.status })
    }
    throw error
  }
}
