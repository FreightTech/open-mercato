import { z } from 'zod'
import type { AutomationNodeTypeDefinition } from '../../node-type-registry'

const configSchema = z.object({
  variables: z.array(z.object({
    key: z.string().min(1),
    value: z.unknown(),
  })).min(1),
})

export const setVariableAction: AutomationNodeTypeDefinition = {
  type: 'action.set_variable',
  category: 'utility',
  name: 'Set Variable',
  description: 'Set variables in the run context, accessible by all subsequent nodes',
  icon: 'variable',
  color: '#6b7280',
  configSchema,
  inputs: [{ name: 'main', label: 'Input', type: 'main' }],
  outputs: [{ name: 'main', label: 'Output', type: 'main' }],

  async execute(ctx) {
    const { variables } = ctx.config as z.infer<typeof configSchema>

    const contextUpdates: Record<string, unknown> = {}
    for (const { key, value } of variables) {
      contextUpdates[key] = value
      ctx.runContext[key] = value
    }

    return {
      output: {
        ...ctx.inputData,
        _context: contextUpdates,
      },
    }
  },
}
