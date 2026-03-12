import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { CellAnnotation, CellComment } from '../../data/entities'
import {
  createAnnotationSchema,
  updateAnnotationColorSchema,
  batchGetAnnotationsSchema,
  batchSetColorSchema,
} from '../../data/validators'
export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['annotations.view'] },
  POST: { requireAuth: true, requireFeatures: ['annotations.create'] },
  PUT: { requireAuth: true, requireFeatures: ['annotations.create'] },
  PATCH: { requireAuth: true, requireFeatures: ['annotations.create'] },
  DELETE: { requireAuth: true, requireFeatures: ['annotations.delete'] },
}

async function buildContext(req: Request) {
  const container = await createRequestContainer()
  const auth = await getAuthFromRequest(req)
  const { translate } = await resolveTranslations()
  if (!auth) throw new CrudHttpError(401, { error: translate('annotations.errors.unauthorized', 'Unauthorized') })
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  return { container, auth, scope, translate }
}

function resolveScope(auth: { tenantId?: string | null; orgId?: string | null }, scope: { selectedId?: string | null } | null, translate: (key: string, fallback?: string) => string) {
  const tenantId = auth.tenantId ?? null
  if (!tenantId) throw new CrudHttpError(400, { error: translate('annotations.errors.tenant_required', 'Tenant context is required') })
  const organizationId = scope?.selectedId ?? auth.orgId ?? null
  if (!organizationId) throw new CrudHttpError(400, { error: translate('annotations.errors.organization_required', 'Organization context is required') })
  return { tenantId, organizationId }
}

export async function GET(req: Request) {
  try {
    const { container, auth, scope, translate } = await buildContext(req)
    const { tenantId, organizationId } = resolveScope(auth, scope, translate)

    const url = new URL(req.url)
    const tableId = url.searchParams.get('tableId') ?? url.searchParams.get('table_id')
    const rowIdsParam = url.searchParams.get('rowIds') ?? url.searchParams.get('row_ids')

    if (!tableId) {
      throw new CrudHttpError(400, { error: translate('annotations.errors.table_id_required', 'table_id is required') })
    }
    if (!rowIdsParam) {
      throw new CrudHttpError(400, { error: translate('annotations.errors.row_ids_required', 'row_ids is required') })
    }

    const rowIds = rowIdsParam.split(',').map((id) => id.trim()).filter((id) => id.length > 0)
    batchGetAnnotationsSchema.parse({ tableId, rowIds })

    const em = container.resolve('em') as EntityManager
    const annotations = await em.find(
      CellAnnotation,
      {
        organizationId,
        tenantId,
        tableId,
        rowId: { $in: rowIds },
        deletedAt: null,
      },
      { populate: ['comments'], orderBy: { createdAt: 'ASC' } },
    )

    const items = annotations.map((annotation) => ({
      id: annotation.id,
      tableId: annotation.tableId,
      rowId: annotation.rowId,
      columnKey: annotation.columnKey,
      color: annotation.color ?? null,
      createdAt: annotation.createdAt.toISOString(),
      updatedAt: annotation.updatedAt.toISOString(),
      comments: annotation.comments
        .getItems()
        .filter((comment) => !comment.deletedAt)
        .map((comment) => ({
          id: comment.id,
          userId: comment.userId,
          content: comment.content,
          createdAt: comment.createdAt.toISOString(),
          updatedAt: comment.updatedAt.toISOString(),
        })),
    }))

    return NextResponse.json({ items })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    console.error('[annotations] GET failed', err)
    return NextResponse.json({ error: 'Failed to fetch annotations' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { container, auth, scope, translate } = await buildContext(req)
    const { tenantId, organizationId } = resolveScope(auth, scope, translate)

    const body = await req.json().catch(() => ({}))
    const input = createAnnotationSchema.parse(body)

    const em = container.resolve('em') as EntityManager

    const existing = await em.findOne(CellAnnotation, {
      organizationId,
      tenantId,
      tableId: input.tableId,
      rowId: input.rowId,
      columnKey: input.columnKey,
      deletedAt: null,
    })

    if (existing) {
      if (input.color !== undefined) {
        existing.color = input.color ?? null
      }
      await em.flush()
      return NextResponse.json({ id: existing.id }, { status: 200 })
    }

    const annotation = em.create(CellAnnotation, {
      organizationId,
      tenantId,
      tableId: input.tableId,
      rowId: input.rowId,
      columnKey: input.columnKey,
      color: input.color ?? null,
    })

    await em.flush()
    return NextResponse.json({ id: annotation.id }, { status: 201 })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.errors }, { status: 400 })
    }
    console.error('[annotations] POST failed', err)
    return NextResponse.json({ error: 'Failed to create annotation' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const { container, auth, scope, translate } = await buildContext(req)
    const { tenantId, organizationId } = resolveScope(auth, scope, translate)

    const url = new URL(req.url)
    const annotationId = url.searchParams.get('id')
    if (!annotationId) {
      throw new CrudHttpError(400, { error: translate('annotations.errors.id_required', 'Annotation id is required') })
    }

    const body = await req.json().catch(() => ({}))
    const input = updateAnnotationColorSchema.parse(body)

    const em = container.resolve('em') as EntityManager
    const annotation = await em.findOne(CellAnnotation, {
      id: annotationId,
      organizationId,
      tenantId,
      deletedAt: null,
    })

    if (!annotation) {
      throw new CrudHttpError(404, { error: translate('annotations.errors.not_found', 'Annotation not found') })
    }

    annotation.color = input.color ?? null
    await em.flush()

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.errors }, { status: 400 })
    }
    console.error('[annotations] PATCH failed', err)
    return NextResponse.json({ error: 'Failed to update annotation' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const { container, auth, scope, translate } = await buildContext(req)
    const { tenantId, organizationId } = resolveScope(auth, scope, translate)

    const body = await req.json().catch(() => ({}))
    const input = batchSetColorSchema.parse(body)

    const em = container.resolve('em') as EntityManager

    // Load existing annotations for all target cells in one query
    const existing = await em.find(CellAnnotation, {
      organizationId,
      tenantId,
      tableId: input.tableId,
      rowId: { $in: input.cells.map((c) => c.rowId) },
      deletedAt: null,
    })

    const existingMap = new Map<string, CellAnnotation>()
    for (const annotation of existing) {
      existingMap.set(`${annotation.rowId}:${annotation.columnKey}`, annotation)
    }

    const userId = auth.userId ?? auth.sub
    const annotationRefs: CellAnnotation[] = []

    for (const cell of input.cells) {
      const key = `${cell.rowId}:${cell.columnKey}`
      let annotation = existingMap.get(key)

      if (annotation) {
        if (input.color !== undefined) {
          annotation.color = input.color ?? null
        }
      } else {
        annotation = em.create(CellAnnotation, {
          organizationId,
          tenantId,
          tableId: input.tableId,
          rowId: cell.rowId,
          columnKey: cell.columnKey,
          color: input.color ?? null,
        })
      }
      annotationRefs.push(annotation)
    }

    // Flush annotations first so they have IDs for comments
    await em.flush()

    if (input.comment && userId) {
      for (const annotation of annotationRefs) {
        em.create(CellComment, {
          organizationId,
          tenantId,
          userId,
          content: input.comment,
          annotation,
        })
      }
      await em.flush()
    }

    return NextResponse.json({ ok: true, count: annotationRefs.length })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.errors }, { status: 400 })
    }
    console.error('[annotations] PUT batch-color failed', err)
    return NextResponse.json({ error: 'Failed to batch update colors' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { container, auth, scope, translate } = await buildContext(req)
    const { tenantId, organizationId } = resolveScope(auth, scope, translate)

    const url = new URL(req.url)
    const annotationId = url.searchParams.get('id')
    if (!annotationId) {
      const body = await req.json().catch(() => ({}))
      const id = (body as Record<string, unknown>)?.id
      if (typeof id !== 'string' || !id.trim().length) {
        throw new CrudHttpError(400, { error: translate('annotations.errors.id_required', 'Annotation id is required') })
      }
      const em = container.resolve('em') as EntityManager
      const annotation = await em.findOne(CellAnnotation, {
        id: id.trim(),
        organizationId,
        tenantId,
        deletedAt: null,
      })
      if (!annotation) {
        throw new CrudHttpError(404, { error: translate('annotations.errors.not_found', 'Annotation not found') })
      }
      annotation.deletedAt = new Date()
      await em.flush()
      return NextResponse.json({ ok: true })
    }

    const em = container.resolve('em') as EntityManager
    const annotation = await em.findOne(CellAnnotation, {
      id: annotationId,
      organizationId,
      tenantId,
      deletedAt: null,
    })

    if (!annotation) {
      throw new CrudHttpError(404, { error: translate('annotations.errors.not_found', 'Annotation not found') })
    }

    annotation.deletedAt = new Date()
    await em.flush()

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    console.error('[annotations] DELETE failed', err)
    return NextResponse.json({ error: 'Failed to delete annotation' }, { status: 500 })
  }
}

const annotationItemSchema = z.object({
  id: z.string().uuid(),
  tableId: z.string(),
  rowId: z.string(),
  columnKey: z.string(),
  color: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  comments: z.array(z.object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    content: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })),
})

const annotationListResponseSchema = z.object({
  items: z.array(annotationItemSchema),
})

const annotationCreateResponseSchema = z.object({
  id: z.string().uuid(),
})

const batchColorResponseSchema = z.object({ ok: z.boolean(), count: z.number() })
const okResponseSchema = z.object({ ok: z.boolean() })
const errorSchema = z.object({ error: z.string() })

export const openApi: OpenApiRouteDoc = {
  tag: 'Annotations',
  summary: 'Cell annotations',
  methods: {
    GET: {
      summary: 'Batch get annotations',
      description: 'Returns annotations for a given table and set of row IDs, including nested comments.',
      parameters: [
        { name: 'tableId', in: 'query', required: true, schema: z.string() },
        { name: 'rowIds', in: 'query', required: true, schema: z.string(), description: 'Comma-separated row IDs' },
      ],
      responses: [
        { status: 200, description: 'Annotations with comments', schema: annotationListResponseSchema },
      ],
      errors: [
        { status: 400, description: 'Missing required parameters', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
      ],
    },
    POST: {
      summary: 'Create or update annotation',
      description: 'Creates a cell annotation. If one already exists for the same cell, updates it instead.',
      requestBody: {
        contentType: 'application/json',
        schema: createAnnotationSchema,
      },
      responses: [
        { status: 201, description: 'Annotation created', schema: annotationCreateResponseSchema },
        { status: 200, description: 'Existing annotation updated', schema: annotationCreateResponseSchema },
      ],
      errors: [
        { status: 400, description: 'Validation failed', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
      ],
    },
    PUT: {
      summary: 'Batch set color',
      description: 'Sets the color for multiple cells at once. Creates annotations for cells that do not have one yet.',
      requestBody: {
        contentType: 'application/json',
        schema: batchSetColorSchema,
      },
      responses: [
        { status: 200, description: 'Colors updated', schema: batchColorResponseSchema },
      ],
      errors: [
        { status: 400, description: 'Validation failed', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
      ],
    },
    PATCH: {
      summary: 'Update annotation color',
      description: 'Updates the color of an existing cell annotation. Pass annotation id via query string.',
      parameters: [
        { name: 'id', in: 'query', required: true, schema: z.string().uuid() },
      ],
      requestBody: {
        contentType: 'application/json',
        schema: updateAnnotationColorSchema,
      },
      responses: [
        { status: 200, description: 'Annotation color updated', schema: okResponseSchema },
      ],
      errors: [
        { status: 400, description: 'Validation failed', schema: errorSchema },
        { status: 404, description: 'Annotation not found', schema: errorSchema },
      ],
    },
    DELETE: {
      summary: 'Delete annotation',
      description: 'Soft-deletes an annotation. Pass annotation id via query string or body.',
      parameters: [
        { name: 'id', in: 'query', required: false, schema: z.string().uuid() },
      ],
      responses: [
        { status: 200, description: 'Annotation deleted', schema: okResponseSchema },
      ],
      errors: [
        { status: 400, description: 'Missing annotation id', schema: errorSchema },
        { status: 404, description: 'Annotation not found', schema: errorSchema },
      ],
    },
  },
}
