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
import { FmsProject, FmsRoadUnit } from '../data/entities'
import {
  fmsRoadUnitCreateSchema,
  fmsRoadUnitUpdateSchema,
  type FmsRoadUnitCreateInput,
  type FmsRoadUnitUpdateInput,
} from '../data/validators'
import {
  ensureOrganizationScope,
  ensureTenantScope,
  extractUndoPayload,
  assertRecordFound,
} from './shared'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { CrudIndexerConfig } from '@open-mercato/shared/lib/crud/types'
import { E } from '@open-mercato/fms/generated/entities.ids.generated'
import type { RoadVehicleType, TransportUnitStatus } from '../data/types'

const roadUnitCrudIndexer: CrudIndexerConfig<FmsRoadUnit> = {
  entityType: E.fms_projects.fms_road_unit,
}

type RoadUnitSnapshot = {
  id: string
  projectId: string
  organizationId: string
  tenantId: string
  vehicleType: RoadVehicleType
  truckNumber: string | null
  trailerNumber: string | null
  driverName: string | null
  driverPhone: string | null
  cmrNumber: string | null
  bookingNumber: string | null
  carrierName: string | null
  carrierContact: string | null
  originAddress: string | null
  destinationAddress: string | null
  pickupDate: Date | null
  deliveryDate: Date | null
  actualPickup: Date | null
  actualDelivery: Date | null
  pieces: number | null
  grossWeight: string | null
  palletSpaces: number | null
  loadingMeters: string | null
  status: TransportUnitStatus
  isHazardous: boolean
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

type RoadUnitUndoPayload = {
  before?: RoadUnitSnapshot | null
  after?: RoadUnitSnapshot | null
}

async function loadRoadUnitSnapshot(em: EntityManager, id: string): Promise<RoadUnitSnapshot | null> {
  const unit = await em.findOne(FmsRoadUnit, { id, deletedAt: null }, { populate: ['project'] })
  if (!unit) return null

  const projectId = typeof unit.project === 'string' ? unit.project : unit.project?.id

  return {
    id: unit.id,
    projectId: projectId ?? '',
    organizationId: unit.organizationId,
    tenantId: unit.tenantId,
    vehicleType: unit.vehicleType as RoadVehicleType,
    truckNumber: unit.truckNumber ?? null,
    trailerNumber: unit.trailerNumber ?? null,
    driverName: unit.driverName ?? null,
    driverPhone: unit.driverPhone ?? null,
    cmrNumber: unit.cmrNumber ?? null,
    bookingNumber: unit.bookingNumber ?? null,
    carrierName: unit.carrierName ?? null,
    carrierContact: unit.carrierContact ?? null,
    originAddress: unit.originAddress ?? null,
    destinationAddress: unit.destinationAddress ?? null,
    pickupDate: unit.pickupDate ?? null,
    deliveryDate: unit.deliveryDate ?? null,
    actualPickup: unit.actualPickup ?? null,
    actualDelivery: unit.actualDelivery ?? null,
    pieces: unit.pieces ?? null,
    grossWeight: unit.grossWeight ?? null,
    palletSpaces: unit.palletSpaces ?? null,
    loadingMeters: unit.loadingMeters ?? null,
    status: unit.status as TransportUnitStatus,
    isHazardous: unit.isHazardous,
    notes: unit.notes ?? null,
    createdAt: unit.createdAt,
    updatedAt: unit.updatedAt,
  }
}

const createRoadUnitCommand: CommandHandler<FmsRoadUnitCreateInput & { projectId: string }, { roadUnitId: string }> = {
  id: 'fms_projects.road_units.create',
  async execute(input, ctx) {
    const parsed = fmsRoadUnitCreateSchema.parse(input)
    const projectId = (input as any).projectId
    const tenantId = ctx.auth?.tenantId
    const organizationId = ctx.auth?.orgId

    if (!projectId) {
      throw new (await import('@open-mercato/shared/lib/crud/errors')).CrudHttpError(400, { error: 'Project ID required' })
    }

    if (tenantId) ensureTenantScope(ctx, tenantId)
    if (organizationId) ensureOrganizationScope(ctx, organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const project = await em.findOne(FmsProject, { id: projectId, deletedAt: null })
    if (!project) {
      throw new (await import('@open-mercato/shared/lib/crud/errors')).CrudHttpError(404, { error: 'Project not found' })
    }

    ensureTenantScope(ctx, project.tenantId)
    ensureOrganizationScope(ctx, project.organizationId)

    const now = new Date()
    const unit = em.create(FmsRoadUnit, {
      project,
      organizationId: project.organizationId,
      tenantId: project.tenantId,
      vehicleType: parsed.vehicleType,
      truckNumber: parsed.truckNumber ?? null,
      trailerNumber: parsed.trailerNumber ?? null,
      driverName: parsed.driverName ?? null,
      driverPhone: parsed.driverPhone ?? null,
      cmrNumber: parsed.cmrNumber ?? null,
      bookingNumber: parsed.bookingNumber ?? null,
      carrierName: parsed.carrierName ?? null,
      carrierContact: parsed.carrierContact ?? null,
      originAddress: parsed.originAddress ?? null,
      destinationAddress: parsed.destinationAddress ?? null,
      pickupDate: parsed.pickupDate ?? null,
      deliveryDate: parsed.deliveryDate ?? null,
      actualPickup: parsed.actualPickup ?? null,
      actualDelivery: parsed.actualDelivery ?? null,
      pieces: parsed.pieces ?? null,
      grossWeight: parsed.grossWeight?.toString() ?? null,
      palletSpaces: parsed.palletSpaces ?? null,
      loadingMeters: parsed.loadingMeters?.toString() ?? null,
      status: parsed.status ?? 'not_ready',
      isHazardous: parsed.isHazardous ?? false,
      notes: parsed.notes ?? null,
      createdAt: now,
      updatedAt: now,
    })

    await em.persistAndFlush(unit)

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: unit,
      identifiers: { id: unit.id, organizationId: unit.organizationId, tenantId: unit.tenantId },
      indexer: roadUnitCrudIndexer,
    })

    return { roadUnitId: unit.id }
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve('em') as EntityManager
    return await loadRoadUnitSnapshot(em, result.roadUnitId)
  },
  buildLog: async ({ result, ctx }) => {
    const { translate } = await resolveTranslations()
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadRoadUnitSnapshot(em, result.roadUnitId)
    return {
      actionLabel: translate('fms_projects.audit.road_units.create', 'Create road unit'),
      resourceKind: 'fms_projects.road_unit',
      resourceId: result.roadUnitId,
      tenantId: snapshot?.tenantId ?? null,
      organizationId: snapshot?.organizationId ?? null,
      snapshotAfter: snapshot ?? null,
      payload: { undo: { after: snapshot } satisfies RoadUnitUndoPayload },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const roadUnitId = logEntry?.resourceId
    if (!roadUnitId) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const unit = await em.findOne(FmsRoadUnit, { id: roadUnitId })
    if (!unit) return
    em.remove(unit)
    await em.flush()
  },
}

const updateRoadUnitCommand: CommandHandler<FmsRoadUnitUpdateInput, { roadUnitId: string }> = {
  id: 'fms_projects.road_units.update',
  async prepare(input, ctx) {
    const parsed = fmsRoadUnitUpdateSchema.parse(input)
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadRoadUnitSnapshot(em, parsed.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const parsed = fmsRoadUnitUpdateSchema.parse(input)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const unit = await em.findOne(FmsRoadUnit, { id: parsed.id, deletedAt: null })
    const record = assertRecordFound(unit, 'Road unit not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    if (parsed.vehicleType !== undefined) record.vehicleType = parsed.vehicleType
    if (parsed.truckNumber !== undefined) record.truckNumber = parsed.truckNumber
    if (parsed.trailerNumber !== undefined) record.trailerNumber = parsed.trailerNumber
    if (parsed.driverName !== undefined) record.driverName = parsed.driverName
    if (parsed.driverPhone !== undefined) record.driverPhone = parsed.driverPhone
    if (parsed.cmrNumber !== undefined) record.cmrNumber = parsed.cmrNumber
    if (parsed.bookingNumber !== undefined) record.bookingNumber = parsed.bookingNumber
    if (parsed.carrierName !== undefined) record.carrierName = parsed.carrierName
    if (parsed.carrierContact !== undefined) record.carrierContact = parsed.carrierContact
    if (parsed.originAddress !== undefined) record.originAddress = parsed.originAddress
    if (parsed.destinationAddress !== undefined) record.destinationAddress = parsed.destinationAddress
    if (parsed.pickupDate !== undefined) record.pickupDate = parsed.pickupDate
    if (parsed.deliveryDate !== undefined) record.deliveryDate = parsed.deliveryDate
    if (parsed.actualPickup !== undefined) record.actualPickup = parsed.actualPickup
    if (parsed.actualDelivery !== undefined) record.actualDelivery = parsed.actualDelivery
    if (parsed.pieces !== undefined) record.pieces = parsed.pieces
    if (parsed.grossWeight !== undefined) record.grossWeight = parsed.grossWeight?.toString() ?? null
    if (parsed.palletSpaces !== undefined) record.palletSpaces = parsed.palletSpaces
    if (parsed.loadingMeters !== undefined) record.loadingMeters = parsed.loadingMeters?.toString() ?? null
    if (parsed.status !== undefined) record.status = parsed.status
    if (parsed.isHazardous !== undefined) record.isHazardous = parsed.isHazardous
    if (parsed.notes !== undefined) record.notes = parsed.notes

    record.updatedAt = new Date()
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: record,
      identifiers: { id: record.id, organizationId: record.organizationId, tenantId: record.tenantId },
      indexer: roadUnitCrudIndexer,
    })

    return { roadUnitId: record.id }
  },
  buildLog: async ({ snapshots, ctx }) => {
    const { translate } = await resolveTranslations()
    const before = snapshots.before as RoadUnitSnapshot | undefined
    if (!before) return null
    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadRoadUnitSnapshot(em, before.id)
    const changeKeys: readonly string[] = [
      'vehicleType', 'truckNumber', 'trailerNumber', 'driverName', 'driverPhone',
      'cmrNumber', 'bookingNumber', 'carrierName', 'carrierContact',
      'originAddress', 'destinationAddress', 'pickupDate', 'deliveryDate',
      'actualPickup', 'actualDelivery', 'pieces', 'grossWeight', 'palletSpaces',
      'loadingMeters', 'status', 'isHazardous', 'notes',
    ]
    const changes = afterSnapshot
      ? buildChanges(before as unknown as Record<string, unknown>, afterSnapshot as unknown as Record<string, unknown>, changeKeys)
      : {}

    return {
      actionLabel: translate('fms_projects.audit.road_units.update', 'Update road unit'),
      resourceKind: 'fms_projects.road_unit',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      snapshotAfter: afterSnapshot ?? null,
      changes,
      payload: { undo: { before, after: afterSnapshot ?? null } satisfies RoadUnitUndoPayload },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<RoadUnitUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    let unit = await em.findOne(FmsRoadUnit, { id: before.id })
    if (!unit) {
      const project = await em.findOne(FmsProject, { id: before.projectId })
      if (!project) return
      const now = new Date()
      unit = em.create(FmsRoadUnit, {
        id: before.id,
        project,
        organizationId: before.organizationId,
        tenantId: before.tenantId,
        vehicleType: before.vehicleType,
        truckNumber: before.truckNumber,
        trailerNumber: before.trailerNumber,
        driverName: before.driverName,
        driverPhone: before.driverPhone,
        cmrNumber: before.cmrNumber,
        bookingNumber: before.bookingNumber,
        carrierName: before.carrierName,
        carrierContact: before.carrierContact,
        originAddress: before.originAddress,
        destinationAddress: before.destinationAddress,
        pickupDate: before.pickupDate,
        deliveryDate: before.deliveryDate,
        actualPickup: before.actualPickup,
        actualDelivery: before.actualDelivery,
        pieces: before.pieces,
        grossWeight: before.grossWeight,
        palletSpaces: before.palletSpaces,
        loadingMeters: before.loadingMeters,
        status: before.status,
        isHazardous: before.isHazardous,
        notes: before.notes,
        createdAt: before.createdAt ?? now,
        updatedAt: now,
      })
      em.persist(unit)
    } else {
      Object.assign(unit, {
        vehicleType: before.vehicleType,
        truckNumber: before.truckNumber,
        trailerNumber: before.trailerNumber,
        driverName: before.driverName,
        driverPhone: before.driverPhone,
        cmrNumber: before.cmrNumber,
        bookingNumber: before.bookingNumber,
        carrierName: before.carrierName,
        carrierContact: before.carrierContact,
        originAddress: before.originAddress,
        destinationAddress: before.destinationAddress,
        pickupDate: before.pickupDate,
        deliveryDate: before.deliveryDate,
        actualPickup: before.actualPickup,
        actualDelivery: before.actualDelivery,
        pieces: before.pieces,
        grossWeight: before.grossWeight,
        palletSpaces: before.palletSpaces,
        loadingMeters: before.loadingMeters,
        status: before.status,
        isHazardous: before.isHazardous,
        notes: before.notes,
      })
    }

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudUndoSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: unit,
      identifiers: { id: unit.id, organizationId: unit.organizationId, tenantId: unit.tenantId },
      indexer: roadUnitCrudIndexer,
    })
  },
}

const deleteRoadUnitCommand: CommandHandler<{ body?: Record<string, unknown>; query?: Record<string, unknown> }, { roadUnitId: string }> = {
  id: 'fms_projects.road_units.delete',
  async prepare(input, ctx) {
    const id = requireId(input, 'Road unit id required')
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadRoadUnitSnapshot(em, id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Road unit id required')
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const unit = await em.findOne(FmsRoadUnit, { id, deletedAt: null })
    const record = assertRecordFound(unit, 'Road unit not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    record.deletedAt = new Date()
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'deleted',
      entity: record,
      identifiers: { id: record.id, organizationId: record.organizationId, tenantId: record.tenantId },
      indexer: roadUnitCrudIndexer,
    })

    return { roadUnitId: record.id }
  },
  buildLog: async ({ snapshots }) => {
    const before = snapshots.before as RoadUnitSnapshot | undefined
    if (!before) return null
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('fms_projects.audit.road_units.delete', 'Delete road unit'),
      resourceKind: 'fms_projects.road_unit',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      payload: { undo: { before } satisfies RoadUnitUndoPayload },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<RoadUnitUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    let unit = await em.findOne(FmsRoadUnit, { id: before.id })
    if (!unit) {
      const project = await em.findOne(FmsProject, { id: before.projectId })
      if (!project) return
      unit = em.create(FmsRoadUnit, {
        id: before.id,
        project,
        organizationId: before.organizationId,
        tenantId: before.tenantId,
        vehicleType: before.vehicleType,
        truckNumber: before.truckNumber,
        trailerNumber: before.trailerNumber,
        driverName: before.driverName,
        driverPhone: before.driverPhone,
        cmrNumber: before.cmrNumber,
        bookingNumber: before.bookingNumber,
        carrierName: before.carrierName,
        carrierContact: before.carrierContact,
        originAddress: before.originAddress,
        destinationAddress: before.destinationAddress,
        pickupDate: before.pickupDate,
        deliveryDate: before.deliveryDate,
        actualPickup: before.actualPickup,
        actualDelivery: before.actualDelivery,
        pieces: before.pieces,
        grossWeight: before.grossWeight,
        palletSpaces: before.palletSpaces,
        loadingMeters: before.loadingMeters,
        status: before.status,
        isHazardous: before.isHazardous,
        notes: before.notes,
        createdAt: before.createdAt,
        updatedAt: before.updatedAt,
      })
      em.persist(unit)
    } else {
      unit.deletedAt = null
    }

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudUndoSideEffects({
      dataEngine: de,
      action: 'created',
      entity: unit,
      identifiers: { id: unit.id, organizationId: unit.organizationId, tenantId: unit.tenantId },
      indexer: roadUnitCrudIndexer,
    })
  },
}

registerCommand(createRoadUnitCommand)
registerCommand(updateRoadUnitCommand)
registerCommand(deleteRoadUnitCommand)
