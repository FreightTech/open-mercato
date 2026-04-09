import { z } from 'zod'
import { filterConditionSchema } from '../../../data/validators'
import { evaluateFilterConditions } from '../../filters'
import type { AutomationNodeTypeDefinition } from '../../node-type-registry'

const configSchema = z.object({
  conditions: z.array(filterConditionSchema).min(1),
  combineMode: z.enum(['AND', 'OR']).default('AND'),
})

export const ifLogic: AutomationNodeTypeDefinition = {
  type: 'logic.if',
  category: 'logic',
  name: 'IF',
  description: 'Route execution based on conditions — true or false output',
  icon: 'git-branch',
  color: '#f59e0b',
  configSchema,
  inputs: [{ name: 'main', label: 'Input', type: 'main' }],
  outputs: [
    { name: 'true', label: 'True', type: 'conditional' },
    { name: 'false', label: 'False', type: 'conditional' },
  ],

  async execute(ctx) {
    const { conditions, combineMode } = ctx.config as z.infer<typeof configSchema>

    const result = evaluateFilterConditions(
      conditions,
      ctx.inputData,
      combineMode ?? 'AND'
    )

    return {
      output: { ...ctx.inputData, _condition: result },
      outputRoute: result ? 'true' : 'false',
    }
  },
}
