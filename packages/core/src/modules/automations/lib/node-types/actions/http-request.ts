import { z } from 'zod'
import type { AutomationNodeTypeDefinition } from '../../node-type-registry'

const configSchema = z.object({
  url: z.string().min(1),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
  credentialId: z.string().optional().describe('Integration credential ID for auth injection'),
  timeout: z.number().int().min(1000).max(60000).default(10000),
})

export const httpRequestAction: AutomationNodeTypeDefinition = {
  type: 'action.http_request',
  category: 'action',
  name: 'HTTP Request',
  description: 'Make an HTTP request to an external or internal API',
  icon: 'globe',
  color: '#3b82f6',
  configSchema,
  inputs: [{ name: 'main', label: 'Input', type: 'main' }],
  outputs: [
    { name: 'main', label: 'Response', type: 'main' },
    { name: 'error', label: 'Error', type: 'error' },
  ],

  async execute(ctx) {
    const { url, method, headers, body, credentialId, timeout } = ctx.config as z.infer<typeof configSchema>

    const requestHeaders: Record<string, string> = { ...headers }

    // Inject credentials if provided
    if (credentialId) {
      try {
        const credService = ctx.container.resolve<any>('integrationCredentialsService')
        if (credService) {
          const creds = await credService.getCredentials(credentialId, {
            tenantId: (ctx as any).tenantId,
            organizationId: (ctx as any).organizationId,
          })
          if (creds?.apiKey) {
            requestHeaders['Authorization'] = `Bearer ${creds.apiKey}`
          }
        }
      } catch {
        // Credential injection is best-effort
      }
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout ?? 10000)

    try {
      const fetchOptions: RequestInit = {
        method: method ?? 'GET',
        headers: requestHeaders,
        signal: controller.signal,
      }

      if (body && method !== 'GET') {
        fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body)
        if (!requestHeaders['Content-Type']) {
          requestHeaders['Content-Type'] = 'application/json'
        }
      }

      const response = await fetch(url as string, fetchOptions)
      clearTimeout(timeoutId)

      let responseBody: unknown
      const contentType = response.headers.get('content-type') ?? ''
      if (contentType.includes('application/json')) {
        responseBody = await response.json()
      } else {
        responseBody = await response.text()
      }

      return {
        output: {
          statusCode: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: responseBody,
          ok: response.ok,
        },
      }
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  },
}
