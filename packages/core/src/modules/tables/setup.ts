import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: ['tables.*', 'tables.view', 'tables.manage'],
    employee: ['tables.view'],
  },
}

export default setup
