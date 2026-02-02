import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: [
      'fms_quotes.quotes.view',
      'fms_quotes.quotes.manage',
      'fms_quotes.offers.view',
      'fms_quotes.offers.manage',
    ],
    employee: [
      'fms_quotes.quotes.view',
      'fms_quotes.quotes.manage',
      'fms_quotes.offers.view',
      'fms_quotes.offers.manage',
    ],
  },
}

export default setup
