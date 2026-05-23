/**
 * Auto-Create or Update FmsFileLeg from Booking Confirmation Subscriber
 *
 * Listens to fms_documents.document.processed events and:
 * - Creates an FmsFileLeg (type=SHIP) if no matching leg exists
 * - Fills missing fields on an existing leg if one with the same bookingNumber exists
 *
 * Conditions:
 * - The document category is 'booking_confirmation'
 * - The document is linked to an FMS file (relatedEntityType === 'fms_files:fms_file')
 *
 * Also triggers tracking if carrier + booking/BL reference is available.
 */

import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsDocument, DocumentCategory } from '../../fms_documents/data/entities'
import { FmsFile, FmsFileLeg } from '../data/entities'
import { extractBookingData } from '../../fms_projects/lib/booking-data-extractor'
import { lookupCarrierByName } from '../../fms_projects/lib/carrier-lookup'
import { triggerTrackingIfApplicable } from '../lib/tracking-integration'
import { createFmsLogger } from '../../../lib/logger'
import type { BookingConfirmationData } from '../../fms_projects/data/types'
import type { DocumentProcessedPayload } from '../../fms_documents/events'
import type { SubscriberContext } from '@open-mercato/events'
import type { LegTimestampEntry } from '../data/types'
import type { ExtractedBookingData } from '../../fms_projects/data/types'

const logger = createFmsLogger('fms_files.auto_create_leg_from_booking')

const RELATED_ENTITY_TYPE = 'fms_files:fms_file'

export const metadata = {
  event: 'fms_documents.document.processed',
  persistent: true,
  id: 'fms_files.auto_create_leg_from_booking',
}

function buildTimestampEntry(date: Date, documentDate: Date | null | undefined): LegTimestampEntry {
  return {
    value: date.toISOString(),
    offset: null,
    source: 'document',
    updatedAt: (documentDate ?? new Date()).toISOString(),
  }
}

/**
 * Fills missing fields on an existing leg from booking data.
 * Never overwrites non-null values. Returns list of field names that were filled.
 */
function fillMissingLegFields(
  leg: FmsFileLeg,
  data: ExtractedBookingData,
  carrierId: string | null,
  documentDate: Date | null | undefined
): string[] {
  const filled: string[] = []

  function fillString<K extends keyof FmsFileLeg>(field: K, value: string | null) {
    if (!leg[field] && value) {
      ;(leg as any)[field] = value
      filled.push(field as string)
    }
  }

  function fillDate<K extends keyof FmsFileLeg>(field: K, value: Date | null) {
    if (!leg[field] && value) {
      ;(leg as any)[field] = value
      filled.push(field as string)
    }
  }

  fillString('blNumber', data.blNumber)
  fillString('vesselName', data.vesselName)
  fillString('voyageNumber', data.voyageNumber)

  if (!leg.carrierId && carrierId) {
    leg.carrierId = carrierId
    filled.push('carrierId')
  }

  // Fill timestamps only if the array is empty/null
  if ((!leg.etdTimestamps || leg.etdTimestamps.length === 0) && data.etd) {
    leg.etdTimestamps = [buildTimestampEntry(data.etd, documentDate)]
    filled.push('etdTimestamps')
  }

  if ((!leg.etaTimestamps || leg.etaTimestamps.length === 0) && data.eta) {
    leg.etaTimestamps = [buildTimestampEntry(data.eta, documentDate)]
    filled.push('etaTimestamps')
  }

  fillDate('vgmCutoff', data.vgmCutoffDate)
  fillDate('documentationCutoff', data.docCutoffDate)
  fillDate('gateInCutoff', data.gateCloseDate)

  return filled
}

export default async function handle(
  payload: DocumentProcessedPayload,
  context?: SubscriberContext
): Promise<void> {
  const documentId = payload?.id
  const tenantId = payload?.tenantId
  const organizationId = payload?.organizationId
  const category = payload?.category

  if (!documentId || !tenantId || !organizationId) {
    logger.warn('missing_required_fields', { documentId })
    return
  }

  if (category !== DocumentCategory.BOOKING_CONFIRMATION && category !== 'booking_confirmation') {
    return
  }

  const resolve = context?.resolve
  if (!resolve) {
    logger.error('no_resolve_function', new Error('No resolve function in context'), { documentId })
    return
  }

  const em = (resolve('em') as EntityManager).fork()

  try {
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

    // Must be linked to an FMS file
    if (document.relatedEntityType !== RELATED_ENTITY_TYPE || !document.relatedEntityId) {
      logger.debug('document_not_linked_to_file', {
        documentId,
        relatedEntityType: document.relatedEntityType,
      })
      return
    }

    const fileId = document.relatedEntityId

    // Verify the file exists
    const file = await em.findOne(FmsFile, {
      id: fileId,
      tenantId,
      organizationId,
      deletedAt: null,
    })

    if (!file) {
      logger.warn('file_not_found', { documentId, fileId })
      return
    }

    const extractedData = (document.extractedData ?? document.documentData) as BookingConfirmationData | null
    if (!extractedData || Object.keys(extractedData).length === 0) {
      logger.warn('no_extracted_data', { documentId })
      return
    }

    const bookingData = extractBookingData(document, extractedData)

    // Guard: require at least a booking number or vessel name to create a leg
    if (!bookingData.bookingNumber && !bookingData.vesselName && !bookingData.blNumber) {
      logger.warn('insufficient_booking_data', {
        documentId,
        fileId,
        message: 'Extraction produced no booking number, vessel name, or B/L number — skipping leg creation',
      })
      return
    }

    // Lookup carrier for use in both create and update paths
    let carrierId: string | null = null
    if (bookingData.carrierName) {
      const carrierMatch = await lookupCarrierByName(em, bookingData.carrierName, tenantId, organizationId)
      if (carrierMatch) {
        carrierId = carrierMatch.id
      }
    }

    // Check if a SHIP leg with the same booking number already exists
    let leg: FmsFileLeg | null = null
    let created = false

    if (bookingData.bookingNumber) {
      leg = await em.findOne(FmsFileLeg, {
        file: fileId,
        type: 'SHIP',
        bookingNumber: bookingData.bookingNumber,
        deletedAt: null,
      })
    }

    if (leg) {
      // Fill missing fields only — never overwrite existing data
      const filled = fillMissingLegFields(leg, bookingData, carrierId, document.documentDate)

      if (filled.length === 0) {
        logger.debug('leg_already_complete', {
          documentId,
          fileId,
          legId: leg.id,
          bookingNumber: bookingData.bookingNumber,
        })
      } else {
        leg.updatedAt = new Date()
        await em.flush()

        logger.info('leg_updated_from_booking', {
          documentId,
          fileId,
          legId: leg.id,
          filledFields: filled,
        })
      }
    } else {
      // Create new leg
      const maxLeg = await em.findOne(
        FmsFileLeg,
        { file: fileId, deletedAt: null },
        { orderBy: { legSequence: 'DESC' } }
      )
      const legSequence = (maxLeg?.legSequence ?? 0) + 1

      const etdTimestamps = bookingData.etd ? [buildTimestampEntry(bookingData.etd, document.documentDate)] : null
      const etaTimestamps = bookingData.eta ? [buildTimestampEntry(bookingData.eta, document.documentDate)] : null

      leg = em.create(FmsFileLeg, {
        file: fileId,
        organizationId,
        tenantId,
        legSequence,
        type: 'SHIP',
        bookingNumber: bookingData.bookingNumber || null,
        blNumber: bookingData.blNumber || null,
        carrierId,
        vesselName: bookingData.vesselName || null,
        voyageNumber: bookingData.voyageNumber || null,
        etdTimestamps,
        etaTimestamps,
        vgmCutoff: bookingData.vgmCutoffDate || null,
        documentationCutoff: bookingData.docCutoffDate || null,
        gateInCutoff: bookingData.gateCloseDate || null,
      })

      await em.persist(leg).flush()
      created = true

      logger.info('leg_created_from_booking', {
        documentId,
        fileId,
        legId: leg.id,
        legSequence,
        bookingNumber: bookingData.bookingNumber,
        vesselName: bookingData.vesselName,
        carrierId,
      })
    }

    // Trigger tracking if carrier + booking/BL reference is available
    // (useful for both new and updated legs — carrier/BL may have been filled)
    try {
      await triggerTrackingIfApplicable(em, leg, { resolve })
    } catch (err) {
      logger.warn('tracking_trigger_failed', {
        legId: leg.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }

  } catch (error) {
    logger.error('auto_create_leg_failed', error, { documentId })

    const errorMessage = error instanceof Error ? error.message : String(error)
    const isNonRetryable =
      error instanceof TypeError ||
      error instanceof ReferenceError ||
      errorMessage.includes('validation') ||
      errorMessage.includes('constraint')

    if (isNonRetryable) {
      logger.error('non_retryable_error', error, { documentId })
      return
    }

    throw error
  }
}
