import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'
import { sql } from 'kysely'
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
  const db = em.getKysely<any>()

  // Query all org users with their team assignments
  // Left join to get team info even if user has no team assignment
  const baseQuery = () => {
    let qb = db.selectFrom('users as u')
      .leftJoin('fms_user_teams as ut', (join) =>
        join.onRef('ut.user_id', '=', 'u.id').on('ut.organization_id', '=', organizationId)
      )
      .leftJoin('fms_teams as t', (join) =>
        join.onRef('t.id', '=', 'ut.team_id').on('t.deleted_at', 'is', null)
      )
      .where('u.organization_id', '=', organizationId)
      .where('u.deleted_at', 'is', null)

    // Apply search filter (accept both 'search' and 'q' param names)
    const searchTerm = query.search || query.q
    if (searchTerm) {
      const pattern = `%${escapeLikePattern(searchTerm)}%`
      qb = qb.where((eb) => eb.or([
        eb('u.name', 'ilike', pattern),
        eb('u.email', 'ilike', pattern),
      ]))
    }

    // Apply team filter
    if (query.teamId) {
      qb = qb.where('ut.team_id', '=', query.teamId)
    }

    return qb
  }

  // Get total count
  const countResult = await baseQuery().select(({ fn }) => fn.count('u.id').distinct().as('count')).executeTakeFirst()
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
  const rows = await baseQuery()
    .select([
      'ut.id as id',
      'ut.team_id as teamId',
      't.name as teamName',
      'u.id as userId',
      'u.name as userName',
      'u.email as userEmail',
    ])
    .orderBy(sql`${sql.ref(sortColumn)} ${sql.raw(sortDir)} NULLS LAST`)
    .limit(limit)
    .offset(offset)
    .execute()

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
