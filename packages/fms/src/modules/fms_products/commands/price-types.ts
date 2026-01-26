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
import { FmsPriceType } from '../data/entities'
import type { FmsPriceTypeSnapshot, PriceTypeUndoPayload } from '../data/snapshots'
import {
  ensureTenantScope,
  ensureOrganizationScope,
  extractUndoPayload,
  assertRecordFound,
  loadPriceTypeSnapshot,
  applyPriceTypeSnapshot,
  getUserIdFromAuth,
} from './shared'

const createPriceTypeSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string().min(1).max(50).regex(/^[A-Z0-9_]+$/, 'Code must be uppercase letters, numbers and underscores only'),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional().nullable(),
  isActive: z.boolean().optional().default(true),
  createdBy: z.string().uuid().optional().nullable(),
})

const updatePriceTypeSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional().nullable(),
  isActive: z.boolean().optional(),
  updatedBy: z.string().uuid().optional().nullable(),
})

type CreatePriceTypeInput = z.infer<typeof createPriceTypeSchema>
type UpdatePriceTypeInput = z.infer<typeof updatePriceTypeSchema>

const createPriceTypeCommand: CommandHandler<CreatePriceTypeInput, { id: string }> = {
  id: 'fms_products.price_types.create',
  async execute(rawInput, ctx) {
    const input = createPriceTypeSchema.parse(rawInput)
    ensureTenantScope(ctx, input.tenantId)
    ensureOrganizationScope(ctx, input.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    // Check for unique code constraint
    const existing = await em.findOne(FmsPriceType, {
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      code: input.code,
      deletedAt: null,
    })
    if (existing) {
      throw new Error('Price type code already exists')
    }

    const priceType = em.create(FmsPriceType, {
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      isActive: input.isActive ?? true,
      createdBy: input.createdBy ?? getUserIdFromAuth(ctx),
    })

    em.persist(priceType)
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: priceType,
      identifiers: {
        id: priceType.id,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
      },
      indexer: { entityType: 'fms_products:fms_price_type' },
    })

    return { id: priceType.id }
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve('em') as EntityManager
    return await loadPriceTypeSnapshot(em, result.id)
  },
  buildLog: async ({ result, ctx }) => {
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadPriceTypeSnapshot(em, result.id)
    return {
      actionLabel: 'Create price type',
      resourceKind: 'fms_products.price_type',
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
    const payload = extractUndoPayload<PriceTypeUndoPayload>(logEntry)
    const priceTypeId = logEntry?.resourceId ?? payload?.after?.id ?? null
    if (!priceTypeId) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const priceType = await em.findOne(FmsPriceType, { id: priceTypeId })
    if (!priceType) return

    em.remove(priceType)
    await em.flush()
  },
}

const updatePriceTypeCommand: CommandHandler<UpdatePriceTypeInput, { id: string }> = {
  id: 'fms_products.price_types.update',
  async prepare(rawInput, ctx) {
    const input = updatePriceTypeSchema.parse(rawInput)
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadPriceTypeSnapshot(em, input.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(rawInput, ctx) {
    const input = updatePriceTypeSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const priceType = await em.findOne(FmsPriceType, { id: input.id, deletedAt: null })
    const record = assertRecordFound(priceType, 'Price type not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    if (input.name !== undefined) record.name = input.name
    if (input.description !== undefined) record.description = input.description
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
      indexer: { entityType: 'fms_products:fms_price_type' },
    })

    return { id: record.id }
  },
  buildLog: async ({ ctx, snapshots, result }) => {
    const before = snapshots.before as FmsPriceTypeSnapshot | undefined
    if (!before) return null

    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadPriceTypeSnapshot(em, result.id)

    const changeKeys = [
      'name',
      'description',
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
      actionLabel: 'Update price type',
      resourceKind: 'fms_products.price_type',
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
        } satisfies PriceTypeUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<PriceTypeUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    await applyPriceTypeSnapshot(em, before)

    const de = ctx.container.resolve('dataEngine') as DataEngine
    const priceType = await em.findOne(FmsPriceType, { id: before.id })
    if (priceType) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'updated',
        entity: priceType,
        identifiers: {
          id: before.id,
          organizationId: before.organizationId,
          tenantId: before.tenantId,
        },
        indexer: { entityType: 'fms_products:fms_price_type' },
      })
    }
  },
}

const deletePriceTypeCommand: CommandHandler<{ id?: string; body?: Record<string, unknown>; query?: Record<string, unknown> }, { id: string }> = {
  id: 'fms_products.price_types.delete',
  async prepare(input, ctx) {
    const id = requireId(input, 'Price type id required')
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadPriceTypeSnapshot(em, id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Price type id required')
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const priceType = await em.findOne(FmsPriceType, { id, deletedAt: null })
    const record = assertRecordFound(priceType, 'Price type not found')
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
      indexer: { entityType: 'fms_products:fms_price_type' },
    })

    return { id: record.id }
  },
  buildLog: async ({ snapshots }) => {
    const before = snapshots.before as FmsPriceTypeSnapshot | undefined
    if (!before) return null

    return {
      actionLabel: 'Delete price type',
      resourceKind: 'fms_products.price_type',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      payload: {
        undo: {
          before,
        } satisfies PriceTypeUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<PriceTypeUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    await applyPriceTypeSnapshot(em, before)

    const de = ctx.container.resolve('dataEngine') as DataEngine
    const priceType = await em.findOne(FmsPriceType, { id: before.id })
    if (priceType) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'created',
        entity: priceType,
        identifiers: {
          id: before.id,
          organizationId: before.organizationId,
          tenantId: before.tenantId,
        },
        indexer: { entityType: 'fms_products:fms_price_type' },
      })
    }
  },
}

registerCommand(createPriceTypeCommand)
registerCommand(updatePriceTypeCommand)
registerCommand(deletePriceTypeCommand)

export { createPriceTypeCommand, updatePriceTypeCommand, deletePriceTypeCommand }
