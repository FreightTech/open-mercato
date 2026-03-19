/**
 * Tracking Integration Service
 *
 * Handles tracking job creation and shipment synchronization
 * for projects created from booking confirmations.
 */

import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsProject } from '../data/entities'
import { Shipment } from '@open-mercato/shipment-tracking'
import { syncShipmentsToProject } from './sea-containers/tracking-sync'
import { createFmsLogger } from '../../../lib/logger'

const logger = createFmsLogger('fms_projects.tracking_integration')

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

/**
 * Reference selection for tracking (booking, BL, or container number).
 */
export type TrackingReferenceType = 'bol' | 'booking' | 'container'

/**
 * Input for starting tracking.
 */
export interface StartTrackingInput {
  projectId: string
  organizationId: string
  tenantId: string
  carrierCode: string
  bookingNumber: string | null
  blNumber: string | null
  containerNumbers: string[]
}

/**
 * Result of starting tracking.
 */
export interface StartTrackingResult {
  trackingStarted: boolean
  trackingJobId?: string
  containersCreated?: number
  containersUpdated?: number
}

/**
 * Determines the best reference for tracking.
 * Priority: booking number > BL number > first container number.
 *
 * @param bookingNumber - Booking number from extracted data
 * @param blNumber - Bill of lading number from extracted data
 * @param containerNumbers - Container numbers from extracted data
 * @returns Reference type and value, or null if no valid reference
 */
export function selectTrackingReference(
  bookingNumber: string | null,
  blNumber: string | null,
  containerNumbers: string[]
): { referenceType: TrackingReferenceType; referenceValue: string } | null {
  if (bookingNumber) {
    return { referenceType: 'booking', referenceValue: bookingNumber }
  }

  if (blNumber) {
    return { referenceType: 'bol', referenceValue: blNumber }
  }

  if (containerNumbers.length > 0 && containerNumbers[0]) {
    return { referenceType: 'container', referenceValue: containerNumbers[0] }
  }

  return null
}

/**
 * Checks if tracking can be started based on available data.
 *
 * @param carrierCode - SCAC code for the carrier
 * @param bookingNumber - Booking number
 * @param blNumber - Bill of lading number
 * @param containerNumbers - Container numbers
 * @returns True if tracking can be started
 */
export function canStartTracking(
  carrierCode: string | null,
  bookingNumber: string | null,
  blNumber: string | null,
  containerNumbers: string[]
): boolean {
  if (!carrierCode) {
    return false
  }

  return Boolean(bookingNumber || blNumber || containerNumbers.length > 0)
}

/**
 * Starts tracking for a project and syncs shipments to create containers.
 *
 * This function:
 * 1. Creates a tracking job via the tracking service
 * 2. Fetches shipments created by the tracking job
 * 3. Syncs shipments to the project (creates validated containers)
 *
 * Uses a forked EntityManager for isolation.
 *
 * @param em - Entity manager (will be forked)
 * @param trackingService - Tracking service for creating jobs
 * @param input - Tracking input parameters
 * @param contextId - Context ID for logging (e.g., documentId)
 * @returns Tracking result
 */
export async function startTrackingForProject(
  em: EntityManager,
  trackingService: TrackingService,
  input: StartTrackingInput,
  contextId?: string
): Promise<StartTrackingResult> {
  const { projectId, organizationId, tenantId, carrierCode, bookingNumber, blNumber, containerNumbers } = input

  // Check if we have enough data to start tracking
  if (!canStartTracking(carrierCode, bookingNumber, blNumber, containerNumbers)) {
    logger.debug('tracking_skipped_no_data', {
      contextId,
      projectId,
      carrierCode,
      hasBookingNumber: Boolean(bookingNumber),
      hasBlNumber: Boolean(blNumber),
      containerCount: containerNumbers.length,
    })
    return { trackingStarted: false }
  }

  // Determine reference for tracking
  const reference = selectTrackingReference(bookingNumber, blNumber, containerNumbers)
  if (!reference) {
    return { trackingStarted: false }
  }

  try {
    // Create tracking job
    const trackingResult = await trackingService.createTrackingJob({
      organizationId,
      tenantId,
      carrierCode,
      referenceType: reference.referenceType,
      referenceValue: reference.referenceValue,
    })

    logger.info('tracking_job_created', {
      contextId,
      projectId,
      trackingJobId: trackingResult.trackingJobId,
      shipmentsCreated: trackingResult.shipmentsCreated,
      newEvents: trackingResult.newEvents,
      referenceType: reference.referenceType,
      referenceValue: reference.referenceValue,
    })

    // Sync shipments to project (creates validated containers)
    // Use a fresh EM to avoid contamination from tracking job creation
    const freshEm = em.fork()
    const shipments = await freshEm.find(Shipment, {
      trackingJob: { id: trackingResult.trackingJobId },
      organizationId,
      tenantId,
      deletedAt: null,
    })

    if (shipments.length === 0) {
      logger.debug('no_shipments_to_sync', {
        contextId,
        projectId,
        trackingJobId: trackingResult.trackingJobId,
      })
      return {
        trackingStarted: true,
        trackingJobId: trackingResult.trackingJobId,
        containersCreated: 0,
        containersUpdated: 0,
      }
    }

    // Reload project in fresh EM for sync
    const freshProject = await freshEm.findOneOrFail(FmsProject, { id: projectId })
    const syncResult = await syncShipmentsToProject(
      freshEm,
      shipments,
      freshProject,
      organizationId,
      tenantId
    )

    logger.info('containers_synced', {
      contextId,
      projectId,
      trackingJobId: trackingResult.trackingJobId,
      containersCreated: syncResult.containersCreated,
      containersUpdated: syncResult.containersUpdated,
      reusedExistingJob: trackingResult.shipmentsCreated === 0,
    })

    return {
      trackingStarted: true,
      trackingJobId: trackingResult.trackingJobId,
      containersCreated: syncResult.containersCreated,
      containersUpdated: syncResult.containersUpdated,
    }
  } catch (error) {
    // Log but don't fail - tracking can be added manually
    logger.warn('tracking_failed', {
      contextId,
      projectId,
      carrierCode,
      referenceType: reference.referenceType,
      referenceValue: reference.referenceValue,
      error: error instanceof Error ? error.message : String(error),
    })
    return { trackingStarted: false }
  }
}
