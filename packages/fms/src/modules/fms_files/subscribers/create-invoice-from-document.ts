/**
 * Create FmsFileInvoice from Extracted Document Subscriber
 *
 * Listens to fms_documents.document.processed events and creates
 * a FmsFileInvoice record when:
 * - The document category is 'invoice'
 * - The document is linked to an FMS file (relatedEntityType === 'fms_files:fms_file')
 * - No invoice already exists for this documentId
 */

import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsDocument } from '../../fms_documents/data/entities'
import { FmsFile, FmsFileInvoice } from '../data/entities'
import { createFmsLogger } from '../../../lib/logger'
import type { DocumentProcessedPayload } from '../../fms_documents/events'
import type { SubscriberContext } from '@open-mercato/events'

const logger = createFmsLogger('fms_files.create_invoice_from_document')

const RELATED_ENTITY_TYPE = 'fms_files:fms_file'

export const metadata = {
  event: 'fms_documents.document.processed',
  persistent: true,
  id: 'fms_files.create_invoice_from_document',
}

function mapConfidence(consensusConfidence: string | null | undefined): string {
  if (!consensusConfidence) return 'REVIEW'
  const value = parseFloat(consensusConfidence)
  if (isNaN(value)) return 'REVIEW'
  if (value > 0.8) return 'HIGH'
  if (value > 0.6) return 'MEDIUM'
  if (value > 0.4) return 'LOW'
  return 'REVIEW'
}

function extractString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  return null
}

function extractNumericString(value: unknown): string | null {
  if (value == null) return null
  const num = typeof value === 'number' ? value : parseFloat(String(value))
  return isNaN(num) ? null : num.toFixed(4)
}

function parseDate(value: unknown): Date | null {
  if (!value) return null
  const d = new Date(value as string)
  return isNaN(d.getTime()) ? null : d
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

  // Only process invoice documents
  if (category !== 'invoice') {
    logger.debug('skipping_non_invoice', { documentId, category })
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
    if (
      document.relatedEntityType !== RELATED_ENTITY_TYPE ||
      !document.relatedEntityId
    ) {
      logger.debug('document_not_linked_to_file', {
        documentId,
        relatedEntityType: document.relatedEntityType,
        relatedEntityId: document.relatedEntityId,
      })
      return
    }

    const fileId = document.relatedEntityId

    // Check for duplicate
    const existing = await em.findOne(FmsFileInvoice, {
      documentId,
      file: fileId,
      deletedAt: null,
    })

    if (existing) {
      logger.debug('invoice_already_exists', { documentId, invoiceId: existing.id })
      return
    }

    // Map extracted data to invoice fields
    const data = (document.documentData ?? document.extractedData) as Record<string, unknown> | null
    const seller = data?.seller as Record<string, unknown> | undefined
    const buyer = data?.buyer as Record<string, unknown> | undefined
    const totals = data?.totals as Record<string, unknown> | undefined

    const invoiceNumber = extractString(data?.invoice_number) ?? document.documentNumber ?? null
    const sellerName = extractString(seller?.name) ?? document.sellerName ?? null
    const sellerNip = extractString(seller?.nip) ?? null
    const buyerName = extractString(buyer?.name) ?? document.buyerName ?? null
    const buyerNip = extractString(buyer?.nip) ?? null

    const netAmount = extractNumericString(totals?.net_amount ?? totals?.net)
    const vatAmount = extractNumericString(totals?.vat_amount ?? totals?.vat)
    const grossAmount = extractNumericString(totals?.gross_amount ?? totals?.gross ?? document.totalGrossAmount)
    const currencyCode = extractString(data?.currency ?? totals?.currency ?? document.currency) ?? 'PLN'

    const invoiceDate = parseDate(data?.invoice_date) ?? document.documentDate ?? null
    const paymentDueDate = parseDate(data?.payment_due_date ?? data?.due_date)
    const paymentMethod = extractString(data?.payment_method) ?? null

    const lineItems = Array.isArray(data?.line_items) ? data.line_items : null

    const confidence = mapConfidence(document.consensusConfidence)
    const rawExtractionData = document.extractedData ?? null

    const fileRef = em.getReference(FmsFile, fileId)
    const now = new Date()
    const invoice = em.create(FmsFileInvoice, {
      file: fileRef,
      organizationId,
      tenantId,
      documentId,
      invoiceNumber,
      sellerName,
      sellerNip,
      buyerName,
      buyerNip,
      sellerDetails: seller ? (seller as Record<string, unknown>) : null,
      buyerDetails: buyer ? (buyer as Record<string, unknown>) : null,
      netAmount,
      vatAmount,
      grossAmount,
      currencyCode,
      invoiceDate,
      paymentDueDate,
      serviceDate: null,
      paymentMethod,
      lineItems,
      confidence,
      extractionStrategies: null,
      rawExtractionData,
      status: 'pending_review',
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
      createdAt: now,
      updatedAt: now,
    })

    await em.persist(invoice).flush()

    logger.info('invoice_created_from_document', {
      documentId,
      fileId,
      invoiceId: invoice.id,
      confidence,
    })
  } catch (error) {
    logger.error('create_invoice_failed', error, { documentId })

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
