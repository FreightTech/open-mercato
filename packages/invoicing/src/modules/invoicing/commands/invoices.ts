import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import {
  emitCrudSideEffects,
  emitCrudUndoSideEffects,
  buildChanges,
  requireId,
} from '@open-mercato/shared/lib/commands/helpers'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { InvoicingInvoice, InvoicingLineItem, InvoicingSettings } from '../data/entities'
import { isOfflineMode } from '../lib/ksef/offline-modes'
import { buildOfflineQrContent } from '../lib/ksef/offline-qr'
import type { InvoicingInvoiceSnapshot, InvoiceUndoPayload } from '../data/snapshots'
import {
  createInvoiceSchema,
  updateInvoiceSchema,
  approveInvoiceSchema,
  rejectInvoiceSchema,
} from '../data/validators'
import {
  ensureTenantScope,
  ensureOrganizationScope,
  extractUndoPayload,
  assertRecordFound,
  loadInvoiceSnapshot,
  applyInvoiceSnapshot,
  getUserIdFromAuth,
} from './shared'
import { emitInvoicingEvent } from '../events'

const ENTITY_TYPE = 'invoicing:invoicing_invoice'

// ========================================
// Create Invoice Command
// ========================================

type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>

const createInvoiceCommand: CommandHandler<CreateInvoiceInput, { id: string }> = {
  id: 'invoicing.invoices.create',
  async execute(rawInput, ctx) {
    const input = createInvoiceSchema.parse(rawInput)
    ensureTenantScope(ctx, input.tenantId)
    ensureOrganizationScope(ctx, input.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    // Validate correction invoice requirements
    const isCorrection = ['KOR', 'KOR_ZAL', 'KOR_ROZ'].includes(input.invoiceType ?? 'VAT')
    if (isCorrection) {
      if (!input.correctedInvoiceId) {
        throw new CrudHttpError(400, { error: 'Correction invoice requires correctedInvoiceId' })
      }
      if (!input.correctionReason) {
        throw new CrudHttpError(400, { error: 'Correction invoice requires correctionReason' })
      }
      const correctedInvoice = await em.findOne(InvoicingInvoice, {
        id: input.correctedInvoiceId,
        organizationId: input.organizationId,
        tenantId: input.tenantId,
        deletedAt: null,
      })
      if (!correctedInvoice) {
        throw new CrudHttpError(404, { error: 'Corrected invoice not found' })
      }
      if (!correctedInvoice.ksefNumber) {
        throw new CrudHttpError(400, { error: 'Corrected invoice must have a KSeF number before correction can be issued' })
      }
    }

    const invoice = em.create(InvoicingInvoice, {
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      invoiceNumber: input.invoiceNumber,
      invoiceDate: input.invoiceDate ?? null,
      dueDate: input.dueDate ?? null,
      serviceDate: input.serviceDate ?? null,
      sellerName: input.sellerName ?? null,
      sellerTaxId: input.sellerTaxId ?? null,
      sellerAddress: input.sellerAddress ?? null,
      sellerCountryCode: input.sellerCountryCode ?? null,
      sellerBankAccount: input.sellerBankAccount ?? null,
      buyerName: input.buyerName ?? null,
      buyerTaxId: input.buyerTaxId ?? null,
      buyerAddress: input.buyerAddress ?? null,
      buyerCountryCode: input.buyerCountryCode ?? null,
      netAmount: input.netAmount ?? '0',
      vatAmount: input.vatAmount ?? '0',
      grossAmount: input.grossAmount ?? '0',
      currencyCode: input.currencyCode ?? 'PLN',
      paymentMethod: input.paymentMethod ?? null,
      paymentTerms: input.paymentTerms ?? null,
      direction: input.direction ?? 'outgoing',
      sourceType: input.sourceType ?? 'manual',
      sourceDocumentInvoiceId: input.sourceDocumentInvoiceId ?? null,
      sourceDocumentId: input.sourceDocumentId ?? null,
      sourceSalesInvoiceId: input.sourceSalesInvoiceId ?? null,
      sourceImportReference: input.sourceImportReference ?? null,
      attachmentId: input.attachmentId ?? null,
      status: input.status ?? 'draft',
      invoiceType: input.invoiceType ?? 'VAT',
      correctedInvoiceId: input.correctedInvoiceId ?? null,
      correctionReason: input.correctionReason ?? null,
      notes: input.notes ?? null,
      metadata: input.metadata ?? null,
      createdBy: input.createdBy ?? getUserIdFromAuth(ctx),
    })

    em.persist(invoice)
    await em.flush()

    // Create line items if provided
    if (input.lineItems && input.lineItems.length > 0) {
      for (const li of input.lineItems) {
        const lineItem = em.create(InvoicingLineItem, {
          organizationId: input.organizationId,
          tenantId: input.tenantId,
          invoice,
          lineNumber: li.lineNumber,
          description: li.description,
          quantity: li.quantity ?? '1',
          unit: li.unit ?? null,
          unitPriceNet: li.unitPriceNet ?? '0',
          vatRate: li.vatRate ?? '0',
          vatRateCode: li.vatRateCode ?? null,
          netAmount: li.netAmount ?? '0',
          vatAmount: li.vatAmount ?? '0',
          grossAmount: li.grossAmount ?? '0',
          productId: li.productId ?? null,
          gtuCode: li.gtuCode ?? null,
          pkwiuCode: li.pkwiuCode ?? null,
        })

        em.persist(lineItem)
      }
      await em.flush()
    }

    // Apply offline mode if active
    const settings = await em.findOne(InvoicingSettings, {
      organizationId: input.organizationId,
      tenantId: input.tenantId,
    })
    if (settings && isOfflineMode(settings.offlineMode)) {
      invoice.offlineMode = settings.offlineMode
      invoice.offlineQrData = buildOfflineQrContent(invoice)
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
      resourceKind: 'invoicing.invoice',
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
    await em.nativeDelete(InvoicingLineItem, { invoice: invoiceId })

    // Delete invoice
    const invoice = await em.findOne(InvoicingInvoice, { id: invoiceId })
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
  id: 'invoicing.invoices.update',
  async prepare(rawInput, ctx) {
    const input = { id: rawInput.id, ...updateInvoiceSchema.parse(rawInput) }
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadInvoiceSnapshot(em, input.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(rawInput, ctx) {
    const input = { id: rawInput.id, ...updateInvoiceSchema.parse(rawInput) }
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const invoice = await em.findOne(InvoicingInvoice, { id: input.id, deletedAt: null })
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
    if (input.sellerCountryCode !== undefined) record.sellerCountryCode = input.sellerCountryCode
    if (input.sellerBankAccount !== undefined) record.sellerBankAccount = input.sellerBankAccount
    if (input.buyerName !== undefined) record.buyerName = input.buyerName
    if (input.buyerTaxId !== undefined) record.buyerTaxId = input.buyerTaxId
    if (input.buyerAddress !== undefined) record.buyerAddress = input.buyerAddress
    if (input.buyerCountryCode !== undefined) record.buyerCountryCode = input.buyerCountryCode
    if (input.netAmount !== undefined) record.netAmount = input.netAmount
    if (input.vatAmount !== undefined) record.vatAmount = input.vatAmount
    if (input.grossAmount !== undefined) record.grossAmount = input.grossAmount
    if (input.currencyCode !== undefined) record.currencyCode = input.currencyCode
    if (input.paymentMethod !== undefined) record.paymentMethod = input.paymentMethod
    if (input.paymentTerms !== undefined) record.paymentTerms = input.paymentTerms
    if (input.direction !== undefined) record.direction = input.direction
    if (input.status !== undefined) record.status = input.status
    if (input.notes !== undefined) record.notes = input.notes
    if (input.metadata !== undefined) record.metadata = input.metadata
    if (input.invoiceType !== undefined) record.invoiceType = input.invoiceType
    if (input.correctedInvoiceId !== undefined) record.correctedInvoiceId = input.correctedInvoiceId
    if (input.correctionReason !== undefined) record.correctionReason = input.correctionReason

    record.updatedBy = input.updatedBy ?? getUserIdFromAuth(ctx)
    record.updatedAt = new Date()

    // Handle line items: full replace strategy
    if (input.lineItems !== undefined) {
      await em.nativeDelete(InvoicingLineItem, { invoice: record.id })

      let totalNet = 0
      let totalVat = 0
      let totalGross = 0

      for (const li of input.lineItems) {
        const lineItem = em.create(InvoicingLineItem, {
          organizationId: record.organizationId,
          tenantId: record.tenantId,
          invoice: record,
          lineNumber: li.lineNumber,
          description: li.description,
          quantity: li.quantity ?? '1',
          unit: li.unit ?? null,
          unitPriceNet: li.unitPriceNet ?? '0',
          vatRate: li.vatRate ?? '0',
          vatRateCode: li.vatRateCode ?? null,
          netAmount: li.netAmount ?? '0',
          vatAmount: li.vatAmount ?? '0',
          grossAmount: li.grossAmount ?? '0',
          productId: li.productId ?? null,
          gtuCode: li.gtuCode ?? null,
          pkwiuCode: li.pkwiuCode ?? null,
        })
        em.persist(lineItem)

        totalNet += parseFloat(li.netAmount ?? '0') || 0
        totalVat += parseFloat(li.vatAmount ?? '0') || 0
        totalGross += parseFloat(li.grossAmount ?? '0') || 0
      }

      // Auto-recalculate totals from line items
      record.netAmount = totalNet.toFixed(2)
      record.vatAmount = totalVat.toFixed(2)
      record.grossAmount = totalGross.toFixed(2)
    }

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
    const before = snapshots.before as InvoicingInvoiceSnapshot | undefined
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
      'sellerCountryCode',
      'sellerBankAccount',
      'buyerName',
      'buyerTaxId',
      'buyerAddress',
      'buyerCountryCode',
      'netAmount',
      'vatAmount',
      'grossAmount',
      'currencyCode',
      'paymentMethod',
      'paymentTerms',
      'direction',
      'status',
      'invoiceType',
      'correctedInvoiceId',
      'correctionReason',
      'notes',
      'metadata',
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
      resourceKind: 'invoicing.invoice',
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
    const invoice = await em.findOne(InvoicingInvoice, { id: before.id })
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
  id: 'invoicing.invoices.delete',
  async prepare(input, ctx) {
    const id = requireId(input, 'Invoice id required')
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadInvoiceSnapshot(em, id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Invoice id required')
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const invoice = await em.findOne(InvoicingInvoice, { id, deletedAt: null })
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
    const before = snapshots.before as InvoicingInvoiceSnapshot | undefined
    if (!before) return null

    return {
      actionLabel: 'Delete invoice',
      resourceKind: 'invoicing.invoice',
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
    const invoice = await em.findOne(InvoicingInvoice, { id: before.id })
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
  id: 'invoicing.invoices.approve',
  async prepare(rawInput, ctx) {
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadInvoiceSnapshot(em, rawInput.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(rawInput, ctx) {
    const input = { id: rawInput.id, ...approveInvoiceSchema.parse(rawInput) }
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const invoice = await em.findOne(InvoicingInvoice, { id: input.id, deletedAt: null })
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

    // Emit lifecycle event
    await emitInvoicingEvent('invoicing.invoice.approved', {
      id: record.id,
      tenantId: record.tenantId,
      organizationId: record.organizationId,
      invoiceNumber: record.invoiceNumber,
      direction: record.direction,
      sourceType: record.sourceType,
    })

    return { id: record.id }
  },
  buildLog: async ({ ctx, snapshots, result }) => {
    const before = snapshots.before as InvoicingInvoiceSnapshot | undefined
    if (!before) return null

    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadInvoiceSnapshot(em, result.id)

    return {
      actionLabel: 'Approve invoice',
      resourceKind: 'invoicing.invoice',
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
    const invoice = await em.findOne(InvoicingInvoice, { id: before.id })
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
  id: 'invoicing.invoices.reject',
  async prepare(rawInput, ctx) {
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadInvoiceSnapshot(em, rawInput.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(rawInput, ctx) {
    const input = { id: rawInput.id, ...rejectInvoiceSchema.parse(rawInput) }
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const invoice = await em.findOne(InvoicingInvoice, { id: input.id, deletedAt: null })
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
    const before = snapshots.before as InvoicingInvoiceSnapshot | undefined
    if (!before) return null

    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadInvoiceSnapshot(em, result.id)

    return {
      actionLabel: 'Reject invoice',
      resourceKind: 'invoicing.invoice',
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
    const invoice = await em.findOne(InvoicingInvoice, { id: before.id })
    if (!invoice) return

    invoice.status = before.status
    invoice.reviewedBy = before.reviewedBy
    invoice.reviewedAt = before.reviewedAt
    invoice.reviewNotes = before.reviewNotes

    await em.flush()
  },
}

// Register all commands
registerCommand(createInvoiceCommand)
registerCommand(updateInvoiceCommand)
registerCommand(deleteInvoiceCommand)
registerCommand(approveInvoiceCommand)
registerCommand(rejectInvoiceCommand)

export {
  createInvoiceCommand,
  updateInvoiceCommand,
  deleteInvoiceCommand,
  approveInvoiceCommand,
  rejectInvoiceCommand,
}
