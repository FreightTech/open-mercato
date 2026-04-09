import { z } from 'zod'
import type { AutomationNodeTypeDefinition } from '../../node-type-registry'

const configSchema = z.object({
  note: z.string().optional().describe('Annotation for this node'),
})

export const noopUtility: AutomationNodeTypeDefinition = {
  type: 'utility.noop',
  category: 'utility',
  name: 'No-Op',
  description: 'Pass data through unchanged — useful for organization and annotations',
  icon: 'minus',
  color: '#6b7280',
  configSchema,
  inputs: [{ name: 'main', label: 'Input', type: 'main' }],
  outputs: [{ name: 'main', label: 'Output', type: 'main' }],

  async execute(ctx) {
    return { output: ctx.inputData }
  },
}
