import type { EntityManager } from '@mikro-orm/core'
import { matchEventPattern } from '@open-mercato/shared/lib/events/patterns'
import { AutomationDefinition, AutomationRun } from '../data/entities'
import { evaluateFilterConditions, mapDataToContext } from '../lib/filters'
import { createQueue } from '@open-mercato/queue'

export const metadata = {
  event: '*',
  persistent: true,
  id: 'automations:event-trigger',
}

const EXCLUDED_PREFIXES = ['query_index.', 'search.', 'automations.', 'cache.', 'queue.', 'workflows.']
const AUTOMATION_RUNS_QUEUE = 'automation-runs'

export default async function handler(
  payload: Record<string, unknown>,
  ctx: { resolve: <T>(name: string) => T; eventName?: string }
) {
  const eventName = ctx.eventName
  if (!eventName) return

  // Skip internal events
  if (EXCLUDED_PREFIXES.some(prefix => eventName.startsWith(prefix))) return

  const em = ctx.resolve<EntityManager>('em').fork()

  // Find all enabled automation definitions with event trigger nodes
  const definitions = await em.find(AutomationDefinition, {
    enabled: true,
    deletedAt: null,
  })

  for (const definition of definitions) {
    const eventTriggerNodes = definition.definition.nodes.filter(
      node => node.type === 'trigger.event' && !node.disabled
    )

    for (const triggerNode of eventTriggerNodes) {
      const config = triggerNode.config as {
        eventPattern?: string
        filters?: Array<{ field: string; operator: any; value: unknown }>
        contextMapping?: Array<{ targetKey: string; sourceExpression: string; defaultValue?: unknown }>
      }

      if (!config.eventPattern) continue

      // Check event pattern match
      if (!matchEventPattern(eventName, config.eventPattern)) continue

      // Check filter conditions
      if (!evaluateFilterConditions(config.filters, payload as Record<string, unknown>)) continue

      // Map context
      const triggerData = config.contextMapping
        ? { ...payload, ...mapDataToContext(config.contextMapping, payload as Record<string, unknown>) }
        : { ...(payload as Record<string, unknown>) }

      // Create run
      const run = em.create(AutomationRun, {
        definitionId: definition.id,
        automationId: definition.automationId,
        status: 'RUNNING',
        triggerData: triggerData as Record<string, unknown>,
        startedAt: new Date(),
        tenantId: definition.tenantId,
        organizationId: definition.organizationId,
      })
      await em.persistAndFlush(run)

      // Enqueue execution
      const queue = createQueue(AUTOMATION_RUNS_QUEUE, (process.env.QUEUE_STRATEGY as any) ?? 'local')
      await queue.enqueue({
        runId: run.id,
        definitionId: definition.id,
        triggerData,
        tenantId: definition.tenantId,
        organizationId: definition.organizationId,
      })
    }
  }
}
