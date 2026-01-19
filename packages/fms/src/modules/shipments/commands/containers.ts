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
import { Shipment, ShipmentContainer, ContainerType, ContainerStatus } from '../data/entities'
import type { ShipmentContainerSnapshot, ContainerUndoPayload } from '../data/snapshots'
import {
  ensureTenantScope,
  ensureOrganizationScope,
  extractUndoPayload,
  assertRecordFound,
  loadContainerSnapshot,
  applyContainerSnapshot,
} from './shared'

const createContainerSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  shipmentId: z.string().uuid(),
  containerNumber: z.string().optional().nullable(),
  containerType: z.nativeEnum(ContainerType),
  cargoDescription: z.string().optional().nullable(),
  status: z.nativeEnum(ContainerStatus).optional(),
  currentLocation: z.string().optional().nullable(),
  gateInDate: z.coerce.date().optional().nullable(),
  loadedOnVesselDate: z.coerce.date().optional().nullable(),
  dischargedDate: z.coerce.date().optional().nullable(),
  gateOutDate: z.coerce.date().optional().nullable(),
  emptyReturnDate: z.coerce.date().optional().nullable(),
})

const updateContainerSchema = z.object({
  id: z.string().uuid(),
  containerNumber: z.string().optional().nullable(),
  containerType: z.nativeEnum(ContainerType).optional(),
  cargoDescription: z.string().optional().nullable(),
  status: z.nativeEnum(ContainerStatus).optional(),
  currentLocation: z.string().optional().nullable(),
  gateInDate: z.coerce.date().optional().nullable(),
  loadedOnVesselDate: z.coerce.date().optional().nullable(),
  dischargedDate: z.coerce.date().optional().nullable(),
  gateOutDate: z.coerce.date().optional().nullable(),
  emptyReturnDate: z.coerce.date().optional().nullable(),
})

type CreateContainerInput = z.infer<typeof createContainerSchema>
type UpdateContainerInput = z.infer<typeof updateContainerSchema>

const createContainerCommand: CommandHandler<CreateContainerInput, { id: string }> = {
  id: 'shipments.containers.create',
  async execute(rawInput, ctx) {
    const input = createContainerSchema.parse(rawInput)
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

    const container = em.create(ShipmentContainer, {
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      shipment,
      containerNumber: input.containerNumber ?? undefined,
      containerType: input.containerType,
      cargoDescription: input.cargoDescription ?? undefined,
      status: input.status,
      currentLocation: input.currentLocation ?? undefined,
      gateInDate: input.gateInDate ?? undefined,
      loadedOnVesselDate: input.loadedOnVesselDate ?? undefined,
      dischargedDate: input.dischargedDate ?? undefined,
      gateOutDate: input.gateOutDate ?? undefined,
      emptyReturnDate: input.emptyReturnDate ?? undefined,
    })

    em.persist(container)
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: container,
      identifiers: {
        id: container.id,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
      },
    })

    return { id: container.id }
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve('em') as EntityManager
    return await loadContainerSnapshot(em, result.id)
  },
  buildLog: async ({ result, ctx }) => {
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadContainerSnapshot(em, result.id)
    return {
      actionLabel: 'Create container',
      resourceKind: 'shipments.container',
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
    const payload = extractUndoPayload<ContainerUndoPayload>(logEntry)
    const containerId = logEntry?.resourceId ?? payload?.after?.id ?? null
    if (!containerId) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const container = await em.findOne(ShipmentContainer, { id: containerId })
    if (!container) return

    em.remove(container)
    await em.flush()
  },
}

const updateContainerCommand: CommandHandler<UpdateContainerInput, { id: string }> = {
  id: 'shipments.containers.update',
  async prepare(rawInput, ctx) {
    const input = updateContainerSchema.parse(rawInput)
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadContainerSnapshot(em, input.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(rawInput, ctx) {
    const input = updateContainerSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const container = await em.findOne(ShipmentContainer, { id: input.id })
    const record = assertRecordFound(container, 'Container not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    if (input.containerNumber !== undefined) record.containerNumber = input.containerNumber ?? undefined
    if (input.containerType !== undefined) record.containerType = input.containerType
    if (input.cargoDescription !== undefined) record.cargoDescription = input.cargoDescription ?? undefined
    if (input.status !== undefined) record.status = input.status
    if (input.currentLocation !== undefined) record.currentLocation = input.currentLocation ?? undefined
    if (input.gateInDate !== undefined) record.gateInDate = input.gateInDate ?? undefined
    if (input.loadedOnVesselDate !== undefined) record.loadedOnVesselDate = input.loadedOnVesselDate ?? undefined
    if (input.dischargedDate !== undefined) record.dischargedDate = input.dischargedDate ?? undefined
    if (input.gateOutDate !== undefined) record.gateOutDate = input.gateOutDate ?? undefined
    if (input.emptyReturnDate !== undefined) record.emptyReturnDate = input.emptyReturnDate ?? undefined

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
    const before = snapshots.before as ShipmentContainerSnapshot | undefined
    if (!before) return null

    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadContainerSnapshot(em, result.id)

    const changeKeys = [
      'containerNumber', 'containerType', 'cargoDescription', 'status', 'currentLocation',
      'gateInDate', 'loadedOnVesselDate', 'dischargedDate', 'gateOutDate', 'emptyReturnDate',
    ] as const

    const changes = afterSnapshot
      ? buildChanges(
          before as Record<string, unknown>,
          afterSnapshot as Record<string, unknown>,
          changeKeys
        )
      : {}

    return {
      actionLabel: 'Update container',
      resourceKind: 'shipments.container',
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
        } satisfies ContainerUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<ContainerUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    await applyContainerSnapshot(em, before)

    const de = ctx.container.resolve('dataEngine') as DataEngine
    const container = await em.findOne(ShipmentContainer, { id: before.id })
    if (container) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'updated',
        entity: container,
        identifiers: {
          id: before.id,
          organizationId: before.organizationId,
          tenantId: before.tenantId,
        },
      })
    }
  },
}

const deleteContainerCommand: CommandHandler<{ id?: string; body?: Record<string, unknown>; query?: Record<string, unknown> }, { id: string }> = {
  id: 'shipments.containers.delete',
  async prepare(input, ctx) {
    const id = requireId(input, 'Container id required')
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadContainerSnapshot(em, id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Container id required')
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const container = await em.findOne(ShipmentContainer, { id })
    const record = assertRecordFound(container, 'Container not found')
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
    const before = snapshots.before as ShipmentContainerSnapshot | undefined
    if (!before) return null

    return {
      actionLabel: 'Delete container',
      resourceKind: 'shipments.container',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      payload: {
        undo: {
          before,
        } satisfies ContainerUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<ContainerUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    await applyContainerSnapshot(em, before)

    const de = ctx.container.resolve('dataEngine') as DataEngine
    const container = await em.findOne(ShipmentContainer, { id: before.id })
    if (container) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'created',
        entity: container,
        identifiers: {
          id: before.id,
          organizationId: before.organizationId,
          tenantId: before.tenantId,
        },
      })
    }
  },
}

registerCommand(createContainerCommand)
registerCommand(updateContainerCommand)
registerCommand(deleteContainerCommand)

export { createContainerCommand, updateContainerCommand, deleteContainerCommand }
