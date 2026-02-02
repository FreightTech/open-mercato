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
import { FmsProductVariant, FmsProductPrice } from '../data/entities'
import type { FmsProductPriceSnapshot, PriceUndoPayload } from '../data/snapshots'
import {
  ensureTenantScope,
  ensureOrganizationScope,
  extractUndoPayload,
  assertRecordFound,
  loadPriceSnapshot,
  applyPriceSnapshot,
  getUserIdFromAuth,
} from './shared'

const contractTypeSchema = z.enum(['SPOT', 'NAC', 'BASKET'])

const createPriceSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  variantId: z.string().uuid(),
  validityStart: z.coerce.date(),
  validityEnd: z.coerce.date().optional().nullable(),
  contractType: contractTypeSchema,
  contractNumber: z.string().max(255).optional().nullable(),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Price must be a valid decimal with up to 2 decimal places'),
  currencyCode: z.string().length(3).regex(/^[A-Z]{3}$/, 'Currency code must be 3 uppercase letters').default('USD'),
  isActive: z.boolean().optional().default(true),
  createdBy: z.string().uuid().optional().nullable(),
})

const updatePriceSchema = z.object({
  id: z.string().uuid(),
  validityStart: z.coerce.date().optional(),
  validityEnd: z.coerce.date().optional().nullable(),
  contractType: contractTypeSchema.optional(),
  contractNumber: z.string().max(255).optional().nullable(),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Price must be a valid decimal with up to 2 decimal places').optional(),
  currencyCode: z.string().length(3).regex(/^[A-Z]{3}$/, 'Currency code must be 3 uppercase letters').optional(),
  isActive: z.boolean().optional(),
  updatedBy: z.string().uuid().optional().nullable(),
})

type CreatePriceInput = z.infer<typeof createPriceSchema>
type UpdatePriceInput = z.infer<typeof updatePriceSchema>

const createPriceCommand: CommandHandler<CreatePriceInput, { id: string }> = {
  id: 'fms_products.prices.create',
  async execute(rawInput, ctx) {
    const input = createPriceSchema.parse(rawInput)
    ensureTenantScope(ctx, input.tenantId)
    ensureOrganizationScope(ctx, input.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    // Verify variant exists
    const variant = await em.findOne(FmsProductVariant, {
      id: input.variantId,
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      deletedAt: null,
    })
    if (!variant) {
      throw new Error('Variant not found')
    }

    // Validate date range
    if (input.validityEnd && input.validityStart > input.validityEnd) {
      throw new Error('Validity end date must be after start date')
    }

    const price = em.create(FmsProductPrice, {
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      variant,
      validityStart: input.validityStart,
      validityEnd: input.validityEnd ?? null,
      contractType: input.contractType,
      contractNumber: input.contractNumber ?? null,
      price: input.price,
      currencyCode: input.currencyCode ?? 'USD',
      isActive: input.isActive ?? true,
      createdBy: input.createdBy ?? getUserIdFromAuth(ctx),
    })

    em.persist(price)
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: price,
      identifiers: {
        id: price.id,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
      },
    })

    return { id: price.id }
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve('em') as EntityManager
    return await loadPriceSnapshot(em, result.id)
  },
  buildLog: async ({ result, ctx }) => {
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadPriceSnapshot(em, result.id)
    return {
      actionLabel: 'Create product price',
      resourceKind: 'fms_products.price',
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
    const payload = extractUndoPayload<PriceUndoPayload>(logEntry)
    const priceId = logEntry?.resourceId ?? payload?.after?.id ?? null
    if (!priceId) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const price = await em.findOne(FmsProductPrice, { id: priceId })
    if (!price) return

    em.remove(price)
    await em.flush()
  },
}

const updatePriceCommand: CommandHandler<UpdatePriceInput, { id: string }> = {
  id: 'fms_products.prices.update',
  async prepare(rawInput, ctx) {
    const input = updatePriceSchema.parse(rawInput)
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadPriceSnapshot(em, input.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(rawInput, ctx) {
    const input = updatePriceSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const price = await em.findOne(FmsProductPrice, { id: input.id, deletedAt: null }, {
      populate: ['variant'],
    })
    const record = assertRecordFound(price, 'Price not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    if (input.validityStart !== undefined) record.validityStart = input.validityStart
    if (input.validityEnd !== undefined) record.validityEnd = input.validityEnd
    if (input.contractType !== undefined) record.contractType = input.contractType
    if (input.contractNumber !== undefined) record.contractNumber = input.contractNumber
    if (input.price !== undefined) record.price = input.price
    if (input.currencyCode !== undefined) record.currencyCode = input.currencyCode
    if (input.isActive !== undefined) record.isActive = input.isActive

    // Validate date range
    if (record.validityEnd && record.validityStart > record.validityEnd) {
      throw new Error('Validity end date must be after start date')
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
    const before = snapshots.before as FmsProductPriceSnapshot | undefined
    if (!before) return null

    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadPriceSnapshot(em, result.id)

    const changeKeys = [
      'validityStart',
      'validityEnd',
      'contractType',
      'contractNumber',
      'price',
      'currencyCode',
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
      actionLabel: 'Update product price',
      resourceKind: 'fms_products.price',
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
        } satisfies PriceUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<PriceUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    await applyPriceSnapshot(em, before)

    const de = ctx.container.resolve('dataEngine') as DataEngine
    const price = await em.findOne(FmsProductPrice, { id: before.id })
    if (price) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'updated',
        entity: price,
        identifiers: {
          id: before.id,
          organizationId: before.organizationId,
          tenantId: before.tenantId,
        },
      })
    }
  },
}

const deletePriceCommand: CommandHandler<{ id?: string; body?: Record<string, unknown>; query?: Record<string, unknown> }, { id: string }> = {
  id: 'fms_products.prices.delete',
  async prepare(input, ctx) {
    const id = requireId(input, 'Price id required')
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadPriceSnapshot(em, id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Price id required')
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const price = await em.findOne(FmsProductPrice, { id, deletedAt: null })
    const record = assertRecordFound(price, 'Price not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    // Soft delete the price
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
    const before = snapshots.before as FmsProductPriceSnapshot | undefined
    if (!before) return null

    return {
      actionLabel: 'Delete product price',
      resourceKind: 'fms_products.price',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      payload: {
        undo: {
          before,
        } satisfies PriceUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<PriceUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    await applyPriceSnapshot(em, before)

    const de = ctx.container.resolve('dataEngine') as DataEngine
    const price = await em.findOne(FmsProductPrice, { id: before.id })
    if (price) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'created',
        entity: price,
        identifiers: {
          id: before.id,
          organizationId: before.organizationId,
          tenantId: before.tenantId,
        },
      })
    }
  },
}

registerCommand(createPriceCommand)
registerCommand(updatePriceCommand)
registerCommand(deletePriceCommand)

export { createPriceCommand, updatePriceCommand, deletePriceCommand }
