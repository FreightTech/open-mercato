import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { CellAnnotation, CellComment, CellAnnotationAssignee } from '../../../../data/entities'
import { createCommentSchema } from '../../../../data/validators'
import { emitAnnotationsEvent } from '../../../../events'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['annotations.create'] },
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

function extractAnnotationId(req: Request): string {
  const url = new URL(req.url)
  const segments = url.pathname.split('/')
  const commentsIdx = segments.indexOf('comments')
  if (commentsIdx >= 1) {
    const candidate = segments[commentsIdx - 1]
    if (candidate && candidate !== 'annotations') return candidate
  }
  const annotationIdParam = url.searchParams.get('annotationId') ?? url.searchParams.get('annotation_id')
  if (annotationIdParam) return annotationIdParam
  throw new CrudHttpError(400, { error: 'Annotation id is required' })
}

export async function POST(req: Request) {
  try {
    const { container, auth, scope, translate } = await buildContext(req)
    const { tenantId, organizationId } = resolveScope(auth, scope, translate)
    const annotationId = extractAnnotationId(req)

    const body = await req.json().catch(() => ({}))
    const input = createCommentSchema.parse(body)

    const em = container.resolve('em') as EntityManager
    const annotation = await em.findOne(CellAnnotation, {
      id: annotationId,
      organizationId,
      tenantId,
      deletedAt: null,
    })

    if (!annotation) {
      throw new CrudHttpError(404, { error: translate('annotations.errors.annotation_not_found', 'Annotation not found') })
    }

    const userId = auth.userId ?? auth.sub
    if (!userId) {
      throw new CrudHttpError(400, { error: translate('annotations.errors.user_required', 'User context is required') })
    }

    const comment = em.create(CellComment, {
      organizationId,
      tenantId,
      userId,
      content: input.content,
      annotation,
    })

    await em.flush()

    if (input.mentionedUserIds && input.mentionedUserIds.length > 0) {
      const existingAssignees = await em.find(CellAnnotationAssignee, { annotation })
      const existingUserIds = new Set(existingAssignees.map((a) => a.userId))
      for (const mentionedUserId of input.mentionedUserIds) {
        if (!existingUserIds.has(mentionedUserId)) {
          em.create(CellAnnotationAssignee, {
            organizationId,
            tenantId,
            userId: mentionedUserId,
            assignedBy: userId,
            annotation,
          })
        }
      }
      await em.flush()

      await emitAnnotationsEvent('annotations.comment.created', {
        commentId: comment.id,
        annotationId: annotation.id,
        tableId: annotation.tableId,
        rowId: annotation.rowId,
        columnKey: annotation.columnKey,
        userId,
        authorName: auth.email || undefined,
        mentionedUserIds: input.mentionedUserIds,
        tenantId,
        organizationId,
      })
    }

    return NextResponse.json({ id: comment.id }, { status: 201 })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.errors }, { status: 400 })
    }
    console.error('[annotations.comments] POST failed', err)
    return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { container, auth, scope, translate } = await buildContext(req)
    const { tenantId, organizationId } = resolveScope(auth, scope, translate)

    const url = new URL(req.url)
    const commentId = url.searchParams.get('commentId') ?? url.searchParams.get('comment_id')

    let resolvedCommentId = commentId
    if (!resolvedCommentId) {
      const body = await req.json().catch(() => ({}))
      resolvedCommentId = typeof (body as Record<string, unknown>)?.commentId === 'string'
        ? (body as Record<string, unknown>).commentId as string
        : null
    }

    if (!resolvedCommentId) {
      throw new CrudHttpError(400, { error: translate('annotations.errors.comment_id_required', 'Comment id is required') })
    }

    const em = container.resolve('em') as EntityManager
    const comment = await em.findOne(CellComment, {
      id: resolvedCommentId,
      organizationId,
      tenantId,
      deletedAt: null,
    })

    if (!comment) {
      throw new CrudHttpError(404, { error: translate('annotations.errors.comment_not_found', 'Comment not found') })
    }

    comment.deletedAt = new Date()
    await em.flush()

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    console.error('[annotations.comments] DELETE failed', err)
    return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 })
  }
}

const commentCreateResponseSchema = z.object({
  id: z.string().uuid(),
})

const okResponseSchema = z.object({ ok: z.boolean() })
const errorSchema = z.object({ error: z.string() })

export const openApi: OpenApiRouteDoc = {
  tag: 'Annotations',
  summary: 'Annotation comments',
  methods: {
    POST: {
      summary: 'Add comment to annotation',
      description: 'Creates a new comment on a cell annotation.',
      requestBody: {
        contentType: 'application/json',
        schema: createCommentSchema,
      },
      responses: [
        { status: 201, description: 'Comment created', schema: commentCreateResponseSchema },
      ],
      errors: [
        { status: 400, description: 'Validation failed', schema: errorSchema },
        { status: 404, description: 'Annotation not found', schema: errorSchema },
      ],
    },
    DELETE: {
      summary: 'Delete comment',
      description: 'Soft-deletes a comment. Pass commentId via query string or body.',
      parameters: [
        { name: 'commentId', in: 'query', required: false, schema: z.string().uuid() },
      ],
      responses: [
        { status: 200, description: 'Comment deleted', schema: okResponseSchema },
      ],
      errors: [
        { status: 400, description: 'Missing comment id', schema: errorSchema },
        { status: 404, description: 'Comment not found', schema: errorSchema },
      ],
    },
  },
}
