import { resolveNotificationService } from '@open-mercato/core/modules/notifications/lib/notificationService'
import { buildBatchNotificationFromType } from '@open-mercato/core/modules/notifications/lib/notificationBuilder'
import { notificationTypes as annotationNotificationTypes } from '@open-mercato/core/modules/annotations/notifications'

type MentionNotificationOptions = {
  mentionedUserIds: string[]
  actorUserId: string | null
  authorName: string
  sourceEntityType: string
  sourceEntityId: string
  linkHref: string
  tenantId: string
  organizationId: string
  container: { resolve: (name: string) => unknown }
}

/**
 * Creates in-app notifications for mentioned users in FMS activity comments.
 * Reuses the annotation mention notification type for consistent UX.
 * Silently swallows errors to avoid blocking the note creation flow.
 */
export async function createMentionNotifications(options: MentionNotificationOptions): Promise<void> {
  const {
    mentionedUserIds,
    actorUserId,
    authorName,
    sourceEntityType,
    sourceEntityId,
    linkHref,
    tenantId,
    organizationId,
    container,
  } = options

  const recipientUserIds = actorUserId
    ? mentionedUserIds.filter((id) => id !== actorUserId)
    : mentionedUserIds

  if (recipientUserIds.length === 0) return

  try {
    const typeDef = annotationNotificationTypes.find((t) => t.type === 'annotations.mention')
    if (!typeDef) return

    const notificationService = resolveNotificationService(container)
    const notificationInput = buildBatchNotificationFromType(typeDef, {
      recipientUserIds,
      titleVariables: { authorName },
      bodyVariables: { authorName, columnKey: '_activity' },
      sourceEntityType,
      sourceEntityId,
      linkHref,
    })
    // Override actions to use correct link instead of {sourceEntityId} template
    notificationInput.actions = [
      { id: 'view', label: 'common.view', labelKey: 'common.view', variant: 'outline', icon: 'external-link', href: linkHref },
    ]
    await notificationService.createBatch(notificationInput, { tenantId, organizationId })
  } catch (err) {
    console.error('[fms:mention-notifications] failed to create mention notifications', err)
  }
}
