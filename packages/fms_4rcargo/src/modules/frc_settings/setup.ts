import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    superadmin: ['frc_settings.view', 'frc_settings.manage', 'frc_settings.integrations'],
    admin: ['frc_settings.view', 'frc_settings.manage', 'frc_settings.integrations'],
    employee: ['frc_settings.view'],
  },
}

export default setup
