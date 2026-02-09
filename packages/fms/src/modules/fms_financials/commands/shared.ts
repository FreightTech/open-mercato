import type { ActionLog } from '@open-mercato/core/modules/audit_logs/data/entities'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { FmsInvoice, FmsInvoiceLineItem } from '../data/entities'
import { FmsProduct } from '../../fms_products/data/entities'
import type {
  FmsInvoiceSnapshot,
  FmsInvoiceLineItemSnapshot,
} from '../data/snapshots'

export { ensureOrganizationScope } from '@open-mercato/shared/lib/commands/scope'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Safely extract a user ID from the auth context.
 * Returns null if the sub is not a valid UUID (e.g., API key auth).
 */
export function getUserIdFromAuth(ctx: CommandRuntimeContext): string | null {
  const sub = ctx.auth?.sub
  if (typeof sub === 'string' && UUID_REGEX.test(sub)) {
    return sub
  }
  return null
}

type UndoEnvelope<T> = {
  undo?: T
  value?: { undo?: T }
  __redoInput?: unknown
  [key: string]: unknown
}

export function ensureTenantScope(ctx: CommandRuntimeContext, tenantId: string): void {
  const currentTenant = ctx.auth?.tenantId ?? null
  if (currentTenant && currentTenant !== tenantId) {
    throw new CrudHttpError(403, { error: 'Forbidden' })
  }
}

export function extractUndoPayload<T>(logEntry: ActionLog | null | undefined): T | null {
  if (!logEntry) return null
  const payload = logEntry.commandPayload as UndoEnvelope<T> | undefined
  if (!payload || typeof payload !== 'object') return null
  if (payload.undo) return payload.undo
  if (payload.value && typeof payload.value === 'object' && payload.value.undo) {
    return payload.value.undo as T
  }
  const entries = Object.entries(payload).find(([key]) => key !== '__redoInput')
  if (entries && entries[1] && typeof entries[1] === 'object' && 'undo' in (entries[1] as Record<string, unknown>)) {
    return (entries[1] as { undo?: T }).undo ?? null
  }
  return null
}

export function assertRecordFound<T>(record: T | null | undefined, message: string): T {
  if (!record) throw new CrudHttpError(404, { error: message })
  return record
}

/**
 * Serialize a line item entity to snapshot
 */
function serializeLineItemSnapshot(lineItem: FmsInvoiceLineItem): FmsInvoiceLineItemSnapshot {
  return {
    id: lineItem.id,
    organizationId: lineItem.organizationId,
    tenantId: lineItem.tenantId,
    invoiceId: typeof lineItem.invoice === 'string' ? lineItem.invoice : lineItem.invoice.id,
    lineNumber: lineItem.lineNumber,
    description: lineItem.description,
    quantity: lineItem.quantity,
    unit: lineItem.unit ?? null,
    unitPriceNet: lineItem.unitPriceNet,
    vatRate: lineItem.vatRate,
    netAmount: lineItem.netAmount,
    vatAmount: lineItem.vatAmount,
    grossAmount: lineItem.grossAmount,
    productId: lineItem.product
      ? typeof lineItem.product === 'string'
        ? lineItem.product
        : lineItem.product.id
      : null,
    chargeCodeMatchConfidence: lineItem.chargeCodeMatchConfidence ?? null,
    rawDescription: lineItem.rawDescription ?? null,
    createdAt: lineItem.createdAt,
    updatedAt: lineItem.updatedAt,
  }
}

/**
 * Load a full invoice snapshot including line items
 */
export async function loadInvoiceSnapshot(
  em: EntityManager,
  invoiceId: string
): Promise<FmsInvoiceSnapshot | null> {
  const invoice = await em.findOne(FmsInvoice, { id: invoiceId, deletedAt: null })
  if (!invoice) return null

  const lineItems = await em.find(
    FmsInvoiceLineItem,
    { invoice },
    {
      populate: ['product'],
      orderBy: { lineNumber: 'asc' },
    }
  )

  const lineItemSnapshots: FmsInvoiceLineItemSnapshot[] = lineItems.map(serializeLineItemSnapshot)

  return {
    id: invoice.id,
    organizationId: invoice.organizationId,
    tenantId: invoice.tenantId,

    // Invoice identification
    invoiceNumber: invoice.invoiceNumber ?? null,
    invoiceDate: invoice.invoiceDate ?? null,
    dueDate: invoice.dueDate ?? null,
    serviceDate: invoice.serviceDate ?? null,

    // Seller details
    sellerName: invoice.sellerName ?? null,
    sellerTaxId: invoice.sellerTaxId ?? null,
    sellerAddress: invoice.sellerAddress ?? null,

    // Buyer details
    buyerName: invoice.buyerName ?? null,
    buyerTaxId: invoice.buyerTaxId ?? null,
    buyerAddress: invoice.buyerAddress ?? null,

    // Totals
    netAmount: invoice.netAmount,
    vatAmount: invoice.vatAmount,
    grossAmount: invoice.grossAmount,
    currencyCode: invoice.currencyCode,

    // Source file
    attachmentId: invoice.attachmentId ?? null,
    originalFilename: invoice.originalFilename ?? null,

    // OCR metadata
    extractedData: invoice.extractedData ?? null,
    extractionConfidence: invoice.extractionConfidence ?? null,
    processedAt: invoice.processedAt ?? null,

    // Review workflow
    status: invoice.status,
    reviewedBy: invoice.reviewedBy ?? null,
    reviewedAt: invoice.reviewedAt ?? null,
    reviewNotes: invoice.reviewNotes ?? null,

    // Audit
    createdAt: invoice.createdAt,
    createdBy: invoice.createdBy ?? null,
    updatedAt: invoice.updatedAt,
    updatedBy: invoice.updatedBy ?? null,

    lineItems: lineItemSnapshots,
  }
}

/**
 * Load a line item snapshot
 */
export async function loadLineItemSnapshot(
  em: EntityManager,
  lineItemId: string
): Promise<FmsInvoiceLineItemSnapshot | null> {
  const lineItem = await em.findOne(
    FmsInvoiceLineItem,
    { id: lineItemId },
    { populate: ['product', 'invoice'] }
  )
  if (!lineItem) return null

  return serializeLineItemSnapshot(lineItem)
}

/**
 * Restore an invoice from snapshot (for undo operations)
 */
export async function applyInvoiceSnapshot(
  em: EntityManager,
  snapshot: FmsInvoiceSnapshot
): Promise<FmsInvoice> {
  let invoice = await em.findOne(FmsInvoice, { id: snapshot.id })

  if (!invoice) {
    invoice = em.create(FmsInvoice, {
      id: snapshot.id,
      organizationId: snapshot.organizationId,
      tenantId: snapshot.tenantId,
      invoiceNumber: snapshot.invoiceNumber,
      invoiceDate: snapshot.invoiceDate,
      dueDate: snapshot.dueDate,
      serviceDate: snapshot.serviceDate,
      sellerName: snapshot.sellerName,
      sellerTaxId: snapshot.sellerTaxId,
      sellerAddress: snapshot.sellerAddress,
      buyerName: snapshot.buyerName,
      buyerTaxId: snapshot.buyerTaxId,
      buyerAddress: snapshot.buyerAddress,
      netAmount: snapshot.netAmount,
      vatAmount: snapshot.vatAmount,
      grossAmount: snapshot.grossAmount,
      currencyCode: snapshot.currencyCode,
      attachmentId: snapshot.attachmentId,
      originalFilename: snapshot.originalFilename,
      extractedData: snapshot.extractedData,
      extractionConfidence: snapshot.extractionConfidence,
      processedAt: snapshot.processedAt,
      status: snapshot.status,
      reviewedBy: snapshot.reviewedBy,
      reviewedAt: snapshot.reviewedAt,
      reviewNotes: snapshot.reviewNotes,
      createdAt: snapshot.createdAt,
      createdBy: snapshot.createdBy,
      updatedAt: snapshot.updatedAt,
      updatedBy: snapshot.updatedBy,
    })
    em.persist(invoice)
  } else {
    // Update existing invoice
    invoice.invoiceNumber = snapshot.invoiceNumber
    invoice.invoiceDate = snapshot.invoiceDate
    invoice.dueDate = snapshot.dueDate
    invoice.serviceDate = snapshot.serviceDate
    invoice.sellerName = snapshot.sellerName
    invoice.sellerTaxId = snapshot.sellerTaxId
    invoice.sellerAddress = snapshot.sellerAddress
    invoice.buyerName = snapshot.buyerName
    invoice.buyerTaxId = snapshot.buyerTaxId
    invoice.buyerAddress = snapshot.buyerAddress
    invoice.netAmount = snapshot.netAmount
    invoice.vatAmount = snapshot.vatAmount
    invoice.grossAmount = snapshot.grossAmount
    invoice.currencyCode = snapshot.currencyCode
    invoice.status = snapshot.status
    invoice.reviewedBy = snapshot.reviewedBy
    invoice.reviewedAt = snapshot.reviewedAt
    invoice.reviewNotes = snapshot.reviewNotes
    invoice.deletedAt = null
  }

  await em.flush()

  // Restore line items
  for (const liSnapshot of snapshot.lineItems) {
    await applyLineItemSnapshot(em, liSnapshot)
  }

  return invoice
}

/**
 * Restore a line item from snapshot (for undo operations)
 */
export async function applyLineItemSnapshot(
  em: EntityManager,
  snapshot: FmsInvoiceLineItemSnapshot
): Promise<FmsInvoiceLineItem> {
  let lineItem = await em.findOne(FmsInvoiceLineItem, { id: snapshot.id })

  if (!lineItem) {
    lineItem = em.create(FmsInvoiceLineItem, {
      id: snapshot.id,
      organizationId: snapshot.organizationId,
      tenantId: snapshot.tenantId,
      invoice: em.getReference(FmsInvoice, snapshot.invoiceId),
      lineNumber: snapshot.lineNumber,
      description: snapshot.description,
      quantity: snapshot.quantity,
      unit: snapshot.unit,
      unitPriceNet: snapshot.unitPriceNet,
      vatRate: snapshot.vatRate,
      netAmount: snapshot.netAmount,
      vatAmount: snapshot.vatAmount,
      grossAmount: snapshot.grossAmount,
      chargeCodeMatchConfidence: snapshot.chargeCodeMatchConfidence,
      rawDescription: snapshot.rawDescription,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
    })
    em.persist(lineItem)
  } else {
    lineItem.lineNumber = snapshot.lineNumber
    lineItem.description = snapshot.description
    lineItem.quantity = snapshot.quantity
    lineItem.unit = snapshot.unit
    lineItem.unitPriceNet = snapshot.unitPriceNet
    lineItem.vatRate = snapshot.vatRate
    lineItem.netAmount = snapshot.netAmount
    lineItem.vatAmount = snapshot.vatAmount
    lineItem.grossAmount = snapshot.grossAmount
    lineItem.chargeCodeMatchConfidence = snapshot.chargeCodeMatchConfidence
    lineItem.rawDescription = snapshot.rawDescription
  }

  // Set product reference
  if (snapshot.productId) {
    lineItem.product = em.getReference(FmsProduct, snapshot.productId)
  } else {
    lineItem.product = null
  }

  await em.flush()
  return lineItem
}
