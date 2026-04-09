import { z } from 'zod'
import type { AutomationNodeTypeDefinition } from '../../node-type-registry'

const configSchema = z.object({
  mode: z.enum(['append', 'combine', 'chooseBranch']).default('append'),
  combineKey: z.string().optional().describe('Key to combine objects by (for combine mode)'),
  preferredBranch: z.string().optional().describe('Source node ID to prefer (for chooseBranch mode)'),
})

export const mergeLogic: AutomationNodeTypeDefinition = {
  type: 'logic.merge',
  category: 'logic',
  name: 'Merge',
  description: 'Combine data from multiple input branches',
  icon: 'merge',
  color: '#f59e0b',
  configSchema,
  inputs: [
    { name: 'main', label: 'Input 1', type: 'main' },
    { name: 'input2', label: 'Input 2', type: 'main' },
  ],
  outputs: [{ name: 'main', label: 'Merged', type: 'main' }],

  async execute(ctx) {
    const { mode, combineKey, preferredBranch } = ctx.config as z.infer<typeof configSchema>
    const input = ctx.inputData

    // Input comes namespaced by source node ID when multiple inputs
    const sources = Object.entries(input).filter(([key]) => key !== '_merged')
    const mergedFlat = (input._merged ?? input) as Record<string, unknown>

    switch (mode) {
      case 'append': {
        // Collect all items into arrays
        const result: Record<string, unknown[]> = {}
        for (const [_sourceId, sourceData] of sources) {
          if (sourceData && typeof sourceData === 'object') {
            for (const [key, value] of Object.entries(sourceData as Record<string, unknown>)) {
              if (!result[key]) result[key] = []
              if (Array.isArray(value)) {
                result[key].push(...value)
              } else {
                result[key].push(value)
              }
            }
          }
        }
        return { output: result }
      }

      case 'combine': {
        if (!combineKey) {
          return { output: mergedFlat }
        }
        // Deep merge all sources, keyed by combineKey
        const combined: Record<string, Record<string, unknown>> = {}
        for (const [_sourceId, sourceData] of sources) {
          if (sourceData && typeof sourceData === 'object') {
            const data = sourceData as Record<string, unknown>
            const keyVal = String(data[combineKey] ?? '')
            if (keyVal) {
              combined[keyVal] = { ...(combined[keyVal] ?? {}), ...data }
            }
          }
        }
        return { output: { items: Object.values(combined), count: Object.keys(combined).length } }
      }

      case 'chooseBranch': {
        if (preferredBranch && input[preferredBranch]) {
          return { output: input[preferredBranch] as Record<string, unknown> }
        }
        // Fall back to first available source
        if (sources.length > 0) {
          return { output: sources[0][1] as Record<string, unknown> }
        }
        return { output: mergedFlat }
      }

      default:
        return { output: mergedFlat }
    }
  },
}
