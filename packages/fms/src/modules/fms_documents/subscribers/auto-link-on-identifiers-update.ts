/**
 * Auto-Link Document on Identifiers Update Subscriber
 *
 * Listens to fms_documents.document.identifiers_updated events (triggered when
 * shipping identifiers are manually updated via PATCH API) and automatically
 * links documents to matching FMS Projects.
 *
 * This subscriber reuses the same logic as auto-link-to-project but is
 * triggered by manual field updates instead of AI extraction.
 *
 * Criteria for linking:
 * - Document is NOT already linked to anything
 * - Document is NOT a booking_confirmation (handled by auto-create-from-booking)
 * - Document has identifiers (booking number, BL number, MBL number)
 * - Exactly ONE project matches those identifiers
 *
 * Note: containerNumbers is NOT used for matching as containers can be reused.
 */

import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsDocument, DocumentCategory } from '../data/entities'
import { findMatchingProjects } from '../services/project-matcher.service'
import { createFmsLogger } from '../../../lib/logger'
import type { DocumentIdentifiersUpdatedPayload } from '../events'
import type { SubscriberContext } from '@open-mercato/events'

const logger = createFmsLogger('fms_documents.auto_link_on_identifiers_update')

const RELATED_ENTITY_TYPE = 'fms_projects:fms_project'

/**
 * Event subscriber metadata.
 * Listens to document identifiers_updated events from the fms_documents module.
 */
export const metadata = {
  event: 'fms_documents.document.identifiers_updated',
  persistent: true,
  id: 'fms_documents.auto_link_on_identifiers_update',
}

/**
 * Handler that auto-links documents to matching projects when identifiers are
 * manually updated via the PATCH API.
 */
export default async function handle(
  payload: DocumentIdentifiersUpdatedPayload,
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
    // (This shouldn't happen since the PATCH command checks this before emitting)
    if (document.relatedEntityId) {
      logger.debug('document_already_linked', {
        documentId,
        relatedEntityId: document.relatedEntityId,
        relatedEntityType: document.relatedEntityType,
      })
      return
    }

    // Extract identifiers from document fields
    // Note: containerNumbers is intentionally excluded as containers can be reused
    const bookingNumber = document.bookingNumber || null
    const blNumber = document.blNumber || null
    const mblNumber = document.mblNumber || null

    // Skip if no identifiers to match on
    if (!bookingNumber && !blNumber && !mblNumber) {
      logger.debug('no_identifiers_to_match', { documentId, category })
      return
    }

    logger.debug('searching_for_matching_projects', {
      documentId,
      category,
      bookingNumber,
      blNumber,
      mblNumber,
      trigger: 'manual_update',
    })

    // Find matching projects (without containerNumbers)
    const matches = await findMatchingProjects(
      em,
      { bookingNumber, blNumber, mblNumber, containerNumbers: null },
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
      trigger: 'manual_update',
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
