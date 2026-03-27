import type { ActionLog } from '@open-mercato/core/modules/audit_logs/data/entities'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { InvoicingInvoice, InvoicingLineItem } from '../data/entities'
import type {
  InvoicingInvoiceSnapshot,
  InvoicingLineItemSnapshot,
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
function serializeLineItemSnapshot(lineItem: InvoicingLineItem): InvoicingLineItemSnapshot {
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
    vatRateCode: lineItem.vatRateCode ?? null,
    netAmount: lineItem.netAmount,
    vatAmount: lineItem.vatAmount,
    grossAmount: lineItem.grossAmount,
    productId: lineItem.productId ?? null,
    gtuCode: lineItem.gtuCode ?? null,
    pkwiuCode: lineItem.pkwiuCode ?? null,
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
): Promise<InvoicingInvoiceSnapshot | null> {
  const invoice = await em.findOne(InvoicingInvoice, { id: invoiceId, deletedAt: null })
  if (!invoice) return null

  const lineItems = await em.find(
    InvoicingLineItem,
    { invoice },
    { orderBy: { lineNumber: 'asc' } }
  )

  const lineItemSnapshots: InvoicingLineItemSnapshot[] = lineItems.map(serializeLineItemSnapshot)

  return {
    id: invoice.id,
    organizationId: invoice.organizationId,
    tenantId: invoice.tenantId,

    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate ?? null,
    dueDate: invoice.dueDate ?? null,
    serviceDate: invoice.serviceDate ?? null,

    sellerName: invoice.sellerName ?? null,
    sellerTaxId: invoice.sellerTaxId ?? null,
    sellerAddress: invoice.sellerAddress ?? null,
    sellerCountryCode: invoice.sellerCountryCode ?? null,
    sellerBankAccount: invoice.sellerBankAccount ?? null,

    buyerName: invoice.buyerName ?? null,
    buyerTaxId: invoice.buyerTaxId ?? null,
    buyerAddress: invoice.buyerAddress ?? null,
    buyerCountryCode: invoice.buyerCountryCode ?? null,

    netAmount: invoice.netAmount,
    vatAmount: invoice.vatAmount,
    grossAmount: invoice.grossAmount,
    currencyCode: invoice.currencyCode,

    paymentMethod: invoice.paymentMethod ?? null,
    paymentTerms: invoice.paymentTerms ?? null,

    direction: invoice.direction,
    sourceType: invoice.sourceType,
    sourceDocumentInvoiceId: invoice.sourceDocumentInvoiceId ?? null,
    sourceSalesInvoiceId: invoice.sourceSalesInvoiceId ?? null,
    sourceImportReference: invoice.sourceImportReference ?? null,
    attachmentId: invoice.attachmentId ?? null,

    status: invoice.status,
    ksefStatus: invoice.ksefStatus,
    ksefNumber: invoice.ksefNumber ?? null,

    invoiceType: invoice.invoiceType,
    correctedInvoiceId: invoice.correctedInvoiceId ?? null,
    correctionReason: invoice.correctionReason ?? null,
    offlineMode: invoice.offlineMode ?? null,
    offlineQrData: invoice.offlineQrData ?? null,

    notes: invoice.notes ?? null,
    metadata: invoice.metadata ?? null,

    reviewedBy: invoice.reviewedBy ?? null,
    reviewedAt: invoice.reviewedAt ?? null,
    reviewNotes: invoice.reviewNotes ?? null,

    createdAt: invoice.createdAt,
    createdBy: invoice.createdBy ?? null,
    updatedAt: invoice.updatedAt,
    updatedBy: invoice.updatedBy ?? null,

    lineItems: lineItemSnapshots,
  }
}

/**
 * Restore an invoice from snapshot (for undo operations)
 */
export async function applyInvoiceSnapshot(
  em: EntityManager,
  snapshot: InvoicingInvoiceSnapshot
): Promise<InvoicingInvoice> {
  let invoice = await em.findOne(InvoicingInvoice, { id: snapshot.id })

  if (!invoice) {
    invoice = em.create(InvoicingInvoice, {
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
      sellerCountryCode: snapshot.sellerCountryCode,
      sellerBankAccount: snapshot.sellerBankAccount,
      buyerName: snapshot.buyerName,
      buyerTaxId: snapshot.buyerTaxId,
      buyerAddress: snapshot.buyerAddress,
      buyerCountryCode: snapshot.buyerCountryCode,
      netAmount: snapshot.netAmount,
      vatAmount: snapshot.vatAmount,
      grossAmount: snapshot.grossAmount,
      currencyCode: snapshot.currencyCode,
      paymentMethod: snapshot.paymentMethod,
      paymentTerms: snapshot.paymentTerms,
      direction: snapshot.direction,
      sourceType: snapshot.sourceType,
      sourceDocumentInvoiceId: snapshot.sourceDocumentInvoiceId,
      sourceSalesInvoiceId: snapshot.sourceSalesInvoiceId,
      sourceImportReference: snapshot.sourceImportReference,
      attachmentId: snapshot.attachmentId,
      status: snapshot.status,
      ksefStatus: snapshot.ksefStatus,
      ksefNumber: snapshot.ksefNumber,
      invoiceType: snapshot.invoiceType,
      correctedInvoiceId: snapshot.correctedInvoiceId,
      correctionReason: snapshot.correctionReason,
      offlineMode: snapshot.offlineMode,
      offlineQrData: snapshot.offlineQrData,
      notes: snapshot.notes,
      metadata: snapshot.metadata,
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
    invoice.invoiceNumber = snapshot.invoiceNumber
    invoice.invoiceDate = snapshot.invoiceDate
    invoice.dueDate = snapshot.dueDate
    invoice.serviceDate = snapshot.serviceDate
    invoice.sellerName = snapshot.sellerName
    invoice.sellerTaxId = snapshot.sellerTaxId
    invoice.sellerAddress = snapshot.sellerAddress
    invoice.sellerCountryCode = snapshot.sellerCountryCode
    invoice.sellerBankAccount = snapshot.sellerBankAccount
    invoice.buyerName = snapshot.buyerName
    invoice.buyerTaxId = snapshot.buyerTaxId
    invoice.buyerAddress = snapshot.buyerAddress
    invoice.buyerCountryCode = snapshot.buyerCountryCode
    invoice.netAmount = snapshot.netAmount
    invoice.vatAmount = snapshot.vatAmount
    invoice.grossAmount = snapshot.grossAmount
    invoice.currencyCode = snapshot.currencyCode
    invoice.paymentMethod = snapshot.paymentMethod
    invoice.paymentTerms = snapshot.paymentTerms
    invoice.direction = snapshot.direction
    invoice.sourceType = snapshot.sourceType
    invoice.status = snapshot.status
    invoice.ksefStatus = snapshot.ksefStatus
    invoice.ksefNumber = snapshot.ksefNumber
    invoice.invoiceType = snapshot.invoiceType
    invoice.correctedInvoiceId = snapshot.correctedInvoiceId
    invoice.correctionReason = snapshot.correctionReason
    invoice.offlineMode = snapshot.offlineMode
    invoice.offlineQrData = snapshot.offlineQrData
    invoice.notes = snapshot.notes
    invoice.metadata = snapshot.metadata
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
  snapshot: InvoicingLineItemSnapshot
): Promise<InvoicingLineItem> {
  let lineItem = await em.findOne(InvoicingLineItem, { id: snapshot.id })

  if (!lineItem) {
    lineItem = em.create(InvoicingLineItem, {
      id: snapshot.id,
      organizationId: snapshot.organizationId,
      tenantId: snapshot.tenantId,
      invoice: em.getReference(InvoicingInvoice, snapshot.invoiceId),
      lineNumber: snapshot.lineNumber,
      description: snapshot.description,
      quantity: snapshot.quantity,
      unit: snapshot.unit,
      unitPriceNet: snapshot.unitPriceNet,
      vatRate: snapshot.vatRate,
      vatRateCode: snapshot.vatRateCode,
      netAmount: snapshot.netAmount,
      vatAmount: snapshot.vatAmount,
      grossAmount: snapshot.grossAmount,
      productId: snapshot.productId,
      gtuCode: snapshot.gtuCode,
      pkwiuCode: snapshot.pkwiuCode,
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
    lineItem.vatRateCode = snapshot.vatRateCode
    lineItem.netAmount = snapshot.netAmount
    lineItem.vatAmount = snapshot.vatAmount
    lineItem.grossAmount = snapshot.grossAmount
    lineItem.productId = snapshot.productId
    lineItem.gtuCode = snapshot.gtuCode
    lineItem.pkwiuCode = snapshot.pkwiuCode
  }

  await em.flush()
  return lineItem
}
