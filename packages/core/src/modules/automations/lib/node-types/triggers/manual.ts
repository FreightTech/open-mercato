import { z } from 'zod'
import type { AutomationNodeTypeDefinition } from '../../node-type-registry'

const configSchema = z.object({
  inputSchema: z.record(z.unknown()).optional(),
})

export const manualTrigger: AutomationNodeTypeDefinition = {
  type: 'trigger.manual',
  category: 'trigger',
  name: 'Manual Trigger',
  description: 'Triggered manually via API or UI button',
  icon: 'play',
  color: '#22c55e',
  configSchema,
  inputs: [],
  outputs: [{ name: 'main', label: 'Output', type: 'main' }],

  async execute(ctx) {
    return { output: ctx.inputData }
  },
}
