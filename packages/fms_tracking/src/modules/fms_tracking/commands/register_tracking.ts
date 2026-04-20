import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import { EntityManager } from '@mikro-orm/postgresql'
import { FreighttechRegisterSubscription } from './freighttech/api'
import { logDebug, logInfo, logError, type TrackingLogContext } from '../lib/logger'
import z from 'zod'

const registerTrackingSchema = z.object({
  organizationId: z.uuid(),
  tenantId: z.uuid(),

  bookingNumber: z.string().optional(),
  carrierCode: z.string(),
  containerId: z.string().optional(),
}).refine(
  (data) => data.bookingNumber || data.containerId,
  {
    message: "Either bookingNumber or containerId is required",
  }
)
export type RegisterTrackingInput = z.infer<typeof registerTrackingSchema>

const registerTrackingCommand: CommandHandler<RegisterTrackingInput, {
  success: boolean,
  referenceId?: string,
  source?: string,
}> = {
  id: 'fms_tracking.tracking.register',
  async execute(rawInput, ctx) {
    const logCtx: TrackingLogContext = {
      organizationId: rawInput.organizationId,
      tenantId: rawInput.tenantId,
    }

    logDebug('register_tracking:start', {
      hasBookingNumber: !!rawInput.bookingNumber,
      hasContainerId: !!rawInput.containerId,
      carrierCode: rawInput.carrierCode,
    }, logCtx)

    const start = performance.now()

    try {
      const input = registerTrackingSchema.parse(rawInput)
      const em = ctx.container.resolve<EntityManager>('em')

      const resp = await FreighttechRegisterSubscription(em, input)

      const durationMs = Math.round(performance.now() - start)
      logInfo('register_tracking:success', {
        referenceId: resp.reference.id,
        containerId: resp.reference.container_id,
        carrierCode: resp.reference.carrier_code,
        active: resp.reference.active,
        durationMs,
      }, logCtx)

      return {
        referenceId: resp.reference.id,
        success: resp.reference.active,
        source: 'freighttech'
      }
    } catch (err) {
      const durationMs = Math.round(performance.now() - start)
      logError('register_tracking:failed', err, {
        carrierCode: rawInput.carrierCode,
        durationMs,
      }, logCtx)
      throw err
    }
  },
}

registerCommand(registerTrackingCommand)
