import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import {
  userContractorListQuerySchema,
  userContractorAssignmentCreateSchema,
  userContractorAssignmentDeleteSchema,
} from '../../data/validators'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_teams.view'] },
  POST: { requireAuth: true, requireFeatures: ['fms_teams.assign_contractors'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_teams.assign_contractors'] },
}

const listSchema = userContractorListQuerySchema.extend({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
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

  // Get user's contractor assignments
  const baseQuery = knex('fms_user_contractor_assignments as uca')
    .join('contractors as c', function () {
      this.on('c.id', '=', 'uca.contractor_id').andOnNull('c.deleted_at')
    })
    .where('uca.organization_id', organizationId)
    .where('uca.user_id', query.userId)
    .whereNull('uca.deleted_at')

  // Get total count
  const countResult = await baseQuery.clone().count('* as count').first()
  const total = Number(countResult?.count ?? 0)

  // Get assignments with contractor details
  const rows = await baseQuery
    .clone()
    .select(
      'uca.id',
      'uca.contractor_id as contractorId',
      'c.name as contractorName',
      'uca.created_at as createdAt'
    )
    .orderBy('c.name', 'asc')
    .limit(limit)
    .offset(offset)

  const items = rows.map((row) => ({
    id: row.id,
    contractorId: row.contractorId,
    contractorName: row.contractorName,
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

  const parsed = userContractorAssignmentCreateSchema.safeParse(body)
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
    const { result } = await commandBus.execute('fms_teams.assignUserContractor', {
      input: {
        ...parsed.data,
        organizationId,
        tenantId,
      },
      ctx,
    })

    return NextResponse.json({ id: result.id }, { status: 201 })
  } catch (error) {
    if (error instanceof CrudHttpError) {
      return NextResponse.json(error.payload, { status: error.status })
    }
    throw error
  }
}

export async function DELETE(request: NextRequest) {
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

  const parsed = userContractorAssignmentDeleteSchema.safeParse(body)
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
    await commandBus.execute('fms_teams.removeUserContractor', {
      input: {
        ...parsed.data,
        organizationId,
        tenantId,
      },
      ctx,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof CrudHttpError) {
      return NextResponse.json(error.payload, { status: error.status })
    }
    throw error
  }
}
