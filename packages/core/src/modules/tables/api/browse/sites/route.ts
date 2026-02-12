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
  const search = url.searchParams.get('search') || undefined

  const container = await createRequestContainer()
  const excelService = container.resolve('sharePointExcelService') as SharePointExcelService

  try {
    const sites = await excelService.listSites(search)
    return Response.json({ items: sites })
  } catch (error: unknown) {
    const graphError = error as { statusCode?: number; code?: string; message?: string; body?: string }
    const statusCode = graphError.statusCode || 500
    let message = 'Failed to list sites'
    if (graphError.body) {
      try {
        const parsed = JSON.parse(graphError.body)
        message = parsed?.error?.message || graphError.message || message
      } catch {
        message = graphError.message || message
      }
    } else if (graphError.message) {
      message = graphError.message
    }
    console.error('[tables] listSites error:', { statusCode, code: graphError.code, message })
    return Response.json({ error: message }, { status: statusCode })
  }
}

export const openApi = {
  GET: {
    summary: 'Search SharePoint sites',
    tags: ['Tables'],
    parameters: [
      { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search query for sites' },
    ],
    responses: {
      200: {
        description: 'List of SharePoint sites',
        content: {
          'application/json': {
            schema: z.object({
              items: z.array(z.object({
                id: z.string(),
                name: z.string(),
                displayName: z.string(),
                webUrl: z.string(),
              })),
            }),
          },
        },
      },
    },
  },
}
