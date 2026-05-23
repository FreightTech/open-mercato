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
import { FmsProject, FmsProjectLeg } from '../data/entities'
import { FmsLocation } from '../../fms_locations/data/entities'
import { Contractor } from '../../contractors/data/entities'
import {
  fmsProjectLegCreateSchema,
  fmsProjectLegUpdateSchema,
  type FmsProjectLegCreateInput,
  type FmsProjectLegUpdateInput,
} from '../data/validators'

// Extended input type for command (includes framework-injected projectId)
type ProjectLegCreateCommandInput = FmsProjectLegCreateInput & {
  projectId: string
}
import {
  ensureOrganizationScope,
  ensureTenantScope,
  extractUndoPayload,
  assertRecordFound,
} from './shared'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { CrudIndexerConfig } from '@open-mercato/shared/lib/crud/types'
import { E } from '#generated/entities.ids.generated'
import type { TransportMode } from '../data/types'

const projectLegCrudIndexer: CrudIndexerConfig<FmsProjectLeg> = {
  entityType: E.fms_projects.fms_project_leg,
}

type ProjectLegSnapshot = {
  id: string
  projectId: string
  organizationId: string
  tenantId: string
  legSequence: number
  transportMode: TransportMode
  originLocationId: string | null
  destinationLocationId: string | null
  originAddress: string | null
  destinationAddress: string | null
  carrierId: string | null
  carrierName: string | null
  vesselName: string | null
  voyageNumber: string | null
  flightNumber: string | null
  estimatedDeparture: Date | null
  estimatedArrival: Date | null
  actualDeparture: Date | null
  actualArrival: Date | null
  estimatedCost: string | null
  actualCost: string | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

type ProjectLegUndoPayload = {
  before?: ProjectLegSnapshot | null
  after?: ProjectLegSnapshot | null
}

async function loadProjectLegSnapshot(em: EntityManager, id: string): Promise<ProjectLegSnapshot | null> {
  const leg = await em.findOne(FmsProjectLeg, { id, deletedAt: null }, {
    populate: ['project', 'originLocation', 'destinationLocation', 'carrier'],
  })
  if (!leg) return null

  const projectId = typeof leg.project === 'string' ? leg.project : leg.project?.id

  return {
    id: leg.id,
    projectId: projectId ?? '',
    organizationId: leg.organizationId,
    tenantId: leg.tenantId,
    legSequence: leg.legSequence,
    transportMode: leg.transportMode as TransportMode,
    originLocationId: leg.originLocation?.id ?? null,
    destinationLocationId: leg.destinationLocation?.id ?? null,
    originAddress: leg.originAddress ?? null,
    destinationAddress: leg.destinationAddress ?? null,
    carrierId: leg.carrier?.id ?? null,
    carrierName: leg.carrierName ?? null,
    vesselName: leg.vesselName ?? null,
    voyageNumber: leg.voyageNumber ?? null,
    flightNumber: leg.flightNumber ?? null,
    estimatedDeparture: leg.estimatedDeparture ?? null,
    estimatedArrival: leg.estimatedArrival ?? null,
    actualDeparture: leg.actualDeparture ?? null,
    actualArrival: leg.actualArrival ?? null,
    estimatedCost: leg.estimatedCost ?? null,
    actualCost: leg.actualCost ?? null,
    notes: leg.notes ?? null,
    createdAt: leg.createdAt,
    updatedAt: leg.updatedAt,
  }
}

const createProjectLegCommand: CommandHandler<ProjectLegCreateCommandInput, { legId: string }> = {
  id: 'fms_projects.project_legs.create',
  async execute(input, ctx) {
    // Parse API input fields (excludes projectId which is injected by framework)
    const parsed = fmsProjectLegCreateSchema.parse(input)
    // projectId is injected by the CRUD framework's beforeCreate hook
    const projectId = input.projectId

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    // Verify the project exists
    const project = await em.findOne(FmsProject, { id: projectId, deletedAt: null })
    if (!project) {
      throw new (await import('@open-mercato/shared/lib/crud/errors')).CrudHttpError(404, { error: 'Project not found' })
    }

    ensureTenantScope(ctx, project.tenantId)
    ensureOrganizationScope(ctx, project.organizationId)

    // Get next leg sequence if not provided
    let legSequence = parsed.legSequence
    if (!legSequence) {
      const maxLeg = await em.findOne(FmsProjectLeg, { project, deletedAt: null }, { orderBy: { legSequence: 'DESC' } })
      legSequence = (maxLeg?.legSequence ?? 0) + 1
    }

    const now = new Date()
    const leg = em.create(FmsProjectLeg, {
      project,
      organizationId: project.organizationId,
      tenantId: project.tenantId,
      legSequence,
      transportMode: parsed.transportMode,
      originAddress: parsed.originAddress ?? null,
      destinationAddress: parsed.destinationAddress ?? null,
      carrierName: parsed.carrierName ?? null,
      vesselName: parsed.vesselName ?? null,
      voyageNumber: parsed.voyageNumber ?? null,
      flightNumber: parsed.flightNumber ?? null,
      estimatedDeparture: parsed.estimatedDeparture ?? null,
      estimatedArrival: parsed.estimatedArrival ?? null,
      actualDeparture: parsed.actualDeparture ?? null,
      actualArrival: parsed.actualArrival ?? null,
      estimatedCost: parsed.estimatedCost?.toString() ?? null,
      actualCost: parsed.actualCost?.toString() ?? null,
      notes: parsed.notes ?? null,
      createdAt: now,
      updatedAt: now,
    })

    // Handle origin location
    if (parsed.originLocationId) {
      const location = await em.findOne(FmsLocation, { id: parsed.originLocationId })
      if (location) {
        leg.originLocation = location
      }
    }

    // Handle destination location
    if (parsed.destinationLocationId) {
      const location = await em.findOne(FmsLocation, { id: parsed.destinationLocationId })
      if (location) {
        leg.destinationLocation = location
      }
    }

    // Handle carrier
    if (parsed.carrierId) {
      const carrier = await em.findOne(Contractor, { id: parsed.carrierId })
      if (carrier) {
        leg.carrier = carrier
      }
    }

    await em.persist(leg).flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: leg,
      identifiers: {
        id: leg.id,
        organizationId: leg.organizationId,
        tenantId: leg.tenantId,
      },
      indexer: projectLegCrudIndexer,
    })

    return { legId: leg.id }
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve('em') as EntityManager
    return await loadProjectLegSnapshot(em, result.legId)
  },
  buildLog: async ({ result, ctx }) => {
    const { translate } = await resolveTranslations()
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadProjectLegSnapshot(em, result.legId)
    return {
      actionLabel: translate('fms_projects.audit.project_legs.create', 'Create project leg'),
      resourceKind: 'fms_projects.project_leg',
      resourceId: result.legId,
      tenantId: snapshot?.tenantId ?? null,
      organizationId: snapshot?.organizationId ?? null,
      snapshotAfter: snapshot ?? null,
      payload: {
        undo: {
          after: snapshot,
        } satisfies ProjectLegUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const legId = logEntry?.resourceId
    if (!legId) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const leg = await em.findOne(FmsProjectLeg, { id: legId })
    if (!leg) return
    em.remove(leg)
    await em.flush()
  },
}

const updateProjectLegCommand: CommandHandler<FmsProjectLegUpdateInput, { legId: string }> = {
  id: 'fms_projects.project_legs.update',
  async prepare(input, ctx) {
    const parsed = fmsProjectLegUpdateSchema.parse(input)
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadProjectLegSnapshot(em, parsed.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const parsed = fmsProjectLegUpdateSchema.parse(input)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const leg = await em.findOne(FmsProjectLeg, { id: parsed.id, deletedAt: null }, {
      populate: ['originLocation', 'destinationLocation', 'carrier'],
    })
    const record = assertRecordFound(leg, 'Project leg not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    if (parsed.legSequence !== undefined) record.legSequence = parsed.legSequence
    if (parsed.transportMode !== undefined) record.transportMode = parsed.transportMode
    if (parsed.originAddress !== undefined) record.originAddress = parsed.originAddress
    if (parsed.destinationAddress !== undefined) record.destinationAddress = parsed.destinationAddress
    if (parsed.carrierName !== undefined) record.carrierName = parsed.carrierName
    if (parsed.vesselName !== undefined) record.vesselName = parsed.vesselName
    if (parsed.voyageNumber !== undefined) record.voyageNumber = parsed.voyageNumber
    if (parsed.flightNumber !== undefined) record.flightNumber = parsed.flightNumber
    if (parsed.estimatedDeparture !== undefined) record.estimatedDeparture = parsed.estimatedDeparture
    if (parsed.estimatedArrival !== undefined) record.estimatedArrival = parsed.estimatedArrival
    if (parsed.actualDeparture !== undefined) record.actualDeparture = parsed.actualDeparture
    if (parsed.actualArrival !== undefined) record.actualArrival = parsed.actualArrival
    if (parsed.estimatedCost !== undefined) record.estimatedCost = parsed.estimatedCost?.toString() ?? null
    if (parsed.actualCost !== undefined) record.actualCost = parsed.actualCost?.toString() ?? null
    if (parsed.notes !== undefined) record.notes = parsed.notes

    // Handle origin location
    if (parsed.originLocationId !== undefined) {
      if (parsed.originLocationId === null) {
        record.originLocation = null
      } else {
        const location = await em.findOne(FmsLocation, { id: parsed.originLocationId })
        if (location) {
          record.originLocation = location
        }
      }
    }

    // Handle destination location
    if (parsed.destinationLocationId !== undefined) {
      if (parsed.destinationLocationId === null) {
        record.destinationLocation = null
      } else {
        const location = await em.findOne(FmsLocation, { id: parsed.destinationLocationId })
        if (location) {
          record.destinationLocation = location
        }
      }
    }

    // Handle carrier
    if (parsed.carrierId !== undefined) {
      if (parsed.carrierId === null) {
        record.carrier = null
      } else {
        const carrier = await em.findOne(Contractor, { id: parsed.carrierId })
        if (carrier) {
          record.carrier = carrier
        }
      }
    }

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
      indexer: projectLegCrudIndexer,
    })

    return { legId: record.id }
  },
  buildLog: async ({ snapshots, ctx }) => {
    const { translate } = await resolveTranslations()
    const before = snapshots.before as ProjectLegSnapshot | undefined
    if (!before) return null
    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadProjectLegSnapshot(em, before.id)
    const changeKeys: readonly string[] = [
      'legSequence',
      'transportMode',
      'originAddress',
      'destinationAddress',
      'carrierName',
      'vesselName',
      'voyageNumber',
      'flightNumber',
      'estimatedDeparture',
      'estimatedArrival',
      'actualDeparture',
      'actualArrival',
      'estimatedCost',
      'actualCost',
      'notes',
    ]
    const changes = afterSnapshot
      ? buildChanges(
          before as unknown as Record<string, unknown>,
          afterSnapshot as unknown as Record<string, unknown>,
          changeKeys
        )
      : {}

    return {
      actionLabel: translate('fms_projects.audit.project_legs.update', 'Update project leg'),
      resourceKind: 'fms_projects.project_leg',
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
        } satisfies ProjectLegUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<ProjectLegUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    let leg = await em.findOne(FmsProjectLeg, { id: before.id }, {
      populate: ['originLocation', 'destinationLocation', 'carrier'],
    })
    if (!leg) {
      const project = await em.findOne(FmsProject, { id: before.projectId })
      if (!project) return
      const now = new Date()
      leg = em.create(FmsProjectLeg, {
        id: before.id,
        project,
        organizationId: before.organizationId,
        tenantId: before.tenantId,
        legSequence: before.legSequence,
        transportMode: before.transportMode,
        originAddress: before.originAddress,
        destinationAddress: before.destinationAddress,
        carrierName: before.carrierName,
        vesselName: before.vesselName,
        voyageNumber: before.voyageNumber,
        flightNumber: before.flightNumber,
        estimatedDeparture: before.estimatedDeparture,
        estimatedArrival: before.estimatedArrival,
        actualDeparture: before.actualDeparture,
        actualArrival: before.actualArrival,
        estimatedCost: before.estimatedCost,
        actualCost: before.actualCost,
        notes: before.notes,
        createdAt: before.createdAt ?? now,
        updatedAt: now,
      })
      em.persist(leg)
    } else {
      leg.legSequence = before.legSequence
      leg.transportMode = before.transportMode
      leg.originAddress = before.originAddress
      leg.destinationAddress = before.destinationAddress
      leg.carrierName = before.carrierName
      leg.vesselName = before.vesselName
      leg.voyageNumber = before.voyageNumber
      leg.flightNumber = before.flightNumber
      leg.estimatedDeparture = before.estimatedDeparture
      leg.estimatedArrival = before.estimatedArrival
      leg.actualDeparture = before.actualDeparture
      leg.actualArrival = before.actualArrival
      leg.estimatedCost = before.estimatedCost
      leg.actualCost = before.actualCost
      leg.notes = before.notes

      // Restore locations
      if (before.originLocationId) {
        const location = await em.findOne(FmsLocation, { id: before.originLocationId })
        if (location) leg.originLocation = location
      } else {
        leg.originLocation = null
      }

      if (before.destinationLocationId) {
        const location = await em.findOne(FmsLocation, { id: before.destinationLocationId })
        if (location) leg.destinationLocation = location
      } else {
        leg.destinationLocation = null
      }

      // Restore carrier
      if (before.carrierId) {
        const carrier = await em.findOne(Contractor, { id: before.carrierId })
        if (carrier) leg.carrier = carrier
      } else {
        leg.carrier = null
      }
    }

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudUndoSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: leg,
      identifiers: {
        id: leg.id,
        organizationId: leg.organizationId,
        tenantId: leg.tenantId,
      },
      indexer: projectLegCrudIndexer,
    })
  },
}

const deleteProjectLegCommand: CommandHandler<{ body?: Record<string, unknown>; query?: Record<string, unknown> }, { legId: string }> = {
  id: 'fms_projects.project_legs.delete',
  async prepare(input, ctx) {
    const id = requireId(input, 'Project leg id required')
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadProjectLegSnapshot(em, id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Project leg id required')
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const leg = await em.findOne(FmsProjectLeg, { id, deletedAt: null })
    const record = assertRecordFound(leg, 'Project leg not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    // Soft delete
    record.deletedAt = new Date()
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
      indexer: projectLegCrudIndexer,
    })

    return { legId: record.id }
  },
  buildLog: async ({ snapshots }) => {
    const before = snapshots.before as ProjectLegSnapshot | undefined
    if (!before) return null
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('fms_projects.audit.project_legs.delete', 'Delete project leg'),
      resourceKind: 'fms_projects.project_leg',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      payload: {
        undo: {
          before,
        } satisfies ProjectLegUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<ProjectLegUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    let leg = await em.findOne(FmsProjectLeg, { id: before.id })
    if (!leg) {
      const project = await em.findOne(FmsProject, { id: before.projectId })
      if (!project) return
      leg = em.create(FmsProjectLeg, {
        id: before.id,
        project,
        organizationId: before.organizationId,
        tenantId: before.tenantId,
        legSequence: before.legSequence,
        transportMode: before.transportMode,
        originAddress: before.originAddress,
        destinationAddress: before.destinationAddress,
        carrierName: before.carrierName,
        vesselName: before.vesselName,
        voyageNumber: before.voyageNumber,
        flightNumber: before.flightNumber,
        estimatedDeparture: before.estimatedDeparture,
        estimatedArrival: before.estimatedArrival,
        actualDeparture: before.actualDeparture,
        actualArrival: before.actualArrival,
        estimatedCost: before.estimatedCost,
        actualCost: before.actualCost,
        notes: before.notes,
        createdAt: before.createdAt,
        updatedAt: before.updatedAt,
      })
      em.persist(leg)
    } else {
      leg.deletedAt = null
    }

    // Restore locations
    if (before.originLocationId) {
      const location = await em.findOne(FmsLocation, { id: before.originLocationId })
      if (location) leg.originLocation = location
    }
    if (before.destinationLocationId) {
      const location = await em.findOne(FmsLocation, { id: before.destinationLocationId })
      if (location) leg.destinationLocation = location
    }
    if (before.carrierId) {
      const carrier = await em.findOne(Contractor, { id: before.carrierId })
      if (carrier) leg.carrier = carrier
    }

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudUndoSideEffects({
      dataEngine: de,
      action: 'created',
      entity: leg,
      identifiers: {
        id: leg.id,
        organizationId: leg.organizationId,
        tenantId: leg.tenantId,
      },
      indexer: projectLegCrudIndexer,
    })
  },
}

registerCommand(createProjectLegCommand)
registerCommand(updateProjectLegCommand)
registerCommand(deleteProjectLegCommand)
