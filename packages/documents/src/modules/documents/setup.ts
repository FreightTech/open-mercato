import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: [
      'documents.view',
      'documents.manage',
      'documents.upload',
      'documents.delete',
    ],
    employee: [
      'documents.view',
      'documents.upload',
    ],
  },
}

export default setup
