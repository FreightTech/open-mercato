import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    superadmin: ['customs.*'],
    admin: ['customs.*'],
    employee: ['customs.view'],
  },
}

export default setup
