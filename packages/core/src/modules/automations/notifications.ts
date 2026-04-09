import type { NotificationTypeDefinition } from '@open-mercato/shared/modules/notifications/types'

export const notificationTypes: NotificationTypeDefinition[] = [
  {
    type: 'automations.run.failed',
    module: 'automations',
    titleKey: 'automations.notifications.run.failed.title',
    bodyKey: 'automations.notifications.run.failed.body',
    icon: 'zap-off',
    severity: 'error',
    actions: [
      {
        id: 'view',
        labelKey: 'common.view',
        variant: 'outline',
        href: '/backend/automations/{sourceEntityId}/runs/{sourceEntityId}',
        icon: 'external-link',
      },
    ],
    expiresAfterHours: 168,
  },
]

export default notificationTypes
