import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: [
      'contractors.view',
      'contractors.create',
      'contractors.edit',
      'contractors.delete',
      'contractors.manage_financial',
      'contractors.admin',
    ],
    employee: ['contractors.view'],
  },
}

export default setup
