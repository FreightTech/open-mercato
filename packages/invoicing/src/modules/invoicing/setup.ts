import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: [
      'invoicing.invoices.view',
      'invoicing.invoices.manage',
      'invoicing.invoices.approve',
      'invoicing.invoices.delete',
      'invoicing.ksef.view',
      'invoicing.ksef.submit',
      'invoicing.ksef.receive',
      'invoicing.settings.view',
      'invoicing.settings.manage',
    ],
    employee: [
      'invoicing.invoices.view',
      'invoicing.ksef.view',
    ],
  },
}

export default setup
