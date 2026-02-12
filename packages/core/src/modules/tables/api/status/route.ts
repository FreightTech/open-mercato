import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { MicrosoftGraphService } from '../../services/microsoftGraphService'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['tables.view'] },
}

export async function GET(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const container = await createRequestContainer()
  const graphService = container.resolve('microsoftGraphService') as MicrosoftGraphService

  const configured = graphService.isConfigured()

  if (!configured) {
    return Response.json({
      configured: false,
      connected: false,
      message: 'Microsoft Graph is not configured. Set AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET environment variables.',
    })
  }

  const status = await graphService.verifyConnection()

  return Response.json({
    configured: true,
    connected: status.connected,
    message: status.connected
      ? 'Microsoft Graph connection is active.'
      : `Connection failed: ${status.error}`,
  })
}

export const openApi = {
  GET: {
    summary: 'Check Microsoft Graph connection status',
    tags: ['Tables'],
    responses: {
      200: {
        description: 'Connection status',
        content: {
          'application/json': {
            schema: z.object({
              configured: z.boolean(),
              connected: z.boolean(),
              message: z.string(),
            }),
          },
        },
      },
    },
  },
}
