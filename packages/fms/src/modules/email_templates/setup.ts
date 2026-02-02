import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: [
      'email_templates.view',
      'email_templates.manage',
      'email_templates.settings.view',
      'email_templates.settings.manage',
    ],
    employee: ['email_templates.view'],
  },
}

export default setup
