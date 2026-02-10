import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { seedCarrierConfigs } from './lib/seed-carrier-configs'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: [
      'shipment_tracking.*',
    ],
    employee: [
      'shipment_tracking.shipments.view',
      'shipment_tracking.tracking_jobs.view',
      'shipment_tracking.companies.view',
      'shipment_tracking.carrier_configs.view',
      'shipment_tracking.webhooks.view',
    ],
  },

  seedDefaults: async (ctx) => {
    await seedCarrierConfigs(ctx.em, {
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId,
    })
  },
}

export default setup
