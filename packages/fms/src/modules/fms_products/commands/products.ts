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
import { FmsProduct } from '../data/entities'
import { chargeUnitSchema, productTransportModeSchema } from '../data/validators'
import type { FmsProductSnapshot, ProductUndoPayload } from '../data/snapshots'
import {
  ensureTenantScope,
  ensureOrganizationScope,
  extractUndoPayload,
  assertRecordFound,
  loadProductSnapshot,
  applyProductSnapshot,
  getUserIdFromAuth,
} from './shared'

const createProductSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(255),
  chargeCode: z.string().max(50).optional().nullable(),
  chargeUnit: chargeUnitSchema.optional().nullable(),
  transportMode: productTransportModeSchema.optional().nullable(),
  isActive: z.boolean().optional().default(true),
  createdBy: z.string().uuid().optional().nullable(),
})

const updateProductSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  chargeCode: z.string().max(50).optional().nullable(),
  chargeUnit: chargeUnitSchema.optional().nullable(),
  transportMode: productTransportModeSchema.optional().nullable(),
  isActive: z.boolean().optional(),
  updatedBy: z.string().uuid().optional().nullable(),
})

type CreateProductInput = z.infer<typeof createProductSchema>
type UpdateProductInput = z.infer<typeof updateProductSchema>

const createProductCommand: CommandHandler<CreateProductInput, { id: string }> = {
  id: 'fms_products.products.create',
  async execute(rawInput, ctx) {
    const input = createProductSchema.parse(rawInput)
    ensureTenantScope(ctx, input.tenantId)
    ensureOrganizationScope(ctx, input.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const product = em.create(FmsProduct, {
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      name: input.name,
      chargeCode: input.chargeCode ?? null,
      chargeUnit: input.chargeUnit ?? null,
      transportMode: input.transportMode ?? null,
      isActive: input.isActive ?? true,
      createdBy: input.createdBy ?? getUserIdFromAuth(ctx),
    })

    em.persist(product)
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: product,
      identifiers: {
        id: product.id,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
      },
    })

    return { id: product.id }
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve('em') as EntityManager
    return await loadProductSnapshot(em, result.id)
  },
  buildLog: async ({ result, ctx }) => {
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadProductSnapshot(em, result.id)
    return {
      actionLabel: 'Create product',
      resourceKind: 'fms_products.product',
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
    const payload = extractUndoPayload<ProductUndoPayload>(logEntry)
    const productId = logEntry?.resourceId ?? payload?.after?.id ?? null
    if (!productId) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const product = await em.findOne(FmsProduct, { id: productId })
    if (!product) return

    em.remove(product)
    await em.flush()
  },
}

const updateProductCommand: CommandHandler<UpdateProductInput, { id: string }> = {
  id: 'fms_products.products.update',
  async prepare(rawInput, ctx) {
    const input = updateProductSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const snapshot = await loadProductSnapshot(em, input.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(rawInput, ctx) {
    const input = updateProductSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const product = await em.findOne(FmsProduct, { id: input.id, deletedAt: null })
    const record = assertRecordFound(product, 'Product not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    if (input.name !== undefined) record.name = input.name
    if (input.chargeCode !== undefined) record.chargeCode = input.chargeCode
    if (input.chargeUnit !== undefined) record.chargeUnit = input.chargeUnit
    if (input.transportMode !== undefined) record.transportMode = input.transportMode
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
    })

    return { id: record.id }
  },
  buildLog: async ({ ctx, snapshots, result }) => {
    const before = snapshots.before as FmsProductSnapshot | undefined
    if (!before) return null

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const afterSnapshot = await loadProductSnapshot(em, result.id)

    const changeKeys = [
      'name',
      'chargeCode',
      'chargeUnit',
      'transportMode',
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
      actionLabel: 'Update product',
      resourceKind: 'fms_products.product',
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
        } satisfies ProductUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<ProductUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    await applyProductSnapshot(em, before)

    const de = ctx.container.resolve('dataEngine') as DataEngine
    const product = await em.findOne(FmsProduct, { id: before.id })
    if (product) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'updated',
        entity: product,
        identifiers: {
          id: before.id,
          organizationId: before.organizationId,
          tenantId: before.tenantId,
        },
      })
    }
  },
}

const deleteProductCommand: CommandHandler<{ id?: string; body?: Record<string, unknown>; query?: Record<string, unknown> }, { id: string }> = {
  id: 'fms_products.products.delete',
  async prepare(input, ctx) {
    const id = requireId(input, 'Product id required')
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const snapshot = await loadProductSnapshot(em, id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Product id required')
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const product = await em.findOne(FmsProduct, { id, deletedAt: null })
    const record = assertRecordFound(product, 'Product not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    // Soft delete the product
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
    })

    return { id: record.id }
  },
  buildLog: async ({ snapshots }) => {
    const before = snapshots.before as FmsProductSnapshot | undefined
    if (!before) return null

    return {
      actionLabel: 'Delete product',
      resourceKind: 'fms_products.product',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      payload: {
        undo: {
          before,
        } satisfies ProductUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<ProductUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    // Restore the product
    await applyProductSnapshot(em, before)

    const de = ctx.container.resolve('dataEngine') as DataEngine
    const product = await em.findOne(FmsProduct, { id: before.id })
    if (product) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'created',
        entity: product,
        identifiers: {
          id: before.id,
          organizationId: before.organizationId,
          tenantId: before.tenantId,
        },
      })
    }
  },
}

registerCommand(createProductCommand)
registerCommand(updateProductCommand)
registerCommand(deleteProductCommand)

export { createProductCommand, updateProductCommand, deleteProductCommand }
