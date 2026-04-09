import { z } from 'zod'
import type { AutomationNodeTypeDefinition } from '../../node-type-registry'

const configSchema = z.object({
  scheduleType: z.enum(['cron', 'interval']),
  scheduleValue: z.string().min(1).describe('Cron expression (e.g. "0 9 * * *") or interval (e.g. "5m", "1h")'),
  timezone: z.string().default('UTC'),
})

export const scheduleTrigger: AutomationNodeTypeDefinition = {
  type: 'trigger.schedule',
  category: 'trigger',
  name: 'Schedule Trigger',
  description: 'Triggered on a cron schedule or interval',
  icon: 'clock',
  color: '#22c55e',
  configSchema,
  inputs: [],
  outputs: [{ name: 'main', label: 'Schedule Data', type: 'main' }],

  async execute(ctx) {
    return {
      output: {
        scheduledAt: new Date().toISOString(),
        scheduleType: ctx.config.scheduleType,
        scheduleValue: ctx.config.scheduleValue,
        timezone: ctx.config.timezone,
        ...ctx.inputData,
      },
    }
  },
}
