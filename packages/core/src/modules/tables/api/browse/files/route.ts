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
  const driveId = url.searchParams.get('driveId')
  const path = url.searchParams.get('path') || undefined

  if (!driveId) {
    return Response.json({ error: 'Missing driveId parameter' }, { status: 400 })
  }

  const container = await createRequestContainer()
  const excelService = container.resolve('sharePointExcelService') as SharePointExcelService

  try {
    const items = await excelService.listItems(driveId, path)
    return Response.json({ items })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list files'
    return Response.json({ error: message }, { status: 500 })
  }
}

export const openApi = {
  GET: {
    summary: 'List Excel files and folders in a drive',
    tags: ['Tables'],
    parameters: [
      { name: 'driveId', in: 'query', required: true, schema: { type: 'string' }, description: 'Drive ID' },
      { name: 'path', in: 'query', schema: { type: 'string' }, description: 'Folder path (optional)' },
    ],
    responses: {
      200: {
        description: 'List of files and folders',
        content: {
          'application/json': {
            schema: z.object({
              items: z.array(z.object({
                id: z.string(),
                name: z.string(),
                webUrl: z.string(),
                size: z.number(),
                isFolder: z.boolean(),
                lastModifiedDateTime: z.string(),
              })),
            }),
          },
        },
      },
    },
  },
}
