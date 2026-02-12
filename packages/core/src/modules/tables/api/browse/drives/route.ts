import { z } from 'zod'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { SharePointExcelService } from '../../../services/sharePointExcelService'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['tables.manage'] },
}

export async function GET(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const siteId = url.searchParams.get('siteId')

  if (!siteId) {
    return Response.json({ error: 'Missing siteId parameter' }, { status: 400 })
  }

  const container = await createRequestContainer()
  const excelService = container.resolve('sharePointExcelService') as SharePointExcelService

  try {
    const drives = await excelService.listDrives(siteId)
    return Response.json({ items: drives })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list drives'
    return Response.json({ error: message }, { status: 500 })
  }
}

export const openApi = {
  GET: {
    summary: 'List drives in a SharePoint site',
    tags: ['Tables'],
    parameters: [
      { name: 'siteId', in: 'query', required: true, schema: { type: 'string' }, description: 'SharePoint site ID' },
    ],
    responses: {
      200: {
        description: 'List of drives',
        content: {
          'application/json': {
            schema: z.object({
              items: z.array(z.object({
                id: z.string(),
                name: z.string(),
                driveType: z.string(),
                webUrl: z.string(),
              })),
            }),
          },
        },
      },
    },
  },
}
