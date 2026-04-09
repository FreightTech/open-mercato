import { z } from 'zod'
import { getNestedValue } from '../../filters'
import type { AutomationNodeTypeDefinition } from '../../node-type-registry'

const configSchema = z.object({
  sourceField: z.string().min(1).describe('Dot-notation path to the array in input data'),
  itemVariable: z.string().default('item').describe('Variable name for the current item'),
  indexVariable: z.string().default('index').describe('Variable name for the current index'),
  batchSize: z.number().int().min(1).max(1000).default(1).describe('Number of items per batch'),
})

export const loopLogic: AutomationNodeTypeDefinition = {
  type: 'logic.loop',
  category: 'logic',
  name: 'Loop',
  description: 'Iterate over an array — outputs each item (or batch) sequentially',
  icon: 'repeat',
  color: '#f59e0b',
  configSchema,
  inputs: [{ name: 'main', label: 'Input', type: 'main' }],
  outputs: [
    { name: 'main', label: 'Item', type: 'main' },
    { name: 'done', label: 'Done', type: 'main' },
  ],

  async execute(ctx) {
    const { sourceField, itemVariable, indexVariable, batchSize } = ctx.config as z.infer<typeof configSchema>

    const source = getNestedValue(ctx.inputData, sourceField)

    if (!Array.isArray(source)) {
      return {
        output: {
          ...ctx.inputData,
          _loop: { error: `Field "${sourceField}" is not an array`, totalItems: 0 },
        },
        outputRoute: 'done',
      }
    }

    if (source.length === 0) {
      return {
        output: {
          ...ctx.inputData,
          _loop: { totalItems: 0, processedItems: 0 },
        },
        outputRoute: 'done',
      }
    }

    // Process items in batches
    const effectiveBatchSize = batchSize ?? 1
    const results: unknown[] = []

    for (let i = 0; i < source.length; i += effectiveBatchSize) {
      const batch = source.slice(i, i + effectiveBatchSize)
      const batchItems = effectiveBatchSize === 1 ? batch[0] : batch

      // Store the current item in run context so downstream nodes can access it
      ctx.runContext[itemVariable ?? 'item'] = batchItems
      ctx.runContext[indexVariable ?? 'index'] = i

      results.push(batchItems)
    }

    // Output the collected items for downstream processing
    // The execution engine will feed these to connected nodes
    return {
      output: {
        items: results,
        _loop: {
          totalItems: source.length,
          processedItems: source.length,
          batchSize: effectiveBatchSize,
        },
        _context: {
          [itemVariable ?? 'item']: source[source.length - 1],
          [indexVariable ?? 'index']: source.length - 1,
          [`${itemVariable ?? 'item'}s`]: source,
        },
      },
    }
  },
}
