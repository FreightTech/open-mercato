/**
 * Auto-Link Document to FMS File Subscriber
 *
 * Listens to fms_documents.document.processed events and automatically
 * links documents to matching FMS Files when:
 * - Document is NOT already linked to anything
 * - Document is NOT a booking_confirmation
 * - Document has identifiers (booking number, BL number, container numbers)
 * - Exactly ONE file matches those identifiers
 *
 * If multiple files match, logs a warning and skips (user must manually link).
 */

import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsDocument, DocumentCategory } from '../../fms_documents/data/entities'
import { createFmsLogger } from '../../../lib/logger'
import type { DocumentProcessedPayload } from '../../fms_documents/events'
import type { SubscriberContext } from '@open-mercato/events'

const logger = createFmsLogger('fms_files.auto_link_to_file')

const RELATED_ENTITY_TYPE = 'fms_files:fms_file'

export const metadata = {
  event: 'fms_documents.document.processed',
  persistent: true,
  id: 'fms_files.auto_link_to_file',
}

function normalize(value: string | null | undefined): string {
  if (!value) return ''
  return value.trim().toUpperCase().replace(/\s+/g, '')
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
    logger.warn('missing_required_fields', {
      documentId,
      tenantId: !!tenantId,
      organizationId: !!organizationId,
    })
    return
  }

  // Skip booking_confirmation — no auto-create for files
  if (category === DocumentCategory.BOOKING_CONFIRMATION || category === 'booking_confirmation') {
    logger.debug('skipping_booking_confirmation', { documentId, category })
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

    if (document.relatedEntityId) {
      logger.debug('document_already_linked', {
        documentId,
        relatedEntityId: document.relatedEntityId,
        relatedEntityType: document.relatedEntityType,
      })
      return
    }

    const bookingNumber = document.bookingNumber || null
    const blNumber = document.blNumber || null
    const mblNumber = document.mblNumber || null
    const containerNumbers = document.containerNumbers || null

    if (!bookingNumber && !blNumber && !mblNumber && (!containerNumbers || containerNumbers.length === 0)) {
      logger.debug('no_identifiers_to_match', { documentId, category })
      return
    }

    logger.debug('searching_for_matching_files', {
      documentId,
      category,
      bookingNumber,
      blNumber,
      mblNumber,
      containerCount: containerNumbers?.length ?? 0,
    })

    // Use raw SQL for case-insensitive identifier matching
    const connection = em.getConnection()
    const matchedFileIds = new Set<string>()

    // Match via legs (booking number + BL number)
    if (bookingNumber || blNumber || mblNumber) {
      const legConditions: string[] = []
      const legParams: unknown[] = [organizationId, tenantId]

      if (bookingNumber) {
        legConditions.push(`UPPER(TRIM(booking_number)) = ?`)
        legParams.push(normalize(bookingNumber))
      }
      if (blNumber) {
        legConditions.push(`UPPER(TRIM(bl_number)) = ?`)
        legParams.push(normalize(blNumber))
      }
      if (mblNumber) {
        legConditions.push(`UPPER(TRIM(bl_number)) = ?`)
        legParams.push(normalize(mblNumber))
      }

      const legSql = `
        SELECT DISTINCT file_id FROM fms_file_legs
        WHERE organization_id = ? AND tenant_id = ? AND deleted_at IS NULL
          AND (${legConditions.join(' OR ')})
      `
      const legRows = (await connection.execute(legSql, legParams)) as Array<{ file_id: string }>
      for (const row of legRows) {
        if (row.file_id) matchedFileIds.add(row.file_id)
      }
    }

    // Match via units (container numbers)
    if (containerNumbers && containerNumbers.length > 0) {
      const normalizedContainers = containerNumbers.map(normalize).filter(Boolean)
      if (normalizedContainers.length > 0) {
        const placeholders = normalizedContainers.map(() => '?').join(',')
        const unitSql = `
          SELECT DISTINCT file_id FROM fms_file_units
          WHERE organization_id = ? AND tenant_id = ? AND deleted_at IS NULL
            AND UPPER(TRIM(container_number)) IN (${placeholders})
        `
        const unitRows = (await connection.execute(unitSql, [organizationId, tenantId, ...normalizedContainers])) as Array<{ file_id: string }>
        for (const row of unitRows) {
          if (row.file_id) matchedFileIds.add(row.file_id)
        }
      }
    }

    const fileIds = Array.from(matchedFileIds)

    if (fileIds.length === 0) {
      logger.debug('no_matching_files', { documentId })
      return
    }

    if (fileIds.length > 1) {
      logger.warn('multiple_files_matched', {
        documentId,
        matchCount: fileIds.length,
        fileIds,
      })
      return
    }

    const fileId = fileIds[0]

    document.relatedEntityType = RELATED_ENTITY_TYPE
    document.relatedEntityId = fileId
    await em.flush()

    logger.info('document_linked_to_file', {
      documentId,
      category,
      fileId,
    })
  } catch (error) {
    logger.error('auto_link_failed', error, { documentId })

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
