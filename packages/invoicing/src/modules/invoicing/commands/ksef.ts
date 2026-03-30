import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler } from '@open-mercato/shared/lib/commands'
import {
  emitCrudSideEffects,
} from '@open-mercato/shared/lib/commands/helpers'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { InvoicingInvoice } from '../data/entities'
import { ksefStatusSchema } from '../data/validators'
import {
  ensureTenantScope,
  ensureOrganizationScope,
  assertRecordFound,
  getUserIdFromAuth,
  loadInvoiceSnapshot,
} from './shared'
import type { InvoicingInvoiceSnapshot } from '../data/snapshots'
import { emitInvoicingEvent } from '../events'

const ENTITY_TYPE = 'invoicing:invoicing_invoice'

// ========================================
// Queue Invoice for KSeF Submission
// ========================================

const queueKsefSchema = z.object({
  id: z.string().uuid(),
})

type QueueKsefInput = z.infer<typeof queueKsefSchema>

const queueKsefCommand: CommandHandler<QueueKsefInput, { id: string }> = {
  id: 'invoicing.ksef.queue',
  async prepare(rawInput, ctx) {
    const input = queueKsefSchema.parse(rawInput)
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadInvoiceSnapshot(em, input.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(rawInput, ctx) {
    const input = queueKsefSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const invoice = await em.findOne(InvoicingInvoice, { id: input.id, deletedAt: null })
    const record = assertRecordFound(invoice, 'Invoice not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    if (record.status !== 'approved') {
      throw new Error('Invoice must be approved before queuing for KSeF submission')
    }

    record.ksefStatus = 'queued'
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

    await emitInvoicingEvent('invoicing.ksef.queued', {
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
      actionLabel: 'Queue invoice for KSeF',
      resourceKind: 'invoicing.invoice',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      snapshotAfter: afterSnapshot ?? null,
      changes: { ksefStatus: { from: before.ksefStatus, to: 'queued' } },
    }
  },
}

// ========================================
// Update KSeF Status Command (called by workers)
// ========================================

const updateKsefStatusSchema = z.object({
  id: z.string().uuid(),
  ksefStatus: ksefStatusSchema,
  ksefNumber: z.string().optional().nullable(),
  ksefReferenceNumber: z.string().optional().nullable(),
  ksefSessionId: z.string().uuid().optional().nullable(),
  ksefSubmittedAt: z.coerce.date().optional().nullable(),
  ksefAcceptedAt: z.coerce.date().optional().nullable(),
  ksefFaXml: z.string().optional().nullable(),
  ksefUpoXml: z.string().optional().nullable(),
  ksefErrorMessage: z.string().optional().nullable(),
  ksefErrorCode: z.string().optional().nullable(),
})

type UpdateKsefStatusInput = z.infer<typeof updateKsefStatusSchema>

const updateKsefStatusCommand: CommandHandler<UpdateKsefStatusInput, { id: string }> = {
  id: 'invoicing.ksef.update_status',
  async execute(rawInput, ctx) {
    const input = updateKsefStatusSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const invoice = await em.findOne(InvoicingInvoice, { id: input.id, deletedAt: null })
    const record = assertRecordFound(invoice, 'Invoice not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    record.ksefStatus = input.ksefStatus
    if (input.ksefNumber !== undefined) record.ksefNumber = input.ksefNumber
    if (input.ksefReferenceNumber !== undefined) record.ksefReferenceNumber = input.ksefReferenceNumber
    if (input.ksefSessionId !== undefined) record.ksefSessionId = input.ksefSessionId
    if (input.ksefSubmittedAt !== undefined) record.ksefSubmittedAt = input.ksefSubmittedAt
    if (input.ksefAcceptedAt !== undefined) record.ksefAcceptedAt = input.ksefAcceptedAt
    if (input.ksefFaXml !== undefined) record.ksefFaXml = input.ksefFaXml
    if (input.ksefUpoXml !== undefined) record.ksefUpoXml = input.ksefUpoXml
    if (input.ksefErrorMessage !== undefined) record.ksefErrorMessage = input.ksefErrorMessage
    if (input.ksefErrorCode !== undefined) record.ksefErrorCode = input.ksefErrorCode

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

    // Emit specific KSeF status event
    const ksefEventMap: Record<string, string> = {
      submitted: 'invoicing.ksef.submitted',
      accepted: 'invoicing.ksef.accepted',
      rejected: 'invoicing.ksef.rejected',
      error: 'invoicing.ksef.error',
      upo_downloaded: 'invoicing.ksef.upo_downloaded',
    }

    const eventId = ksefEventMap[input.ksefStatus]
    if (eventId) {
      await emitInvoicingEvent(eventId as Parameters<typeof emitInvoicingEvent>[0], {
        id: record.id,
        tenantId: record.tenantId,
        organizationId: record.organizationId,
        invoiceNumber: record.invoiceNumber,
        direction: record.direction,
        sourceType: record.sourceType,
      })
    }

    return { id: record.id }
  },
  buildLog: async ({ result }) => {
    return {
      actionLabel: 'Update KSeF status',
      resourceKind: 'invoicing.invoice',
      resourceId: result.id,
      tenantId: null,
      organizationId: null,
    }
  },
}

// Register all commands
registerCommand(queueKsefCommand)
registerCommand(updateKsefStatusCommand)

export {
  queueKsefCommand,
  updateKsefStatusCommand,
}
