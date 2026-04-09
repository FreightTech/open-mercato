import type { EntityManager } from '@mikro-orm/core'
import { AutomationDefinition } from '../data/entities'

const AUTOMATION_RUNS_QUEUE = 'automation-runs'

export async function syncScheduleTriggers(
  ctx: { resolve: <T>(name: string) => T },
  definitionId: string
): Promise<void> {
  const em = ctx.resolve<EntityManager>('em').fork()

  const definition = await em.findOne(AutomationDefinition, { id: definitionId })
  if (!definition) return

  // Find schedule trigger nodes
  const scheduleNodes = definition.definition.nodes.filter(
    node => node.type === 'trigger.schedule' && !node.disabled
  )

  // Try to resolve scheduler service — it may not be available in all environments
  let schedulerService: any
  try {
    schedulerService = ctx.resolve<any>('schedulerService')
  } catch {
    return // Scheduler not available
  }

  if (!schedulerService) return

  // Remove all existing schedules for this automation
  try {
    const existingSchedules = await schedulerService.listBySource?.('automations', definitionId)
    if (existingSchedules) {
      for (const schedule of existingSchedules) {
        await schedulerService.unregister(schedule.id)
      }
    }
  } catch {
    // listBySource might not be available
  }

  // If automation is disabled, don't register new schedules
  if (!definition.enabled || definition.deletedAt) return

  // Register a schedule for each schedule trigger node
  for (const node of scheduleNodes) {
    const config = node.config as {
      scheduleType?: 'cron' | 'interval'
      scheduleValue?: string
      timezone?: string
    }

    if (!config.scheduleType || !config.scheduleValue) continue

    try {
      await schedulerService.register({
        id: `automation:${definition.automationId}:${node.id}`,
        name: `Automation: ${definition.name}`,
        scopeType: 'organization',
        tenantId: definition.tenantId,
        organizationId: definition.organizationId,
        scheduleType: config.scheduleType,
        scheduleValue: config.scheduleValue,
        timezone: config.timezone ?? 'UTC',
        targetType: 'queue',
        targetQueue: AUTOMATION_RUNS_QUEUE,
        targetPayload: {
          definitionId: definition.id,
          automationId: definition.automationId,
          triggerNodeId: node.id,
          tenantId: definition.tenantId,
          organizationId: definition.organizationId,
        },
        isEnabled: true,
        sourceType: 'module',
        sourceModule: 'automations',
        sourceId: definitionId,
      })
    } catch (error) {
      console.error(`[automations] Failed to register schedule for ${node.id}:`, error)
    }
  }
}
