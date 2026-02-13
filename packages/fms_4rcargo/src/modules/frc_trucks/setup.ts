import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: [
      'frc_trucks.view',
      'frc_trucks.manage',
    ],
    employee: [
      'frc_trucks.view',
      'frc_trucks.manage',
    ],
  },
}

export default setup
