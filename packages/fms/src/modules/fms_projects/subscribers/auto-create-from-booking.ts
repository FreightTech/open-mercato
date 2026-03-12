/**
 * Auto-Create Project from Booking Confirmation Subscriber
 *
 * Listens to fms_documents.document.processed events and automatically
 * creates FmsProject records when a booking confirmation document is processed.
 *
 * Features:
 * - Creates FmsProject with data extracted from document (all fields including
 *   vessel, voyage, dates, carrier, cargo description)
 * - Starts tracking via import-tracking pattern (containers created by tracking sync)
 * - Links related documents (by booking number, BL number, or container number)
 * - Matches client using Meilisearch fuzzy search
 *
 * Note: Placeholder containers are NOT created. Real containers with valid
 * container numbers are created by the tracking import (syncShipmentsToProject)
 * which validates container numbers against ISO 6346 format.
 */

import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsDocument, DocumentCategory } from '../../fms_documents/data/entities'
import { findMatchingDocumentIds } from '../../fms_documents/services/project-matcher.service'
import { matchClient } from '../lib/client-matcher'
import { extractBookingData } from '../lib/booking-data-extractor'
import { lookupCarrierByName } from '../lib/carrier-lookup'
import { createProjectFromBookingData } from '../lib/project-creation.service'
import {
  startTrackingForProject,
  type TrackingService,
} from '../lib/tracking-integration'
import { createFmsLogger } from '../../../lib/logger'
import type { BookingConfirmationData } from '../data/types'
import type { DocumentProcessedPayload } from '../../fms_documents/events'
import type { SubscriberContext } from '@open-mercato/events'
import type { FeatureTogglesService } from '@open-mercato/core/modules/feature_toggles/lib/feature-flag-check'

const logger = createFmsLogger('fms_projects.auto_create_from_booking')

/** Feature flag identifier for tenant-scoped opt-out */
const FEATURE_FLAG_ID = 'fms_auto_create_project_from_booking'

/**
 * Event subscriber metadata.
 * Listens to document processed events from the fms_documents module.
 */
export const metadata = {
  event: 'fms_documents.document.processed',
  persistent: true, // Use queue for reliable processing
  id: 'fms_projects.auto_create_from_booking',
}

/**
 * Handler that creates FmsProject from booking confirmation documents.
 *
 * When a booking confirmation document is processed with AI extraction,
 * this subscriber:
 * 1. Creates a new FmsProject with all extracted data (including vessel, dates, carrier)
 * 2. Starts tracking via trackingService (containers created by syncShipmentsToProject)
 * 3. Links related documents by matching identifiers
 */
export default async function handle(
  payload: DocumentProcessedPayload,
  context?: SubscriberContext
): Promise<void> {
  const documentId = payload?.id
  const tenantId = payload?.tenantId
  const organizationId = payload?.organizationId
  const category = payload?.category

  // Validate required fields
  if (!documentId || !tenantId || !organizationId) {
    logger.warn('missing_required_fields', {
      documentId,
      tenantId: !!tenantId,
      organizationId: !!organizationId,
    })
    return
  }

  // Only process booking confirmation documents
  if (category !== DocumentCategory.BOOKING_CONFIRMATION && category !== 'booking_confirmation') {
    logger.debug('skipping_non_booking_document', { documentId, category })
    return
  }

  const resolve = context?.resolve
  if (!resolve) {
    logger.error('no_resolve_function', new Error('No resolve function in context'), { documentId })
    return
  }

  // Check feature flag - allow tenants to opt-out of auto-create
  const featureTogglesService = resolve('featureTogglesService') as FeatureTogglesService
  const featureResult = await featureTogglesService.getBoolConfig(FEATURE_FLAG_ID, tenantId)

  if (!featureResult.ok || featureResult.value === false) {
    logger.debug('feature_disabled', {
      documentId,
      tenantId,
      featureSource: featureResult.ok ? featureResult.resolution.source : 'error',
    })
    return
  }

  const em = (resolve('em') as EntityManager).fork()

  try {
    // Load the document with extracted data
    const document = await em.findOne(FmsDocument, {
      id: documentId,
      tenantId,
      organizationId,
      deletedAt: null,
    })

    if (!document) {
      logger.warn('document_not_found', { documentId })
      return
    }

    // Skip if document is already linked to a project
    if (document.relatedEntityId) {
      logger.debug('document_already_linked', {
        documentId,
        relatedEntityId: document.relatedEntityId,
      })
      return
    }

    const extractedData = document.extractedData as BookingConfirmationData | null
    if (!extractedData) {
      logger.warn('no_extracted_data', { documentId })
      return
    }

    // Extract and normalize booking data
    const bookingData = extractBookingData(document, extractedData)

    logger.info('creating_project_from_booking', {
      documentId,
      bookingNumber: bookingData.bookingNumber,
      blNumber: bookingData.blNumber,
      carrierCode: bookingData.carrierCode,
      vesselName: bookingData.vesselName,
      containerCount: bookingData.containerNumbers.length,
    })

    // Match client from shipper/consignee
    let clientId: string | null = null
    try {
      const clientMatch = await matchClient(
        resolve,
        { shipper: bookingData.shipper, consignee: bookingData.consignee },
        { tenantId, organizationId }
      )
      if (clientMatch) {
        clientId = clientMatch.contractorId
        logger.debug('client_matched', {
          documentId,
          clientId,
          matchedField: clientMatch.matchedField,
        })
      }
    } catch (error) {
      logger.warn('client_match_failed', {
        documentId,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    // Match carrier from extracted name
    let carrierId: string | null = null
    if (bookingData.carrierName) {
      const carrierMatch = await lookupCarrierByName(
        em,
        bookingData.carrierName,
        tenantId,
        organizationId
      )
      if (carrierMatch) {
        carrierId = carrierMatch.id
        logger.debug('carrier_matched', { documentId, carrierId })
      }
    }

    // Create the project
    const { project } = await createProjectFromBookingData(em, {
      organizationId,
      tenantId,
      extractedData: bookingData,
      clientId,
      carrierId,
    })

    // Link document IMMEDIATELY to prevent duplicate project creation on retry
    document.relatedEntityType = 'fms_projects:fms_project'
    document.relatedEntityId = project.id
    await em.flush()

    logger.debug('document_linked_to_project', { documentId, projectId: project.id })

    // Start tracking and sync containers
    let trackingStarted = false
    if (bookingData.carrierCode) {
      const trackingService = resolve('shipmentTrackingService') as TrackingService
      const trackingResult = await startTrackingForProject(em, trackingService, {
        projectId: project.id,
        organizationId,
        tenantId,
        carrierCode: bookingData.carrierCode,
        bookingNumber: bookingData.bookingNumber,
        blNumber: bookingData.blNumber,
        containerNumbers: bookingData.containerNumbers,
      }, documentId)
      trackingStarted = trackingResult.trackingStarted
    }

    // Find and link related documents
    const matchingDocIds = await findMatchingDocumentIds(
      em,
      {
        blNumber: bookingData.blNumber || null,
        mblNumber: bookingData.mblNumber || null,
        bookingNumber: bookingData.bookingNumber || null,
        containerNumbers: bookingData.containerNumbers.length > 0 ? bookingData.containerNumbers : null,
      },
      {
        tenantId,
        organizationId,
        excludeDocumentId: documentId,
      }
    )

    if (matchingDocIds.length > 0) {
      await em.nativeUpdate(
        FmsDocument,
        { id: { $in: matchingDocIds } },
        {
          relatedEntityType: 'fms_projects:fms_project',
          relatedEntityId: project.id,
        }
      )

      logger.info('related_documents_linked', {
        documentId,
        projectId: project.id,
        linkedCount: matchingDocIds.length,
      })
    }

    logger.info('auto_create_completed', {
      documentId,
      projectId: project.id,
      projectNumber: project.projectNumber,
      documentsLinked: matchingDocIds.length + 1,
      trackingStarted,
    })
  } catch (error) {
    logger.error('auto_create_failed', error, { documentId })

    // Non-retryable errors
    const errorMessage = error instanceof Error ? error.message : String(error)
    const isNonRetryable =
      error instanceof TypeError ||
      error instanceof ReferenceError ||
      errorMessage.includes('validation') ||
      errorMessage.includes('constraint') ||
      errorMessage.includes('violates') ||
      errorMessage.includes('duplicate key')

    if (isNonRetryable) {
      logger.error('non_retryable_error', error, { documentId })
      return // Don't retry
    }

    throw error // Re-throw for queue retry
  }
}
