import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: [
      'fms_products.products.view',
      'fms_products.products.manage',
      'fms_products.carriers.view',
      'fms_products.carriers.manage',
    ],
    employee: [
      'fms_products.products.view',
      'fms_products.carriers.view',
    ],
  },
}

export default setup
