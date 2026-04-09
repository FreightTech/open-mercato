import { z } from 'zod'
import { filterConditionSchema } from '../../../data/validators'
import { evaluateFilterConditions, getNestedValue } from '../../filters'
import type { AutomationNodeTypeDefinition } from '../../node-type-registry'

const configSchema = z.object({
  sourceField: z.string().min(1).describe('Dot-notation path to the array to filter'),
  conditions: z.array(filterConditionSchema).min(1),
  combineMode: z.enum(['AND', 'OR']).default('AND'),
})

export const filterAction: AutomationNodeTypeDefinition = {
  type: 'action.filter',
  category: 'action',
  name: 'Filter',
  description: 'Filter array items based on conditions',
  icon: 'filter',
  color: '#3b82f6',
  configSchema,
  inputs: [{ name: 'main', label: 'Input', type: 'main' }],
  outputs: [
    { name: 'main', label: 'Matching', type: 'main' },
    { name: 'rejected', label: 'Rejected', type: 'main' },
  ],

  async execute(ctx) {
    const { sourceField, conditions, combineMode } = ctx.config as z.infer<typeof configSchema>

    const source = getNestedValue(ctx.inputData, sourceField)

    if (!Array.isArray(source)) {
      // If not an array, evaluate the input data itself as a single item
      const matches = evaluateFilterConditions(conditions, ctx.inputData, combineMode ?? 'AND')
      return {
        output: {
          ...ctx.inputData,
          _filter: { matched: matches, totalItems: 1, matchedCount: matches ? 1 : 0 },
        },
        outputRoute: matches ? 'main' : 'rejected',
      }
    }

    const matched: unknown[] = []
    const rejected: unknown[] = []

    for (const item of source) {
      const itemData = (item && typeof item === 'object') ? item as Record<string, unknown> : { value: item }
      if (evaluateFilterConditions(conditions, itemData, combineMode ?? 'AND')) {
        matched.push(item)
      } else {
        rejected.push(item)
      }
    }

    return {
      output: {
        items: matched,
        rejected,
        _filter: {
          totalItems: source.length,
          matchedCount: matched.length,
          rejectedCount: rejected.length,
        },
      },
    }
  },
}
