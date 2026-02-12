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
  const itemId = url.searchParams.get('itemId')

  if (!driveId || !itemId) {
    return Response.json({ error: 'Missing driveId or itemId parameter' }, { status: 400 })
  }

  const container = await createRequestContainer()
  const excelService = container.resolve('sharePointExcelService') as SharePointExcelService

  try {
    const worksheets = await excelService.listWorksheets(driveId, itemId)
    return Response.json({ items: worksheets })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list worksheets'
    return Response.json({ error: message }, { status: 500 })
  }
}

export const openApi = {
  GET: {
    summary: 'List worksheets in an Excel file',
    tags: ['Tables'],
    parameters: [
      { name: 'driveId', in: 'query', required: true, schema: { type: 'string' }, description: 'Drive ID' },
      { name: 'itemId', in: 'query', required: true, schema: { type: 'string' }, description: 'Excel file item ID' },
    ],
    responses: {
      200: {
        description: 'List of worksheets',
        content: {
          'application/json': {
            schema: z.object({
              items: z.array(z.object({
                id: z.string(),
                name: z.string(),
                position: z.number(),
              })),
            }),
          },
        },
      },
    },
  },
}
