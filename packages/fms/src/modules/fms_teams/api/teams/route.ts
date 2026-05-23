import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'
import { sql } from 'kysely'
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
  const db = em.getKysely<any>()

  // Build base query
  const baseQuery = () => {
    let qb = db.selectFrom('fms_teams as t')
      .where('t.organization_id', '=', organizationId)
      .where('t.tenant_id', '=', tenantId)
      .where('t.deleted_at', 'is', null)

    // Apply search filter
    if (query.search) {
      const pattern = `%${escapeLikePattern(query.search)}%`
      qb = qb.where('t.name', 'ilike', pattern)
    }

    // Apply isActive filter
    if (typeof query.isActive === 'boolean') {
      qb = qb.where('t.is_active', '=', query.isActive)
    }

    return qb
  }

  // Get total count
  const countResult = await baseQuery().select(({ fn }) => fn.countAll().as('count')).executeTakeFirst()
  const total = Number(countResult?.count ?? 0)

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
  const rows = await baseQuery()
    .leftJoin(
      (eb) => eb
        .selectFrom('fms_user_teams')
        .select(['team_id', (b) => b.fn.countAll().as('member_count')])
        .where('organization_id', '=', organizationId)
        .where('team_id', 'is not', null)
        .groupBy('team_id')
        .as('mc'),
      (join) => join.onRef('mc.team_id', '=', 't.id')
    )
    .select([
      't.id',
      't.name',
      't.is_active as isActive',
      't.created_at as createdAt',
      sql<number>`COALESCE(mc.member_count, 0)::int`.as('memberCount'),
    ])
    .orderBy(sortColumn, sortDir as 'asc' | 'desc')
    .limit(limit)
    .offset(offset)
    .execute()

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
    organizationScope: scope,
    selectedOrganizationId: organizationId,
    organizationIds: scope?.filterIds ?? null,
  }

  try {
    const { result } = await commandBus.execute<{ name: string; organizationId: string; tenantId: string }, { teamId: string }>('fms_teams.create', {
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
      return NextResponse.json(error.body, { status: error.status })
    }
    throw error
  }
}
