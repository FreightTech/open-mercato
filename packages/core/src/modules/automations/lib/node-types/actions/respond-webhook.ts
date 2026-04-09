import { z } from 'zod'
import type { AutomationNodeTypeDefinition } from '../../node-type-registry'

const configSchema = z.object({
  statusCode: z.number().int().min(100).max(599).default(200),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional().describe('Response body — uses input data if not set'),
  respondWithInput: z.boolean().default(false).describe('Use full input data as response body'),
})

export const respondWebhookAction: AutomationNodeTypeDefinition = {
  type: 'action.respond_webhook',
  category: 'action',
  name: 'Respond to Webhook',
  description: 'Send a response back to the webhook caller',
  icon: 'reply',
  color: '#3b82f6',
  configSchema,
  inputs: [{ name: 'main', label: 'Input', type: 'main' }],
  outputs: [{ name: 'main', label: 'Output', type: 'main' }],

  async execute(ctx) {
    const { statusCode, headers, body, respondWithInput } = ctx.config as z.infer<typeof configSchema>

    const responseBody = respondWithInput ? ctx.inputData : (body ?? ctx.inputData)

    // Store the webhook response in run context for the webhook route to pick up
    ctx.runContext._webhookResponse = {
      statusCode: statusCode ?? 200,
      headers: headers ?? {},
      body: responseBody,
      respondedAt: new Date().toISOString(),
    }

    return {
      output: {
        ...ctx.inputData,
        _webhookResponse: {
          statusCode: statusCode ?? 200,
          responded: true,
        },
        _context: {
          _webhookResponse: ctx.runContext._webhookResponse,
        },
      },
    }
  },
}
