import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { AutomationDefinition, AutomationRun } from '../../../../data/entities'
import { startRunSchema } from '../../../../data/validators'
import { createQueue } from '@open-mercato/queue'
import type { EntityManager } from '@mikro-orm/core'

export const metadata = {
  requireAuth: true,
  requireFeatures: ['automations.execute'],
}

export const openApi = {
  post: { summary: 'Manually trigger an automation run', tags: ['Automations'], responses: { 201: { description: 'Run created' } } },
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')
    const auth = await getAuthFromRequest(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
    const tenantId = auth.tenantId
    const organizationId = scope?.selectedId ?? auth.orgId

    const definition = await em.findOne(AutomationDefinition, {
      id,
      tenantId,
      organizationId,
      deletedAt: null,
    })

    if (!definition) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!definition.enabled) return NextResponse.json({ error: 'Automation is disabled' }, { status: 400 })

    const body = await request.json().catch(() => ({}))
    const input = startRunSchema.parse(body)

    const triggerData: Record<string, unknown> = {
      ...input.input,
      _trigger: {
        type: 'manual',
        triggeredBy: auth.userId,
        triggeredAt: new Date().toISOString(),
      },
    }

    const run = em.create(AutomationRun, {
      definitionId: definition.id,
      automationId: definition.automationId,
      status: 'RUNNING',
      triggerData,
      startedAt: new Date(),
      tenantId,
      organizationId,
    })
    await em.persistAndFlush(run)

    // Enqueue
    const queue = createQueue('automation-runs', (process.env.QUEUE_STRATEGY as any) ?? 'local')
    await queue.enqueue({
      runId: run.id,
      definitionId: definition.id,
      triggerData,
      tenantId,
      organizationId,
    })

    return NextResponse.json({ id: run.id, status: run.status }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
