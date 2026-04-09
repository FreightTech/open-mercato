import { z } from 'zod'
import type { AutomationNodeTypeDefinition } from '../../node-type-registry'

const configSchema = z.object({
  entityType: z.string().min(1).describe('Entity type (e.g. "sales:order", "customers:person")'),
  entityId: z.string().min(1).describe('Entity ID to update'),
  data: z.record(z.unknown()).describe('Fields to update'),
  method: z.enum(['PUT', 'PATCH']).default('PUT').describe('HTTP method for the update'),
})

function resolveInternalBaseUrl(): string {
  return (
    process.env.INTERNAL_API_URL ??
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    `http://localhost:${process.env.PORT ?? 3000}`
  )
}

export const updateEntityAction: AutomationNodeTypeDefinition = {
  type: 'action.update_entity',
  category: 'action',
  name: 'Update Entity',
  description: 'Update a platform entity via its CRUD API',
  icon: 'database',
  color: '#3b82f6',
  configSchema,
  inputs: [{ name: 'main', label: 'Input', type: 'main' }],
  outputs: [
    { name: 'main', label: 'Result', type: 'main' },
    { name: 'error', label: 'Error', type: 'error' },
  ],

  async execute(ctx) {
    const { entityType, entityId, data, method } = ctx.config as z.infer<typeof configSchema>

    const [module, entity] = entityType.split(':')
    if (!module || !entity) {
      throw new Error(`Invalid entityType format: "${entityType}". Expected "module:entity"`)
    }

    const baseUrl = resolveInternalBaseUrl()
    const apiPath = `/api/${module}/${entity}/${entityId}`

    try {
      const response = await fetch(`${baseUrl}${apiPath}`, {
        method: method ?? 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': (ctx as any).tenantId ?? '',
          'x-organization-id': (ctx as any).organizationId ?? '',
        },
        body: JSON.stringify(data),
      })

      const responseBody = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${JSON.stringify(responseBody)}`)
      }

      return {
        output: {
          updated: true,
          entityType,
          entityId,
          response: responseBody,
        },
      }
    } catch (error) {
      throw new Error(`Failed to update entity: ${error instanceof Error ? error.message : String(error)}`)
    }
  },
}
