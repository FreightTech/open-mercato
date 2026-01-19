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
  Shipment,
  ShipmentContainer,
  ShipmentDocument,
  ShipmentTask,
  ShipmentStatus,
  ContainerType,
  Incoterms,
  ShipmentMode,
} from '../data/entities'
import type { ShipmentSnapshot, ShipmentUndoPayload } from '../data/snapshots'
import {
  ensureTenantScope,
  ensureOrganizationScope,
  extractUndoPayload,
  assertRecordFound,
  loadShipmentSnapshot,
  applyShipmentSnapshot,
  applyContainerSnapshot,
  applyDocumentSnapshot,
  applyTaskSnapshot,
} from './shared'

const createShipmentSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  clientId: z.string().uuid().optional().nullable(),
  assignedToId: z.string().uuid().optional().nullable(),
  containerNumber: z.string().optional().nullable(),
  internalReference: z.string().optional().nullable(),
  clientReference: z.string().optional().nullable(),
  bookingNumber: z.string().optional().nullable(),
  bolNumber: z.string().optional().nullable(),
  carrier: z.string().optional().nullable(),
  originPort: z.string().optional().nullable(),
  originLocation: z.string().optional().nullable(),
  destinationPort: z.string().optional().nullable(),
  destinationLocation: z.string().optional().nullable(),
  etd: z.coerce.date().optional().nullable(),
  atd: z.coerce.date().optional().nullable(),
  eta: z.coerce.date().optional().nullable(),
  ata: z.coerce.date().optional().nullable(),
  shipperId: z.string().uuid().optional().nullable(),
  consigneeId: z.string().uuid().optional().nullable(),
  contactPersonId: z.string().uuid().optional().nullable(),
  weight: z.number().optional().nullable(),
  volume: z.number().optional().nullable(),
  containerType: z.nativeEnum(ContainerType).optional().nullable(),
  totalPieces: z.number().int().optional().nullable(),
  totalActualWeight: z.number().optional().nullable(),
  totalChargeableWeight: z.number().optional().nullable(),
  totalVolume: z.number().optional().nullable(),
  actualWeightPerKilo: z.number().optional().nullable(),
  amount: z.number().optional().nullable(),
  mode: z.nativeEnum(ShipmentMode).optional().nullable(),
  vesselName: z.string().optional().nullable(),
  vesselImo: z.string().optional().nullable(),
  voyageNumber: z.string().optional().nullable(),
  status: z.nativeEnum(ShipmentStatus).optional().default(ShipmentStatus.BOOKED),
  incoterms: z.nativeEnum(Incoterms).optional().nullable(),
  requestDate: z.coerce.date().optional().nullable(),
  createdById: z.string().uuid().optional().nullable(),
})

const updateShipmentSchema = z.object({
  id: z.string().uuid(),
  clientId: z.string().uuid().optional().nullable(),
  assignedToId: z.string().uuid().optional().nullable(),
  containerNumber: z.string().optional().nullable(),
  internalReference: z.string().optional().nullable(),
  clientReference: z.string().optional().nullable(),
  bookingNumber: z.string().optional().nullable(),
  bolNumber: z.string().optional().nullable(),
  carrier: z.string().optional().nullable(),
  originPort: z.string().optional().nullable(),
  originLocation: z.string().optional().nullable(),
  destinationPort: z.string().optional().nullable(),
  destinationLocation: z.string().optional().nullable(),
  etd: z.coerce.date().optional().nullable(),
  atd: z.coerce.date().optional().nullable(),
  eta: z.coerce.date().optional().nullable(),
  ata: z.coerce.date().optional().nullable(),
  shipperId: z.string().uuid().optional().nullable(),
  consigneeId: z.string().uuid().optional().nullable(),
  contactPersonId: z.string().uuid().optional().nullable(),
  weight: z.number().optional().nullable(),
  volume: z.number().optional().nullable(),
  containerType: z.nativeEnum(ContainerType).optional().nullable(),
  totalPieces: z.number().int().optional().nullable(),
  totalActualWeight: z.number().optional().nullable(),
  totalChargeableWeight: z.number().optional().nullable(),
  totalVolume: z.number().optional().nullable(),
  actualWeightPerKilo: z.number().optional().nullable(),
  amount: z.number().optional().nullable(),
  mode: z.nativeEnum(ShipmentMode).optional().nullable(),
  vesselName: z.string().optional().nullable(),
  vesselImo: z.string().optional().nullable(),
  voyageNumber: z.string().optional().nullable(),
  status: z.nativeEnum(ShipmentStatus).optional(),
  incoterms: z.nativeEnum(Incoterms).optional().nullable(),
  requestDate: z.coerce.date().optional().nullable(),
})

type CreateShipmentInput = z.infer<typeof createShipmentSchema>
type UpdateShipmentInput = z.infer<typeof updateShipmentSchema>

const createShipmentCommand: CommandHandler<CreateShipmentInput, { id: string }> = {
  id: 'shipments.shipments.create',
  async execute(rawInput, ctx) {
    const input = createShipmentSchema.parse(rawInput)
    ensureTenantScope(ctx, input.tenantId)
    ensureOrganizationScope(ctx, input.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const shipment = em.create(Shipment, {
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      containerNumber: input.containerNumber ?? undefined,
      internalReference: input.internalReference ?? undefined,
      clientReference: input.clientReference ?? undefined,
      bookingNumber: input.bookingNumber ?? undefined,
      bolNumber: input.bolNumber ?? undefined,
      carrier: input.carrier ?? undefined,
      originPort: input.originPort ?? undefined,
      originLocation: input.originLocation ?? undefined,
      destinationPort: input.destinationPort ?? undefined,
      destinationLocation: input.destinationLocation ?? undefined,
      etd: input.etd ?? undefined,
      atd: input.atd ?? undefined,
      eta: input.eta ?? undefined,
      ata: input.ata ?? undefined,
      weight: input.weight ?? undefined,
      volume: input.volume ?? undefined,
      containerType: input.containerType ?? undefined,
      totalPieces: input.totalPieces ?? undefined,
      totalActualWeight: input.totalActualWeight ?? undefined,
      totalChargeableWeight: input.totalChargeableWeight ?? undefined,
      totalVolume: input.totalVolume ?? undefined,
      actualWeightPerKilo: input.actualWeightPerKilo ?? undefined,
      amount: input.amount ?? undefined,
      mode: input.mode ?? undefined,
      vesselName: input.vesselName ?? undefined,
      vesselImo: input.vesselImo ?? undefined,
      voyageNumber: input.voyageNumber ?? undefined,
      status: input.status ?? ShipmentStatus.BOOKED,
      incoterms: input.incoterms ?? undefined,
      requestDate: input.requestDate ?? undefined,
    })

    em.persist(shipment)
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: shipment,
      identifiers: {
        id: shipment.id,
        tenantId: input.tenantId,
        organizationId: input.organizationId,
      },
    })

    return { id: shipment.id }
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve('em') as EntityManager
    return await loadShipmentSnapshot(em, result.id)
  },
  buildLog: async ({ result, ctx }) => {
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadShipmentSnapshot(em, result.id)
    return {
      actionLabel: 'Create shipment',
      resourceKind: 'shipments.shipment',
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
    const payload = extractUndoPayload<ShipmentUndoPayload>(logEntry)
    const shipmentId = logEntry?.resourceId ?? payload?.after?.id ?? null
    if (!shipmentId) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const shipment = await em.findOne(Shipment, { id: shipmentId })
    if (!shipment) return

    // Delete related records first
    await em.nativeDelete(ShipmentContainer, { shipment })
    await em.nativeDelete(ShipmentDocument, { shipmentId })
    await em.nativeDelete(ShipmentTask, { shipmentId })
    em.remove(shipment)
    await em.flush()
  },
}

const updateShipmentCommand: CommandHandler<UpdateShipmentInput, { id: string }> = {
  id: 'shipments.shipments.update',
  async prepare(rawInput, ctx) {
    const input = updateShipmentSchema.parse(rawInput)
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadShipmentSnapshot(em, input.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(rawInput, ctx) {
    const input = updateShipmentSchema.parse(rawInput)
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const shipment = await em.findOne(Shipment, { id: input.id })
    const record = assertRecordFound(shipment, 'Shipment not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    // Apply updates
    if (input.containerNumber !== undefined) record.containerNumber = input.containerNumber ?? undefined
    if (input.internalReference !== undefined) record.internalReference = input.internalReference ?? undefined
    if (input.clientReference !== undefined) record.clientReference = input.clientReference ?? undefined
    if (input.bookingNumber !== undefined) record.bookingNumber = input.bookingNumber ?? undefined
    if (input.bolNumber !== undefined) record.bolNumber = input.bolNumber ?? undefined
    if (input.carrier !== undefined) record.carrier = input.carrier ?? undefined
    if (input.originPort !== undefined) record.originPort = input.originPort ?? undefined
    if (input.originLocation !== undefined) record.originLocation = input.originLocation ?? undefined
    if (input.destinationPort !== undefined) record.destinationPort = input.destinationPort ?? undefined
    if (input.destinationLocation !== undefined) record.destinationLocation = input.destinationLocation ?? undefined
    if (input.etd !== undefined) record.etd = input.etd ?? undefined
    if (input.atd !== undefined) record.atd = input.atd ?? undefined
    if (input.eta !== undefined) record.eta = input.eta ?? undefined
    if (input.ata !== undefined) record.ata = input.ata ?? undefined
    if (input.weight !== undefined) record.weight = input.weight ?? undefined
    if (input.volume !== undefined) record.volume = input.volume ?? undefined
    if (input.containerType !== undefined) record.containerType = input.containerType ?? undefined
    if (input.totalPieces !== undefined) record.totalPieces = input.totalPieces ?? undefined
    if (input.totalActualWeight !== undefined) record.totalActualWeight = input.totalActualWeight ?? undefined
    if (input.totalChargeableWeight !== undefined) record.totalChargeableWeight = input.totalChargeableWeight ?? undefined
    if (input.totalVolume !== undefined) record.totalVolume = input.totalVolume ?? undefined
    if (input.actualWeightPerKilo !== undefined) record.actualWeightPerKilo = input.actualWeightPerKilo ?? undefined
    if (input.amount !== undefined) record.amount = input.amount ?? undefined
    if (input.mode !== undefined) record.mode = input.mode ?? undefined
    if (input.vesselName !== undefined) record.vesselName = input.vesselName ?? undefined
    if (input.vesselImo !== undefined) record.vesselImo = input.vesselImo ?? undefined
    if (input.voyageNumber !== undefined) record.voyageNumber = input.voyageNumber ?? undefined
    if (input.status !== undefined) record.status = input.status
    if (input.incoterms !== undefined) record.incoterms = input.incoterms ?? undefined
    if (input.requestDate !== undefined) record.requestDate = input.requestDate ?? undefined

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
    const before = snapshots.before as ShipmentSnapshot | undefined
    if (!before) return null

    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadShipmentSnapshot(em, result.id)

    const changeKeys = [
      'containerNumber', 'internalReference', 'clientReference', 'bookingNumber', 'bolNumber',
      'carrier', 'originPort', 'originLocation', 'destinationPort', 'destinationLocation',
      'etd', 'atd', 'eta', 'ata', 'status', 'incoterms', 'mode',
    ] as const

    const changes = afterSnapshot
      ? buildChanges(
          before as Record<string, unknown>,
          afterSnapshot as Record<string, unknown>,
          changeKeys
        )
      : {}

    return {
      actionLabel: 'Update shipment',
      resourceKind: 'shipments.shipment',
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
        } satisfies ShipmentUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<ShipmentUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    await applyShipmentSnapshot(em, before)

    const de = ctx.container.resolve('dataEngine') as DataEngine
    const shipment = await em.findOne(Shipment, { id: before.id })
    if (shipment) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'updated',
        entity: shipment,
        identifiers: {
          id: before.id,
          organizationId: before.organizationId,
          tenantId: before.tenantId,
        },
      })
    }
  },
}

const deleteShipmentCommand: CommandHandler<{ id?: string; body?: Record<string, unknown>; query?: Record<string, unknown> }, { id: string }> = {
  id: 'shipments.shipments.delete',
  async prepare(input, ctx) {
    const id = requireId(input, 'Shipment id required')
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadShipmentSnapshot(em, id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Shipment id required')
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const shipment = await em.findOne(Shipment, { id })
    const record = assertRecordFound(shipment, 'Shipment not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    // Hard delete with cascade
    await em.nativeDelete(ShipmentContainer, { shipment: record })
    await em.nativeDelete(ShipmentDocument, { shipmentId: record.id })
    await em.nativeDelete(ShipmentTask, { shipmentId: record.id })
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
    const before = snapshots.before as ShipmentSnapshot | undefined
    if (!before) return null

    return {
      actionLabel: 'Delete shipment',
      resourceKind: 'shipments.shipment',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      payload: {
        undo: {
          before,
        } satisfies ShipmentUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<ShipmentUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    // Restore the shipment
    await applyShipmentSnapshot(em, before)

    // Restore containers, documents, and tasks
    for (const containerSnapshot of before.containers) {
      await applyContainerSnapshot(em, containerSnapshot)
    }
    for (const docSnapshot of before.documents) {
      await applyDocumentSnapshot(em, docSnapshot)
    }
    for (const taskSnapshot of before.tasks) {
      await applyTaskSnapshot(em, taskSnapshot)
    }

    const de = ctx.container.resolve('dataEngine') as DataEngine
    const shipment = await em.findOne(Shipment, { id: before.id })
    if (shipment) {
      await emitCrudUndoSideEffects({
        dataEngine: de,
        action: 'created',
        entity: shipment,
        identifiers: {
          id: before.id,
          organizationId: before.organizationId,
          tenantId: before.tenantId,
        },
      })
    }
  },
}

registerCommand(createShipmentCommand)
registerCommand(updateShipmentCommand)
registerCommand(deleteShipmentCommand)

export { createShipmentCommand, updateShipmentCommand, deleteShipmentCommand }
