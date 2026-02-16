import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { seedCarrierConfigs } from './lib/seed-carrier-configs'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    admin: ['shipment_tracking.*'],
    employee: [
      'shipment_tracking.shipments.view',
      'shipment_tracking.tracking_jobs.view',
      'shipment_tracking.carrier_configs.view',
      'shipment_tracking.webhooks.view',
    ],
  },

  seedDefaults: async (ctx) => {
    // Seed carrier configs
    await seedCarrierConfigs(ctx.em, {
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId,
    })

    // Register daily poll schedule for this organization
    // The scheduler service may not be available in all installations
    try {
      const schedulerService = ctx.container.resolve<{
        register: (registration: {
          id: string
          name: string
          description?: string
          scopeType: 'system' | 'organization' | 'tenant'
          organizationId?: string
          tenantId?: string
          scheduleType: 'cron' | 'interval'
          scheduleValue: string
          timezone?: string
          targetType: 'queue' | 'command'
          targetQueue?: string
          targetCommand?: string
          targetPayload?: unknown
          sourceType?: 'user' | 'module'
          sourceModule?: string
          isEnabled?: boolean
        }) => Promise<void>
        exists: (id: string) => Promise<boolean>
      }>('schedulerService')

      const scheduleId = `shipment_tracking:daily-poll:${ctx.organizationId}`

      // Only register if it doesn't already exist (idempotent)
      const exists = await schedulerService.exists(scheduleId)
      if (!exists) {
        await schedulerService.register({
          id: scheduleId,
          name: 'Daily Shipment Tracking Poll',
          description:
            'Polls all active tracking jobs for carrier updates every day at 6:00 AM UTC. You can change the schedule time in the scheduler settings.',
          scopeType: 'organization',
          tenantId: ctx.tenantId,
          organizationId: ctx.organizationId,
          scheduleType: 'cron',
          scheduleValue: '0 6 * * *', // 6:00 AM UTC daily
          timezone: 'UTC',
          targetType: 'command',
          targetCommand: 'shipment_tracking.tracking.poll_all',
          targetPayload: {
            tenantId: ctx.tenantId,
            organizationId: ctx.organizationId,
          },
          sourceType: 'module',
          sourceModule: 'shipment_tracking',
          isEnabled: true,
        })

        console.log(
          `[shipment-tracking] Registered daily poll schedule for org ${ctx.organizationId}`,
        )
      }
    } catch (error) {
      // Scheduler module may not be installed - this is fine
      console.debug('[shipment-tracking] Scheduler service not available, skipping schedule registration')
    }
  },
}

export default setup
