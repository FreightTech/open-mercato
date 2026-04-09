import { z } from 'zod'
import type { AutomationNodeTypeDefinition } from '../../node-type-registry'

const configSchema = z.object({
  eventName: z.string().min(1).describe('Event name (e.g. "orders.status.changed")'),
  payload: z.record(z.unknown()).default({}),
  persistent: z.boolean().default(false),
})

export const emitEventAction: AutomationNodeTypeDefinition = {
  type: 'action.emit_event',
  category: 'action',
  name: 'Emit Event',
  description: 'Emit a domain event to the event bus',
  icon: 'radio',
  color: '#3b82f6',
  configSchema,
  inputs: [{ name: 'main', label: 'Input', type: 'main' }],
  outputs: [{ name: 'main', label: 'Result', type: 'main' }],

  async execute(ctx) {
    const { eventName, payload, persistent } = ctx.config as z.infer<typeof configSchema>

    const eventBus = ctx.container.resolve<any>('eventBus')
    if (!eventBus) {
      throw new Error('Event bus not available')
    }

    await eventBus.emit(eventName, payload, persistent ? { persistent: true } : undefined)

    return {
      output: {
        emitted: true,
        eventName,
        payload,
        emittedAt: new Date().toISOString(),
      },
    }
  },
}
