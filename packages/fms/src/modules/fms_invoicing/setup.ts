import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: [
      'fms_invoicing.invoices.view',
      'fms_invoicing.invoices.manage',
      'fms_invoicing.invoices.approve',
      'fms_invoicing.invoices.delete',
      'fms_invoicing.settings.view',
      'fms_invoicing.settings.manage',
    ],
    employee: [
      'fms_invoicing.invoices.view',
    ],
  },
}

export default setup
