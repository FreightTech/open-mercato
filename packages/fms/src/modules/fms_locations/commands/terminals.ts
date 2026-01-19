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

const createTerminalSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  portId: z.string().uuid().optional().nullable(),
  locode: z.string().max(10).optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  city: z.string().max(255).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  createdBy: z.string().uuid().optional().nullable(),
})

const updateTerminalSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(255).optional(),
  portId: z.string().uuid().optional().nullable(),
  locode: z.string().max(10).optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  city: z.string().max(255).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  updatedBy: z.string().uuid().optional().nullable(),
})

type CreateTerminalInput = z.infer<typeof createTerminalSchema>
type UpdateTerminalInput = z.infer<typeof updateTerminalSchema>

const createTerminalCommand: CommandHandler<CreateTerminalInput, { id: string }> = {
  id: 'fms_locations.terminals.create',
  async execute(rawInput, ctx) {
    const input = createTerminalSchema.parse(rawInput)
    ensureTenantScope(ctx, input.tenantId)
    ensureOrganizationScope(ctx, input.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    // Verify port exists if provided
    if (input.portId) {
      const port = await em.findOne(FmsLocation, { id: input.portId, type: 'port', deletedAt: null })
      if (!port) {
        throw new Error('Port not found')
      }
    }

    const terminal = em.create(FmsLocation, {
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      code: input.code,
      name: input.name,
      type: 'terminal',
      portId: input.portId ?? null,
      locode: input.locode ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      city: input.city ?? null,
      country: input.country ?? null,
      createdBy: input.createdBy ?? getUserIdFromAuth(ctx),
    })

    em.persist(terminal)
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: terminal,
      identifiers: {
        id: terminal.id,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
      },
    })

    return { id: terminal.id }
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve('em') as EntityManager
    return await loadLocationSnapshot(em, result.id)
  },
  buildLog: async ({ result, ctx }) => {
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadLocationSnapshot(em, result.id)
    return {
      actionLabel: 'Create terminal',
      resourceKind: 'fms_locations.terminal',
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
    const terminalId = logEntry?.resourceId ?? payload?.after?.id ?? null
    if (!terminalId) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const terminal = await em.findOne(FmsLocation, { id: terminalId })
    if (!terminal) return

    em.remove(terminal)
    await em.flush()
  },
}

const updateTerminalCommand: CommandHandler<UpdateTerminalInput, { id: string }> = {
  id: 'fms_locations.terminals.update',
  async prepare(rawInput, ctx) {
    const input = updateTerminalSchema.parse(rawInput)
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadLocationSnapshot(em, input.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(rawInput, ctx) {
    const input = updateTerminalSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const terminal = await em.findOne(FmsLocation, { id: input.id, type: 'terminal', deletedAt: null })
    const record = assertRecordFound(terminal, 'Terminal not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    // Verify port exists if being updated
    if (input.portId !== undefined && input.portId !== null) {
      const port = await em.findOne(FmsLocation, { id: input.portId, type: 'port', deletedAt: null })
      if (!port) {
        throw new Error('Port not found')
      }
    }

    if (input.code !== undefined) record.code = input.code
    if (input.name !== undefined) record.name = input.name
    if (input.portId !== undefined) record.portId = input.portId
    if (input.locode !== undefined) record.locode = input.locode
    if (input.lat !== undefined) record.lat = input.lat
    if (input.lng !== undefined) record.lng = input.lng
    if (input.city !== undefined) record.city = input.city
    if (input.country !== undefined) record.country = input.country

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
    const before = snapshots.before as FmsLocationSnapshot | undefined
    if (!before) return null

    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadLocationSnapshot(em, result.id)

    const changeKeys = ['code', 'name', 'portId', 'locode', 'lat', 'lng', 'city', 'country'] as const

    const changes = afterSnapshot
      ? buildChanges(
          before as Record<string, unknown>,
          afterSnapshot as Record<string, unknown>,
          changeKeys
        )
      : {}

    return {
      actionLabel: 'Update terminal',
      resourceKind: 'fms_locations.terminal',
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
    const terminal = await em.findOne(FmsLocation, { id: before.id })
    if (terminal) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'updated',
        entity: terminal,
        identifiers: {
          id: before.id,
          organizationId: before.organizationId,
          tenantId: before.tenantId,
        },
      })
    }
  },
}

const deleteTerminalCommand: CommandHandler<{ id?: string; body?: Record<string, unknown>; query?: Record<string, unknown> }, { id: string }> = {
  id: 'fms_locations.terminals.delete',
  async prepare(input, ctx) {
    const id = requireId(input, 'Terminal id required')
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadLocationSnapshot(em, id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Terminal id required')
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const terminal = await em.findOne(FmsLocation, { id, type: 'terminal', deletedAt: null })
    const record = assertRecordFound(terminal, 'Terminal not found')
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
    })

    return { id: record.id }
  },
  buildLog: async ({ snapshots }) => {
    const before = snapshots.before as FmsLocationSnapshot | undefined
    if (!before) return null

    return {
      actionLabel: 'Delete terminal',
      resourceKind: 'fms_locations.terminal',
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
    const terminal = await em.findOne(FmsLocation, { id: before.id })
    if (terminal) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'created',
        entity: terminal,
        identifiers: {
          id: before.id,
          organizationId: before.organizationId,
          tenantId: before.tenantId,
        },
      })
    }
  },
}

registerCommand(createTerminalCommand)
registerCommand(updateTerminalCommand)
registerCommand(deleteTerminalCommand)

export { createTerminalCommand, updateTerminalCommand, deleteTerminalCommand }
