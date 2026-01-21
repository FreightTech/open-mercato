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
import { FmsProject, FmsSeaContainer } from '../data/entities'
import {
  fmsSeaContainerCommandCreateSchema,
  fmsSeaContainerUpdateSchema,
  type FmsSeaContainerCommandCreateInput,
  type FmsSeaContainerUpdateInput,
} from '../data/validators'
import {
  ensureOrganizationScope,
  ensureTenantScope,
  extractUndoPayload,
  assertRecordFound,
} from './shared'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { CrudIndexerConfig } from '@open-mercato/shared/lib/crud/types'
import { E } from '#generated/entities.ids.generated'
import type { ContainerType, ContainerOwnershipType, TransportUnitStatus } from '../data/types'

const seaContainerCrudIndexer: CrudIndexerConfig<FmsSeaContainer> = {
  entityType: E.fms_projects.fms_sea_container,
}

type SeaContainerSnapshot = {
  id: string
  projectId: string
  organizationId: string
  tenantId: string
  containerType: ContainerType
  containerNumber: string | null
  sealNumber: string | null
  ownershipType: ContainerOwnershipType
  bookingNumber: string | null
  blNumber: string | null
  vesselName: string | null
  vesselImo: string | null
  voyageNumber: string | null
  originPort: string | null
  destinationPort: string | null
  etd: Date | null
  eta: Date | null
  atd: Date | null
  ata: Date | null
  status: TransportUnitStatus
  isHazardous: boolean
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

type SeaContainerUndoPayload = {
  before?: SeaContainerSnapshot | null
  after?: SeaContainerSnapshot | null
}

async function loadSeaContainerSnapshot(em: EntityManager, id: string): Promise<SeaContainerSnapshot | null> {
  const container = await em.findOne(FmsSeaContainer, { id, deletedAt: null }, { populate: ['project'] })
  if (!container) return null

  const projectId = typeof container.project === 'string' ? container.project : container.project?.id

  return {
    id: container.id,
    projectId: projectId ?? '',
    organizationId: container.organizationId,
    tenantId: container.tenantId,
    containerType: container.containerType as ContainerType,
    containerNumber: container.containerNumber ?? null,
    sealNumber: container.sealNumber ?? null,
    ownershipType: container.ownershipType as ContainerOwnershipType,
    bookingNumber: container.bookingNumber ?? null,
    blNumber: container.blNumber ?? null,
    vesselName: container.vesselName ?? null,
    vesselImo: container.vesselImo ?? null,
    voyageNumber: container.voyageNumber ?? null,
    originPort: container.originPort ?? null,
    destinationPort: container.destinationPort ?? null,
    etd: container.etd ?? null,
    eta: container.eta ?? null,
    atd: container.atd ?? null,
    ata: container.ata ?? null,
    status: container.status as TransportUnitStatus,
    isHazardous: container.isHazardous,
    notes: container.notes ?? null,
    createdAt: container.createdAt,
    updatedAt: container.updatedAt,
  }
}

const createSeaContainerCommand: CommandHandler<FmsSeaContainerCommandCreateInput, { containerId: string }> = {
  id: 'fms_projects.sea_containers.create',
  async execute(input, ctx) {
    const parsed = fmsSeaContainerCommandCreateSchema.parse(input)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const project = await em.findOne(FmsProject, { id: parsed.projectId, deletedAt: null })
    if (!project) {
      throw new (await import('@open-mercato/shared/lib/crud/errors')).CrudHttpError(404, { error: 'Project not found' })
    }

    ensureTenantScope(ctx, project.tenantId)
    ensureOrganizationScope(ctx, project.organizationId)

    const now = new Date()
    const container = em.create(FmsSeaContainer, {
      project,
      organizationId: project.organizationId,
      tenantId: project.tenantId,
      containerType: parsed.containerType,
      containerNumber: parsed.containerNumber ?? null,
      sealNumber: parsed.sealNumber ?? null,
      ownershipType: parsed.ownershipType ?? 'coc',
      bookingNumber: parsed.bookingNumber ?? null,
      blNumber: parsed.blNumber ?? null,
      vesselName: parsed.vesselName ?? null,
      vesselImo: parsed.vesselImo ?? null,
      voyageNumber: parsed.voyageNumber ?? null,
      originPort: parsed.originPort ?? null,
      destinationPort: parsed.destinationPort ?? null,
      etd: parsed.etd ?? null,
      eta: parsed.eta ?? null,
      atd: parsed.atd ?? null,
      ata: parsed.ata ?? null,
      status: parsed.status ?? 'not_ready',
      isHazardous: parsed.isHazardous ?? false,
      notes: parsed.notes ?? null,
      createdAt: now,
      updatedAt: now,
    })

    await em.persistAndFlush(container)

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: container,
      identifiers: {
        id: container.id,
        organizationId: container.organizationId,
        tenantId: container.tenantId,
      },
      indexer: seaContainerCrudIndexer,
    })

    return { containerId: container.id }
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve('em') as EntityManager
    return await loadSeaContainerSnapshot(em, result.containerId)
  },
  buildLog: async ({ result, ctx }) => {
    const { translate } = await resolveTranslations()
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadSeaContainerSnapshot(em, result.containerId)
    return {
      actionLabel: translate('fms_projects.audit.sea_containers.create', 'Create sea container'),
      resourceKind: 'fms_projects.sea_container',
      resourceId: result.containerId,
      tenantId: snapshot?.tenantId ?? null,
      organizationId: snapshot?.organizationId ?? null,
      snapshotAfter: snapshot ?? null,
      payload: {
        undo: { after: snapshot } satisfies SeaContainerUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const containerId = logEntry?.resourceId
    if (!containerId) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const container = await em.findOne(FmsSeaContainer, { id: containerId })
    if (!container) return
    em.remove(container)
    await em.flush()
  },
}

const updateSeaContainerCommand: CommandHandler<FmsSeaContainerUpdateInput, { containerId: string }> = {
  id: 'fms_projects.sea_containers.update',
  async prepare(input, ctx) {
    const id = requireId(input, 'Sea container id required')
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadSeaContainerSnapshot(em, id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Sea container id required')
    const parsed = fmsSeaContainerUpdateSchema.parse(input)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const container = await em.findOne(FmsSeaContainer, { id, deletedAt: null })
    const record = assertRecordFound(container, 'Sea container not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    if (parsed.containerType !== undefined) record.containerType = parsed.containerType
    if (parsed.containerNumber !== undefined) record.containerNumber = parsed.containerNumber
    if (parsed.sealNumber !== undefined) record.sealNumber = parsed.sealNumber
    if (parsed.ownershipType !== undefined) record.ownershipType = parsed.ownershipType
    if (parsed.bookingNumber !== undefined) record.bookingNumber = parsed.bookingNumber
    if (parsed.blNumber !== undefined) record.blNumber = parsed.blNumber
    if (parsed.vesselName !== undefined) record.vesselName = parsed.vesselName
    if (parsed.vesselImo !== undefined) record.vesselImo = parsed.vesselImo
    if (parsed.voyageNumber !== undefined) record.voyageNumber = parsed.voyageNumber
    if (parsed.originPort !== undefined) record.originPort = parsed.originPort
    if (parsed.destinationPort !== undefined) record.destinationPort = parsed.destinationPort
    if (parsed.etd !== undefined) record.etd = parsed.etd
    if (parsed.eta !== undefined) record.eta = parsed.eta
    if (parsed.atd !== undefined) record.atd = parsed.atd
    if (parsed.ata !== undefined) record.ata = parsed.ata
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
      identifiers: {
        id: record.id,
        organizationId: record.organizationId,
        tenantId: record.tenantId,
      },
      indexer: seaContainerCrudIndexer,
    })

    return { containerId: record.id }
  },
  buildLog: async ({ snapshots, ctx }) => {
    const { translate } = await resolveTranslations()
    const before = snapshots.before as SeaContainerSnapshot | undefined
    if (!before) return null
    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadSeaContainerSnapshot(em, before.id)
    const changeKeys: readonly string[] = [
      'containerType', 'containerNumber', 'sealNumber', 'ownershipType',
      'bookingNumber', 'blNumber', 'vesselName', 'vesselImo', 'voyageNumber',
      'originPort', 'destinationPort', 'etd', 'eta', 'atd', 'ata',
      'status', 'isHazardous', 'notes',
    ]
    const changes = afterSnapshot
      ? buildChanges(before as unknown as Record<string, unknown>, afterSnapshot as unknown as Record<string, unknown>, changeKeys)
      : {}

    return {
      actionLabel: translate('fms_projects.audit.sea_containers.update', 'Update sea container'),
      resourceKind: 'fms_projects.sea_container',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      snapshotAfter: afterSnapshot ?? null,
      changes,
      payload: { undo: { before, after: afterSnapshot ?? null } satisfies SeaContainerUndoPayload },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<SeaContainerUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    let container = await em.findOne(FmsSeaContainer, { id: before.id })
    if (!container) {
      const project = await em.findOne(FmsProject, { id: before.projectId })
      if (!project) return
      const now = new Date()
      container = em.create(FmsSeaContainer, {
        id: before.id,
        project,
        organizationId: before.organizationId,
        tenantId: before.tenantId,
        containerType: before.containerType,
        containerNumber: before.containerNumber,
        sealNumber: before.sealNumber,
        ownershipType: before.ownershipType,
        bookingNumber: before.bookingNumber,
        blNumber: before.blNumber,
        vesselName: before.vesselName,
        vesselImo: before.vesselImo,
        voyageNumber: before.voyageNumber,
        originPort: before.originPort,
        destinationPort: before.destinationPort,
        etd: before.etd,
        eta: before.eta,
        atd: before.atd,
        ata: before.ata,
        status: before.status,
        isHazardous: before.isHazardous,
        notes: before.notes,
        createdAt: before.createdAt ?? now,
        updatedAt: now,
      })
      em.persist(container)
    } else {
      container.containerType = before.containerType
      container.containerNumber = before.containerNumber
      container.sealNumber = before.sealNumber
      container.ownershipType = before.ownershipType
      container.bookingNumber = before.bookingNumber
      container.blNumber = before.blNumber
      container.vesselName = before.vesselName
      container.vesselImo = before.vesselImo
      container.voyageNumber = before.voyageNumber
      container.originPort = before.originPort
      container.destinationPort = before.destinationPort
      container.etd = before.etd
      container.eta = before.eta
      container.atd = before.atd
      container.ata = before.ata
      container.status = before.status
      container.isHazardous = before.isHazardous
      container.notes = before.notes
    }

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudUndoSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: container,
      identifiers: { id: container.id, organizationId: container.organizationId, tenantId: container.tenantId },
      indexer: seaContainerCrudIndexer,
    })
  },
}

const deleteSeaContainerCommand: CommandHandler<{ body?: Record<string, unknown>; query?: Record<string, unknown> }, { containerId: string }> = {
  id: 'fms_projects.sea_containers.delete',
  async prepare(input, ctx) {
    const id = requireId(input, 'Sea container id required')
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadSeaContainerSnapshot(em, id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Sea container id required')
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const container = await em.findOne(FmsSeaContainer, { id, deletedAt: null })
    const record = assertRecordFound(container, 'Sea container not found')
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
      indexer: seaContainerCrudIndexer,
    })

    return { containerId: record.id }
  },
  buildLog: async ({ snapshots }) => {
    const before = snapshots.before as SeaContainerSnapshot | undefined
    if (!before) return null
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('fms_projects.audit.sea_containers.delete', 'Delete sea container'),
      resourceKind: 'fms_projects.sea_container',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      payload: { undo: { before } satisfies SeaContainerUndoPayload },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<SeaContainerUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    let container = await em.findOne(FmsSeaContainer, { id: before.id })
    if (!container) {
      const project = await em.findOne(FmsProject, { id: before.projectId })
      if (!project) return
      container = em.create(FmsSeaContainer, {
        id: before.id,
        project,
        organizationId: before.organizationId,
        tenantId: before.tenantId,
        containerType: before.containerType,
        containerNumber: before.containerNumber,
        sealNumber: before.sealNumber,
        ownershipType: before.ownershipType,
        bookingNumber: before.bookingNumber,
        blNumber: before.blNumber,
        vesselName: before.vesselName,
        vesselImo: before.vesselImo,
        voyageNumber: before.voyageNumber,
        originPort: before.originPort,
        destinationPort: before.destinationPort,
        etd: before.etd,
        eta: before.eta,
        atd: before.atd,
        ata: before.ata,
        status: before.status,
        isHazardous: before.isHazardous,
        notes: before.notes,
        createdAt: before.createdAt,
        updatedAt: before.updatedAt,
      })
      em.persist(container)
    } else {
      container.deletedAt = null
    }

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudUndoSideEffects({
      dataEngine: de,
      action: 'created',
      entity: container,
      identifiers: { id: container.id, organizationId: container.organizationId, tenantId: container.tenantId },
      indexer: seaContainerCrudIndexer,
    })
  },
}

registerCommand(createSeaContainerCommand)
registerCommand(updateSeaContainerCommand)
registerCommand(deleteSeaContainerCommand)
