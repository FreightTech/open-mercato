import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { memberListQuerySchema } from '../../data/validators'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_teams.view'] },
}

const listSchema = memberListQuerySchema.extend({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).optional(),
  sortField: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  q: z.string().optional(),
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
  const limit = query.pageSize ?? query.limit ?? 50
  const offset = (page - 1) * limit

  const em = container.resolve('em') as EntityManager
  const knex = (em.getConnection() as unknown as { getKnex(): import('knex').Knex }).getKnex()

  // Query all org users with their team assignments
  // Left join to get team info even if user has no team assignment
  let baseQuery = knex('users as u')
    .leftJoin('fms_user_teams as ut', function () {
      this.on('ut.user_id', '=', 'u.id')
        .andOn('ut.organization_id', '=', knex.raw('?', [organizationId]))
    })
    .leftJoin('fms_teams as t', function () {
      this.on('t.id', '=', 'ut.team_id').andOnNull('t.deleted_at')
    })
    .where('u.organization_id', organizationId)
    .whereNull('u.deleted_at')

  // Apply search filter (accept both 'search' and 'q' param names)
  const searchTerm = query.search || query.q
  if (searchTerm) {
    const pattern = `%${escapeLikePattern(searchTerm)}%`
    baseQuery = baseQuery.where(function () {
      this.where('u.name', 'ilike', pattern).orWhere('u.email', 'ilike', pattern)
    })
  }

  // Apply team filter
  if (query.teamId) {
    baseQuery = baseQuery.where('ut.team_id', query.teamId)
  }

  // Get total count
  const countResult = await baseQuery.clone().countDistinct('u.id as count').first()
  const total = Number(countResult?.count ?? 0)

  // Apply sorting
  const sortField = query.sortField || query.sortBy || 'userName'
  const sortDir = query.sortDir || query.sortOrder || 'asc'
  const sortFieldMap: Record<string, string> = {
    userName: 'u.name',
    userEmail: 'u.email',
    teamName: 't.name',
  }
  const sortColumn = sortFieldMap[sortField] || 'u.name'

  // Get members
  const rows = await baseQuery
    .clone()
    .select(
      'ut.id as id',
      'ut.team_id as teamId',
      't.name as teamName',
      'u.id as userId',
      'u.name as userName',
      'u.email as userEmail'
    )
    .orderByRaw(`${sortColumn} ${sortDir} NULLS LAST`)
    .limit(limit)
    .offset(offset)

  const items = rows.map((row) => ({
    id: row.id || null, // FmsUserTeam.id may be null if no record exists yet
    teamId: row.teamId || null,
    teamName: row.teamName || null,
    userId: row.userId,
    userName: row.userName || row.userEmail, // Fall back to email if name is null
    userEmail: row.userEmail,
  }))

  return NextResponse.json({
    items,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  })
}
