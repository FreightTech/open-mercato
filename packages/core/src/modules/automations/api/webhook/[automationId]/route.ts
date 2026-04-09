import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { AutomationDefinition, AutomationRun } from '../../../data/entities'
import { createQueue } from '@open-mercato/queue'
import type { EntityManager } from '@mikro-orm/core'

export const metadata = {
  // Webhooks are unauthenticated — auth is handled per-node config
  requireAuth: false,
}

export const openApi = {
  post: { summary: 'Inbound webhook trigger for an automation', tags: ['Automations'], responses: { 200: { description: 'Accepted' } } },
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ automationId: string }> }) {
  const { automationId } = await params

  try {
    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')

    // Find automation by automationId (check all tenants — webhook URL is the auth boundary)
    const definition = await em.findOne(AutomationDefinition, {
      automationId,
      enabled: true,
      deletedAt: null,
    })

    if (!definition) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Find webhook trigger node
    const webhookNode = definition.definition.nodes.find(
      n => n.type === 'trigger.webhook' && !n.disabled
    )
    if (!webhookNode) return NextResponse.json({ error: 'No webhook trigger configured' }, { status: 400 })

    // Validate method
    const config = webhookNode.config as { method?: string; authType?: string; authConfig?: Record<string, string> }
    const expectedMethod = config.method ?? 'POST'
    if (request.method !== expectedMethod) {
      return NextResponse.json({ error: `Expected ${expectedMethod}` }, { status: 405 })
    }

    // Basic auth check
    if (config.authType === 'header' && config.authConfig) {
      for (const [header, expectedValue] of Object.entries(config.authConfig)) {
        if (request.headers.get(header) !== expectedValue) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
      }
    }

    // Parse request data
    let body: Record<string, unknown> = {}
    try {
      body = await request.json()
    } catch {
      // Body might not be JSON
    }

    const triggerData: Record<string, unknown> = {
      body,
      headers: Object.fromEntries(request.headers.entries()),
      query: Object.fromEntries(new URL(request.url).searchParams.entries()),
      method: request.method,
      _trigger: {
        type: 'webhook',
        automationId,
        receivedAt: new Date().toISOString(),
      },
    }

    const run = em.create(AutomationRun, {
      definitionId: definition.id,
      automationId: definition.automationId,
      status: 'RUNNING',
      triggerData,
      startedAt: new Date(),
      tenantId: definition.tenantId,
      organizationId: definition.organizationId,
    })
    await em.persistAndFlush(run)

    const queue = createQueue('automation-runs', (process.env.QUEUE_STRATEGY as any) ?? 'local')
    await queue.enqueue({
      runId: run.id,
      definitionId: definition.id,
      triggerData,
      tenantId: definition.tenantId,
      organizationId: definition.organizationId,
    })

    return NextResponse.json({ ok: true, runId: run.id })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
