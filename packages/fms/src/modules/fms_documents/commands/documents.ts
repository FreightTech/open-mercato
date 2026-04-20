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
import { FmsDocument, DocumentCategory } from '../data/entities'
import type { FmsDocumentSnapshot, DocumentUndoPayload } from '../data/snapshots'
import {
  ensureTenantScope,
  ensureOrganizationScope,
  extractUndoPayload,
  assertRecordFound,
  loadDocumentSnapshot,
  applyDocumentSnapshot,
  getUserIdFromAuth,
} from './shared'
import type { DocumentIdentifiersUpdatedPayload } from '../events'
import type { EventBus } from '@open-mercato/events'
import { createLogger } from '@open-mercato/logger'
import { getMeter } from '@open-mercato/logger'

const logger = createLogger('fms_documents')
const meter = getMeter('fms_documents')

// Create counters once at module scope
const documentsUpdatedCounter = meter.createCounter('fms.documents.updated', {
  description: 'Number of documents updated',
  unit: '1',
})

const documentsDeletedCounter = meter.createCounter('fms.documents.deleted', {
  description: 'Number of documents deleted',
  unit: '1',
})

const documentCategorySchema = z.enum(['offer', 'invoice', 'customs_declaration', 'bill_of_lading', 'booking_confirmation', 'delivery_note', 'packing_list', 'vgm_certificate', 'other'])

const createDocumentSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(500),
  category: documentCategorySchema.optional().default('other'),
  description: z.string().max(2000).optional().nullable(),
  attachmentId: z.string().uuid(),
  relatedEntityId: z.string().uuid().optional().nullable(),
  relatedEntityType: z.string().max(100).optional().nullable(),
  createdBy: z.string().uuid().optional().nullable(),
})

const updateDocumentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(500).optional(),
  category: documentCategorySchema.optional(),
  description: z.string().max(2000).optional().nullable(),
  relatedEntityId: z.string().uuid().optional().nullable(),
  relatedEntityType: z.string().max(100).optional().nullable(),
  updatedBy: z.string().uuid().optional().nullable(),
})

type CreateDocumentInput = z.infer<typeof createDocumentSchema>
type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>

const createDocumentCommand: CommandHandler<CreateDocumentInput, { id: string }> = {
  id: 'fms_documents.documents.create',
  async execute(rawInput, ctx) {
    const input = createDocumentSchema.parse(rawInput)
    ensureTenantScope(ctx, input.tenantId)
    ensureOrganizationScope(ctx, input.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const document = em.create(FmsDocument, {
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      name: input.name,
      category: input.category as DocumentCategory,
      description: input.description ?? null,
      attachmentId: input.attachmentId,
      relatedEntityId: input.relatedEntityId ?? null,
      relatedEntityType: input.relatedEntityType ?? null,
      createdBy: input.createdBy ?? getUserIdFromAuth(ctx),
    })

    em.persist(document)
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: document,
      identifiers: {
        id: document.id,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
      },
      indexer: { entityType: 'fms_documents:fms_document' },
    })

    return { id: document.id }
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve('em') as EntityManager
    return await loadDocumentSnapshot(em, result.id)
  },
  buildLog: async ({ result, ctx }) => {
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadDocumentSnapshot(em, result.id)
    return {
      actionLabel: 'Create document',
      resourceKind: 'fms_documents.document',
      resourceId: result.id,
      tenantId: snapshot?.tenantId ?? null,
      organizationId: snapshot?.organizationId ?? null,
      snapshotAfter: snapshot ?? null,
      payload: {
        undo: {
          after: snapshot,
        },
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<DocumentUndoPayload>(logEntry)
    const documentId = logEntry?.resourceId ?? payload?.after?.id ?? null
    if (!documentId) return

    const em = ctx.container.resolve('em') as EntityManager
    const document = await em.findOne(FmsDocument, { id: documentId })
    if (!document) return

    em.remove(document)
    await em.flush()
  },
}

const updateDocumentCommand: CommandHandler<UpdateDocumentInput, { id: string }> = {
  id: 'fms_documents.documents.update',
  async prepare(rawInput, ctx) {
    const input = updateDocumentSchema.parse(rawInput)
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadDocumentSnapshot(em, input.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(rawInput, ctx) {
    const input = updateDocumentSchema.parse(rawInput)
    const em = ctx.container.resolve('em') as EntityManager

    const document = await em.findOne(FmsDocument, { id: input.id, deletedAt: null })
    const record = assertRecordFound(document, 'Document not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    if (input.name !== undefined) record.name = input.name
    if (input.category !== undefined) record.category = input.category as DocumentCategory
    if (input.description !== undefined) record.description = input.description
    if (input.relatedEntityId !== undefined) record.relatedEntityId = input.relatedEntityId
    if (input.relatedEntityType !== undefined) record.relatedEntityType = input.relatedEntityType

    record.updatedBy = input.updatedBy ?? getUserIdFromAuth(ctx)
    record.updatedAt = new Date()

    await em.flush()

    // Track changed fields
    const changedFields = Object.keys(input).filter(k => k !== 'id' && k !== 'updatedBy')

    // Log update
    logger.info('fms.document.updated', {
      documentId: record.id,
      category: record.category,
      changedFields,
      tenantId: record.tenantId,
      organizationId: record.organizationId,
    })

    // Emit metrics
    documentsUpdatedCounter.add(1, {
      category: record.category || 'unknown',
      tenantId: record.tenantId,
      organizationId: record.organizationId,
    })

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
      indexer: { entityType: 'fms_documents:fms_document' },
    })

    return { id: record.id }
  },
  buildLog: async ({ ctx, snapshots, result }) => {
    const before = snapshots.before as FmsDocumentSnapshot | undefined
    if (!before) return null

    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadDocumentSnapshot(em, result.id)

    const changeKeys = ['name', 'category', 'description', 'relatedEntityId', 'relatedEntityType'] as const

    const changes = afterSnapshot
      ? buildChanges(
          before as Record<string, unknown>,
          afterSnapshot as Record<string, unknown>,
          changeKeys
        )
      : {}

    return {
      actionLabel: 'Update document',
      resourceKind: 'fms_documents.document',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      snapshotAfter: afterSnapshot ?? null,
      changes,
      payload: {
        undo: {
          before,
          after: afterSnapshot ?? null,
        } satisfies DocumentUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<DocumentUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return

    const em = ctx.container.resolve('em') as EntityManager
    await applyDocumentSnapshot(em, before)

    const de = ctx.container.resolve('dataEngine') as DataEngine
    const document = await em.findOne(FmsDocument, { id: before.id })
    if (document) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'updated',
        entity: document,
        identifiers: {
          id: before.id,
          organizationId: before.organizationId,
          tenantId: before.tenantId,
        },
        indexer: { entityType: 'fms_documents:fms_document' },
      })
    }
  },
}

const deleteDocumentCommand: CommandHandler<{ id?: string; body?: Record<string, unknown>; query?: Record<string, unknown> }, { id: string }> = {
  id: 'fms_documents.documents.delete',
  async prepare(input, ctx) {
    const id = requireId(input, 'Document id required')
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadDocumentSnapshot(em, id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Document id required')
    const em = ctx.container.resolve('em') as EntityManager

    const document = await em.findOne(FmsDocument, { id, deletedAt: null })
    const record = assertRecordFound(document, 'Document not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    // Soft delete
    record.deletedAt = new Date()
    record.updatedBy = getUserIdFromAuth(ctx)

    await em.flush()

    // Log deletion
    logger.info('fms.document.deleted', {
      documentId: record.id,
      category: record.category,
      tenantId: record.tenantId,
      organizationId: record.organizationId,
    })

    // Emit metrics
    documentsDeletedCounter.add(1, {
      category: record.category || 'unknown',
      tenantId: record.tenantId,
      organizationId: record.organizationId,
    })

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
      indexer: { entityType: 'fms_documents:fms_document' },
    })

    return { id: record.id }
  },
  buildLog: async ({ snapshots }) => {
    const before = snapshots.before as FmsDocumentSnapshot | undefined
    if (!before) return null

    return {
      actionLabel: 'Delete document',
      resourceKind: 'fms_documents.document',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      payload: {
        undo: {
          before,
        } satisfies DocumentUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<DocumentUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return

    const em = ctx.container.resolve('em') as EntityManager
    await applyDocumentSnapshot(em, before)

    const de = ctx.container.resolve('dataEngine') as DataEngine
    const document = await em.findOne(FmsDocument, { id: before.id })
    if (document) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'created',
        entity: document,
        identifiers: {
          id: before.id,
          organizationId: before.organizationId,
          tenantId: before.tenantId,
        },
        indexer: { entityType: 'fms_documents:fms_document' },
      })
    }
  },
}

const updateDocumentDataSchema = z.object({
  id: z.string().uuid(),
  documentData: z.record(z.string(), z.unknown()).optional(),
  documentNumber: z.string().max(500).optional().nullable(),
  documentDate: z.string().optional().nullable(),
  blNumber: z.string().max(500).optional().nullable(),
  bookingNumber: z.string().max(500).optional().nullable(),
  containerNumbers: z.array(z.string()).optional().nullable(),
  vesselName: z.string().max(500).optional().nullable(),
  voyageNumber: z.string().max(500).optional().nullable(),
  portOfLoading: z.string().max(500).optional().nullable(),
  portOfDischarge: z.string().max(500).optional().nullable(),
  currency: z.string().max(10).optional().nullable(),
  sellerName: z.string().max(500).optional().nullable(),
  buyerName: z.string().max(500).optional().nullable(),
  totalGrossAmount: z.string().max(50).optional().nullable(),
})

type UpdateDocumentDataInput = z.infer<typeof updateDocumentDataSchema>

const updateDocumentDataCommand: CommandHandler<UpdateDocumentDataInput, { id: string }> = {
  id: 'fms_documents.documents.updateDocumentData',
  async execute(rawInput, ctx) {
    const input = updateDocumentDataSchema.parse(rawInput)
    const em = ctx.container.resolve('em') as EntityManager

    const document = await em.findOne(FmsDocument, { id: input.id, deletedAt: null })
    const record = assertRecordFound(document, 'Document not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    if (input.documentData !== undefined) record.documentData = input.documentData as Record<string, unknown>
    if (input.documentNumber !== undefined) record.documentNumber = input.documentNumber
    if (input.documentDate !== undefined) {
      record.documentDate = input.documentDate ? new Date(input.documentDate) : null
    }
    if (input.blNumber !== undefined) record.blNumber = input.blNumber
    if (input.bookingNumber !== undefined) record.bookingNumber = input.bookingNumber
    if (input.containerNumbers !== undefined) record.containerNumbers = input.containerNumbers
    if (input.vesselName !== undefined) record.vesselName = input.vesselName
    if (input.voyageNumber !== undefined) record.voyageNumber = input.voyageNumber
    if (input.portOfLoading !== undefined) record.portOfLoading = input.portOfLoading
    if (input.portOfDischarge !== undefined) record.portOfDischarge = input.portOfDischarge
    if (input.currency !== undefined) record.currency = input.currency
    if (input.sellerName !== undefined) record.sellerName = input.sellerName
    if (input.buyerName !== undefined) record.buyerName = input.buyerName
    if (input.totalGrossAmount !== undefined) record.totalGrossAmount = input.totalGrossAmount

    record.editedBy = getUserIdFromAuth(ctx)
    record.editedAt = new Date()
    record.updatedBy = getUserIdFromAuth(ctx)
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
      indexer: { entityType: 'fms_documents:fms_document' },
    })

    // Emit identifiers_updated event if linking-relevant fields were updated
    // and document is not already linked to a project.
    // Note: containerNumbers is excluded as containers can be reused across shipments.
    const linkingFieldsChanged =
      input.blNumber !== undefined ||
      input.bookingNumber !== undefined
      // mblNumber is not in the PATCH schema, but if added later, include it here

    if (linkingFieldsChanged && !record.relatedEntityId) {
      const eventBus = ctx.container.resolve('eventBus') as EventBus
      const payload: DocumentIdentifiersUpdatedPayload = {
        id: record.id,
        tenantId: record.tenantId,
        organizationId: record.organizationId,
        category: record.category ?? 'unknown',
        bookingNumber: record.bookingNumber ?? undefined,
        blNumber: record.blNumber ?? undefined,
        mblNumber: record.mblNumber ?? undefined,
      }
      await eventBus.emitEvent('fms_documents.document.identifiers_updated', payload, { persistent: true })
    }

    return { id: record.id }
  },
  buildLog: async ({ result }) => {
    return {
      actionLabel: 'Update document data',
      resourceKind: 'fms_documents.document',
      resourceId: result.id,
      tenantId: null,
      organizationId: null,
    }
  },
}

registerCommand(createDocumentCommand)
registerCommand(updateDocumentCommand)
registerCommand(deleteDocumentCommand)
registerCommand(updateDocumentDataCommand)

export { createDocumentCommand, updateDocumentCommand, deleteDocumentCommand, updateDocumentDataCommand }
