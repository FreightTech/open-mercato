import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: [
      'fms_projects.projects.view',
      'fms_projects.projects.manage',
      'fms_projects.projects.cancel',
      'fms_projects.legs.manage',
      'fms_projects.cargo.manage',
      'fms_projects.containers.manage',
      'fms_projects.invoices.view',
      'fms_projects.invoices.manage',
    ],
    employee: [
      'fms_projects.projects.view',
      'fms_projects.projects.manage',
      'fms_projects.legs.manage',
      'fms_projects.cargo.manage',
      'fms_projects.containers.manage',
      'fms_projects.invoices.view',
    ],
  },
}

export default setup
