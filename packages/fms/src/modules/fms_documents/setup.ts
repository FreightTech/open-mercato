import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: [
      'fms_documents.view',
      'fms_documents.manage',
      'fms_documents.upload',
      'fms_documents.delete',
      'fms_documents.dashboard.view',
      'fms_documents.reports.view',
      'fms_documents.invoices.view',
      'fms_documents.invoices.upload',
      'fms_documents.invoices.manage',
      'fms_documents.invoices.approve',
      'fms_documents.invoices.delete',
    ],
    employee: [
      'fms_documents.view',
      'fms_documents.upload',
      'fms_documents.dashboard.view',
      'fms_documents.invoices.view',
    ],
  },
}

export default setup
