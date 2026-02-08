import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { seedCarrierConfigs } from './lib/seed-carrier-configs'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: [
      'shipment_tracking.*',
      'shipment_tracking.shipments.view',
      'shipment_tracking.shipments.manage',
      'shipment_tracking.tracking_jobs.view',
      'shipment_tracking.tracking_jobs.manage',
      'shipment_tracking.companies.view',
      'shipment_tracking.companies.manage',
      'shipment_tracking.carrier_configs.view',
      'shipment_tracking.carrier_configs.manage',
      'shipment_tracking.webhooks.view',
      'shipment_tracking.webhooks.manage',
      'shipment_tracking.settings.manage',
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
