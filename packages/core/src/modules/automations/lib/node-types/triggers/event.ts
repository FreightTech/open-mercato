import { z } from 'zod'
import { filterConditionSchema, contextMappingSchema } from '../../../data/validators'
import type { AutomationNodeTypeDefinition } from '../../node-type-registry'

const configSchema = z.object({
  eventPattern: z.string().min(1).describe('Event pattern to match (e.g. "sales.orders.created", "customers.*")'),
  filters: z.array(filterConditionSchema).optional(),
  contextMapping: z.array(contextMappingSchema).optional(),
})

export const eventTrigger: AutomationNodeTypeDefinition = {
  type: 'trigger.event',
  category: 'trigger',
  name: 'Event Trigger',
  description: 'Triggered when a platform event matches the pattern',
  icon: 'zap',
  color: '#22c55e',
  configSchema,
  inputs: [],
  outputs: [{ name: 'main', label: 'Event Data', type: 'main' }],

  async execute(ctx) {
    // The event subscriber passes the event payload as inputData
    return { output: ctx.inputData }
  },
}
