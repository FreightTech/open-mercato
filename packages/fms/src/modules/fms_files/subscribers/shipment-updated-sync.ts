/**
 * Shipment Updated Sync Subscriber
 *
 * Listens to shipment_tracking.shipment.updated events and automatically
 * syncs changes to any FmsFileUnit records linked via trackedShipmentId.
 *
 * This keeps containerNumber and containerType accurate when the carrier
 * API refines the data after initial discovery.
 */

import type { EntityManager } from '@mikro-orm/postgresql'
import { Shipment } from '@open-mercato/shipment-tracking'
import { FmsFileUnit } from '../data/entities'
import type { SubscriberContext } from '@open-mercato/events'

export const metadata = {
  event: 'shipment_tracking.shipment.updated',
  persistent: true,
  id: 'fms_files.shipment_updated_sync',
}

type ShipmentUpdatedPayload = {
  id: string
  tenantId: string
  organizationId: string
}

export default async function handle(
  payload: ShipmentUpdatedPayload,
  context?: SubscriberContext
): Promise<void> {
  const shipmentId = payload?.id
  const tenantId = payload?.tenantId
  const organizationId = payload?.organizationId

  if (!shipmentId || !tenantId || !organizationId) {
    console.warn('[fms_files:shipment-updated-sync] Missing required payload fields', {
      shipmentId,
      tenantId,
      organizationId,
    })
    return
  }

  const resolve = context?.resolve
  if (!resolve) {
    console.error('[fms_files:shipment-updated-sync] No resolve function in context')
    return
  }

  const em = resolve('em') as EntityManager
  const forkedEm = em.fork()

  try {
    const shipment = await forkedEm.findOne(Shipment, {
      id: shipmentId,
      tenantId,
      organizationId,
      deletedAt: null,
    })

    if (!shipment) {
      console.debug('[fms_files:shipment-updated-sync] Shipment not found:', shipmentId)
      return
    }

    const linkedUnits = await forkedEm.find(FmsFileUnit, {
      trackedShipmentId: shipmentId,
      tenantId,
      organizationId,
      deletedAt: null,
    })

    if (linkedUnits.length === 0) {
      console.debug('[fms_files:shipment-updated-sync] No linked units for shipment:', shipmentId)
      return
    }

    for (const unit of linkedUnits) {
      if (shipment.containerNumber) unit.containerNumber = shipment.containerNumber
      if (shipment.isoEquipmentCode) unit.containerType = shipment.isoEquipmentCode
    }

    await forkedEm.flush()

    console.log('[fms_files:shipment-updated-sync] Sync completed', {
      shipmentId,
      unitsUpdated: linkedUnits.length,
    })
  } catch (error) {
    console.error('[fms_files:shipment-updated-sync] Error syncing shipment:', error)

    const errorMessage = error instanceof Error ? error.message : String(error)
    const isNonRetryable =
      error instanceof TypeError ||
      error instanceof ReferenceError ||
      errorMessage.includes('validation') ||
      errorMessage.includes('constraint') ||
      errorMessage.includes('violates')

    if (isNonRetryable) {
      console.error('[fms_files:shipment-updated-sync] Non-retryable error, skipping retry:', errorMessage)
      return
    }

    throw error
  }
}
