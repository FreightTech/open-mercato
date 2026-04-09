import { z } from 'zod'
import type { AutomationNodeTypeDefinition } from '../../node-type-registry'

const configSchema = z.object({
  duration: z.number().int().min(1),
  unit: z.enum(['ms', 'seconds', 'minutes', 'hours']).default('seconds'),
})

function toMs(duration: number, unit: string): number {
  switch (unit) {
    case 'ms': return duration
    case 'seconds': return duration * 1000
    case 'minutes': return duration * 60 * 1000
    case 'hours': return duration * 60 * 60 * 1000
    default: return duration * 1000
  }
}

export const delayAction: AutomationNodeTypeDefinition = {
  type: 'action.delay',
  category: 'utility',
  name: 'Delay',
  description: 'Pause execution for a specified duration',
  icon: 'timer',
  color: '#6b7280',
  configSchema,
  inputs: [{ name: 'main', label: 'Input', type: 'main' }],
  outputs: [{ name: 'main', label: 'Output', type: 'main' }],

  async execute(ctx) {
    const { duration, unit } = ctx.config as z.infer<typeof configSchema>
    const ms = toMs(duration, unit ?? 'seconds')

    // Cap inline delay at 30 seconds; longer delays should use queued continuation (future)
    const cappedMs = Math.min(ms, 30000)

    await new Promise(resolve => setTimeout(resolve, cappedMs))

    return {
      output: {
        ...ctx.inputData,
        _delay: {
          requestedMs: ms,
          actualMs: cappedMs,
          delayedAt: new Date().toISOString(),
        },
      },
    }
  },
}
