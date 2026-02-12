import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/core'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { TableDefinition } from '../../../data/entities'
import { cellWriteSchema } from '../../../data/validators'
import type { SharePointExcelService } from '../../../services/sharePointExcelService'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['tables.manage'] },
}

export async function POST(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth || !auth.orgId || !auth.tenantId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = cellWriteSchema.safeParse(body)

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
    await excelService.writeCell(
      definition.driveId,
      definition.itemId,
      definition.worksheetName,
      parsed.data.row,
      parsed.data.col,
      parsed.data.value,
      definition.hasHeaderRow,
    )

    return Response.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to write cell'
    return Response.json({ error: message }, { status: 500 })
  }
}

export const openApi = {
  POST: {
    summary: 'Write a cell value to an Excel worksheet',
    tags: ['Tables'],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: z.object({
            definitionId: z.string().uuid(),
            row: z.number(),
            col: z.number(),
            value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
          }),
        },
      },
    },
    responses: {
      200: {
        description: 'Cell written successfully',
        content: {
          'application/json': {
            schema: z.object({ ok: z.boolean() }),
          },
        },
      },
    },
  },
}
