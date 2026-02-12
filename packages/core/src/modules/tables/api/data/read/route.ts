import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/core'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { TableDefinition } from '../../../data/entities'
import type { SharePointExcelService } from '../../../services/sharePointExcelService'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['tables.view'] },
}

const querySchema = z.object({
  definitionId: z.string().uuid(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(100),
})

export async function GET(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth || !auth.orgId || !auth.tenantId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const parsed = querySchema.safeParse({
    definitionId: url.searchParams.get('definitionId') ?? undefined,
    page: url.searchParams.get('page') ?? undefined,
    pageSize: url.searchParams.get('pageSize') ?? undefined,
  })

  if (!parsed.success) {
    return Response.json({ error: 'Invalid parameters', details: parsed.error.flatten() }, { status: 400 })
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  const definition = await em.findOne(TableDefinition, {
    id: parsed.data.definitionId,
    organizationId: auth.orgId,
    tenantId: auth.tenantId,
    deletedAt: null,
  })

  if (!definition) {
    return Response.json({ error: 'Table definition not found' }, { status: 404 })
  }

  const excelService = container.resolve('sharePointExcelService') as SharePointExcelService

  try {
    const data = await excelService.readWorksheetData(
      definition.driveId,
      definition.itemId,
      definition.worksheetName,
      definition.dataRange,
      parsed.data.page,
      parsed.data.pageSize,
      definition.hasHeaderRow,
    )

    const totalPages = Math.max(1, Math.ceil(data.totalRows / parsed.data.pageSize))

    return Response.json({
      headers: data.headers,
      rows: data.rows,
      total: data.totalRows,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      totalPages,
      definition: {
        id: definition.id,
        name: definition.name,
        worksheetName: definition.worksheetName,
        hasHeaderRow: definition.hasHeaderRow,
        columnConfig: definition.columnConfig,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read worksheet data'
    return Response.json({ error: message }, { status: 500 })
  }
}

export const openApi = {
  GET: {
    summary: 'Read Excel worksheet data',
    tags: ['Tables'],
    parameters: [
      { name: 'definitionId', in: 'query', required: true, schema: { type: 'string' }, description: 'Table definition ID' },
      { name: 'page', in: 'query', schema: { type: 'number' }, description: 'Page number' },
      { name: 'pageSize', in: 'query', schema: { type: 'number' }, description: 'Page size (max 100)' },
    ],
    responses: {
      200: {
        description: 'Worksheet data with headers and rows',
        content: {
          'application/json': {
            schema: z.object({
              headers: z.array(z.string()),
              rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))),
              total: z.number(),
              page: z.number(),
              pageSize: z.number(),
              totalPages: z.number(),
            }),
          },
        },
      },
    },
  },
}
