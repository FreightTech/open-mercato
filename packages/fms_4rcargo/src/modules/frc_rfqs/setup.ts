import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: [
      'frc_rfqs.view',
      'frc_rfqs.manage',
      'frc_rfqs.air_cargo.view',
      'frc_rfqs.air_cargo.manage',
    ],
    employee: [
      'frc_rfqs.view',
      'frc_rfqs.manage',
      'frc_rfqs.air_cargo.view',
      'frc_rfqs.air_cargo.manage',
    ],
  },
}

export default setup
