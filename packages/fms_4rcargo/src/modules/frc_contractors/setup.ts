import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: [
      'contractors.view',
      'contractors.create',
      'contractors.edit',
      'contractors.delete',
    ],
    employee: [
      'contractors.view',
      'contractors.create',
      'contractors.edit',
      'contractors.delete',
    ],
  },
}

export default setup
