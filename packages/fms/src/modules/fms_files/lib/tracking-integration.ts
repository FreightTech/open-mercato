/**
 * Tracking Integration for fms_files
 *
 * Handles tracking job creation and shipment synchronization
 * for SHIP legs with supported carriers and booking/BL references.
 */

import type { EntityManager } from '@mikro-orm/postgresql'
import { Shipment } from '@open-mercato/shipment-tracking'
import { FmsCarrier } from '../../fms_products/data/entities'
import { FmsFileLeg } from '../data/entities'
import {
  isCarrierSupported,
  detectCarrierCodeFromName,
} from '../../fms_projects/lib/carrier-scac-mapper'
import { syncShipmentsToFileLeg } from './tracking-sync'
import { createFmsLogger } from '../../../lib/logger'

const logger = createFmsLogger('fms_files.tracking_integration')

/**
 * Type for the TrackingService (injected via DI)
 */
export interface TrackingService {
  createTrackingJob: (input: {
    organizationId: string
    tenantId: string
    carrierCode: string
    referenceType: 'bol' | 'booking' | 'container'
    referenceValue: string
  }) => Promise<{
    trackingJobId: string
    shipmentsCreated: number
    newEvents: number
  }>
}

export interface StartTrackingResult {
  trackingStarted: boolean
  trackingJobId?: string
  unitsCreated?: number
  unitsLinked?: number
  newLocationIds?: string[]
}

type TrackingReferenceType = 'bol' | 'booking' | 'container'

function selectTrackingReference(
  bookingNumber: string | null,
  blNumber: string | null
): { referenceType: TrackingReferenceType; referenceValue: string } | null {
  if (bookingNumber) return { referenceType: 'booking', referenceValue: bookingNumber }
  if (blNumber) return { referenceType: 'bol', referenceValue: blNumber }
  return null
}

/**
 * Resolves carrier code from a leg's carrierId via Contractor name matching.
 */
export async function resolveCarrierCodeForLeg(
  em: EntityManager,
  leg: FmsFileLeg
): Promise<string | null> {
  if (!leg.carrierId) return null

  const carrier = await em.findOne(FmsCarrier, {
    id: leg.carrierId,
    deletedAt: null,
  })

  if (!carrier) return null

  return detectCarrierCodeFromName(carrier.name)
}

/**
 * Checks whether tracking should be triggered for a leg.
 */
export function shouldTriggerTracking(leg: FmsFileLeg): boolean {
  return (
    leg.type === 'SHIP' &&
    Boolean(leg.carrierId) &&
    Boolean(leg.bookingNumber || leg.blNumber)
  )
}

/**
 * Starts tracking for a SHIP leg and syncs discovered shipments to file units.
 *
 * This function:
 * 1. Resolves carrier code from the leg's carrierId (Contractor name match)
 * 2. Checks for a sibling leg on the same file already tracked with the same booking/BL
 * 3. Creates a tracking job (or reuses the sibling's job)
 * 4. Syncs resulting shipments to FmsFileUnit records (create or link)
 *
 * All errors are caught and logged — tracking failures never block leg saves.
 */
export async function startTrackingForFileLeg(
  em: EntityManager,
  trackingService: TrackingService,
  leg: FmsFileLeg
): Promise<StartTrackingResult> {
  const { organizationId, tenantId, bookingNumber, blNumber } = leg

  const carrierCode = await resolveCarrierCodeForLeg(em, leg)

  if (!isCarrierSupported(carrierCode)) {
    logger.debug('tracking_skipped_unsupported_carrier', {
      legId: leg.id,
      carrierId: leg.carrierId,
      carrierCode,
    })
    return { trackingStarted: false }
  }

  const reference = selectTrackingReference(bookingNumber ?? null, blNumber ?? null)
  if (!reference) return { trackingStarted: false }

  try {
    // Check if a sibling leg in the same file already has a tracking job for this reference
    const fileId = typeof leg.file === 'string' ? leg.file : (leg.file as any)?.id
    const siblingFilter: Record<string, unknown> = {
      file: fileId,
      trackingJobId: { $ne: null },
      deletedAt: null,
    }
    if (bookingNumber) siblingFilter.bookingNumber = bookingNumber
    else siblingFilter.blNumber = blNumber

    const existingSiblingLeg = await em.findOne(FmsFileLeg, siblingFilter as any)

    let trackingJobId: string

    if (existingSiblingLeg?.trackingJobId) {
      trackingJobId = existingSiblingLeg.trackingJobId
      logger.debug('tracking_reusing_sibling_job', {
        legId: leg.id,
        siblingLegId: existingSiblingLeg.id,
        trackingJobId,
      })
    } else {
      const trackingResult = await trackingService.createTrackingJob({
        organizationId,
        tenantId,
        carrierCode: carrierCode!,
        referenceType: reference.referenceType,
        referenceValue: reference.referenceValue,
      })
      trackingJobId = trackingResult.trackingJobId

      // Persist tracking job ID on the leg
      leg.trackingJobId = trackingJobId
      await em.flush()

      logger.info('tracking_job_created', {
        legId: leg.id,
        trackingJobId,
        shipmentsCreated: trackingResult.shipmentsCreated,
        referenceType: reference.referenceType,
        referenceValue: reference.referenceValue,
      })
    }

    // Fetch shipments and sync to file units
    const freshEm = em.fork()
    const shipments = await freshEm.find(Shipment, {
      trackingJob: { id: trackingJobId },
      organizationId,
      tenantId,
      deletedAt: null,
    })

    if (shipments.length === 0) {
      return { trackingStarted: true, trackingJobId, unitsCreated: 0, unitsLinked: 0 }
    }

    const freshLeg = await freshEm.findOneOrFail(FmsFileLeg, { id: leg.id })
    const syncResult = await syncShipmentsToFileLeg(freshEm, shipments, freshLeg, organizationId, tenantId)

    logger.info('units_synced', {
      legId: leg.id,
      trackingJobId,
      unitsCreated: syncResult.unitsCreated,
      unitsLinked: syncResult.unitsLinked,
    })

    return {
      trackingStarted: true,
      trackingJobId,
      unitsCreated: syncResult.unitsCreated,
      unitsLinked: syncResult.unitsLinked,
      newLocationIds: syncResult.newLocationIds,
    }
  } catch (error) {
    logger.warn('tracking_failed', {
      legId: leg.id,
      carrierId: leg.carrierId,
      carrierCode,
      referenceType: reference.referenceType,
      referenceValue: reference.referenceValue,
      error: error instanceof Error ? error.message : String(error),
    })
    return { trackingStarted: false }
  }
}

/**
 * Entry point called from API routes after leg create/update.
 * Checks preconditions and triggers tracking if applicable.
 * Always resolves — tracking failures are logged, never propagated.
 */
export async function triggerTrackingIfApplicable(
  em: EntityManager,
  leg: FmsFileLeg,
  diContainer: { resolve: (name: string) => unknown }
): Promise<void> {
  if (!shouldTriggerTracking(leg)) return

  const trackingService = diContainer.resolve('shipmentTrackingService') as TrackingService
  const result = await startTrackingForFileLeg(em, trackingService, leg)

  // Index newly created locations so they appear in search/pickers
  if (result.newLocationIds && result.newLocationIds.length > 0) {
    try {
      const eventBus = diContainer.resolve('eventBus') as { emit: (event: string, payload: unknown) => Promise<void> }
      for (const locationId of result.newLocationIds) {
        await eventBus.emit('search.index_record', {
          entityId: 'fms_locations:fms_location',
          recordId: locationId,
          tenantId: leg.tenantId,
          organizationId: leg.organizationId,
        })
      }
    } catch {
      // Search indexing failure should not block the main flow
    }
  }
}
