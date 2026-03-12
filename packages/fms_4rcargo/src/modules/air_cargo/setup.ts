import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: ['air_cargo.view', 'air_cargo.create', 'air_cargo.edit', 'air_cargo.delete'],
    employee: ['air_cargo.view'],
  },
}

export default setup
