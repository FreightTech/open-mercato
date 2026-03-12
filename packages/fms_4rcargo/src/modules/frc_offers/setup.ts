import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: [
      'frc_offers.view',
      'frc_offers.manage',
    ],
    employee: [
      'frc_offers.view',
      'frc_offers.manage',
    ],
  },
}

export default setup
