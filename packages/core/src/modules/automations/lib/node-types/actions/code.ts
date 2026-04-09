import { z } from 'zod'
import type { AutomationNodeTypeDefinition } from '../../node-type-registry'

const configSchema = z.object({
  code: z.string().min(1).describe('JavaScript code. Available variables: input, context. Must return an object.'),
  timeout: z.number().int().min(100).max(30000).default(5000),
})

export const codeAction: AutomationNodeTypeDefinition = {
  type: 'action.code',
  category: 'action',
  name: 'Code',
  description: 'Execute custom JavaScript code in a sandboxed environment',
  icon: 'code',
  color: '#3b82f6',
  configSchema,
  inputs: [{ name: 'main', label: 'Input', type: 'main' }],
  outputs: [
    { name: 'main', label: 'Output', type: 'main' },
    { name: 'error', label: 'Error', type: 'error' },
  ],

  async execute(ctx) {
    const { code, timeout } = ctx.config as z.infer<typeof configSchema>

    const { runInNewContext } = await import('node:vm')

    const sandbox = {
      input: ctx.inputData,
      context: ctx.runContext,
      console: {
        log: (...args: unknown[]) => ctx.logger('code:log', args),
        warn: (...args: unknown[]) => ctx.logger('code:warn', args),
        error: (...args: unknown[]) => ctx.logger('code:error', args),
      },
      JSON,
      Math,
      Date,
      String,
      Number,
      Boolean,
      Array,
      Object,
      Map,
      Set,
      RegExp,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
      btoa: globalThis.btoa,
      atob: globalThis.atob,
    }

    // Wrap in async IIFE so user can use await
    const wrappedCode = `(async () => { ${code} })()`

    try {
      const result = await runInNewContext(wrappedCode, sandbox, {
        timeout: timeout ?? 5000,
      })

      const output = result !== null && typeof result === 'object' ? result : { result }
      return { output: output as Record<string, unknown> }
    } catch (error) {
      throw new Error(`Code execution failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  },
}
