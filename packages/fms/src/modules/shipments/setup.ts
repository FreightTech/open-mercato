import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: [
      'shipments.shipments.view',
      'shipments.shipments.create',
      'shipments.shipments.edit',
      'shipments.shipments.delete',
      'shipments.import',
    ],
    employee: [
      'shipments.shipments.view',
      'shipments.shipments.create',
      'shipments.shipments.edit',
      'shipments.import',
    ],
  },
}

export default setup
