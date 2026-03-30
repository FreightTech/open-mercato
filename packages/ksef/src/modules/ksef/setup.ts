import type { ModuleSetupConfig } from '@open-mercato/shared/modules/setup'
import { createCredentialsService } from '@open-mercato/core/modules/integrations/lib/credentials-service'
import { createIntegrationLogService } from '@open-mercato/core/modules/integrations/lib/log-service'
import { createIntegrationStateService } from '@open-mercato/core/modules/integrations/lib/state-service'
import { applyKsefEnvPreset } from './lib/preset'

export const setup: ModuleSetupConfig = {
  defaultRoleFeatures: {
    superadmin: ['ksef.view', 'ksef.submit', 'ksef.receive', 'ksef.settings.manage'],
    admin: ['ksef.view', 'ksef.submit', 'ksef.receive', 'ksef.settings.manage'],
    employee: ['ksef.view'],
  },

  async onTenantCreated({ em, organizationId, tenantId }) {
    try {
      await applyKsefEnvPreset({
        credentialsService: createCredentialsService(em),
        integrationStateService: createIntegrationStateService(em),
        integrationLogService: createIntegrationLogService(em),
        scope: { tenantId, organizationId },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown KSeF preset error'
      console.warn(`[ksef] Failed to apply env preset during tenant setup: ${message}`)
    }
  },
}

export default setup
