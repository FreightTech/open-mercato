import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: [
      'templating.view',
      'templating.manage',
    ],
    employee: ['templating.view'],
  },
}

export default setup
