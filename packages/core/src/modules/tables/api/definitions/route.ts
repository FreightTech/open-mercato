import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/core'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { TableDefinition } from '../../data/entities'
import {
  tableDefinitionCreateSchema,
  tableDefinitionUpdateSchema,
  tableDefinitionListSchema,
  tableDefinitionDeleteSchema,
} from '../../data/validators'
import {
  createTablesCrudOpenApi,
  createPagedListResponseSchema,
  defaultOkResponseSchema,
} from '../openapi'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['tables.view'] },
  POST: { requireAuth: true, requireFeatures: ['tables.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['tables.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['tables.manage'] },
}

export const metadata = routeMetadata

type TableDefinitionRow = {
  id: string
  name: string
  siteId: string
  driveId: string
  itemId: string
  filePath: string | null
  worksheetName: string
  dataRange: string | null
  hasHeaderRow: boolean
  isActive: boolean
  createdAt: string | null
  updatedAt: string | null
}

function toRow(entity: TableDefinition): TableDefinitionRow {
  return {
    id: entity.id,
    name: entity.name,
    siteId: entity.siteId,
    driveId: entity.driveId,
    itemId: entity.itemId,
    filePath: entity.filePath ?? null,
    worksheetName: entity.worksheetName,
    dataRange: entity.dataRange ?? null,
    hasHeaderRow: entity.hasHeaderRow,
    isActive: entity.isActive,
    createdAt: entity.createdAt ? entity.createdAt.toISOString() : null,
    updatedAt: entity.updatedAt ? entity.updatedAt.toISOString() : null,
  }
}

export async function GET(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth || !auth.orgId || !auth.tenantId) {
    return NextResponse.json({ items: [], total: 0, page: 1, pageSize: 50, totalPages: 1 }, { status: 401 })
  }

  const url = new URL(req.url)
  const queryParams: Record<string, string | undefined> = {}
  for (const key of ['page', 'pageSize', 'search', 'sortField', 'sortDir']) {
    queryParams[key] = url.searchParams.get(key) ?? undefined
  }

  const parsed = tableDefinitionListSchema.safeParse(queryParams)
  if (!parsed.success) {
    return NextResponse.json({ items: [], total: 0, page: 1, pageSize: 50, totalPages: 1 }, { status: 400 })
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  const { page, pageSize, search, sortField, sortDir } = parsed.data

  const where: Record<string, unknown> = {
    organizationId: auth.orgId,
    tenantId: auth.tenantId,
    deletedAt: null,
  }

  if (search) {
    where.name = { $ilike: `%${escapeLikePattern(search)}%` }
  }

  const orderBy: Record<string, 'ASC' | 'DESC'> = {}
  if (sortField === 'name') {
    orderBy.name = sortDir === 'desc' ? 'DESC' : 'ASC'
  } else {
    orderBy.createdAt = 'DESC'
  }

  const [all, total] = await em.findAndCount(TableDefinition, where, { orderBy })
  const start = (page - 1) * pageSize
  const paged = all.slice(start, start + pageSize)
  const items = paged.map(toRow)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return NextResponse.json({ items, total, page, pageSize, totalPages })
}

export async function POST(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth || !auth.orgId || !auth.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = tableDefinitionCreateSchema.safeParse({
    ...body,
    organizationId: auth.orgId,
    tenantId: auth.tenantId,
  })

  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  const entity = em.create(TableDefinition, {
    organizationId: parsed.data.organizationId,
    tenantId: parsed.data.tenantId,
    name: parsed.data.name,
    siteId: parsed.data.siteId,
    driveId: parsed.data.driveId,
    itemId: parsed.data.itemId,
    filePath: parsed.data.filePath ?? null,
    worksheetName: parsed.data.worksheetName,
    dataRange: parsed.data.dataRange ?? null,
    columnConfig: parsed.data.columnConfig ?? null,
    hasHeaderRow: parsed.data.hasHeaderRow ?? true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  await em.flush()

  return NextResponse.json({ id: entity.id }, { status: 201 })
}

export async function PUT(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth || !auth.orgId || !auth.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = tableDefinitionUpdateSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  const entity = await em.findOne(TableDefinition, {
    id: parsed.data.id,
    organizationId: auth.orgId,
    tenantId: auth.tenantId,
    deletedAt: null,
  })

  if (!entity) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (parsed.data.name !== undefined) entity.name = parsed.data.name
  if (parsed.data.worksheetName !== undefined) entity.worksheetName = parsed.data.worksheetName
  if (parsed.data.dataRange !== undefined) entity.dataRange = parsed.data.dataRange
  if (parsed.data.columnConfig !== undefined) entity.columnConfig = parsed.data.columnConfig
  if (parsed.data.hasHeaderRow !== undefined) entity.hasHeaderRow = parsed.data.hasHeaderRow
  entity.updatedAt = new Date()

  await em.flush()

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth || !auth.orgId || !auth.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 })
  }

  const parsed = tableDefinitionDeleteSchema.safeParse({ id })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  const entity = await em.findOne(TableDefinition, {
    id: parsed.data.id,
    organizationId: auth.orgId,
    tenantId: auth.tenantId,
    deletedAt: null,
  })

  if (!entity) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  entity.deletedAt = new Date()
  entity.updatedAt = new Date()
  await em.flush()

  return NextResponse.json({ ok: true })
}

const tableDefinitionItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  siteId: z.string(),
  driveId: z.string(),
  itemId: z.string(),
  filePath: z.string().nullable(),
  worksheetName: z.string(),
  dataRange: z.string().nullable(),
  hasHeaderRow: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

export const openApi = createTablesCrudOpenApi({
  resourceName: 'TableDefinition',
  pluralName: 'TableDefinitions',
  querySchema: tableDefinitionListSchema,
  listResponseSchema: createPagedListResponseSchema(tableDefinitionItemSchema),
  create: {
    schema: tableDefinitionCreateSchema,
    description: 'Creates a new table definition.',
  },
  update: {
    schema: tableDefinitionUpdateSchema,
    responseSchema: defaultOkResponseSchema,
    description: 'Updates an existing table definition by id.',
  },
  del: {
    schema: z.object({ id: z.string().uuid() }),
    responseSchema: defaultOkResponseSchema,
    description: 'Deletes a table definition by id.',
  },
})
