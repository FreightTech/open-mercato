/**
 * Shipment Updated Sync Subscriber
 *
 * Listens to shipment_tracking.shipment.updated events and automatically
 * syncs changes to FmsFileUnit, FmsFileUnitLeg, and FmsFileLeg records
 * linked via trackedShipmentId.
 *
 * Synced fields:
 * - FmsFileUnit: containerNumber, containerType (via ISO 6346 mapping)
 * - FmsFileUnitLeg: sealNumber (joined from shipment.seals)
 * - FmsFileLeg: vesselName, vesselImo, voyageNumber, etd/atd/eta/ataTimestamps
 */

import type { EntityManager } from '@mikro-orm/postgresql'
import { Shipment } from '@open-mercato/shipment-tracking'
import { FmsFileUnit, FmsFileUnitLeg, FmsFileLeg } from '../data/entities'
import { mapIsoEquipmentCode, mergeTimestampsFromShipment } from '../lib/tracking-sync'
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

    // Sync unit-level fields
    const mappedType = mapIsoEquipmentCode(shipment.isoEquipmentCode)
    for (const unit of linkedUnits) {
      if (shipment.containerNumber) unit.containerNumber = shipment.containerNumber
      if (mappedType) unit.containerType = mappedType
    }

    // Sync unit-leg seal numbers
    const unitIds = linkedUnits.map((u) => u.id)
    const sealNumber = (shipment.seals as any[] | null)?.map((s: any) => s.number).join(', ') || null

    const unitLegs = await forkedEm.find(FmsFileUnitLeg, {
      unit: { $in: unitIds },
      deletedAt: null,
    })

    if (sealNumber) {
      for (const ul of unitLegs) {
        ul.sealNumber = sealNumber
      }
    }

    // Sync leg-level vessel info and timestamps
    const legIds = [...new Set(unitLegs.map((ul) => (ul.leg as any)?.id ?? ul.leg as string))]
    if (legIds.length > 0) {
      const legs = await forkedEm.find(FmsFileLeg, {
        id: { $in: legIds },
        deletedAt: null,
      })

      for (const leg of legs) {
        if (shipment.vesselName) leg.vesselName = shipment.vesselName
        if (shipment.vesselImo) leg.vesselImo = shipment.vesselImo
        if (shipment.voyageNumber) leg.voyageNumber = shipment.voyageNumber
        leg.etdTimestamps = mergeTimestampsFromShipment(leg.etdTimestamps, (shipment as any).etdTimestamps)
        leg.atdTimestamps = mergeTimestampsFromShipment(leg.atdTimestamps, (shipment as any).atdTimestamps)
        leg.etaTimestamps = mergeTimestampsFromShipment(leg.etaTimestamps, (shipment as any).etaTimestamps)
        leg.ataTimestamps = mergeTimestampsFromShipment(leg.ataTimestamps, (shipment as any).ataTimestamps)
      }
    }

    await forkedEm.flush()

    console.log('[fms_files:shipment-updated-sync] Sync completed', {
      shipmentId,
      unitsUpdated: linkedUnits.length,
      unitLegsUpdated: unitLegs.length,
      legsUpdated: legIds.length,
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
