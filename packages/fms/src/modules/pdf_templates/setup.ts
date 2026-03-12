import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: [
      'pdf_templates.view',
      'pdf_templates.manage',
    ],
    employee: ['pdf_templates.view'],
  },
}

export default setup
