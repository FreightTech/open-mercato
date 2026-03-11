/**
 * Auto-Link Document to Project Subscriber
 *
 * Listens to fms_documents.document.processed events and automatically
 * links documents to matching FMS Projects when:
 * - Document is NOT already linked to anything
 * - Document is NOT a booking_confirmation (handled by auto-create-from-booking)
 * - Document has identifiers (booking number, BL number, container numbers)
 * - Exactly ONE project matches those identifiers
 *
 * If multiple projects match, logs a warning and skips (user must manually link).
 */

import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsDocument, DocumentCategory } from '../data/entities'
import { findMatchingProjects } from '../services/project-matcher.service'
import { createFmsLogger } from '../../../lib/logger'
import type { DocumentProcessedPayload } from '../events'
import type { SubscriberContext } from '@open-mercato/events'

const logger = createFmsLogger('fms_documents.auto_link_to_project')

const RELATED_ENTITY_TYPE = 'fms_projects:fms_project'

/**
 * Event subscriber metadata.
 * Listens to document processed events from the fms_documents module.
 */
export const metadata = {
  event: 'fms_documents.document.processed',
  persistent: true,
  id: 'fms_documents.auto_link_to_project',
}

/**
 * Handler that auto-links processed documents to matching projects.
 *
 * When a document is processed with AI extraction and has shipping identifiers,
 * this subscriber:
 * 1. Checks if document is already linked (skip if yes)
 * 2. Skips booking_confirmation (handled by auto-create-from-booking)
 * 3. Finds matching projects by identifiers
 * 4. Links to the project if exactly one match found
 */
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

  // Skip booking_confirmation - handled by auto-create-from-booking subscriber
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
    // Load the document
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

    // Skip if document is already linked
    if (document.relatedEntityId) {
      logger.debug('document_already_linked', {
        documentId,
        relatedEntityId: document.relatedEntityId,
        relatedEntityType: document.relatedEntityType,
      })
      return
    }

    // Extract identifiers from document fields (populated by AI extraction)
    const bookingNumber = document.bookingNumber || null
    const blNumber = document.blNumber || null
    const mblNumber = document.mblNumber || null
    const containerNumbers = document.containerNumbers || null

    // Skip if no identifiers to match on
    if (!bookingNumber && !blNumber && !mblNumber && (!containerNumbers || containerNumbers.length === 0)) {
      logger.debug('no_identifiers_to_match', { documentId, category })
      return
    }

    logger.debug('searching_for_matching_projects', {
      documentId,
      category,
      bookingNumber,
      blNumber,
      mblNumber,
      containerCount: containerNumbers?.length ?? 0,
    })

    // Find matching projects
    const matches = await findMatchingProjects(
      em,
      { bookingNumber, blNumber, mblNumber, containerNumbers },
      { tenantId, organizationId }
    )

    if (matches.length === 0) {
      logger.debug('no_matching_projects', { documentId })
      return
    }

    if (matches.length > 1) {
      logger.warn('multiple_projects_matched', {
        documentId,
        matchCount: matches.length,
        projectIds: matches.map((m) => m.projectId),
        projectNumbers: matches.map((m) => m.projectNumber),
      })
      // Don't auto-link when ambiguous - user must manually choose
      return
    }

    // Exactly one match - link the document
    const match = matches[0]

    document.relatedEntityType = RELATED_ENTITY_TYPE
    document.relatedEntityId = match.projectId
    await em.flush()

    logger.info('document_linked_to_project', {
      documentId,
      category,
      projectId: match.projectId,
      projectNumber: match.projectNumber,
      matchedBy: match.matchedBy,
    })
  } catch (error) {
    logger.error('auto_link_failed', error, { documentId })

    // Non-retryable errors
    const errorMessage = error instanceof Error ? error.message : String(error)
    const isNonRetryable =
      error instanceof TypeError ||
      error instanceof ReferenceError ||
      errorMessage.includes('validation') ||
      errorMessage.includes('constraint')

    if (isNonRetryable) {
      logger.error('non_retryable_error', error, { documentId })
      return // Don't retry
    }

    throw error // Re-throw for queue retry
  }
}
