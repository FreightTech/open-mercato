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
import { FmsProject, FmsProjectCargo } from '../data/entities'
import {
  fmsProjectCargoCreateSchema,
  fmsProjectCargoUpdateSchema,
  type FmsProjectCargoCreateInput,
  type FmsProjectCargoUpdateInput,
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
import type { PackagingType, WeightUnit, VolumeUnit, DimensionUnit, CargoReadinessStatus } from '../data/types'

const projectCargoCrudIndexer: CrudIndexerConfig<FmsProjectCargo> = {
  entityType: E.fms_projects.fms_project_cargo,
}

type ProjectCargoSnapshot = {
  id: string
  projectId: string
  organizationId: string
  tenantId: string
  cargoSequence: number | null
  commodityDescription: string
  hsCode: string | null
  packageType: PackagingType
  packageCount: number
  marksAndNumbers: string | null
  length: string | null
  width: string | null
  height: string | null
  dimensionUnit: DimensionUnit | null
  grossWeight: string
  netWeight: string | null
  weightUnit: WeightUnit
  volume: string | null
  volumeUnit: VolumeUnit | null
  isHazardous: boolean
  hazmatClass: string | null
  unNumber: string | null
  isStackable: boolean
  requiresRefrigeration: boolean
  temperatureMin: string | null
  temperatureMax: string | null
  temperatureUnit: 'C' | 'F' | null
  declaredValue: string | null
  declaredValueCurrency: string | null
  status: CargoReadinessStatus
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

type ProjectCargoUndoPayload = {
  before?: ProjectCargoSnapshot | null
  after?: ProjectCargoSnapshot | null
}

async function loadProjectCargoSnapshot(em: EntityManager, id: string): Promise<ProjectCargoSnapshot | null> {
  const cargo = await em.findOne(FmsProjectCargo, { id, deletedAt: null }, { populate: ['project'] })
  if (!cargo) return null

  const projectId = typeof cargo.project === 'string' ? cargo.project : cargo.project?.id

  return {
    id: cargo.id,
    projectId: projectId ?? '',
    organizationId: cargo.organizationId,
    tenantId: cargo.tenantId,
    cargoSequence: cargo.cargoSequence ?? null,
    commodityDescription: cargo.commodityDescription,
    hsCode: cargo.hsCode ?? null,
    packageType: cargo.packageType as PackagingType,
    packageCount: cargo.packageCount,
    marksAndNumbers: cargo.marksAndNumbers ?? null,
    length: cargo.length ?? null,
    width: cargo.width ?? null,
    height: cargo.height ?? null,
    dimensionUnit: cargo.dimensionUnit ?? null,
    grossWeight: cargo.grossWeight,
    netWeight: cargo.netWeight ?? null,
    weightUnit: cargo.weightUnit as WeightUnit,
    volume: cargo.volume ?? null,
    volumeUnit: cargo.volumeUnit ?? null,
    isHazardous: cargo.isHazardous,
    hazmatClass: cargo.hazmatClass ?? null,
    unNumber: cargo.unNumber ?? null,
    isStackable: cargo.isStackable,
    requiresRefrigeration: cargo.requiresRefrigeration,
    temperatureMin: cargo.temperatureMin ?? null,
    temperatureMax: cargo.temperatureMax ?? null,
    temperatureUnit: cargo.temperatureUnit ?? null,
    declaredValue: cargo.declaredValue ?? null,
    declaredValueCurrency: cargo.declaredValueCurrency ?? null,
    status: cargo.status as CargoReadinessStatus,
    notes: cargo.notes ?? null,
    createdAt: cargo.createdAt,
    updatedAt: cargo.updatedAt,
  }
}

const createProjectCargoCommand: CommandHandler<FmsProjectCargoCreateInput, { cargoId: string }> = {
  id: 'fms_projects.project_cargo.create',
  async execute(input, ctx) {
    const parsed = fmsProjectCargoCreateSchema.parse(input)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const project = await em.findOne(FmsProject, { id: parsed.projectId, deletedAt: null })
    if (!project) {
      throw new (await import('@open-mercato/shared/lib/crud/errors')).CrudHttpError(404, { error: 'Project not found' })
    }

    ensureTenantScope(ctx, project.tenantId)
    ensureOrganizationScope(ctx, project.organizationId)

    // Get next cargo sequence if not provided
    let cargoSequence = parsed.cargoSequence
    if (!cargoSequence) {
      const maxCargo = await em.findOne(FmsProjectCargo, { project, deletedAt: null }, { orderBy: { cargoSequence: 'DESC' } })
      cargoSequence = (maxCargo?.cargoSequence ?? 0) + 1
    }

    const now = new Date()
    const cargo = em.create(FmsProjectCargo, {
      project,
      organizationId: project.organizationId,
      tenantId: project.tenantId,
      cargoSequence,
      commodityDescription: parsed.commodityDescription,
      hsCode: parsed.hsCode ?? null,
      packageType: parsed.packageType,
      packageCount: parsed.packageCount,
      marksAndNumbers: parsed.marksAndNumbers ?? null,
      length: parsed.length?.toString() ?? null,
      width: parsed.width?.toString() ?? null,
      height: parsed.height?.toString() ?? null,
      dimensionUnit: parsed.dimensionUnit ?? null,
      grossWeight: parsed.grossWeight.toString(),
      netWeight: parsed.netWeight?.toString() ?? null,
      weightUnit: parsed.weightUnit,
      volume: parsed.volume?.toString() ?? null,
      volumeUnit: parsed.volumeUnit ?? null,
      isHazardous: parsed.isHazardous ?? false,
      hazmatClass: parsed.hazmatClass ?? null,
      unNumber: parsed.unNumber ?? null,
      isStackable: parsed.isStackable ?? true,
      requiresRefrigeration: parsed.requiresRefrigeration ?? false,
      temperatureMin: parsed.temperatureMin?.toString() ?? null,
      temperatureMax: parsed.temperatureMax?.toString() ?? null,
      temperatureUnit: parsed.temperatureUnit ?? null,
      declaredValue: parsed.declaredValue?.toString() ?? null,
      declaredValueCurrency: parsed.declaredValueCurrency ?? null,
      status: parsed.status ?? 'not_ready',
      notes: parsed.notes ?? null,
      createdAt: now,
      updatedAt: now,
    })

    await em.persistAndFlush(cargo)

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: cargo,
      identifiers: { id: cargo.id, organizationId: cargo.organizationId, tenantId: cargo.tenantId },
      indexer: projectCargoCrudIndexer,
    })

    return { cargoId: cargo.id }
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve('em') as EntityManager
    return await loadProjectCargoSnapshot(em, result.cargoId)
  },
  buildLog: async ({ result, ctx }) => {
    const { translate } = await resolveTranslations()
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadProjectCargoSnapshot(em, result.cargoId)
    return {
      actionLabel: translate('fms_projects.audit.project_cargo.create', 'Create project cargo'),
      resourceKind: 'fms_projects.project_cargo',
      resourceId: result.cargoId,
      tenantId: snapshot?.tenantId ?? null,
      organizationId: snapshot?.organizationId ?? null,
      snapshotAfter: snapshot ?? null,
      payload: { undo: { after: snapshot } satisfies ProjectCargoUndoPayload },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const cargoId = logEntry?.resourceId
    if (!cargoId) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const cargo = await em.findOne(FmsProjectCargo, { id: cargoId })
    if (!cargo) return
    em.remove(cargo)
    await em.flush()
  },
}

const updateProjectCargoCommand: CommandHandler<FmsProjectCargoUpdateInput, { cargoId: string }> = {
  id: 'fms_projects.project_cargo.update',
  async prepare(input, ctx) {
    const parsed = fmsProjectCargoUpdateSchema.parse(input)
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadProjectCargoSnapshot(em, parsed.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const parsed = fmsProjectCargoUpdateSchema.parse(input)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const cargo = await em.findOne(FmsProjectCargo, { id: parsed.id, deletedAt: null })
    const record = assertRecordFound(cargo, 'Project cargo not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    if (parsed.cargoSequence !== undefined) record.cargoSequence = parsed.cargoSequence ?? null
    if (parsed.commodityDescription !== undefined) record.commodityDescription = parsed.commodityDescription
    if (parsed.hsCode !== undefined) record.hsCode = parsed.hsCode
    if (parsed.packageType !== undefined) record.packageType = parsed.packageType
    if (parsed.packageCount !== undefined) record.packageCount = parsed.packageCount
    if (parsed.marksAndNumbers !== undefined) record.marksAndNumbers = parsed.marksAndNumbers
    if (parsed.length !== undefined) record.length = parsed.length?.toString() ?? null
    if (parsed.width !== undefined) record.width = parsed.width?.toString() ?? null
    if (parsed.height !== undefined) record.height = parsed.height?.toString() ?? null
    if (parsed.dimensionUnit !== undefined) record.dimensionUnit = parsed.dimensionUnit
    if (parsed.grossWeight !== undefined) record.grossWeight = parsed.grossWeight.toString()
    if (parsed.netWeight !== undefined) record.netWeight = parsed.netWeight?.toString() ?? null
    if (parsed.weightUnit !== undefined) record.weightUnit = parsed.weightUnit
    if (parsed.volume !== undefined) record.volume = parsed.volume?.toString() ?? null
    if (parsed.volumeUnit !== undefined) record.volumeUnit = parsed.volumeUnit
    if (parsed.isHazardous !== undefined) record.isHazardous = parsed.isHazardous
    if (parsed.hazmatClass !== undefined) record.hazmatClass = parsed.hazmatClass
    if (parsed.unNumber !== undefined) record.unNumber = parsed.unNumber
    if (parsed.isStackable !== undefined) record.isStackable = parsed.isStackable
    if (parsed.requiresRefrigeration !== undefined) record.requiresRefrigeration = parsed.requiresRefrigeration
    if (parsed.temperatureMin !== undefined) record.temperatureMin = parsed.temperatureMin?.toString() ?? null
    if (parsed.temperatureMax !== undefined) record.temperatureMax = parsed.temperatureMax?.toString() ?? null
    if (parsed.temperatureUnit !== undefined) record.temperatureUnit = parsed.temperatureUnit
    if (parsed.declaredValue !== undefined) record.declaredValue = parsed.declaredValue?.toString() ?? null
    if (parsed.declaredValueCurrency !== undefined) record.declaredValueCurrency = parsed.declaredValueCurrency
    if (parsed.status !== undefined) record.status = parsed.status
    if (parsed.notes !== undefined) record.notes = parsed.notes

    record.updatedAt = new Date()
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: record,
      identifiers: { id: record.id, organizationId: record.organizationId, tenantId: record.tenantId },
      indexer: projectCargoCrudIndexer,
    })

    return { cargoId: record.id }
  },
  buildLog: async ({ snapshots, ctx }) => {
    const { translate } = await resolveTranslations()
    const before = snapshots.before as ProjectCargoSnapshot | undefined
    if (!before) return null
    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadProjectCargoSnapshot(em, before.id)
    const changeKeys: readonly string[] = [
      'cargoSequence', 'commodityDescription', 'hsCode', 'packageType', 'packageCount',
      'marksAndNumbers', 'length', 'width', 'height', 'dimensionUnit',
      'grossWeight', 'netWeight', 'weightUnit', 'volume', 'volumeUnit',
      'isHazardous', 'hazmatClass', 'unNumber', 'isStackable', 'requiresRefrigeration',
      'temperatureMin', 'temperatureMax', 'temperatureUnit',
      'declaredValue', 'declaredValueCurrency', 'status', 'notes',
    ]
    const changes = afterSnapshot
      ? buildChanges(before as unknown as Record<string, unknown>, afterSnapshot as unknown as Record<string, unknown>, changeKeys)
      : {}

    return {
      actionLabel: translate('fms_projects.audit.project_cargo.update', 'Update project cargo'),
      resourceKind: 'fms_projects.project_cargo',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      snapshotAfter: afterSnapshot ?? null,
      changes,
      payload: { undo: { before, after: afterSnapshot ?? null } satisfies ProjectCargoUndoPayload },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<ProjectCargoUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    let cargo = await em.findOne(FmsProjectCargo, { id: before.id })
    if (!cargo) {
      const project = await em.findOne(FmsProject, { id: before.projectId })
      if (!project) return
      const now = new Date()
      cargo = em.create(FmsProjectCargo, {
        id: before.id,
        project,
        organizationId: before.organizationId,
        tenantId: before.tenantId,
        cargoSequence: before.cargoSequence,
        commodityDescription: before.commodityDescription,
        hsCode: before.hsCode,
        packageType: before.packageType,
        packageCount: before.packageCount,
        marksAndNumbers: before.marksAndNumbers,
        length: before.length,
        width: before.width,
        height: before.height,
        dimensionUnit: before.dimensionUnit,
        grossWeight: before.grossWeight,
        netWeight: before.netWeight,
        weightUnit: before.weightUnit,
        volume: before.volume,
        volumeUnit: before.volumeUnit,
        isHazardous: before.isHazardous,
        hazmatClass: before.hazmatClass,
        unNumber: before.unNumber,
        isStackable: before.isStackable,
        requiresRefrigeration: before.requiresRefrigeration,
        temperatureMin: before.temperatureMin,
        temperatureMax: before.temperatureMax,
        temperatureUnit: before.temperatureUnit,
        declaredValue: before.declaredValue,
        declaredValueCurrency: before.declaredValueCurrency,
        status: before.status,
        notes: before.notes,
        createdAt: before.createdAt ?? now,
        updatedAt: now,
      })
      em.persist(cargo)
    } else {
      Object.assign(cargo, {
        cargoSequence: before.cargoSequence,
        commodityDescription: before.commodityDescription,
        hsCode: before.hsCode,
        packageType: before.packageType,
        packageCount: before.packageCount,
        marksAndNumbers: before.marksAndNumbers,
        length: before.length,
        width: before.width,
        height: before.height,
        dimensionUnit: before.dimensionUnit,
        grossWeight: before.grossWeight,
        netWeight: before.netWeight,
        weightUnit: before.weightUnit,
        volume: before.volume,
        volumeUnit: before.volumeUnit,
        isHazardous: before.isHazardous,
        hazmatClass: before.hazmatClass,
        unNumber: before.unNumber,
        isStackable: before.isStackable,
        requiresRefrigeration: before.requiresRefrigeration,
        temperatureMin: before.temperatureMin,
        temperatureMax: before.temperatureMax,
        temperatureUnit: before.temperatureUnit,
        declaredValue: before.declaredValue,
        declaredValueCurrency: before.declaredValueCurrency,
        status: before.status,
        notes: before.notes,
      })
    }

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudUndoSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: cargo,
      identifiers: { id: cargo.id, organizationId: cargo.organizationId, tenantId: cargo.tenantId },
      indexer: projectCargoCrudIndexer,
    })
  },
}

const deleteProjectCargoCommand: CommandHandler<{ body?: Record<string, unknown>; query?: Record<string, unknown> }, { cargoId: string }> = {
  id: 'fms_projects.project_cargo.delete',
  async prepare(input, ctx) {
    const id = requireId(input, 'Project cargo id required')
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadProjectCargoSnapshot(em, id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Project cargo id required')
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const cargo = await em.findOne(FmsProjectCargo, { id, deletedAt: null })
    const record = assertRecordFound(cargo, 'Project cargo not found')
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
      indexer: projectCargoCrudIndexer,
    })

    return { cargoId: record.id }
  },
  buildLog: async ({ snapshots }) => {
    const before = snapshots.before as ProjectCargoSnapshot | undefined
    if (!before) return null
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('fms_projects.audit.project_cargo.delete', 'Delete project cargo'),
      resourceKind: 'fms_projects.project_cargo',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      payload: { undo: { before } satisfies ProjectCargoUndoPayload },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<ProjectCargoUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    let cargo = await em.findOne(FmsProjectCargo, { id: before.id })
    if (!cargo) {
      const project = await em.findOne(FmsProject, { id: before.projectId })
      if (!project) return
      cargo = em.create(FmsProjectCargo, {
        id: before.id,
        project,
        organizationId: before.organizationId,
        tenantId: before.tenantId,
        cargoSequence: before.cargoSequence,
        commodityDescription: before.commodityDescription,
        hsCode: before.hsCode,
        packageType: before.packageType,
        packageCount: before.packageCount,
        marksAndNumbers: before.marksAndNumbers,
        length: before.length,
        width: before.width,
        height: before.height,
        dimensionUnit: before.dimensionUnit,
        grossWeight: before.grossWeight,
        netWeight: before.netWeight,
        weightUnit: before.weightUnit,
        volume: before.volume,
        volumeUnit: before.volumeUnit,
        isHazardous: before.isHazardous,
        hazmatClass: before.hazmatClass,
        unNumber: before.unNumber,
        isStackable: before.isStackable,
        requiresRefrigeration: before.requiresRefrigeration,
        temperatureMin: before.temperatureMin,
        temperatureMax: before.temperatureMax,
        temperatureUnit: before.temperatureUnit,
        declaredValue: before.declaredValue,
        declaredValueCurrency: before.declaredValueCurrency,
        status: before.status,
        notes: before.notes,
        createdAt: before.createdAt,
        updatedAt: before.updatedAt,
      })
      em.persist(cargo)
    } else {
      cargo.deletedAt = null
    }

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudUndoSideEffects({
      dataEngine: de,
      action: 'created',
      entity: cargo,
      identifiers: { id: cargo.id, organizationId: cargo.organizationId, tenantId: cargo.tenantId },
      indexer: projectCargoCrudIndexer,
    })
  },
}

registerCommand(createProjectCargoCommand)
registerCommand(updateProjectCargoCommand)
registerCommand(deleteProjectCargoCommand)
