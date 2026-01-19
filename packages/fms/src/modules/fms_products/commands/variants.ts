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
import { FmsProduct, FmsProductVariant, FmsProductPrice } from '../data/entities'
import { Contractor } from '../../contractors/data/entities'
import type { FmsProductVariantSnapshot, VariantUndoPayload } from '../data/snapshots'
import {
  ensureTenantScope,
  ensureOrganizationScope,
  extractUndoPayload,
  assertRecordFound,
  loadVariantSnapshot,
  applyVariantSnapshot,
  applyPriceSnapshot,
  getUserIdFromAuth,
} from './shared'

const createVariantSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  productId: z.string().uuid(),
  providerId: z.string().uuid().optional().nullable(),
  variantType: z.enum(['container', 'simple']).optional().default('container'),
  name: z.string().max(255).optional().nullable(),
  isDefault: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  containerSize: z.string().max(20).optional().nullable(),
  containerType: z.string().max(50).optional().nullable(),
  weightLimit: z.number().positive().optional().nullable(),
  weightUnit: z.string().max(10).optional().nullable(),
  createdBy: z.string().uuid().optional().nullable(),
})

const updateVariantSchema = z.object({
  id: z.string().uuid(),
  providerId: z.string().uuid().optional().nullable(),
  name: z.string().max(255).optional().nullable(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  containerSize: z.string().max(20).optional().nullable(),
  containerType: z.string().max(50).optional().nullable(),
  weightLimit: z.number().positive().optional().nullable(),
  weightUnit: z.string().max(10).optional().nullable(),
  updatedBy: z.string().uuid().optional().nullable(),
})

type CreateVariantInput = z.infer<typeof createVariantSchema>
type UpdateVariantInput = z.infer<typeof updateVariantSchema>

const createVariantCommand: CommandHandler<CreateVariantInput, { id: string }> = {
  id: 'fms_products.variants.create',
  async execute(rawInput, ctx) {
    const input = createVariantSchema.parse(rawInput)
    ensureTenantScope(ctx, input.tenantId)
    ensureOrganizationScope(ctx, input.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    // Verify product exists
    const product = await em.findOne(FmsProduct, {
      id: input.productId,
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      deletedAt: null,
    })
    if (!product) {
      throw new Error('Product not found')
    }

    // Verify provider exists (if provided)
    let provider: Contractor | null = null
    if (input.providerId) {
      provider = await em.findOne(Contractor, { id: input.providerId })
      if (!provider) {
        throw new Error('Provider not found')
      }
    }

    const variant = em.create(FmsProductVariant, {
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      product,
      provider,
      variantType: input.variantType ?? 'container',
      name: input.name ?? null,
      isDefault: input.isDefault ?? false,
      isActive: input.isActive ?? true,
      containerSize: input.containerSize ?? null,
      containerType: input.containerType ?? null,
      weightLimit: input.weightLimit ?? null,
      weightUnit: input.weightUnit ?? null,
      createdBy: input.createdBy ?? getUserIdFromAuth(ctx),
    })

    em.persist(variant)
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: variant,
      identifiers: {
        id: variant.id,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
      },
    })

    return { id: variant.id }
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve('em') as EntityManager
    return await loadVariantSnapshot(em, result.id)
  },
  buildLog: async ({ result, ctx }) => {
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadVariantSnapshot(em, result.id)
    return {
      actionLabel: 'Create product variant',
      resourceKind: 'fms_products.variant',
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
    const payload = extractUndoPayload<VariantUndoPayload>(logEntry)
    const variantId = logEntry?.resourceId ?? payload?.after?.id ?? null
    if (!variantId) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const variant = await em.findOne(FmsProductVariant, { id: variantId })
    if (!variant) return

    // Delete prices first
    await em.nativeDelete(FmsProductPrice, { variant })
    em.remove(variant)
    await em.flush()
  },
}

const updateVariantCommand: CommandHandler<UpdateVariantInput, { id: string }> = {
  id: 'fms_products.variants.update',
  async prepare(rawInput, ctx) {
    const input = updateVariantSchema.parse(rawInput)
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadVariantSnapshot(em, input.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(rawInput, ctx) {
    const input = updateVariantSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const variant = await em.findOne(FmsProductVariant, { id: input.id, deletedAt: null }, {
      populate: ['provider'],
    })
    const record = assertRecordFound(variant, 'Variant not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    if (input.name !== undefined) record.name = input.name
    if (input.isDefault !== undefined) record.isDefault = input.isDefault
    if (input.isActive !== undefined) record.isActive = input.isActive
    if (input.containerSize !== undefined) record.containerSize = input.containerSize
    if (input.containerType !== undefined) record.containerType = input.containerType
    if (input.weightLimit !== undefined) record.weightLimit = input.weightLimit
    if (input.weightUnit !== undefined) record.weightUnit = input.weightUnit

    // Update provider reference
    if (input.providerId !== undefined) {
      if (input.providerId === null) {
        record.provider = null
      } else {
        const provider = await em.findOne(Contractor, { id: input.providerId })
        if (!provider) throw new Error('Provider not found')
        record.provider = provider
      }
    }

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
    const before = snapshots.before as FmsProductVariantSnapshot | undefined
    if (!before) return null

    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadVariantSnapshot(em, result.id)

    const changeKeys = [
      'providerId',
      'name',
      'isDefault',
      'isActive',
      'containerSize',
      'containerType',
      'weightLimit',
      'weightUnit',
    ] as const

    const changes = afterSnapshot
      ? buildChanges(
          before as Record<string, unknown>,
          afterSnapshot as Record<string, unknown>,
          changeKeys
        )
      : {}

    return {
      actionLabel: 'Update product variant',
      resourceKind: 'fms_products.variant',
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
        } satisfies VariantUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<VariantUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    await applyVariantSnapshot(em, before)

    const de = ctx.container.resolve('dataEngine') as DataEngine
    const variant = await em.findOne(FmsProductVariant, { id: before.id })
    if (variant) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'updated',
        entity: variant,
        identifiers: {
          id: before.id,
          organizationId: before.organizationId,
          tenantId: before.tenantId,
        },
      })
    }
  },
}

const deleteVariantCommand: CommandHandler<{ id?: string; body?: Record<string, unknown>; query?: Record<string, unknown> }, { id: string }> = {
  id: 'fms_products.variants.delete',
  async prepare(input, ctx) {
    const id = requireId(input, 'Variant id required')
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadVariantSnapshot(em, id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Variant id required')
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const variant = await em.findOne(FmsProductVariant, { id, deletedAt: null })
    const record = assertRecordFound(variant, 'Variant not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    // Soft delete the variant and its prices
    record.deletedAt = new Date()
    record.updatedBy = getUserIdFromAuth(ctx)

    const prices = await em.find(FmsProductPrice, { variant: record, deletedAt: null })
    for (const price of prices) {
      price.deletedAt = new Date()
    }

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
    const before = snapshots.before as FmsProductVariantSnapshot | undefined
    if (!before) return null

    return {
      actionLabel: 'Delete product variant',
      resourceKind: 'fms_products.variant',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      payload: {
        undo: {
          before,
        } satisfies VariantUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<VariantUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    // Restore the variant
    await applyVariantSnapshot(em, before)

    // Restore prices
    for (const priceSnapshot of before.prices) {
      await applyPriceSnapshot(em, priceSnapshot)
    }

    const de = ctx.container.resolve('dataEngine') as DataEngine
    const variant = await em.findOne(FmsProductVariant, { id: before.id })
    if (variant) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'created',
        entity: variant,
        identifiers: {
          id: before.id,
          organizationId: before.organizationId,
          tenantId: before.tenantId,
        },
      })
    }
  },
}

registerCommand(createVariantCommand)
registerCommand(updateVariantCommand)
registerCommand(deleteVariantCommand)

export { createVariantCommand, updateVariantCommand, deleteVariantCommand }
