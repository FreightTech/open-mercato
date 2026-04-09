import { z } from 'zod'
import type { AutomationNodeTypeDefinition } from '../../node-type-registry'

const configSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT']).default('POST'),
  path: z.string().max(200).optional(),
  authType: z.enum(['none', 'header', 'basic']).default('none'),
  authConfig: z.record(z.string()).optional(),
})

export const webhookTrigger: AutomationNodeTypeDefinition = {
  type: 'trigger.webhook',
  category: 'trigger',
  name: 'Webhook Trigger',
  description: 'Triggered by an inbound HTTP request',
  icon: 'webhook',
  color: '#22c55e',
  configSchema,
  inputs: [],
  outputs: [{ name: 'main', label: 'Request Data', type: 'main' }],

  async execute(ctx) {
    // The webhook API route passes request body/headers/query as inputData
    return { output: ctx.inputData }
  },
}
