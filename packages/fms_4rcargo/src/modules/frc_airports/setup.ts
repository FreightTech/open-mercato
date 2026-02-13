import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: [
      'frc_airports.view',
      'frc_airports.manage',
    ],
    employee: [
      'frc_airports.view',
    ],
  },
}

export default setup
