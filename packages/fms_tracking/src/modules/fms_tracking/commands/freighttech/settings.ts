import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import type { EntityManager } from '@mikro-orm/core'
import { FreighttechTrackingSettings } from '../../data/entities'
import { freighttechSettingsUpsertSchema, type FreighttechSettingsUpsertInput } from '../../data/validators'
import { logInfo, logDebug, logError, type TrackingLogContext } from '../../lib/logger'

export async function freighttechApiKey(em: EntityManager, params: { tenantId: string; organizationId: string }) {
  const settings = await loadFreighttechTrackingSettings(em, params)
  return settings?.apiKey
}

export async function loadFreighttechTrackingSettings(
  em: EntityManager,
  params: { tenantId: string; organizationId: string }
): Promise<FreighttechTrackingSettings | null> {
  return em.findOne(FreighttechTrackingSettings, {
    tenantId: params.tenantId,
    organizationId: params.organizationId,
  })
}

const saveFreighttechTrackingSettingsCommand: CommandHandler<
  FreighttechSettingsUpsertInput, FreighttechSettingsUpsertInput
> = {
  id: 'fms_tracking.freighttech.settings.save',
  async execute(rawInput, ctx) {
    const auth = ctx.auth
    const logCtx: TrackingLogContext = {
      brandId: ctx.brandId,
      organizationId: auth?.orgId ?? undefined,
      tenantId: auth?.tenantId ?? undefined,
    }

    logDebug('settings:save:start', {}, logCtx)

    if (!auth?.orgId || !auth.tenantId) {
      logError('settings:save:missing_context', new Error('Missing org or tenant id'), {}, logCtx)
      throw Error("fms_tracking.freighttech.settings.save Failed, missing org or tenant id")
    }

    const start = performance.now()

    try {
      const input = freighttechSettingsUpsertSchema.parse(rawInput)

      const em = ctx.container.resolve<EntityManager>('em')
      let settings = await loadFreighttechTrackingSettings(em, {
        tenantId: auth?.tenantId,
        organizationId: auth?.orgId,
      })

      const apiKey = input.apiKey.trim()
      const apiBaseUrl = input.apiBaseUrl.trim()
      const isCreate = !settings

      if (!settings) {
        settings = em.create(FreighttechTrackingSettings, {
          tenantId: auth.tenantId,
          organizationId: auth.orgId,
          apiKey: apiKey,
          apiBaseUrl: apiBaseUrl
        })
        em.persist(settings)
      } else {
        settings.apiKey = apiKey
        settings.apiBaseUrl = apiBaseUrl
        settings.updatedAt = new Date()
      }

      await em.flush()

      const durationMs = Math.round(performance.now() - start)
      logInfo('settings:save:success', {
        action: isCreate ? 'created' : 'updated',
        hasApiKey: !!apiKey,
        hasApiBaseUrl: !!apiBaseUrl,
        durationMs,
      }, logCtx)

      return {
        apiKey: settings.apiKey,
        apiBaseUrl: settings.apiBaseUrl,
      }
    } catch (err) {
      const durationMs = Math.round(performance.now() - start)
      logError('settings:save:failed', err, { durationMs }, logCtx)
      throw err
    }
  },
}

registerCommand(saveFreighttechTrackingSettingsCommand)
