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
import { Shipment, ShipmentDocument } from '../data/entities'
import type { ShipmentDocumentSnapshot, DocumentUndoPayload } from '../data/snapshots'
import {
  ensureTenantScope,
  ensureOrganizationScope,
  extractUndoPayload,
  assertRecordFound,
  loadDocumentSnapshot,
  applyDocumentSnapshot,
} from './shared'

const createDocumentSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  shipmentId: z.string().uuid(),
  attachmentId: z.string().uuid(),
  extractedData: z.record(z.string(), z.unknown()).optional().nullable(),
  processedAt: z.coerce.date().optional().nullable(),
})

const updateDocumentSchema = z.object({
  id: z.string().uuid(),
  extractedData: z.record(z.string(), z.unknown()).optional().nullable(),
  processedAt: z.coerce.date().optional().nullable(),
})

type CreateDocumentInput = z.infer<typeof createDocumentSchema>
type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>

const createDocumentCommand: CommandHandler<CreateDocumentInput, { id: string }> = {
  id: 'shipments.documents.create',
  async execute(rawInput, ctx) {
    const input = createDocumentSchema.parse(rawInput)
    ensureTenantScope(ctx, input.tenantId)
    ensureOrganizationScope(ctx, input.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    // Verify shipment exists
    const shipment = await em.findOne(Shipment, {
      id: input.shipmentId,
      organizationId: input.organizationId,
      tenantId: input.tenantId,
    })
    if (!shipment) {
      throw new Error('Shipment not found')
    }

    const doc = em.create(ShipmentDocument, {
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      shipmentId: input.shipmentId,
      attachmentId: input.attachmentId,
      extractedData: input.extractedData ?? undefined,
      processedAt: input.processedAt ?? undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    em.persist(doc)
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: doc,
      identifiers: {
        id: doc.id,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
      },
    })

    return { id: doc.id }
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
      resourceKind: 'shipments.document',
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

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const doc = await em.findOne(ShipmentDocument, { id: documentId })
    if (!doc) return

    em.remove(doc)
    await em.flush()
  },
}

const updateDocumentCommand: CommandHandler<UpdateDocumentInput, { id: string }> = {
  id: 'shipments.documents.update',
  async prepare(rawInput, ctx) {
    const input = updateDocumentSchema.parse(rawInput)
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadDocumentSnapshot(em, input.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(rawInput, ctx) {
    const input = updateDocumentSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const doc = await em.findOne(ShipmentDocument, { id: input.id })
    const record = assertRecordFound(doc, 'Document not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    if (input.extractedData !== undefined) record.extractedData = input.extractedData ?? undefined
    if (input.processedAt !== undefined) record.processedAt = input.processedAt ?? undefined

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
    })

    return { id: record.id }
  },
  buildLog: async ({ ctx, snapshots, result }) => {
    const before = snapshots.before as ShipmentDocumentSnapshot | undefined
    if (!before) return null

    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadDocumentSnapshot(em, result.id)

    const changeKeys = ['extractedData', 'processedAt'] as const

    const changes = afterSnapshot
      ? buildChanges(
          before as Record<string, unknown>,
          afterSnapshot as Record<string, unknown>,
          changeKeys
        )
      : {}

    return {
      actionLabel: 'Update document',
      resourceKind: 'shipments.document',
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

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    await applyDocumentSnapshot(em, before)

    const de = ctx.container.resolve('dataEngine') as DataEngine
    const doc = await em.findOne(ShipmentDocument, { id: before.id })
    if (doc) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'updated',
        entity: doc,
        identifiers: {
          id: before.id,
          organizationId: before.organizationId,
          tenantId: before.tenantId,
        },
      })
    }
  },
}

const deleteDocumentCommand: CommandHandler<{ id?: string; body?: Record<string, unknown>; query?: Record<string, unknown> }, { id: string }> = {
  id: 'shipments.documents.delete',
  async prepare(input, ctx) {
    const id = requireId(input, 'Document id required')
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadDocumentSnapshot(em, id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Document id required')
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const doc = await em.findOne(ShipmentDocument, { id })
    const record = assertRecordFound(doc, 'Document not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    em.remove(record)
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
    })

    return { id: record.id }
  },
  buildLog: async ({ snapshots }) => {
    const before = snapshots.before as ShipmentDocumentSnapshot | undefined
    if (!before) return null

    return {
      actionLabel: 'Delete document',
      resourceKind: 'shipments.document',
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

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    await applyDocumentSnapshot(em, before)

    const de = ctx.container.resolve('dataEngine') as DataEngine
    const doc = await em.findOne(ShipmentDocument, { id: before.id })
    if (doc) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'created',
        entity: doc,
        identifiers: {
          id: before.id,
          organizationId: before.organizationId,
          tenantId: before.tenantId,
        },
      })
    }
  },
}

registerCommand(createDocumentCommand)
registerCommand(updateDocumentCommand)
registerCommand(deleteDocumentCommand)

export { createDocumentCommand, updateDocumentCommand, deleteDocumentCommand }
