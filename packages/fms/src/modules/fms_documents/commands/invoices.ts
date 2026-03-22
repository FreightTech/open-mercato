import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import {
  emitCrudSideEffects,
  emitCrudUndoSideEffects,
  buildChanges,
  requireId,
} from '@open-mercato/shared/lib/commands/helpers'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { FmsInvoice, FmsInvoiceLineItem } from '../data/entities'
import { FmsProduct } from '../../fms_products/data/entities'
import type { FmsInvoiceSnapshot, InvoiceUndoPayload, FmsInvoiceLineItemSnapshot } from '../data/invoice-snapshots'
import {
  createInvoiceSchema,
  updateInvoiceSchema,
  approveInvoiceSchema,
  rejectInvoiceSchema,
  matchChargeCodeSchema,
  confirmInvoiceSchema,
} from '../data/invoice-validators'
import {
  ensureTenantScope,
  ensureOrganizationScope,
  extractUndoPayload,
  assertRecordFound,
  loadInvoiceSnapshot,
  loadLineItemSnapshot,
  applyInvoiceSnapshot,
  applyLineItemSnapshot,
  getUserIdFromAuth,
} from './invoice-shared'

const ENTITY_TYPE = 'fms_documents:fms_invoice'

// ========================================
// Create Invoice Command
// ========================================

type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>

const createInvoiceCommand: CommandHandler<CreateInvoiceInput, { id: string }> = {
  id: 'fms_documents.invoices.create',
  async execute(rawInput, ctx) {
    const input = createInvoiceSchema.parse(rawInput)
    ensureTenantScope(ctx, input.tenantId)
    ensureOrganizationScope(ctx, input.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    // Create the invoice
    const invoice = em.create(FmsInvoice, {
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      invoiceNumber: input.invoiceNumber ?? null,
      invoiceDate: input.invoiceDate ?? null,
      dueDate: input.dueDate ?? null,
      serviceDate: input.serviceDate ?? null,
      sellerName: input.sellerName ?? null,
      sellerTaxId: input.sellerTaxId ?? null,
      sellerAddress: input.sellerAddress ?? null,
      buyerName: input.buyerName ?? null,
      buyerTaxId: input.buyerTaxId ?? null,
      buyerAddress: input.buyerAddress ?? null,
      netAmount: input.netAmount ?? '0',
      vatAmount: input.vatAmount ?? '0',
      grossAmount: input.grossAmount ?? '0',
      currencyCode: input.currencyCode ?? 'PLN',
      attachmentId: input.attachmentId ?? null,
      originalFilename: input.originalFilename ?? null,
      extractedData: input.extractedData ?? null,
      extractionConfidence: input.extractionConfidence ?? null,
      processedAt: input.processedAt ?? null,
      documentType: input.documentType ?? 'invoice',
      documentTypeConfidence: input.documentTypeConfidence ?? null,
      transportationMetadata: input.transportationMetadata ?? null,
      blNumber: input.blNumber ?? null,
      containerNumbers: input.containerNumbers ?? null,
      vesselName: input.vesselName ?? null,
      voyageNumber: input.voyageNumber ?? null,
      status: input.status ?? 'pending_review',
      invoiceType: input.invoiceType ?? null,
      expenseCategory: input.expenseCategory ?? null,
      expenseNote: input.expenseNote ?? null,
      documentId: input.documentId ?? null,
      sellerContractorId: input.sellerContractorId ?? null,
      buyerContractorId: input.buyerContractorId ?? null,
      createdBy: input.createdBy ?? getUserIdFromAuth(ctx),
    })

    em.persist(invoice)
    await em.flush()

    // Create line items if provided
    if (input.lineItems && input.lineItems.length > 0) {
      for (const li of input.lineItems) {
        const lineItem = em.create(FmsInvoiceLineItem, {
          organizationId: input.organizationId,
          tenantId: input.tenantId,
          invoice,
          lineNumber: li.lineNumber,
          description: li.description,
          quantity: li.quantity ?? '1',
          unit: li.unit ?? null,
          unitPriceNet: li.unitPriceNet ?? '0',
          vatRate: li.vatRate ?? '0',
          netAmount: li.netAmount ?? '0',
          vatAmount: li.vatAmount ?? '0',
          grossAmount: li.grossAmount ?? '0',
          chargeCodeMatchConfidence: li.chargeCodeMatchConfidence ?? null,
          rawDescription: li.rawDescription ?? null,
          isExcluded: li.isExcluded ?? false,
          isManuallyAdded: li.isManuallyAdded ?? false,
        })

        if (li.productId) {
          lineItem.product = em.getReference(FmsProduct, li.productId)
        }

        em.persist(lineItem)
      }
      await em.flush()
    }

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: invoice,
      identifiers: {
        id: invoice.id,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
      },
      indexer: { entityType: ENTITY_TYPE },
    })

    return { id: invoice.id }
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve('em') as EntityManager
    return await loadInvoiceSnapshot(em, result.id)
  },
  buildLog: async ({ result, ctx }) => {
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadInvoiceSnapshot(em, result.id)
    return {
      actionLabel: 'Create invoice',
      resourceKind: 'fms_documents.invoice',
      resourceId: result.id,
      tenantId: snapshot?.tenantId ?? null,
      organizationId: snapshot?.organizationId ?? null,
      snapshotAfter: snapshot ?? null,
      payload: {
        undo: { after: snapshot },
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<InvoiceUndoPayload>(logEntry)
    const invoiceId = logEntry?.resourceId ?? payload?.after?.id ?? null
    if (!invoiceId) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    // Delete line items first
    await em.nativeDelete(FmsInvoiceLineItem, { invoice: invoiceId })

    // Delete invoice
    const invoice = await em.findOne(FmsInvoice, { id: invoiceId })
    if (!invoice) return

    em.remove(invoice)
    await em.flush()
  },
}

// ========================================
// Update Invoice Command
// ========================================

type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema> & { id: string }

const updateInvoiceCommand: CommandHandler<UpdateInvoiceInput, { id: string }> = {
  id: 'fms_documents.invoices.update',
  async prepare(rawInput, ctx) {
    const input = { id: rawInput.id, ...updateInvoiceSchema.parse(rawInput) }
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadInvoiceSnapshot(em, input.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(rawInput, ctx) {
    const input = { id: rawInput.id, ...updateInvoiceSchema.parse(rawInput) }
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const invoice = await em.findOne(FmsInvoice, { id: input.id, deletedAt: null })
    const record = assertRecordFound(invoice, 'Invoice not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    // Update fields
    if (input.invoiceNumber !== undefined) record.invoiceNumber = input.invoiceNumber
    if (input.invoiceDate !== undefined) record.invoiceDate = input.invoiceDate
    if (input.dueDate !== undefined) record.dueDate = input.dueDate
    if (input.serviceDate !== undefined) record.serviceDate = input.serviceDate
    if (input.sellerName !== undefined) record.sellerName = input.sellerName
    if (input.sellerTaxId !== undefined) record.sellerTaxId = input.sellerTaxId
    if (input.sellerAddress !== undefined) record.sellerAddress = input.sellerAddress
    if (input.buyerName !== undefined) record.buyerName = input.buyerName
    if (input.buyerTaxId !== undefined) record.buyerTaxId = input.buyerTaxId
    if (input.buyerAddress !== undefined) record.buyerAddress = input.buyerAddress
    if (input.netAmount !== undefined) record.netAmount = input.netAmount
    if (input.vatAmount !== undefined) record.vatAmount = input.vatAmount
    if (input.grossAmount !== undefined) record.grossAmount = input.grossAmount
    if (input.currencyCode !== undefined) record.currencyCode = input.currencyCode
    if (input.status !== undefined) record.status = input.status
    // Transportation metadata / References fields
    if (input.blNumber !== undefined) record.blNumber = input.blNumber
    if (input.vesselName !== undefined) record.vesselName = input.vesselName
    if (input.voyageNumber !== undefined) record.voyageNumber = input.voyageNumber
    if (input.containerNumbers !== undefined) record.containerNumbers = input.containerNumbers
    if (input.transportationMetadata !== undefined) record.transportationMetadata = input.transportationMetadata
    if (input.customReference !== undefined) record.customReference = input.customReference
    if (input.invoiceType !== undefined) record.invoiceType = input.invoiceType
    if (input.expenseCategory !== undefined) record.expenseCategory = input.expenseCategory
    if (input.expenseNote !== undefined) record.expenseNote = input.expenseNote
    if (input.documentId !== undefined) record.documentId = input.documentId
    if (input.sellerContractorId !== undefined) record.sellerContractorId = input.sellerContractorId
    if (input.buyerContractorId !== undefined) record.buyerContractorId = input.buyerContractorId

    record.updatedBy = input.updatedBy ?? getUserIdFromAuth(ctx)
    record.updatedAt = new Date()

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: record,
      identifiers: {
        id: record.id,
        tenantId: record.tenantId,
        organizationId: record.organizationId,
      },
      indexer: { entityType: ENTITY_TYPE },
    })

    return { id: record.id }
  },
  buildLog: async ({ ctx, snapshots, result }) => {
    const before = snapshots.before as FmsInvoiceSnapshot | undefined
    if (!before) return null

    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadInvoiceSnapshot(em, result.id)

    const changeKeys = [
      'invoiceNumber',
      'invoiceDate',
      'dueDate',
      'serviceDate',
      'sellerName',
      'sellerTaxId',
      'sellerAddress',
      'buyerName',
      'buyerTaxId',
      'buyerAddress',
      'netAmount',
      'vatAmount',
      'grossAmount',
      'currencyCode',
      'status',
      'blNumber',
      'vesselName',
      'voyageNumber',
      'containerNumbers',
      'transportationMetadata',
      'customReference',
    ] as const

    const changes = afterSnapshot
      ? buildChanges(
          before as Record<string, unknown>,
          afterSnapshot as Record<string, unknown>,
          changeKeys
        )
      : {}

    return {
      actionLabel: 'Update invoice',
      resourceKind: 'fms_documents.invoice',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      snapshotAfter: afterSnapshot ?? null,
      changes,
      payload: {
        undo: { before, after: afterSnapshot ?? null },
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<InvoiceUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    await applyInvoiceSnapshot(em, before)

    const de = ctx.container.resolve('dataEngine') as DataEngine
    const invoice = await em.findOne(FmsInvoice, { id: before.id })
    if (invoice) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'updated',
        entity: invoice,
        identifiers: {
          id: before.id,
          organizationId: before.organizationId,
          tenantId: before.tenantId,
        },
        indexer: { entityType: ENTITY_TYPE },
      })
    }
  },
}

// ========================================
// Delete Invoice Command
// ========================================

const deleteInvoiceCommand: CommandHandler<{ id?: string; body?: Record<string, unknown>; query?: Record<string, unknown> }, { id: string }> = {
  id: 'fms_documents.invoices.delete',
  async prepare(input, ctx) {
    const id = requireId(input, 'Invoice id required')
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadInvoiceSnapshot(em, id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Invoice id required')
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const invoice = await em.findOne(FmsInvoice, { id, deletedAt: null })
    const record = assertRecordFound(invoice, 'Invoice not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    // Soft delete
    record.deletedAt = new Date()
    record.updatedBy = getUserIdFromAuth(ctx)

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'deleted',
      entity: record,
      identifiers: {
        id: record.id,
        organizationId: record.organizationId,
        tenantId: record.tenantId,
      },
      indexer: { entityType: ENTITY_TYPE },
    })

    return { id: record.id }
  },
  buildLog: async ({ snapshots }) => {
    const before = snapshots.before as FmsInvoiceSnapshot | undefined
    if (!before) return null

    return {
      actionLabel: 'Delete invoice',
      resourceKind: 'fms_documents.invoice',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      payload: { undo: { before } },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<InvoiceUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    await applyInvoiceSnapshot(em, before)

    const de = ctx.container.resolve('dataEngine') as DataEngine
    const invoice = await em.findOne(FmsInvoice, { id: before.id })
    if (invoice) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'created',
        entity: invoice,
        identifiers: {
          id: before.id,
          organizationId: before.organizationId,
          tenantId: before.tenantId,
        },
        indexer: { entityType: ENTITY_TYPE },
      })
    }
  },
}

// ========================================
// Approve Invoice Command
// ========================================

type ApproveInvoiceInput = z.infer<typeof approveInvoiceSchema> & { id: string }

const approveInvoiceCommand: CommandHandler<ApproveInvoiceInput, { id: string }> = {
  id: 'fms_documents.invoices.approve',
  async prepare(rawInput, ctx) {
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadInvoiceSnapshot(em, rawInput.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(rawInput, ctx) {
    const input = { id: rawInput.id, ...approveInvoiceSchema.parse(rawInput) }
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const invoice = await em.findOne(FmsInvoice, { id: input.id, deletedAt: null })
    const record = assertRecordFound(invoice, 'Invoice not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    record.status = 'approved'
    record.reviewedBy = input.reviewedBy ?? getUserIdFromAuth(ctx)
    record.reviewedAt = new Date()
    record.reviewNotes = input.reviewNotes ?? null
    record.updatedAt = new Date()
    record.updatedBy = input.reviewedBy ?? getUserIdFromAuth(ctx)

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: record,
      identifiers: {
        id: record.id,
        tenantId: record.tenantId,
        organizationId: record.organizationId,
      },
      indexer: { entityType: ENTITY_TYPE },
    })

    return { id: record.id }
  },
  buildLog: async ({ ctx, snapshots, result }) => {
    const before = snapshots.before as FmsInvoiceSnapshot | undefined
    if (!before) return null

    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadInvoiceSnapshot(em, result.id)

    return {
      actionLabel: 'Approve invoice',
      resourceKind: 'fms_documents.invoice',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      snapshotAfter: afterSnapshot ?? null,
      changes: { status: { from: before.status, to: 'approved' } },
      payload: { undo: { before, after: afterSnapshot ?? null } },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<InvoiceUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const invoice = await em.findOne(FmsInvoice, { id: before.id })
    if (!invoice) return

    invoice.status = before.status
    invoice.reviewedBy = before.reviewedBy
    invoice.reviewedAt = before.reviewedAt
    invoice.reviewNotes = before.reviewNotes

    await em.flush()
  },
}

// ========================================
// Reject Invoice Command
// ========================================

type RejectInvoiceInput = z.infer<typeof rejectInvoiceSchema> & { id: string }

const rejectInvoiceCommand: CommandHandler<RejectInvoiceInput, { id: string }> = {
  id: 'fms_documents.invoices.reject',
  async prepare(rawInput, ctx) {
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadInvoiceSnapshot(em, rawInput.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(rawInput, ctx) {
    const input = { id: rawInput.id, ...rejectInvoiceSchema.parse(rawInput) }
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const invoice = await em.findOne(FmsInvoice, { id: input.id, deletedAt: null })
    const record = assertRecordFound(invoice, 'Invoice not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    record.status = 'rejected'
    record.reviewedBy = input.reviewedBy ?? getUserIdFromAuth(ctx)
    record.reviewedAt = new Date()
    record.reviewNotes = input.reviewNotes
    record.updatedAt = new Date()
    record.updatedBy = input.reviewedBy ?? getUserIdFromAuth(ctx)

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: record,
      identifiers: {
        id: record.id,
        tenantId: record.tenantId,
        organizationId: record.organizationId,
      },
      indexer: { entityType: ENTITY_TYPE },
    })

    return { id: record.id }
  },
  buildLog: async ({ ctx, snapshots, result }) => {
    const before = snapshots.before as FmsInvoiceSnapshot | undefined
    if (!before) return null

    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadInvoiceSnapshot(em, result.id)

    return {
      actionLabel: 'Reject invoice',
      resourceKind: 'fms_documents.invoice',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      snapshotAfter: afterSnapshot ?? null,
      changes: { status: { from: before.status, to: 'rejected' } },
      payload: { undo: { before, after: afterSnapshot ?? null } },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<InvoiceUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const invoice = await em.findOne(FmsInvoice, { id: before.id })
    if (!invoice) return

    invoice.status = before.status
    invoice.reviewedBy = before.reviewedBy
    invoice.reviewedAt = before.reviewedAt
    invoice.reviewNotes = before.reviewNotes

    await em.flush()
  },
}

// ========================================
// Match Line Item to Charge Code Command
// ========================================

type MatchChargeCodeInput = z.infer<typeof matchChargeCodeSchema>

const matchChargeCodeCommand: CommandHandler<MatchChargeCodeInput, { id: string }> = {
  id: 'fms_documents.line_items.match_charge_code',
  async prepare(rawInput, ctx) {
    const input = matchChargeCodeSchema.parse(rawInput)
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadLineItemSnapshot(em, input.lineItemId)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(rawInput, ctx) {
    const input = matchChargeCodeSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const lineItem = await em.findOne(
      FmsInvoiceLineItem,
      { id: input.lineItemId },
      { populate: ['invoice'] }
    )
    const record = assertRecordFound(lineItem, 'Line item not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    // Verify product exists
    const product = await em.findOne(FmsProduct, {
      id: input.productId,
      deletedAt: null,
    })
    assertRecordFound(product, 'Product not found')

    record.product = product
    record.chargeCodeMatchConfidence = input.confidence ?? 100

    await em.flush()

    return { id: record.id }
  },
  buildLog: async ({ ctx, snapshots, result }) => {
    const before = snapshots.before as FmsInvoiceLineItemSnapshot | undefined
    if (!before) return null

    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadLineItemSnapshot(em, result.id)

    return {
      actionLabel: 'Match charge code',
      resourceKind: 'fms_documents.line_item',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      snapshotAfter: afterSnapshot ?? null,
      changes: {
        productId: { from: before.productId, to: afterSnapshot?.productId },
      },
      payload: { undo: { before, after: afterSnapshot ?? null } },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<{ before?: FmsInvoiceLineItemSnapshot }>(logEntry)
    const before = payload?.before
    if (!before) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    await applyLineItemSnapshot(em, before)
  },
}

// ========================================
// Confirm Invoice Command (Step 1 verification)
// ========================================

type ConfirmInvoiceInput = z.infer<typeof confirmInvoiceSchema> & { id: string }

const confirmInvoiceCommand: CommandHandler<ConfirmInvoiceInput, { id: string }> = {
  id: 'fms_documents.invoices.confirm',
  async prepare(rawInput, ctx) {
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadInvoiceSnapshot(em, rawInput.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(rawInput, ctx) {
    const input = { id: rawInput.id, ...confirmInvoiceSchema.parse(rawInput) }
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const invoice = await em.findOne(FmsInvoice, { id: input.id, deletedAt: null })
    const record = assertRecordFound(invoice, 'Invoice not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    // Validate invoice type requirements
    if (input.invoiceType === 'company_expense' && !input.expenseCategory) {
      throw new Error('Expense category is required for company expenses')
    }

    // Apply classification
    record.invoiceType = input.invoiceType
    record.expenseCategory = input.expenseCategory ?? null
    record.expenseNote = input.expenseNote ?? null
    record.sellerContractorId = input.sellerContractorId ?? null
    record.buyerContractorId = input.buyerContractorId ?? null

    // Recalculate totals excluding excluded lines
    const lineItems = await em.find(FmsInvoiceLineItem, { invoice: record })
    let netTotal = 0
    let vatTotal = 0
    let grossTotal = 0
    for (const li of lineItems) {
      if (!li.isExcluded) {
        netTotal += parseFloat(li.netAmount || '0')
        vatTotal += parseFloat(li.vatAmount || '0')
        grossTotal += parseFloat(li.grossAmount || '0')
      }
    }
    record.netAmount = netTotal.toFixed(2)
    record.vatAmount = vatTotal.toFixed(2)
    record.grossAmount = grossTotal.toFixed(2)

    // Set status to confirmed
    record.status = 'confirmed'
    record.reviewedBy = getUserIdFromAuth(ctx)
    record.reviewedAt = new Date()
    record.updatedAt = new Date()
    record.updatedBy = getUserIdFromAuth(ctx)

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: record,
      identifiers: {
        id: record.id,
        tenantId: record.tenantId,
        organizationId: record.organizationId,
      },
      indexer: { entityType: ENTITY_TYPE },
    })

    return { id: record.id }
  },
  buildLog: async ({ ctx, snapshots, result }) => {
    const before = snapshots.before as FmsInvoiceSnapshot | undefined
    if (!before) return null

    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadInvoiceSnapshot(em, result.id)

    return {
      actionLabel: 'Confirm invoice',
      resourceKind: 'fms_documents.invoice',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      snapshotAfter: afterSnapshot ?? null,
      changes: { status: { from: before.status, to: 'confirmed' } },
      payload: { undo: { before, after: afterSnapshot ?? null } },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<InvoiceUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const invoice = await em.findOne(FmsInvoice, { id: before.id })
    if (!invoice) return

    invoice.status = before.status
    invoice.invoiceType = null
    invoice.expenseCategory = null
    invoice.expenseNote = null
    invoice.reviewedBy = before.reviewedBy
    invoice.reviewedAt = before.reviewedAt

    await em.flush()
  },
}

// ========================================
// Toggle Line Item Exclude Command
// ========================================

type ToggleExcludeInput = { lineItemId: string }

const toggleExcludeCommand: CommandHandler<ToggleExcludeInput, { id: string; isExcluded: boolean }> = {
  id: 'fms_documents.line_items.toggle_exclude',
  async execute(rawInput, ctx) {
    const lineItemId = rawInput.lineItemId
    if (!lineItemId) throw new Error('lineItemId is required')

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const lineItem = await em.findOne(
      FmsInvoiceLineItem,
      { id: lineItemId },
      { populate: ['invoice'] }
    )
    const record = assertRecordFound(lineItem, 'Line item not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    // Toggle excluded state
    record.isExcluded = !record.isExcluded
    record.updatedAt = new Date()

    // Recalculate invoice totals
    const invoice = record.invoice as FmsInvoice
    const allLines = await em.find(FmsInvoiceLineItem, { invoice })
    let netTotal = 0
    let vatTotal = 0
    let grossTotal = 0
    for (const li of allLines) {
      const excluded = li.id === record.id ? record.isExcluded : li.isExcluded
      if (!excluded) {
        netTotal += parseFloat(li.netAmount || '0')
        vatTotal += parseFloat(li.vatAmount || '0')
        grossTotal += parseFloat(li.grossAmount || '0')
      }
    }
    invoice.netAmount = netTotal.toFixed(2)
    invoice.vatAmount = vatTotal.toFixed(2)
    invoice.grossAmount = grossTotal.toFixed(2)

    await em.flush()

    return { id: record.id, isExcluded: record.isExcluded }
  },
}

// Register all commands
registerCommand(createInvoiceCommand)
registerCommand(updateInvoiceCommand)
registerCommand(deleteInvoiceCommand)
registerCommand(approveInvoiceCommand)
registerCommand(rejectInvoiceCommand)
registerCommand(matchChargeCodeCommand)
registerCommand(confirmInvoiceCommand)
registerCommand(toggleExcludeCommand)

export {
  createInvoiceCommand,
  updateInvoiceCommand,
  deleteInvoiceCommand,
  approveInvoiceCommand,
  rejectInvoiceCommand,
  matchChargeCodeCommand,
  confirmInvoiceCommand,
  toggleExcludeCommand,
}
