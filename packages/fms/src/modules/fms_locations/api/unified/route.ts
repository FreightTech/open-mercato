import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { createLocationSchema } from '../../data/validators'
// Import to register commands
import '../../commands'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['fms_locations.ports.manage'] },
}

export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parse = createLocationSchema.omit({ organizationId: true, tenantId: true }).safeParse(body)

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
    const { result } = await bus.execute<Record<string, unknown>, { id: string }>(
      'fms_locations.unified.create',
      {
        input: {
          organizationId: organizationId as string,
          tenantId: tenantId as string,
          ...parse.data,
        },
        ctx,
      }
    )

    return NextResponse.json({
      id: result.id,
      code: parse.data.code,
      name: parse.data.name,
      type: parse.data.type,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create location'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
