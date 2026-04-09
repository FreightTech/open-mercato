import { z } from 'zod'
import { getNestedValue } from '../../filters'
import type { AutomationNodeTypeDefinition } from '../../node-type-registry'

const configSchema = z.object({
  field: z.string().min(1).describe('Dot-notation path to the value in input data'),
  cases: z.array(z.object({
    value: z.unknown(),
    output: z.string().min(1).describe('Output name (e.g. "case_0", "case_1")'),
  })).min(1),
  defaultOutput: z.string().default('default'),
})

export const switchLogic: AutomationNodeTypeDefinition = {
  type: 'logic.switch',
  category: 'logic',
  name: 'Switch',
  description: 'Route execution to different outputs based on a value',
  icon: 'list-tree',
  color: '#f59e0b',
  configSchema,
  inputs: [{ name: 'main', label: 'Input', type: 'main' }],
  outputs: [
    // Dynamic outputs are defined by config.cases + default
    // The visual editor reads config to render handles
    { name: 'default', label: 'Default', type: 'conditional' },
  ],

  async execute(ctx) {
    const { field, cases, defaultOutput } = ctx.config as z.infer<typeof configSchema>

    const value = getNestedValue(ctx.inputData, field)

    for (const caseItem of cases) {
      if (value === caseItem.value) {
        return {
          output: { ...ctx.inputData, _switchValue: value, _matchedCase: caseItem.output },
          outputRoute: caseItem.output,
        }
      }
    }

    return {
      output: { ...ctx.inputData, _switchValue: value, _matchedCase: defaultOutput },
      outputRoute: defaultOutput ?? 'default',
    }
  },
}
