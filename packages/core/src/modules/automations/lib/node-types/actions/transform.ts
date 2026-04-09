import { z } from 'zod'
import { getNestedValue } from '../../filters'
import type { AutomationNodeTypeDefinition } from '../../node-type-registry'

const configSchema = z.object({
  mode: z.enum(['expression', 'mapping']).default('mapping'),
  expression: z.string().optional().describe('JS expression that returns a value. Available: input, context'),
  mappings: z.array(z.object({
    targetKey: z.string().min(1),
    sourceExpression: z.string().min(1).describe('Dot-notation path from input data'),
    defaultValue: z.unknown().optional(),
  })).optional(),
})

export const transformAction: AutomationNodeTypeDefinition = {
  type: 'action.transform',
  category: 'action',
  name: 'Transform Data',
  description: 'Transform data using field mappings or expressions',
  icon: 'shuffle',
  color: '#3b82f6',
  configSchema,
  inputs: [{ name: 'main', label: 'Input', type: 'main' }],
  outputs: [{ name: 'main', label: 'Transformed', type: 'main' }],

  async execute(ctx) {
    const { mode, expression, mappings } = ctx.config as z.infer<typeof configSchema>

    if (mode === 'mapping' && mappings) {
      const result: Record<string, unknown> = {}
      for (const mapping of mappings) {
        const value = getNestedValue(ctx.inputData, mapping.sourceExpression)
        result[mapping.targetKey] = value !== undefined ? value : mapping.defaultValue
      }
      return { output: result }
    }

    if (mode === 'expression' && expression) {
      const { runInNewContext } = await import('node:vm')
      const sandbox = {
        input: ctx.inputData,
        context: ctx.runContext,
        JSON,
        Math,
        Date,
        String,
        Number,
        Boolean,
        Array,
        Object,
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
      }

      try {
        const result = runInNewContext(expression, sandbox, { timeout: 5000 })
        const output = result !== null && typeof result === 'object' ? result : { result }
        return { output: output as Record<string, unknown> }
      } catch (error) {
        throw new Error(`Transform expression failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    // Passthrough if no transform configured
    return { output: ctx.inputData }
  },
}
