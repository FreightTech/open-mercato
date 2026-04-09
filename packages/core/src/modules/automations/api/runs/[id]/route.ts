import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { AutomationRun, NodeExecution } from '../../../data/entities'
import type { EntityManager } from '@mikro-orm/core'

export const metadata = {
  requireAuth: true,
  requireFeatures: ['automations.view_runs'],
}

export const openApi = {
  get: { summary: 'Get automation run with node executions', tags: ['Automations'], responses: { 200: { description: 'Run details' } } },
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')
    const auth = await getAuthFromRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
    const tenantId = auth.tenantId
    const organizationId = scope?.selectedId ?? auth.orgId

    const run = await em.findOne(AutomationRun, {
      id,
      tenantId,
      organizationId,
    })

    if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const nodeExecutions = await em.find(NodeExecution, {
      runId: run.id,
      tenantId,
      organizationId,
    }, {
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({
      ...run,
      nodeExecutions,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
