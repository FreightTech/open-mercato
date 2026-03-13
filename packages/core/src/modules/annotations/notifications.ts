import type { NotificationTypeDefinition } from '@open-mercato/shared/modules/notifications/types'

export const notificationTypes: NotificationTypeDefinition[] = [
  {
    type: 'annotations.mention',
    module: 'annotations',
    titleKey: 'annotations.notifications.mention.title',
    bodyKey: 'annotations.notifications.mention.body',
    icon: 'at-sign',
    severity: 'info',
    actions: [
      {
        id: 'view',
        labelKey: 'common.view',
        variant: 'outline',
        href: '/backend/{sourceEntityId}',
        icon: 'external-link',
      },
    ],
    linkHref: '/backend/{sourceEntityId}',
    expiresAfterHours: 168,
  },
]

export default notificationTypes
