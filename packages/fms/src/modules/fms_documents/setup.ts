import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: [
      'fms_documents.view',
      'fms_documents.manage',
      'fms_documents.upload',
      'fms_documents.delete',
    ],
    employee: [
      'fms_documents.view',
      'fms_documents.upload',
    ],
  },
}

export default setup
