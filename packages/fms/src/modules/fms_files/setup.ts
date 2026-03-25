import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: [
      'fms_files.files.view',
      'fms_files.files.manage',
      'fms_files.legs.manage',
      'fms_files.containers.manage',
      'fms_files.packages.manage',
      'fms_files.lines.manage',
      'fms_files.invoices.view',
      'fms_files.invoices.manage',
    ],
    employee: [
      'fms_files.files.view',
      'fms_files.files.manage',
      'fms_files.legs.manage',
      'fms_files.containers.manage',
      'fms_files.packages.manage',
      'fms_files.lines.manage',
      'fms_files.invoices.view',
    ],
  },
}

export default setup
