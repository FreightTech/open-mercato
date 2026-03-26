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
import { ensureLocationsFromShipment, syncLegLocationsFromShipment } from '../lib/location-sync'
import type { SubscriberContext } from '@open-mercato/events'
import { createFmsLogger } from '../../../lib/logger'

const logger = createFmsLogger('fms_files.shipment_updated_sync')

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
    const shipment = await forkedEm.findOne(Shipment, {
      id: shipmentId,
      tenantId,
      organizationId,
      deletedAt: null,
    })

    if (!shipment) {
      logger.debug('shipment_not_found', { shipmentId })
      return
    }

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

    // Sync leg-level vessel info, timestamps, and origin/destination locations
    const legIds = [...new Set(unitLegs.map((ul) => (ul.leg as any)?.id ?? (ul.leg as unknown as string)))]
    const legs = legIds.length > 0
      ? await forkedEm.find(FmsFileLeg, { id: { $in: legIds }, deletedAt: null })
      : []

    for (const leg of legs) {
      if (shipment.vesselName) leg.vesselName = shipment.vesselName
      if (shipment.vesselImo) leg.vesselImo = shipment.vesselImo
      if (shipment.voyageNumber) leg.voyageNumber = shipment.voyageNumber
      leg.etdTimestamps = mergeTimestampsFromShipment(leg.etdTimestamps, (shipment as any).etdTimestamps)
      leg.atdTimestamps = mergeTimestampsFromShipment(leg.atdTimestamps, (shipment as any).atdTimestamps)
      leg.etaTimestamps = mergeTimestampsFromShipment(leg.etaTimestamps, (shipment as any).etaTimestamps)
      leg.ataTimestamps = mergeTimestampsFromShipment(leg.ataTimestamps, (shipment as any).ataTimestamps)
    }

    // Auto-create missing FmsLocation records and update leg origin/destination
    const newLocationIds: string[] = []
    const locodeMap = await ensureLocationsFromShipment(forkedEm, shipment as any, organizationId, tenantId, newLocationIds)
    for (const leg of legs) {
      syncLegLocationsFromShipment(leg, shipment as any, locodeMap)
    }

    await forkedEm.flush()

    // Index newly created locations so they appear in search/pickers
    if (newLocationIds.length > 0) {
      const eventBus = resolve('eventBus') as { emit: (event: string, payload: unknown) => Promise<void> }
      for (const locationId of newLocationIds) {
        await eventBus.emit('search.index_record', {
          entityId: 'fms_locations:fms_location',
          recordId: locationId,
          tenantId,
          organizationId,
        })
      }
    }

    logger.info('sync_completed', {
      shipmentId,
      unitsUpdated: linkedUnits.length,
      unitLegsUpdated: unitLegs.length,
      legsUpdated: legIds.length,
    })
  } catch (error) {
    logger.error('error_syncing_shipment', error, { shipmentId })

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
