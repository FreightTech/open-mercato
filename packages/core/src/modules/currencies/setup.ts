import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { seedExampleCurrencies } from './lib/seeds'
import type { CurrencyFetchScheduleService } from './lib/fetchScheduleService'

export const setup: ModuleSetupConfig = {
  seedDefaults: async (ctx) => {
    const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
    await seedExampleCurrencies(ctx.em, scope)

    if (ctx.container.hasRegistration('currencyFetchScheduleService')) {
      try {
        const fetchScheduleService = ctx.container.resolve(
          'currencyFetchScheduleService',
        ) as CurrencyFetchScheduleService
        await fetchScheduleService.reconcile(scope)
      } catch (err) {
        console.warn('[currencies] Failed to reconcile fetch schedules:', err)
      }
    }
  },

  defaultRoleFeatures: {
    admin: ['currencies.*'],
  },
}

export default setup
