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
import { FmsLocation } from '../data/entities'
import type { FmsLocationSnapshot, LocationUndoPayload } from '../data/snapshots'
import { locationTypeSchema, contractorAddressTypeSchema } from '../data/validators'
import {
  ensureTenantScope,
  ensureOrganizationScope,
  extractUndoPayload,
  assertRecordFound,
  loadLocationSnapshot,
  applyLocationSnapshot,
  getUserIdFromAuth,
} from './shared'

// ========================================
// Unified Location Create Command
// ========================================

const createUnifiedLocationSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string().max(50).optional().nullable(),
  name: z.string().min(1).max(255),
  type: locationTypeSchema,
  locode: z.string().max(10).optional().nullable(),
  portId: z.string().uuid().optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  city: z.string().max(255).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  contractorId: z.string().uuid().optional().nullable(),
  addressLine1: z.string().max(500).optional().nullable(),
  addressLine2: z.string().max(500).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  isPrimary: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  googlePlaceId: z.string().max(500).optional().nullable(),
  createdBy: z.string().uuid().optional().nullable(),
})

const updateUnifiedLocationSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(255).optional(),
  type: locationTypeSchema.optional(),
  locode: z.string().max(10).optional().nullable(),
  portId: z.string().uuid().optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  city: z.string().max(255).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  contractorId: z.string().uuid().optional().nullable(),
  addressLine1: z.string().max(500).optional().nullable(),
  addressLine2: z.string().max(500).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  isPrimary: z.boolean().optional(),
  isActive: z.boolean().optional(),
  googlePlaceId: z.string().max(500).optional().nullable(),
  updatedBy: z.string().uuid().optional().nullable(),
})

type CreateUnifiedLocationInput = z.infer<typeof createUnifiedLocationSchema>
type UpdateUnifiedLocationInput = z.infer<typeof updateUnifiedLocationSchema>

const createUnifiedLocationCommand: CommandHandler<CreateUnifiedLocationInput, { id: string }> = {
  id: 'fms_locations.unified.create',
  async execute(rawInput, ctx) {
    const input = createUnifiedLocationSchema.parse(rawInput)
    ensureTenantScope(ctx, input.tenantId)
    ensureOrganizationScope(ctx, input.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    // Auto-generate code from postal code if not provided (for addresses)
    let code = input.code
    if (!code) {
      const isContractorAddress = input.type?.startsWith('contractor_')
      if (isContractorAddress && input.postalCode) {
        code = input.postalCode.trim()
      } else if (input.city) {
        code = input.city.toUpperCase().substring(0, 10).replace(/\s+/g, '-')
      } else {
        // Fallback to a unique code based on name
        code = input.name.toUpperCase().substring(0, 10).replace(/\s+/g, '-')
      }
    }

    const location = em.create(FmsLocation, {
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      code,
      name: input.name,
      type: input.type,
      locode: input.locode ?? null,
      portId: input.portId ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      city: input.city ?? null,
      country: input.country ?? null,
      contractorId: input.contractorId ?? null,
      addressLine1: input.addressLine1 ?? null,
      addressLine2: input.addressLine2 ?? null,
      state: input.state ?? null,
      postalCode: input.postalCode ?? null,
      isPrimary: input.isPrimary ?? false,
      isActive: input.isActive ?? true,
      googlePlaceId: input.googlePlaceId ?? null,
      createdBy: input.createdBy ?? getUserIdFromAuth(ctx),
    })

    em.persist(location)
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: location,
      identifiers: {
        id: location.id,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
      },
      indexer: { entityType: 'fms_locations:fms_location' },
    })

    return { id: location.id }
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve('em') as EntityManager
    return await loadLocationSnapshot(em, result.id)
  },
  buildLog: async ({ result, ctx }) => {
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadLocationSnapshot(em, result.id)
    return {
      actionLabel: 'Create location',
      resourceKind: 'fms_locations.location',
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
    const payload = extractUndoPayload<LocationUndoPayload>(logEntry)
    const locationId = logEntry?.resourceId ?? payload?.after?.id ?? null
    if (!locationId) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const location = await em.findOne(FmsLocation, { id: locationId })
    if (!location) return

    em.remove(location)
    await em.flush()
  },
}

const updateUnifiedLocationCommand: CommandHandler<UpdateUnifiedLocationInput, { id: string }> = {
  id: 'fms_locations.unified.update',
  async prepare(rawInput, ctx) {
    const input = updateUnifiedLocationSchema.parse(rawInput)
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadLocationSnapshot(em, input.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(rawInput, ctx) {
    const input = updateUnifiedLocationSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const location = await em.findOne(FmsLocation, { id: input.id, deletedAt: null })
    const record = assertRecordFound(location, 'Location not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    // Update all provided fields
    if (input.code !== undefined) record.code = input.code
    if (input.name !== undefined) record.name = input.name
    if (input.type !== undefined) record.type = input.type
    if (input.locode !== undefined) record.locode = input.locode
    if (input.portId !== undefined) record.portId = input.portId
    if (input.lat !== undefined) record.lat = input.lat
    if (input.lng !== undefined) record.lng = input.lng
    if (input.city !== undefined) record.city = input.city
    if (input.country !== undefined) record.country = input.country
    if (input.contractorId !== undefined) record.contractorId = input.contractorId
    if (input.addressLine1 !== undefined) record.addressLine1 = input.addressLine1
    if (input.addressLine2 !== undefined) record.addressLine2 = input.addressLine2
    if (input.state !== undefined) record.state = input.state
    if (input.postalCode !== undefined) record.postalCode = input.postalCode
    if (input.isPrimary !== undefined) record.isPrimary = input.isPrimary
    if (input.isActive !== undefined) record.isActive = input.isActive
    if (input.googlePlaceId !== undefined) record.googlePlaceId = input.googlePlaceId

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
      indexer: { entityType: 'fms_locations:fms_location' },
    })

    return { id: record.id }
  },
  buildLog: async ({ ctx, snapshots, result }) => {
    const before = snapshots.before as FmsLocationSnapshot | undefined
    if (!before) return null

    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadLocationSnapshot(em, result.id)

    const changeKeys = [
      'code',
      'name',
      'type',
      'locode',
      'portId',
      'lat',
      'lng',
      'city',
      'country',
      'contractorId',
      'addressLine1',
      'addressLine2',
      'state',
      'postalCode',
      'isPrimary',
      'isActive',
      'googlePlaceId',
    ] as const

    const changes = afterSnapshot
      ? buildChanges(
          before as Record<string, unknown>,
          afterSnapshot as Record<string, unknown>,
          changeKeys
        )
      : {}

    return {
      actionLabel: 'Update location',
      resourceKind: 'fms_locations.location',
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
        } satisfies LocationUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<LocationUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    await applyLocationSnapshot(em, before)

    const de = ctx.container.resolve('dataEngine') as DataEngine
    const location = await em.findOne(FmsLocation, { id: before.id })
    if (location) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'updated',
        entity: location,
        identifiers: {
          id: before.id,
          organizationId: before.organizationId,
          tenantId: before.tenantId,
        },
        indexer: { entityType: 'fms_locations:fms_location' },
      })
    }
  },
}

const deleteUnifiedLocationCommand: CommandHandler<
  { id?: string; body?: Record<string, unknown>; query?: Record<string, unknown> },
  { id: string }
> = {
  id: 'fms_locations.unified.delete',
  async prepare(input, ctx) {
    const id = requireId(input, 'Location id required')
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadLocationSnapshot(em, id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Location id required')
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const location = await em.findOne(FmsLocation, { id, deletedAt: null })
    const record = assertRecordFound(location, 'Location not found')
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
      indexer: { entityType: 'fms_locations:fms_location' },
    })

    return { id: record.id }
  },
  buildLog: async ({ snapshots }) => {
    const before = snapshots.before as FmsLocationSnapshot | undefined
    if (!before) return null

    return {
      actionLabel: 'Delete location',
      resourceKind: 'fms_locations.location',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      payload: {
        undo: {
          before,
        } satisfies LocationUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<LocationUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    await applyLocationSnapshot(em, before)

    const de = ctx.container.resolve('dataEngine') as DataEngine
    const location = await em.findOne(FmsLocation, { id: before.id })
    if (location) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'created',
        entity: location,
        identifiers: {
          id: before.id,
          organizationId: before.organizationId,
          tenantId: before.tenantId,
        },
        indexer: { entityType: 'fms_locations:fms_location' },
      })
    }
  },
}

// Register commands
registerCommand(createUnifiedLocationCommand)
registerCommand(updateUnifiedLocationCommand)
registerCommand(deleteUnifiedLocationCommand)

export {
  createUnifiedLocationCommand,
  updateUnifiedLocationCommand,
  deleteUnifiedLocationCommand,
}
