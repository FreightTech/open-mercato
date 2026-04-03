import { buildBatchNotificationFromType } from '../../notifications/lib/notificationBuilder'
import { resolveNotificationService } from '../../notifications/lib/notificationService'
import { notificationTypes } from '../notifications'

export const metadata = {
  event: 'annotations.comment.created',
  persistent: true,
  id: 'annotations:comment-mention-notification',
}

type CommentCreatedPayload = {
  commentId: string
  annotationId: string
  tableId: string
  rowId: string
  columnKey: string
  userId: string
  mentionedUserIds: string[]
  tenantId: string
  organizationId: string
  authorName?: string
}

type ResolverContext = {
  resolve: <T = unknown>(name: string) => T
}

export default async function handle(payload: CommentCreatedPayload, ctx: ResolverContext): Promise<void> {
  console.log('[annotations:comment-mention-notification] handler called with:', JSON.stringify({ userId: payload.userId, mentionedUserIds: payload.mentionedUserIds, tenantId: payload.tenantId }))
  const recipientUserIds = payload.mentionedUserIds.filter((id) => id !== payload.userId)
  console.log('[annotations:comment-mention-notification] recipientUserIds after filtering self:', recipientUserIds)
  if (recipientUserIds.length === 0) return

  const typeDef = notificationTypes.find((t) => t.type === 'annotations.mention')
  console.log('[annotations:comment-mention-notification] typeDef found:', !!typeDef)
  if (!typeDef) return

  const notificationService = resolveNotificationService(ctx)
  console.log('[annotations:comment-mention-notification] notificationService resolved:', !!notificationService)
  const notificationInput = buildBatchNotificationFromType(typeDef, {
    recipientUserIds,
    titleVariables: {
      authorName: payload.authorName ?? 'Someone',
    },
    bodyVariables: {
      authorName: payload.authorName ?? 'Someone',
      columnKey: payload.columnKey,
    },
    sourceEntityType: 'cell_annotation',
    sourceEntityId: payload.tableId,
    linkHref: `/backend/${payload.tableId}`,
  })

  try {
    await notificationService.createBatch(notificationInput, {
      tenantId: payload.tenantId,
      organizationId: payload.organizationId,
    })
    console.log('[annotations:comment-mention-notification] notification batch created successfully')
  } catch (err) {
    console.error('[annotations:comment-mention-notification] failed to create notification batch:', err)
    throw err
  }
}
