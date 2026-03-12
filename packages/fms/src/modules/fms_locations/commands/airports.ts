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
import {
  ensureTenantScope,
  ensureOrganizationScope,
  extractUndoPayload,
  assertRecordFound,
  loadLocationSnapshot,
  applyLocationSnapshot,
  getUserIdFromAuth,
} from './shared'

const createAirportSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string().min(2).max(4).regex(/^[A-Z]{2,4}$/, 'IATA code must be 2-4 uppercase letters'),
  name: z.string().min(1).max(255),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  city: z.string().max(255).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  isActive: z.boolean().optional().default(true),
  createdBy: z.string().uuid().optional().nullable(),
})

const updateAirportSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(2).max(4).regex(/^[A-Z]{2,4}$/, 'IATA code must be 2-4 uppercase letters').optional(),
  name: z.string().min(1).max(255).optional(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  city: z.string().max(255).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  isActive: z.boolean().optional(),
  updatedBy: z.string().uuid().optional().nullable(),
})

type CreateAirportInput = z.infer<typeof createAirportSchema>
type UpdateAirportInput = z.infer<typeof updateAirportSchema>

const createAirportCommand: CommandHandler<CreateAirportInput, { id: string }> = {
  id: 'fms_locations.airports.create',
  async execute(rawInput, ctx) {
    const input = createAirportSchema.parse(rawInput)
    ensureTenantScope(ctx, input.tenantId)
    ensureOrganizationScope(ctx, input.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const airport = em.create(FmsLocation, {
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      code: input.code,
      name: input.name,
      type: 'airport',
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      city: input.city ?? null,
      country: input.country ?? null,
      isActive: input.isActive ?? true,
      createdBy: input.createdBy ?? getUserIdFromAuth(ctx),
    })

    em.persist(airport)
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: airport,
      identifiers: {
        id: airport.id,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
      },
      indexer: { entityType: 'fms_locations:fms_location' },
    })

    return { id: airport.id }
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve('em') as EntityManager
    return await loadLocationSnapshot(em, result.id)
  },
  buildLog: async ({ result, ctx }) => {
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadLocationSnapshot(em, result.id)
    return {
      actionLabel: 'Create airport',
      resourceKind: 'fms_locations.airport',
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
    const airportId = logEntry?.resourceId ?? payload?.after?.id ?? null
    if (!airportId) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const airport = await em.findOne(FmsLocation, { id: airportId })
    if (!airport) return

    em.remove(airport)
    await em.flush()
  },
}

const updateAirportCommand: CommandHandler<UpdateAirportInput, { id: string }> = {
  id: 'fms_locations.airports.update',
  async prepare(rawInput, ctx) {
    const input = updateAirportSchema.parse(rawInput)
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadLocationSnapshot(em, input.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(rawInput, ctx) {
    const input = updateAirportSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const airport = await em.findOne(FmsLocation, { id: input.id, type: 'airport', deletedAt: null })
    const record = assertRecordFound(airport, 'Airport not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    if (input.code !== undefined) record.code = input.code
    if (input.name !== undefined) record.name = input.name
    if (input.lat !== undefined) record.lat = input.lat
    if (input.lng !== undefined) record.lng = input.lng
    if (input.city !== undefined) record.city = input.city
    if (input.country !== undefined) record.country = input.country
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
      indexer: { entityType: 'fms_locations:fms_location' },
    })

    return { id: record.id }
  },
  buildLog: async ({ ctx, snapshots, result }) => {
    const before = snapshots.before as FmsLocationSnapshot | undefined
    if (!before) return null

    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadLocationSnapshot(em, result.id)

    const changeKeys = ['code', 'name', 'lat', 'lng', 'city', 'country', 'isActive'] as const

    const changes = afterSnapshot
      ? buildChanges(
          before as Record<string, unknown>,
          afterSnapshot as Record<string, unknown>,
          changeKeys
        )
      : {}

    return {
      actionLabel: 'Update airport',
      resourceKind: 'fms_locations.airport',
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
    const airport = await em.findOne(FmsLocation, { id: before.id })
    if (airport) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'updated',
        entity: airport,
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

const deleteAirportCommand: CommandHandler<{ id?: string; body?: Record<string, unknown>; query?: Record<string, unknown> }, { id: string }> = {
  id: 'fms_locations.airports.delete',
  async prepare(input, ctx) {
    const id = requireId(input, 'Airport id required')
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadLocationSnapshot(em, id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Airport id required')
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const airport = await em.findOne(FmsLocation, { id, type: 'airport', deletedAt: null })
    const record = assertRecordFound(airport, 'Airport not found')
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
      actionLabel: 'Delete airport',
      resourceKind: 'fms_locations.airport',
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
    const airport = await em.findOne(FmsLocation, { id: before.id })
    if (airport) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'created',
        entity: airport,
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

registerCommand(createAirportCommand)
registerCommand(updateAirportCommand)
registerCommand(deleteAirportCommand)

export { createAirportCommand, updateAirportCommand, deleteAirportCommand }
