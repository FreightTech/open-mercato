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
import { FmsCarrier } from '../data/entities'
import type { FmsCarrierSnapshot, CarrierUndoPayload } from '../data/snapshots'
import {
  ensureTenantScope,
  ensureOrganizationScope,
  extractUndoPayload,
  assertRecordFound,
  loadCarrierSnapshot,
  applyCarrierSnapshot,
  getUserIdFromAuth,
} from './shared'

const carrierTypeSchema = z.enum(['sea', 'air', 'rail', 'road'])

const createCarrierSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string().min(1).max(50).regex(/^[A-Z0-9_]+$/, 'Code must be uppercase letters, numbers and underscores only'),
  name: z.string().min(1).max(255),
  carrierType: carrierTypeSchema,
  isActive: z.boolean().optional().default(true),
  createdBy: z.string().uuid().optional().nullable(),
})

const updateCarrierSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  carrierType: carrierTypeSchema.optional(),
  isActive: z.boolean().optional(),
  updatedBy: z.string().uuid().optional().nullable(),
})

type CreateCarrierInput = z.infer<typeof createCarrierSchema>
type UpdateCarrierInput = z.infer<typeof updateCarrierSchema>

const createCarrierCommand: CommandHandler<CreateCarrierInput, { id: string }> = {
  id: 'fms_products.carriers.create',
  async execute(rawInput, ctx) {
    const input = createCarrierSchema.parse(rawInput)
    ensureTenantScope(ctx, input.tenantId)
    ensureOrganizationScope(ctx, input.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    // Check for unique code constraint
    const existing = await em.findOne(FmsCarrier, {
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      code: input.code,
      deletedAt: null,
    })
    if (existing) {
      throw new Error('Carrier code already exists')
    }

    const carrier = em.create(FmsCarrier, {
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      code: input.code,
      name: input.name,
      carrierType: input.carrierType,
      isActive: input.isActive ?? true,
      createdBy: input.createdBy ?? getUserIdFromAuth(ctx),
    })

    em.persist(carrier)
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: carrier,
      identifiers: {
        id: carrier.id,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
      },
      indexer: { entityType: 'fms_products:fms_carrier' },
    })

    return { id: carrier.id }
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve('em') as EntityManager
    return await loadCarrierSnapshot(em, result.id)
  },
  buildLog: async ({ result, ctx }) => {
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadCarrierSnapshot(em, result.id)
    return {
      actionLabel: 'Create carrier',
      resourceKind: 'fms_products.carrier',
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
    const payload = extractUndoPayload<CarrierUndoPayload>(logEntry)
    const carrierId = logEntry?.resourceId ?? payload?.after?.id ?? null
    if (!carrierId) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const carrier = await em.findOne(FmsCarrier, { id: carrierId })
    if (!carrier) return

    em.remove(carrier)
    await em.flush()
  },
}

const updateCarrierCommand: CommandHandler<UpdateCarrierInput, { id: string }> = {
  id: 'fms_products.carriers.update',
  async prepare(rawInput, ctx) {
    const input = updateCarrierSchema.parse(rawInput)
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadCarrierSnapshot(em, input.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(rawInput, ctx) {
    const input = updateCarrierSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const carrier = await em.findOne(FmsCarrier, { id: input.id, deletedAt: null })
    const record = assertRecordFound(carrier, 'Carrier not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    if (input.name !== undefined) record.name = input.name
    if (input.carrierType !== undefined) record.carrierType = input.carrierType
    if (input.isActive !== undefined) record.isActive = input.isActive

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
      indexer: { entityType: 'fms_products:fms_carrier' },
    })

    return { id: record.id }
  },
  buildLog: async ({ ctx, snapshots, result }) => {
    const before = snapshots.before as FmsCarrierSnapshot | undefined
    if (!before) return null

    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadCarrierSnapshot(em, result.id)

    const changeKeys = [
      'name',
      'carrierType',
      'isActive',
    ] as const

    const changes = afterSnapshot
      ? buildChanges(
          before as Record<string, unknown>,
          afterSnapshot as Record<string, unknown>,
          changeKeys
        )
      : {}

    return {
      actionLabel: 'Update carrier',
      resourceKind: 'fms_products.carrier',
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
        } satisfies CarrierUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<CarrierUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    await applyCarrierSnapshot(em, before)

    const de = ctx.container.resolve('dataEngine') as DataEngine
    const carrier = await em.findOne(FmsCarrier, { id: before.id })
    if (carrier) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'updated',
        entity: carrier,
        identifiers: {
          id: before.id,
          organizationId: before.organizationId,
          tenantId: before.tenantId,
        },
        indexer: { entityType: 'fms_products:fms_carrier' },
      })
    }
  },
}

const deleteCarrierCommand: CommandHandler<{ id?: string; body?: Record<string, unknown>; query?: Record<string, unknown> }, { id: string }> = {
  id: 'fms_products.carriers.delete',
  async prepare(input, ctx) {
    const id = requireId(input, 'Carrier id required')
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadCarrierSnapshot(em, id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Carrier id required')
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const carrier = await em.findOne(FmsCarrier, { id, deletedAt: null })
    const record = assertRecordFound(carrier, 'Carrier not found')
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
      indexer: { entityType: 'fms_products:fms_carrier' },
    })

    return { id: record.id }
  },
  buildLog: async ({ snapshots }) => {
    const before = snapshots.before as FmsCarrierSnapshot | undefined
    if (!before) return null

    return {
      actionLabel: 'Delete carrier',
      resourceKind: 'fms_products.carrier',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      payload: {
        undo: {
          before,
        } satisfies CarrierUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<CarrierUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    await applyCarrierSnapshot(em, before)

    const de = ctx.container.resolve('dataEngine') as DataEngine
    const carrier = await em.findOne(FmsCarrier, { id: before.id })
    if (carrier) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'created',
        entity: carrier,
        identifiers: {
          id: before.id,
          organizationId: before.organizationId,
          tenantId: before.tenantId,
        },
        indexer: { entityType: 'fms_products:fms_carrier' },
      })
    }
  },
}

registerCommand(createCarrierCommand)
registerCommand(updateCarrierCommand)
registerCommand(deleteCarrierCommand)

export { createCarrierCommand, updateCarrierCommand, deleteCarrierCommand }
