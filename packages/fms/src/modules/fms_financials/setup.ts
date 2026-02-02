import type { ModuleSetupConfig} from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: [
      'fms_financials.dashboard.view',
      'fms_financials.reports.view',
    ],
    employee: ['fms_financials.dashboard.view'],
  },
}

export default setup
