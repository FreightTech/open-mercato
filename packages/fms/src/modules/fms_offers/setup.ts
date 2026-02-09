import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: [
      'fms_offers.rfq.view',
      'fms_offers.rfq.manage',
      'fms_offers.offers.view',
      'fms_offers.offers.manage',
    ],
    employee: [
      'fms_offers.rfq.view',
      'fms_offers.rfq.manage',
      'fms_offers.offers.view',
      'fms_offers.offers.manage',
    ],
  },
}

export default setup
