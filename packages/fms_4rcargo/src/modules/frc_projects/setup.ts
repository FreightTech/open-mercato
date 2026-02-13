import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: [
      'frc_projects.view',
      'frc_projects.manage',
    ],
    employee: [
      'frc_projects.view',
      'frc_projects.manage',
    ],
  },
}

export default setup
