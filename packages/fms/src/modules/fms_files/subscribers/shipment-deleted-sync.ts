/**
 * Shipment Deleted Sync Subscriber
 *
 * Listens to shipment_tracking.shipment.deleted events and unlinks
 * the deleted shipment from any FmsFileUnit records.
 *
 * The unit itself is NOT deleted — users may have added manual data
 * (commodity, weight, etc.) that should be preserved.
 */

import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsFileUnit } from '../data/entities'
import type { SubscriberContext } from '@open-mercato/events'
import { createFmsLogger } from '../../../lib/logger'

const logger = createFmsLogger('fms_files.shipment_deleted_sync')

export const metadata = {
  event: 'shipment_tracking.shipment.deleted',
  persistent: true,
  id: 'fms_files.shipment_deleted_sync',
}

type ShipmentDeletedPayload = {
  id: string
  tenantId: string
  organizationId: string
}

export default async function handle(
  payload: ShipmentDeletedPayload,
  context?: SubscriberContext
): Promise<void> {
  const shipmentId = payload?.id
  const tenantId = payload?.tenantId
  const organizationId = payload?.organizationId

  if (!shipmentId || !tenantId || !organizationId) {
    logger.warn('missing_required_payload_fields', { shipmentId, tenantId, organizationId })
    return
  }

  const resolve = context?.resolve
  if (!resolve) {
    logger.error('no_resolve_function_in_context', new Error('No resolve function'), {})
    return
  }

  const em = resolve('em') as EntityManager
  const forkedEm = em.fork()

  try {
    const linkedUnits = await forkedEm.find(FmsFileUnit, {
      trackedShipmentId: shipmentId,
      tenantId,
      organizationId,
      deletedAt: null,
    })

    if (linkedUnits.length === 0) {
      logger.debug('no_linked_units', { shipmentId })
      return
    }

    for (const unit of linkedUnits) {
      unit.trackedShipmentId = null
    }

    await forkedEm.flush()

    logger.info('unlinked_deleted_shipment', {
      shipmentId,
      unitsUnlinked: linkedUnits.length,
    })
  } catch (error) {
    logger.error('error_unlinking_shipment', error, { shipmentId })

    const errorMessage = error instanceof Error ? error.message : String(error)
    const isNonRetryable =
      error instanceof TypeError ||
      error instanceof ReferenceError ||
      errorMessage.includes('validation') ||
      errorMessage.includes('constraint') ||
      errorMessage.includes('violates')

    if (isNonRetryable) {
      logger.error('non_retryable_error', error, { shipmentId })
      return
    }

    throw error
  }
}
