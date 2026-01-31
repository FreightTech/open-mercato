import { NextRequest, NextResponse } from 'next/server'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { userTeamUpdateSchema } from '../../../data/validators'

export const metadata = {
  PUT: { requireAuth: true, requireFeatures: ['fms_teams.manage'] },
}

type RouteContext = {
  params: Promise<{ userId: string }>
}

export async function PUT(request: NextRequest, context: RouteContext) {
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

  const params = await context.params
  const userId = params.userId

  if (!userId) {
    return NextResponse.json({ error: 'User ID required' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = userTeamUpdateSchema.safeParse(body)
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
    await commandBus.execute('fms_teams.updateUserTeam', {
      input: {
        userId,
        teamId: parsed.data.teamId ?? null,
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
