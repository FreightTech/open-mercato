import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: [
      'fms_products.charge_codes.view',
      'fms_products.charge_codes.manage',
      'fms_products.charge_codes.import',
    ],
    employee: ['fms_products.charge_codes.view'],
  },
}

export default setup
