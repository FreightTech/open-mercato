import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: [
      'fms_locations.ports.view',
      'fms_locations.ports.manage',
      'fms_locations.terminals.view',
      'fms_locations.terminals.manage',
      'fms_locations.import',
    ],
    employee: [
      'fms_locations.ports.view',
      'fms_locations.terminals.view',
    ],
  },
}

export default setup
