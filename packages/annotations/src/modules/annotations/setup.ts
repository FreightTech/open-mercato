import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: [
      'annotations.view',
      'annotations.create',
      'annotations.delete',
    ],
    employee: [
      'annotations.view',
      'annotations.create',
    ],
  },
}

export default setup
