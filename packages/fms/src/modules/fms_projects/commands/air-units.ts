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
import { FmsProject, FmsAirUnit } from '../data/entities'
import {
  fmsAirUnitCreateSchema,
  fmsAirUnitUpdateSchema,
  type FmsAirUnitCreateInput,
  type FmsAirUnitUpdateInput,
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
import type { AirDeliveryStatus, AirLocationType, AirUnitType } from '../data/types'

const airUnitCrudIndexer: CrudIndexerConfig<FmsAirUnit> = {
  entityType: E.fms_projects.fms_air_unit,
}

type AirUnitSnapshot = {
  id: string
  projectId: string
  organizationId: string
  tenantId: string
  deliveryStatus: AirDeliveryStatus
  isLoose: boolean
  isStackable: boolean
  isDgr: boolean
  dgrUnNumber: string | null
  dgrClass: string | null
  pieces: number | null
  grossWeight: string | null
  chargeableWeight: string | null
  volume: string | null
  loadingMeters: string | null
  commodity: string | null
  description: string | null
  targetRate: string | null
  unitType: AirUnitType | null
  unitNumber: string | null
  originType: AirLocationType
  originAirport: string | null
  destinationAirport: string | null
  shipmentReadyDate: Date | null
  requiredAtDestination: Date | null
  etd: Date | null
  eta: Date | null
  atd: Date | null
  ata: Date | null
  mawbNumber: string | null
  hawbNumber: string | null
  bookingNumber: string | null
  flightNumber: string | null
  carrierCode: string | null
  aircraftType: string | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

type AirUnitUndoPayload = {
  before?: AirUnitSnapshot | null
  after?: AirUnitSnapshot | null
}

async function loadAirUnitSnapshot(em: EntityManager, id: string): Promise<AirUnitSnapshot | null> {
  const unit = await em.findOne(FmsAirUnit, { id, deletedAt: null }, { populate: ['project'] })
  if (!unit) return null

  const projectId = typeof unit.project === 'string' ? unit.project : unit.project?.id

  return {
    id: unit.id,
    projectId: projectId ?? '',
    organizationId: unit.organizationId,
    tenantId: unit.tenantId,
    deliveryStatus: unit.deliveryStatus as AirDeliveryStatus,
    isLoose: unit.isLoose,
    isStackable: unit.isStackable,
    isDgr: unit.isDgr,
    dgrUnNumber: unit.dgrUnNumber ?? null,
    dgrClass: unit.dgrClass ?? null,
    pieces: unit.pieces ?? null,
    grossWeight: unit.grossWeight ?? null,
    chargeableWeight: unit.chargeableWeight ?? null,
    volume: unit.volume ?? null,
    loadingMeters: unit.loadingMeters ?? null,
    commodity: unit.commodity ?? null,
    description: unit.description ?? null,
    targetRate: unit.targetRate ?? null,
    unitType: unit.unitType ?? null,
    unitNumber: unit.unitNumber ?? null,
    originType: unit.originType as AirLocationType,
    originAirport: unit.originAirport ?? null,
    destinationAirport: unit.destinationAirport ?? null,
    shipmentReadyDate: unit.shipmentReadyDate ?? null,
    requiredAtDestination: unit.requiredAtDestination ?? null,
    etd: unit.etd ?? null,
    eta: unit.eta ?? null,
    atd: unit.atd ?? null,
    ata: unit.ata ?? null,
    mawbNumber: unit.mawbNumber ?? null,
    hawbNumber: unit.hawbNumber ?? null,
    bookingNumber: unit.bookingNumber ?? null,
    flightNumber: unit.flightNumber ?? null,
    carrierCode: unit.carrierCode ?? null,
    aircraftType: unit.aircraftType ?? null,
    notes: unit.notes ?? null,
    createdAt: unit.createdAt,
    updatedAt: unit.updatedAt,
  }
}

const createAirUnitCommand: CommandHandler<FmsAirUnitCreateInput & { projectId: string }, { airUnitId: string }> = {
  id: 'fms_projects.air_units.create',
  async execute(input, ctx) {
    const parsed = fmsAirUnitCreateSchema.parse(input)
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
    const unit = em.create(FmsAirUnit, {
      project,
      organizationId: project.organizationId,
      tenantId: project.tenantId,
      deliveryStatus: parsed.deliveryStatus ?? 'awaiting',
      isLoose: parsed.isLoose ?? true,
      isStackable: parsed.isStackable ?? true,
      isDgr: parsed.isDgr ?? false,
      dgrUnNumber: parsed.dgrUnNumber ?? null,
      dgrClass: parsed.dgrClass ?? null,
      pieces: parsed.pieces ?? null,
      grossWeight: parsed.grossWeight?.toString() ?? null,
      chargeableWeight: parsed.chargeableWeight?.toString() ?? null,
      volume: parsed.volume?.toString() ?? null,
      loadingMeters: parsed.loadingMeters?.toString() ?? null,
      commodity: parsed.commodity ?? null,
      description: parsed.description ?? null,
      targetRate: parsed.targetRate?.toString() ?? null,
      unitType: parsed.unitType ?? null,
      unitNumber: parsed.unitNumber ?? null,
      originType: parsed.originType ?? 'airport',
      originAirport: parsed.originAirport ?? null,
      destinationAirport: parsed.destinationAirport ?? null,
      shipmentReadyDate: parsed.shipmentReadyDate ?? null,
      requiredAtDestination: parsed.requiredAtDestination ?? null,
      etd: parsed.etd ?? null,
      eta: parsed.eta ?? null,
      atd: parsed.atd ?? null,
      ata: parsed.ata ?? null,
      mawbNumber: parsed.mawbNumber ?? null,
      hawbNumber: parsed.hawbNumber ?? null,
      bookingNumber: parsed.bookingNumber ?? null,
      flightNumber: parsed.flightNumber ?? null,
      carrierCode: parsed.carrierCode ?? null,
      aircraftType: parsed.aircraftType ?? null,
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
      indexer: airUnitCrudIndexer,
    })

    return { airUnitId: unit.id }
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve('em') as EntityManager
    return await loadAirUnitSnapshot(em, result.airUnitId)
  },
  buildLog: async ({ result, ctx }) => {
    const { translate } = await resolveTranslations()
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadAirUnitSnapshot(em, result.airUnitId)
    return {
      actionLabel: translate('fms_projects.audit.air_units.create', 'Create air unit'),
      resourceKind: 'fms_projects.air_unit',
      resourceId: result.airUnitId,
      tenantId: snapshot?.tenantId ?? null,
      organizationId: snapshot?.organizationId ?? null,
      snapshotAfter: snapshot ?? null,
      payload: { undo: { after: snapshot } satisfies AirUnitUndoPayload },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const airUnitId = logEntry?.resourceId
    if (!airUnitId) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const unit = await em.findOne(FmsAirUnit, { id: airUnitId })
    if (!unit) return
    em.remove(unit)
    await em.flush()
  },
}

const updateAirUnitCommand: CommandHandler<FmsAirUnitUpdateInput, { airUnitId: string }> = {
  id: 'fms_projects.air_units.update',
  async prepare(input, ctx) {
    const parsed = fmsAirUnitUpdateSchema.parse(input)
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadAirUnitSnapshot(em, parsed.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const parsed = fmsAirUnitUpdateSchema.parse(input)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const unit = await em.findOne(FmsAirUnit, { id: parsed.id, deletedAt: null })
    const record = assertRecordFound(unit, 'Air unit not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    if (parsed.deliveryStatus !== undefined) record.deliveryStatus = parsed.deliveryStatus
    if (parsed.isLoose !== undefined) record.isLoose = parsed.isLoose
    if (parsed.isStackable !== undefined) record.isStackable = parsed.isStackable
    if (parsed.isDgr !== undefined) record.isDgr = parsed.isDgr
    if (parsed.dgrUnNumber !== undefined) record.dgrUnNumber = parsed.dgrUnNumber
    if (parsed.dgrClass !== undefined) record.dgrClass = parsed.dgrClass
    if (parsed.pieces !== undefined) record.pieces = parsed.pieces
    if (parsed.grossWeight !== undefined) record.grossWeight = parsed.grossWeight?.toString() ?? null
    if (parsed.chargeableWeight !== undefined) record.chargeableWeight = parsed.chargeableWeight?.toString() ?? null
    if (parsed.volume !== undefined) record.volume = parsed.volume?.toString() ?? null
    if (parsed.loadingMeters !== undefined) record.loadingMeters = parsed.loadingMeters?.toString() ?? null
    if (parsed.commodity !== undefined) record.commodity = parsed.commodity
    if (parsed.description !== undefined) record.description = parsed.description
    if (parsed.targetRate !== undefined) record.targetRate = parsed.targetRate?.toString() ?? null
    if (parsed.unitType !== undefined) record.unitType = parsed.unitType
    if (parsed.unitNumber !== undefined) record.unitNumber = parsed.unitNumber
    if (parsed.originType !== undefined) record.originType = parsed.originType
    if (parsed.originAirport !== undefined) record.originAirport = parsed.originAirport
    if (parsed.destinationAirport !== undefined) record.destinationAirport = parsed.destinationAirport
    if (parsed.shipmentReadyDate !== undefined) record.shipmentReadyDate = parsed.shipmentReadyDate
    if (parsed.requiredAtDestination !== undefined) record.requiredAtDestination = parsed.requiredAtDestination
    if (parsed.etd !== undefined) record.etd = parsed.etd
    if (parsed.eta !== undefined) record.eta = parsed.eta
    if (parsed.atd !== undefined) record.atd = parsed.atd
    if (parsed.ata !== undefined) record.ata = parsed.ata
    if (parsed.mawbNumber !== undefined) record.mawbNumber = parsed.mawbNumber
    if (parsed.hawbNumber !== undefined) record.hawbNumber = parsed.hawbNumber
    if (parsed.bookingNumber !== undefined) record.bookingNumber = parsed.bookingNumber
    if (parsed.flightNumber !== undefined) record.flightNumber = parsed.flightNumber
    if (parsed.carrierCode !== undefined) record.carrierCode = parsed.carrierCode
    if (parsed.aircraftType !== undefined) record.aircraftType = parsed.aircraftType
    if (parsed.notes !== undefined) record.notes = parsed.notes

    record.updatedAt = new Date()
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: record,
      identifiers: { id: record.id, organizationId: record.organizationId, tenantId: record.tenantId },
      indexer: airUnitCrudIndexer,
    })

    return { airUnitId: record.id }
  },
  buildLog: async ({ snapshots, ctx }) => {
    const { translate } = await resolveTranslations()
    const before = snapshots.before as AirUnitSnapshot | undefined
    if (!before) return null
    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadAirUnitSnapshot(em, before.id)
    const changeKeys: readonly string[] = [
      'deliveryStatus', 'isLoose', 'isStackable', 'isDgr', 'dgrUnNumber', 'dgrClass',
      'pieces', 'grossWeight', 'chargeableWeight', 'volume', 'loadingMeters',
      'commodity', 'description', 'targetRate', 'unitType', 'unitNumber',
      'originType', 'originAirport', 'destinationAirport',
      'shipmentReadyDate', 'requiredAtDestination', 'etd', 'eta', 'atd', 'ata',
      'mawbNumber', 'hawbNumber', 'bookingNumber', 'flightNumber', 'carrierCode', 'aircraftType', 'notes',
    ]
    const changes = afterSnapshot
      ? buildChanges(before as unknown as Record<string, unknown>, afterSnapshot as unknown as Record<string, unknown>, changeKeys)
      : {}

    return {
      actionLabel: translate('fms_projects.audit.air_units.update', 'Update air unit'),
      resourceKind: 'fms_projects.air_unit',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      snapshotAfter: afterSnapshot ?? null,
      changes,
      payload: { undo: { before, after: afterSnapshot ?? null } satisfies AirUnitUndoPayload },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<AirUnitUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    let unit = await em.findOne(FmsAirUnit, { id: before.id })
    if (!unit) {
      const project = await em.findOne(FmsProject, { id: before.projectId })
      if (!project) return
      const now = new Date()
      unit = em.create(FmsAirUnit, {
        id: before.id,
        project,
        organizationId: before.organizationId,
        tenantId: before.tenantId,
        deliveryStatus: before.deliveryStatus,
        isLoose: before.isLoose,
        isStackable: before.isStackable,
        isDgr: before.isDgr,
        dgrUnNumber: before.dgrUnNumber,
        dgrClass: before.dgrClass,
        pieces: before.pieces,
        grossWeight: before.grossWeight,
        chargeableWeight: before.chargeableWeight,
        volume: before.volume,
        loadingMeters: before.loadingMeters,
        commodity: before.commodity,
        description: before.description,
        targetRate: before.targetRate,
        unitType: before.unitType,
        unitNumber: before.unitNumber,
        originType: before.originType,
        originAirport: before.originAirport,
        destinationAirport: before.destinationAirport,
        shipmentReadyDate: before.shipmentReadyDate,
        requiredAtDestination: before.requiredAtDestination,
        etd: before.etd,
        eta: before.eta,
        atd: before.atd,
        ata: before.ata,
        mawbNumber: before.mawbNumber,
        hawbNumber: before.hawbNumber,
        bookingNumber: before.bookingNumber,
        flightNumber: before.flightNumber,
        carrierCode: before.carrierCode,
        aircraftType: before.aircraftType,
        notes: before.notes,
        createdAt: before.createdAt ?? now,
        updatedAt: now,
      })
      em.persist(unit)
    } else {
      Object.assign(unit, {
        deliveryStatus: before.deliveryStatus,
        isLoose: before.isLoose,
        isStackable: before.isStackable,
        isDgr: before.isDgr,
        dgrUnNumber: before.dgrUnNumber,
        dgrClass: before.dgrClass,
        pieces: before.pieces,
        grossWeight: before.grossWeight,
        chargeableWeight: before.chargeableWeight,
        volume: before.volume,
        loadingMeters: before.loadingMeters,
        commodity: before.commodity,
        description: before.description,
        targetRate: before.targetRate,
        unitType: before.unitType,
        unitNumber: before.unitNumber,
        originType: before.originType,
        originAirport: before.originAirport,
        destinationAirport: before.destinationAirport,
        shipmentReadyDate: before.shipmentReadyDate,
        requiredAtDestination: before.requiredAtDestination,
        etd: before.etd,
        eta: before.eta,
        atd: before.atd,
        ata: before.ata,
        mawbNumber: before.mawbNumber,
        hawbNumber: before.hawbNumber,
        bookingNumber: before.bookingNumber,
        flightNumber: before.flightNumber,
        carrierCode: before.carrierCode,
        aircraftType: before.aircraftType,
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
      indexer: airUnitCrudIndexer,
    })
  },
}

const deleteAirUnitCommand: CommandHandler<{ body?: Record<string, unknown>; query?: Record<string, unknown> }, { airUnitId: string }> = {
  id: 'fms_projects.air_units.delete',
  async prepare(input, ctx) {
    const id = requireId(input, 'Air unit id required')
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadAirUnitSnapshot(em, id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Air unit id required')
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const unit = await em.findOne(FmsAirUnit, { id, deletedAt: null })
    const record = assertRecordFound(unit, 'Air unit not found')
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
      indexer: airUnitCrudIndexer,
    })

    return { airUnitId: record.id }
  },
  buildLog: async ({ snapshots }) => {
    const before = snapshots.before as AirUnitSnapshot | undefined
    if (!before) return null
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('fms_projects.audit.air_units.delete', 'Delete air unit'),
      resourceKind: 'fms_projects.air_unit',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      payload: { undo: { before } satisfies AirUnitUndoPayload },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<AirUnitUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    let unit = await em.findOne(FmsAirUnit, { id: before.id })
    if (!unit) {
      const project = await em.findOne(FmsProject, { id: before.projectId })
      if (!project) return
      unit = em.create(FmsAirUnit, {
        id: before.id,
        project,
        organizationId: before.organizationId,
        tenantId: before.tenantId,
        deliveryStatus: before.deliveryStatus,
        isLoose: before.isLoose,
        isStackable: before.isStackable,
        isDgr: before.isDgr,
        dgrUnNumber: before.dgrUnNumber,
        dgrClass: before.dgrClass,
        pieces: before.pieces,
        grossWeight: before.grossWeight,
        chargeableWeight: before.chargeableWeight,
        volume: before.volume,
        loadingMeters: before.loadingMeters,
        commodity: before.commodity,
        description: before.description,
        targetRate: before.targetRate,
        unitType: before.unitType,
        unitNumber: before.unitNumber,
        originType: before.originType,
        originAirport: before.originAirport,
        destinationAirport: before.destinationAirport,
        shipmentReadyDate: before.shipmentReadyDate,
        requiredAtDestination: before.requiredAtDestination,
        etd: before.etd,
        eta: before.eta,
        atd: before.atd,
        ata: before.ata,
        mawbNumber: before.mawbNumber,
        hawbNumber: before.hawbNumber,
        bookingNumber: before.bookingNumber,
        flightNumber: before.flightNumber,
        carrierCode: before.carrierCode,
        aircraftType: before.aircraftType,
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
      indexer: airUnitCrudIndexer,
    })
  },
}

registerCommand(createAirUnitCommand)
registerCommand(updateAirUnitCommand)
registerCommand(deleteAirUnitCommand)
