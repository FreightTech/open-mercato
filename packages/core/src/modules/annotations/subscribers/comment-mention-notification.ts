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
  const recipientUserIds = payload.mentionedUserIds.filter((id) => id !== payload.userId)
  if (recipientUserIds.length === 0) return

  const typeDef = notificationTypes.find((t) => t.type === 'annotations.mention')
  if (!typeDef) return

  const notificationService = resolveNotificationService(ctx)
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

  await notificationService.createBatch(notificationInput, {
    tenantId: payload.tenantId,
    organizationId: payload.organizationId,
  })
}
