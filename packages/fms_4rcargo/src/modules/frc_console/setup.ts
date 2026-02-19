import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: [
      'frc_console.view',
      'frc_console.manage',
    ],
    employee: [
      'frc_console.view',
      'frc_console.manage',
    ],
  },
}

export default setup
