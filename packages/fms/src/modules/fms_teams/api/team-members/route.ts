import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_teams.view'] },
}

const querySchema = z.object({
  teamId: z.string().uuid(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
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

  const parsed = querySchema.safeParse(queryRaw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  const { teamId, page, pageSize } = parsed.data
  const offset = (page - 1) * pageSize

  const em = container.resolve('em') as EntityManager
  const db = em.getKysely<any>()

  // Get total count of members in this team
  const countResult = await db.selectFrom('fms_user_teams as ut')
    .where('ut.organization_id', '=', organizationId)
    .where('ut.tenant_id', '=', tenantId)
    .where('ut.team_id', '=', teamId)
    .select(({ fn }) => fn.countAll().as('count'))
    .executeTakeFirst()

  const total = Number(countResult?.count ?? 0)

  // Get members with user info
  const rows = await db.selectFrom('fms_user_teams as ut')
    .leftJoin('users as u', 'u.id', 'ut.user_id')
    .select([
      'ut.id',
      'ut.user_id as userId',
      'u.name as userName',
      'u.email as userEmail',
    ])
    .where('ut.organization_id', '=', organizationId)
    .where('ut.tenant_id', '=', tenantId)
    .where('ut.team_id', '=', teamId)
    .orderBy('u.name', 'asc')
    .limit(pageSize)
    .offset(offset)
    .execute()

  const items = rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    userName: row.userName ?? '',
    userEmail: row.userEmail ?? '',
  }))

  return NextResponse.json({
    items,
    total,
    page,
    totalPages: Math.ceil(total / pageSize),
  })
}
