/**
 * Auto-Create Invoice from Processed Document Subscriber
 *
 * Listens to fms_documents.document.processed events and automatically
 * creates an FmsInvoice entity when:
 * - Document category is 'invoice'
 * - No FmsInvoice is already linked to this document (via documentId)
 *
 * Also attempts to auto-match seller/buyer tax IDs to contractors.
 */

import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsDocument, FmsInvoice, FmsInvoiceLineItem } from '../data/entities'
import { matchContractorByTaxId } from '../services/contractor-matcher.service'
import { createFmsLogger } from '../../../lib/logger'
import type { DocumentProcessedPayload } from '../events'
import type { SubscriberContext } from '@open-mercato/events'

const logger = createFmsLogger('fms_documents.auto_create_invoice')

export const metadata = {
  event: 'fms_documents.document.processed',
  persistent: true,
  id: 'fms_documents.auto_create_invoice',
}

export default async function handler(
  payload: DocumentProcessedPayload,
  ctx: SubscriberContext
): Promise<void> {
  if (payload.category !== 'invoice') return

  const em = (ctx.resolve<EntityManager>('em')).fork()

  // Load the document
  const document = await em.findOne(FmsDocument, { id: payload.id })
  if (!document) {
    logger.warn('document_not_found', { documentId: payload.id })
    return
  }

  // Check if an invoice already exists for this document
  const existingInvoice = await em.findOne(FmsInvoice, {
    documentId: document.id,
    deletedAt: null,
  })
  if (existingInvoice) {
    logger.debug('invoice_already_exists', { documentId: document.id })
    return
  }

  const extractedData = document.extractedData as Record<string, unknown> | null
  if (!extractedData) {
    logger.warn('no_extracted_data', { documentId: document.id })
    return
  }

  // Extract invoice fields from consensus data
  const seller = extractedData.seller as Record<string, unknown> | undefined
  const buyer = extractedData.buyer as Record<string, unknown> | undefined
  const totals = extractedData.totals as Record<string, unknown> | undefined
  const lineItemsRaw = extractedData.line_items as Record<string, unknown>[] | undefined

  const scope = { tenantId: document.tenantId, organizationId: document.organizationId }

  // Auto-match contractors by tax ID
  const [sellerMatch, buyerMatch] = await Promise.all([
    matchContractorByTaxId(em, seller?.tax_id as string | undefined, scope),
    matchContractorByTaxId(em, buyer?.tax_id as string | undefined, scope),
  ])

  // Create the invoice
  const invoice = em.create(FmsInvoice, {
    organizationId: document.organizationId,
    tenantId: document.tenantId,
    documentId: document.id,
    invoiceNumber: (extractedData.invoice_number as string) ?? document.documentNumber ?? null,
    invoiceDate: parseDate(extractedData.invoice_date as string),
    dueDate: parseDate(extractedData.due_date as string),
    serviceDate: parseDate(extractedData.service_date as string),
    sellerName: (seller?.name as string) ?? document.sellerName ?? null,
    sellerTaxId: (seller?.tax_id as string) ?? null,
    sellerAddress: (seller?.address as string) ?? null,
    buyerName: (buyer?.name as string) ?? document.buyerName ?? null,
    buyerTaxId: (buyer?.tax_id as string) ?? null,
    buyerAddress: (buyer?.address as string) ?? null,
    netAmount: normalizeAmount(totals?.net_amount as string) ?? '0',
    vatAmount: normalizeAmount(totals?.vat_amount as string) ?? '0',
    grossAmount: normalizeAmount(totals?.gross_amount as string) ?? document.totalGrossAmount ?? '0',
    currencyCode: (extractedData.currency as string) ?? document.currency ?? 'PLN',
    attachmentId: document.attachmentId,
    originalFilename: document.name,
    extractedData,
    extractionConfidence: document.consensusConfidence
      ? parseConfidence(parseFloat(document.consensusConfidence))
      : null,
    processedAt: document.processedAt ?? new Date(),
    documentType: 'invoice',
    blNumber: document.blNumber ?? null,
    vesselName: document.vesselName ?? null,
    voyageNumber: document.voyageNumber ?? null,
    containerNumbers: document.containerNumbers ?? null,
    transportationMetadata: extractTransportationMetadata(extractedData),
    sellerContractorId: sellerMatch?.contractorId ?? null,
    buyerContractorId: buyerMatch?.contractorId ?? null,
    status: 'pending_review',
    createdBy: document.createdBy ?? null,
  })

  em.persist(invoice)
  await em.flush()

  // Create line items from extracted data
  if (lineItemsRaw && lineItemsRaw.length > 0) {
    for (let i = 0; i < lineItemsRaw.length; i++) {
      const raw = lineItemsRaw[i]
      const lineItem = em.create(FmsInvoiceLineItem, {
        organizationId: document.organizationId,
        tenantId: document.tenantId,
        invoice,
        lineNumber: (raw.line_number as number) ?? i + 1,
        description: (raw.description as string) ?? (raw.name as string) ?? 'Line item',
        quantity: normalizeAmount(raw.quantity as string) ?? '1',
        unit: (raw.unit as string) ?? null,
        unitPriceNet: normalizeAmount(raw.unit_price_net as string) ?? normalizeAmount(raw.unit_price as string) ?? '0',
        vatRate: normalizeAmount(raw.vat_rate as string) ?? '0',
        netAmount: normalizeAmount(raw.net_amount as string) ?? '0',
        vatAmount: normalizeAmount(raw.vat_amount as string) ?? '0',
        grossAmount: normalizeAmount(raw.gross_amount as string) ?? '0',
        rawDescription: (raw.description as string) ?? null,
      })
      em.persist(lineItem)
    }
    await em.flush()
  }

  logger.info('invoice_auto_created', {
    invoiceId: invoice.id,
    documentId: document.id,
    lineItemCount: lineItemsRaw?.length ?? 0,
  })

  // Emit invoice created event for downstream subscribers (e.g., invoicing module)
  try {
    const eventBus = ctx.resolve('eventBus') as {
      emitEvent(event: string, payload: unknown, options?: { persistent?: boolean }): Promise<void>
    }
    await eventBus.emitEvent('fms_documents.invoice.created', {
      id: invoice.id,
      tenantId: document.tenantId,
      organizationId: document.organizationId,
      status: invoice.status,
      documentId: document.id,
    }, { persistent: true })
  } catch (eventError) {
    logger.warn('event_emit_failed', { error: eventError instanceof Error ? eventError.message : String(eventError) })
  }
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

function normalizeAmount(value: string | number | null | undefined): string | null {
  if (value == null) return null
  const str = String(value).replace(/[^\d.,\-]/g, '').replace(',', '.')
  const num = parseFloat(str)
  return isNaN(num) ? null : num.toFixed(2)
}

function parseConfidence(value: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (value >= 0.8) return 'HIGH'
  if (value >= 0.5) return 'MEDIUM'
  return 'LOW'
}

function extractTransportationMetadata(data: Record<string, unknown>): Record<string, unknown> | null {
  const meta: Record<string, unknown> = {}
  const fields = [
    'bl_number', 'mbl_number', 'booking_number', 'vessel_name',
    'vessel_imo', 'voyage_number', 'port_of_loading', 'port_of_discharge',
    'etd', 'eta', 'carrier_name', 'carrier_scac',
  ]

  for (const f of fields) {
    if (data[f]) {
      // Convert snake_case to camelCase
      const camel = f.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
      meta[camel] = data[f]
    }
  }

  const containers = data.container_numbers ?? data.containers
  if (Array.isArray(containers)) {
    meta.containerNumbers = containers.map((c: unknown) =>
      typeof c === 'string' ? c : (c as Record<string, unknown>)?.number ?? (c as Record<string, unknown>)?.container_number
    ).filter(Boolean)
  }

  return Object.keys(meta).length > 0 ? meta : null
}
