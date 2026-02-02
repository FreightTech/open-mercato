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
import {
  FmsProduct,
  FmsProductVariant,
  FmsProductPrice,
  FmsChargeCode,
} from '../data/entities'
import { Contractor } from '../../contractors/data/entities'
import { FmsLocation } from '../../fms_locations/data/entities'
import type { FmsProductSnapshot, ProductUndoPayload } from '../data/snapshots'
import {
  ensureTenantScope,
  ensureOrganizationScope,
  extractUndoPayload,
  assertRecordFound,
  loadProductSnapshot,
  applyProductSnapshot,
  applyVariantSnapshot,
  applyPriceSnapshot,
  getUserIdFromAuth,
} from './shared'

const createProductSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(255),
  productType: z.enum(['GFRT', 'GTHC', 'GBAF', 'GBAF_PIECE', 'GBOL', 'GCUS', 'CUSTOM']),
  chargeCodeId: z.string().uuid().optional().nullable(),
  serviceProviderId: z.string().uuid().optional().nullable(),
  internalNotes: z.string().max(5000).optional().nullable(),
  isActive: z.boolean().optional().default(true),
  loop: z.string().optional().nullable(),
  sourceId: z.string().uuid().optional().nullable(),
  destinationId: z.string().uuid().optional().nullable(),
  transitTime: z.number().int().positive().optional().nullable(),
  locationId: z.string().uuid().optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  createdBy: z.string().uuid().optional().nullable(),
})

const updateProductSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  chargeCodeId: z.string().uuid().optional().nullable(),
  serviceProviderId: z.string().uuid().optional().nullable(),
  internalNotes: z.string().max(5000).optional().nullable(),
  isActive: z.boolean().optional(),
  loop: z.string().optional().nullable(),
  sourceId: z.string().uuid().optional().nullable(),
  destinationId: z.string().uuid().optional().nullable(),
  transitTime: z.number().int().positive().optional().nullable(),
  locationId: z.string().uuid().optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
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

    // Verify charge code exists (if provided)
    let chargeCode: FmsChargeCode | null = null
    if (input.chargeCodeId) {
      chargeCode = await em.findOne(FmsChargeCode, { id: input.chargeCodeId, deletedAt: null })
      if (!chargeCode) {
        throw new Error('Charge code not found')
      }
    }

    // Verify service provider exists (if provided)
    let serviceProvider: Contractor | null = null
    if (input.serviceProviderId) {
      serviceProvider = await em.findOne(Contractor, { id: input.serviceProviderId })
      if (!serviceProvider) {
        throw new Error('Service provider not found')
      }
    }

    // Verify locations exist (if provided)
    let source: FmsLocation | null = null
    let destination: FmsLocation | null = null
    let location: FmsLocation | null = null

    if (input.sourceId) {
      source = await em.findOne(FmsLocation, { id: input.sourceId, deletedAt: null })
      if (!source) throw new Error('Source location not found')
    }
    if (input.destinationId) {
      destination = await em.findOne(FmsLocation, { id: input.destinationId, deletedAt: null })
      if (!destination) throw new Error('Destination location not found')
    }
    if (input.locationId) {
      location = await em.findOne(FmsLocation, { id: input.locationId, deletedAt: null })
      if (!location) throw new Error('Location not found')
    }

    const product = em.create(FmsProduct, {
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      name: input.name,
      productType: input.productType,
      chargeCode,
      serviceProvider,
      internalNotes: input.internalNotes ?? null,
      isActive: input.isActive ?? true,
      loop: input.loop ?? null,
      source,
      destination,
      transitTime: input.transitTime ?? null,
      location,
      description: input.description ?? null,
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

    // Delete variants and prices first
    const variants = await em.find(FmsProductVariant, { product })
    for (const variant of variants) {
      await em.nativeDelete(FmsProductPrice, { variant })
      em.remove(variant)
    }
    em.remove(product)
    await em.flush()
  },
}

const updateProductCommand: CommandHandler<UpdateProductInput, { id: string }> = {
  id: 'fms_products.products.update',
  async prepare(rawInput, ctx) {
    const input = updateProductSchema.parse(rawInput)
    const em = ctx.container.resolve('em') as EntityManager
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
    if (input.internalNotes !== undefined) record.internalNotes = input.internalNotes
    if (input.isActive !== undefined) record.isActive = input.isActive
    if (input.description !== undefined) record.description = input.description
    if (input.loop !== undefined) record.loop = input.loop
    if (input.transitTime !== undefined) record.transitTime = input.transitTime

    // Update charge code reference
    if (input.chargeCodeId !== undefined) {
      if (input.chargeCodeId === null) {
        record.chargeCode = null
      } else {
        const chargeCode = await em.findOne(FmsChargeCode, { id: input.chargeCodeId, deletedAt: null })
        if (!chargeCode) throw new Error('Charge code not found')
        record.chargeCode = chargeCode
      }
    }

    // Update service provider reference
    if (input.serviceProviderId !== undefined) {
      if (input.serviceProviderId === null) {
        record.serviceProvider = null
      } else {
        const provider = await em.findOne(Contractor, { id: input.serviceProviderId })
        if (!provider) throw new Error('Service provider not found')
        record.serviceProvider = provider
      }
    }

    // Update location references
    if (input.sourceId !== undefined) {
      if (input.sourceId === null) {
        record.source = null
      } else {
        const source = await em.findOne(FmsLocation, { id: input.sourceId, deletedAt: null })
        if (!source) throw new Error('Source location not found')
        record.source = source
      }
    }

    if (input.destinationId !== undefined) {
      if (input.destinationId === null) {
        record.destination = null
      } else {
        const destination = await em.findOne(FmsLocation, { id: input.destinationId, deletedAt: null })
        if (!destination) throw new Error('Destination location not found')
        record.destination = destination
      }
    }

    if (input.locationId !== undefined) {
      if (input.locationId === null) {
        record.location = null
      } else {
        const location = await em.findOne(FmsLocation, { id: input.locationId, deletedAt: null })
        if (!location) throw new Error('Location not found')
        record.location = location
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
    const before = snapshots.before as FmsProductSnapshot | undefined
    if (!before) return null

    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadProductSnapshot(em, result.id)

    const changeKeys = [
      'name',
      'chargeCodeId',
      'serviceProviderId',
      'internalNotes',
      'isActive',
      'loop',
      'sourceId',
      'destinationId',
      'transitTime',
      'locationId',
      'description',
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
    const em = ctx.container.resolve('em') as EntityManager
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

    // Soft delete the product (variants and prices cascade via DB)
    record.deletedAt = new Date()
    record.updatedBy = getUserIdFromAuth(ctx)

    // Also soft delete variants and prices
    const variants = await em.find(FmsProductVariant, { product: record, deletedAt: null })
    for (const variant of variants) {
      variant.deletedAt = new Date()
      const prices = await em.find(FmsProductPrice, { variant, deletedAt: null })
      for (const price of prices) {
        price.deletedAt = new Date()
      }
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

    // Restore variants and prices
    for (const variantSnapshot of before.variants) {
      await applyVariantSnapshot(em, variantSnapshot)
      for (const priceSnapshot of variantSnapshot.prices) {
        await applyPriceSnapshot(em, priceSnapshot)
      }
    }

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
