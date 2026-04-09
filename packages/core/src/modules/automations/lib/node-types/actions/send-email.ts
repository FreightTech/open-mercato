import { z } from 'zod'
import type { AutomationNodeTypeDefinition } from '../../node-type-registry'

const configSchema = z.object({
  to: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().optional(),
  template: z.string().optional(),
  templateData: z.record(z.unknown()).optional(),
})

export const sendEmailAction: AutomationNodeTypeDefinition = {
  type: 'action.send_email',
  category: 'action',
  name: 'Send Email',
  description: 'Send an email via the platform mail service',
  icon: 'mail',
  color: '#3b82f6',
  configSchema,
  inputs: [{ name: 'main', label: 'Input', type: 'main' }],
  outputs: [
    { name: 'main', label: 'Result', type: 'main' },
    { name: 'error', label: 'Error', type: 'error' },
  ],

  async execute(ctx) {
    const { to, subject, body, template, templateData } = ctx.config as z.infer<typeof configSchema>

    try {
      const mailService = ctx.container.resolve<any>('mailService')
      if (!mailService) {
        throw new Error('Mail service not available')
      }

      await mailService.send({
        to,
        subject,
        body: body ?? '',
        template,
        templateData,
      })

      return {
        output: {
          sent: true,
          to,
          subject,
          sentAt: new Date().toISOString(),
        },
      }
    } catch (error) {
      throw new Error(`Failed to send email: ${error instanceof Error ? error.message : String(error)}`)
    }
  },
}
