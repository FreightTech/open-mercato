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
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import {
  FmsProject,
  FmsProjectLeg,
  FmsSeaContainer,
  FmsAirUnit,
  FmsRoadUnit,
  FmsProjectCargo,
  FmsProjectInvoice,
} from '../data/entities'
import { FmsLocation } from '../../fms_locations/data/entities'
import { Contractor } from '../../contractors/data/entities'
import { FmsQuote, FmsOffer } from '../../fms_quotes/data/entities'
import {
  fmsProjectCreateSchema,
  fmsProjectUpdateSchema,
  type FmsProjectCreateInput,
  type FmsProjectUpdateInput,
} from '../data/validators'
import {
  ensureOrganizationScope,
  ensureTenantScope,
  extractUndoPayload,
  assertRecordFound,
  emitQueryIndexDeleteEvents,
  emitQueryIndexUpsertEvents,
  generateProjectNumber,
  type QueryIndexEventEntry,
} from './shared'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { CrudIndexerConfig } from '@open-mercato/shared/lib/crud/types'
import { E } from '@open-mercato/fms/generated/entities.ids.generated'
import type {
  TransportMode,
  FmsProjectStatus,
  ShipmentType,
  Direction,
  CargoType,
  Incoterm,
  WeightUnit,
  VolumeUnit,
} from '../data/types'

const projectCrudIndexer: CrudIndexerConfig<FmsProject> = {
  entityType: E.fms_projects.fms_project,
}

type ProjectSnapshot = {
  id: string
  organizationId: string
  tenantId: string
  projectNumber: string
  clientId: string | null
  quoteId: string | null
  offerId: string | null
  shipmentId: string | null
  workflowInstanceId: string | null
  currentStep: FmsProjectStatus | null
  workflowContext: Record<string, any> | null
  shipmentType: ShipmentType
  direction: Direction
  cargoType: CargoType
  incoterm: Incoterm | null
  transportModes: TransportMode[] | null
  originLocationId: string | null
  destinationLocationId: string | null
  originAddress: string | null
  destinationAddress: string | null
  projectDate: Date
  requestedPickupDate: Date | null
  requestedDeliveryDate: Date | null
  clientReference: string | null
  internalReference: string | null
  commodityDescription: string | null
  hsCode: string | null
  containerCount: number | null
  totalGrossWeight: string | null
  totalVolume: string | null
  weightUnit: WeightUnit | null
  volumeUnit: VolumeUnit | null
  currencyCode: string
  estimatedCost: string | null
  requiresInsurance: boolean
  requiresCustomsBrokerage: boolean
  isHazardous: boolean
  hazmatDetails: string | null
  specialInstructions: string | null
  internalNotes: string | null
  createdAt: Date
  updatedAt: Date
}

type ProjectUndoPayload = {
  before?: ProjectSnapshot | null
  after?: ProjectSnapshot | null
}

async function loadProjectSnapshot(em: EntityManager, id: string): Promise<ProjectSnapshot | null> {
  const project = await em.findOne(FmsProject, { id, deletedAt: null }, {
    populate: ['client', 'quote', 'offer', 'originLocation', 'destinationLocation'],
  })
  if (!project) return null

  return {
    id: project.id,
    organizationId: project.organizationId,
    tenantId: project.tenantId,
    projectNumber: project.projectNumber,
    clientId: project.client?.id ?? null,
    quoteId: project.quote?.id ?? null,
    offerId: project.offer?.id ?? null,
    shipmentId: project.shipmentId ?? null,
    workflowInstanceId: project.workflowInstanceId ?? null,
    currentStep: project.currentStep ?? null,
    workflowContext: project.workflowContext ?? null,
    shipmentType: project.shipmentType as ShipmentType,
    direction: project.direction as Direction,
    cargoType: project.cargoType as CargoType,
    incoterm: project.incoterm ?? null,
    transportModes: project.transportModes ?? null,
    originLocationId: project.originLocation?.id ?? null,
    destinationLocationId: project.destinationLocation?.id ?? null,
    originAddress: project.originAddress ?? null,
    destinationAddress: project.destinationAddress ?? null,
    projectDate: project.projectDate,
    requestedPickupDate: project.requestedPickupDate ?? null,
    requestedDeliveryDate: project.requestedDeliveryDate ?? null,
    clientReference: project.clientReference ?? null,
    internalReference: project.internalReference ?? null,
    commodityDescription: project.commodityDescription ?? null,
    hsCode: project.hsCode ?? null,
    containerCount: project.containerCount ?? null,
    totalGrossWeight: project.totalGrossWeight ?? null,
    totalVolume: project.totalVolume ?? null,
    weightUnit: project.weightUnit ?? null,
    volumeUnit: project.volumeUnit ?? null,
    currencyCode: project.currencyCode,
    estimatedCost: project.estimatedCost ?? null,
    requiresInsurance: project.requiresInsurance,
    requiresCustomsBrokerage: project.requiresCustomsBrokerage,
    isHazardous: project.isHazardous,
    hazmatDetails: project.hazmatDetails ?? null,
    specialInstructions: project.specialInstructions ?? null,
    internalNotes: project.internalNotes ?? null,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }
}

const createProjectCommand: CommandHandler<FmsProjectCreateInput, { projectId: string }> = {
  id: 'fms_projects.projects.create',
  async execute(input, ctx) {
    const parsed = fmsProjectCreateSchema.parse(input)

    // These are injected by mapInput from the route, assert they exist
    const tenantId = parsed.tenantId
    const organizationId = parsed.organizationId
    if (!tenantId || !organizationId) {
      throw new CrudHttpError(400, { error: 'Organization and tenant context required' })
    }

    ensureTenantScope(ctx, tenantId)
    ensureOrganizationScope(ctx, organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    // Generate project number
    const projectNumber = await generateProjectNumber(
      em,
      tenantId,
      organizationId,
      parsed.shipmentType,
      parsed.cargoType,
    )

    const now = new Date()
    const project = em.create(FmsProject, {
      organizationId,
      tenantId,
      projectNumber,
      shipmentType: parsed.shipmentType,
      direction: parsed.direction,
      cargoType: parsed.cargoType,
      incoterm: parsed.incoterm ?? null,
      transportModes: parsed.transportModes ?? null,
      originAddress: parsed.originAddress ?? null,
      destinationAddress: parsed.destinationAddress ?? null,
      projectDate: parsed.projectDate ?? now,
      requestedPickupDate: parsed.requestedPickupDate ?? null,
      requestedDeliveryDate: parsed.requestedDeliveryDate ?? null,
      clientReference: parsed.clientReference ?? null,
      internalReference: parsed.internalReference ?? null,
      commodityDescription: parsed.commodityDescription ?? null,
      hsCode: parsed.hsCode ?? null,
      containerCount: parsed.containerCount ?? null,
      totalGrossWeight: parsed.totalGrossWeight?.toString() ?? null,
      totalVolume: parsed.totalVolume?.toString() ?? null,
      weightUnit: parsed.weightUnit ?? null,
      volumeUnit: parsed.volumeUnit ?? null,
      currencyCode: parsed.currencyCode ?? 'USD',
      estimatedCost: parsed.estimatedCost?.toString() ?? null,
      requiresInsurance: parsed.requiresInsurance ?? false,
      requiresCustomsBrokerage: parsed.requiresCustomsBrokerage ?? false,
      isHazardous: parsed.isHazardous ?? false,
      hazmatDetails: parsed.hazmatDetails ?? null,
      specialInstructions: parsed.specialInstructions ?? null,
      internalNotes: parsed.internalNotes ?? null,
      workflowInstanceId: parsed.workflowInstanceId ?? null,
      currentStep: (parsed.currentStep as FmsProjectStatus) ?? null,
      workflowContext: parsed.workflowContext ?? null,
      createdAt: now,
      updatedAt: now,
    })

    // Handle client relationship
    if (parsed.clientId) {
      const client = await em.findOne(Contractor, { id: parsed.clientId })
      if (client) {
        project.client = client
      }
    }

    // Handle quote relationship
    if (parsed.quoteId) {
      const quote = await em.findOne(FmsQuote, { id: parsed.quoteId })
      if (quote) {
        project.quote = quote
      }
    }

    // Handle offer relationship
    if (parsed.offerId) {
      const offer = await em.findOne(FmsOffer, { id: parsed.offerId })
      if (offer) {
        project.offer = offer
      }
    }

    // Handle origin location
    if (parsed.originLocationId) {
      const location = await em.findOne(FmsLocation, { id: parsed.originLocationId })
      if (location) {
        project.originLocation = location
      }
    }

    // Handle destination location
    if (parsed.destinationLocationId) {
      const location = await em.findOne(FmsLocation, { id: parsed.destinationLocationId })
      if (location) {
        project.destinationLocation = location
      }
    }

    em.persist(project)
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: project,
      identifiers: {
        id: project.id,
        organizationId: project.organizationId,
        tenantId: project.tenantId,
      },
      indexer: projectCrudIndexer,
    })

    return { projectId: project.id }
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve('em') as EntityManager
    return await loadProjectSnapshot(em, result.projectId)
  },
  buildLog: async ({ result, ctx }) => {
    const { translate } = await resolveTranslations()
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadProjectSnapshot(em, result.projectId)
    return {
      actionLabel: translate('fms_projects.audit.projects.create', 'Create project'),
      resourceKind: 'fms_projects.project',
      resourceId: result.projectId,
      tenantId: snapshot?.tenantId ?? null,
      organizationId: snapshot?.organizationId ?? null,
      snapshotAfter: snapshot ?? null,
      payload: {
        undo: {
          after: snapshot,
        } satisfies ProjectUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const projectId = logEntry?.resourceId
    if (!projectId) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const project = await em.findOne(FmsProject, { id: projectId }, {
      populate: ['legs', 'seaContainers', 'airUnits', 'roadUnits', 'cargo', 'invoices'],
    })
    if (!project) return

    // Delete all related entities
    await em.nativeDelete(FmsProjectLeg, { project })
    await em.nativeDelete(FmsSeaContainer, { project })
    await em.nativeDelete(FmsAirUnit, { project })
    await em.nativeDelete(FmsRoadUnit, { project })
    await em.nativeDelete(FmsProjectCargo, { project })
    await em.nativeDelete(FmsProjectInvoice, { project })

    em.remove(project)
    await em.flush()
  },
}

const updateProjectCommand: CommandHandler<FmsProjectUpdateInput, { projectId: string }> = {
  id: 'fms_projects.projects.update',
  async prepare(input, ctx) {
    const parsed = fmsProjectUpdateSchema.parse(input)
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadProjectSnapshot(em, parsed.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const parsed = fmsProjectUpdateSchema.parse(input)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const project = await em.findOne(FmsProject, { id: parsed.id, deletedAt: null }, {
      populate: ['client', 'quote', 'offer', 'originLocation', 'destinationLocation'],
    })
    const record = assertRecordFound(project, 'Project not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    // Update core fields
    if (parsed.shipmentType !== undefined) record.shipmentType = parsed.shipmentType
    if (parsed.direction !== undefined) record.direction = parsed.direction
    if (parsed.cargoType !== undefined) record.cargoType = parsed.cargoType
    if (parsed.incoterm !== undefined) record.incoterm = parsed.incoterm
    if (parsed.transportModes !== undefined) record.transportModes = parsed.transportModes
    if (parsed.originAddress !== undefined) record.originAddress = parsed.originAddress
    if (parsed.destinationAddress !== undefined) record.destinationAddress = parsed.destinationAddress
    if (parsed.projectDate !== undefined) record.projectDate = parsed.projectDate
    if (parsed.requestedPickupDate !== undefined) record.requestedPickupDate = parsed.requestedPickupDate
    if (parsed.requestedDeliveryDate !== undefined) record.requestedDeliveryDate = parsed.requestedDeliveryDate
    if (parsed.clientReference !== undefined) record.clientReference = parsed.clientReference
    if (parsed.internalReference !== undefined) record.internalReference = parsed.internalReference
    if (parsed.commodityDescription !== undefined) record.commodityDescription = parsed.commodityDescription
    if (parsed.hsCode !== undefined) record.hsCode = parsed.hsCode
    if (parsed.containerCount !== undefined) record.containerCount = parsed.containerCount
    if (parsed.totalGrossWeight !== undefined) record.totalGrossWeight = parsed.totalGrossWeight?.toString() ?? null
    if (parsed.totalVolume !== undefined) record.totalVolume = parsed.totalVolume?.toString() ?? null
    if (parsed.weightUnit !== undefined) record.weightUnit = parsed.weightUnit
    if (parsed.volumeUnit !== undefined) record.volumeUnit = parsed.volumeUnit
    if (parsed.currencyCode !== undefined) record.currencyCode = parsed.currencyCode
    if (parsed.estimatedCost !== undefined) record.estimatedCost = parsed.estimatedCost?.toString() ?? null
    if (parsed.requiresInsurance !== undefined) record.requiresInsurance = parsed.requiresInsurance
    if (parsed.requiresCustomsBrokerage !== undefined) record.requiresCustomsBrokerage = parsed.requiresCustomsBrokerage
    if (parsed.isHazardous !== undefined) record.isHazardous = parsed.isHazardous
    if (parsed.hazmatDetails !== undefined) record.hazmatDetails = parsed.hazmatDetails
    if (parsed.specialInstructions !== undefined) record.specialInstructions = parsed.specialInstructions
    if (parsed.internalNotes !== undefined) record.internalNotes = parsed.internalNotes
    if (parsed.workflowInstanceId !== undefined) record.workflowInstanceId = parsed.workflowInstanceId
    if (parsed.currentStep !== undefined) record.currentStep = parsed.currentStep as FmsProjectStatus
    if (parsed.workflowContext !== undefined) record.workflowContext = parsed.workflowContext

    // Handle client relationship
    if (parsed.clientId !== undefined) {
      if (parsed.clientId === null) {
        record.client = null
      } else {
        const client = await em.findOne(Contractor, { id: parsed.clientId })
        if (client) {
          record.client = client
        }
      }
    }

    // Handle quote relationship
    if (parsed.quoteId !== undefined) {
      if (parsed.quoteId === null) {
        record.quote = null
      } else {
        const quote = await em.findOne(FmsQuote, { id: parsed.quoteId })
        if (quote) {
          record.quote = quote
        }
      }
    }

    // Handle offer relationship
    if (parsed.offerId !== undefined) {
      if (parsed.offerId === null) {
        record.offer = null
      } else {
        const offer = await em.findOne(FmsOffer, { id: parsed.offerId })
        if (offer) {
          record.offer = offer
        }
      }
    }

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
      indexer: projectCrudIndexer,
    })

    return { projectId: record.id }
  },
  buildLog: async ({ snapshots, ctx }) => {
    const { translate } = await resolveTranslations()
    const before = snapshots.before as ProjectSnapshot | undefined
    if (!before) return null
    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadProjectSnapshot(em, before.id)
    const changeKeys: readonly string[] = [
      'shipmentType',
      'direction',
      'cargoType',
      'incoterm',
      'transportModes',
      'originAddress',
      'destinationAddress',
      'projectDate',
      'requestedPickupDate',
      'requestedDeliveryDate',
      'clientReference',
      'internalReference',
      'commodityDescription',
      'hsCode',
      'containerCount',
      'totalGrossWeight',
      'totalVolume',
      'currencyCode',
      'estimatedCost',
      'requiresInsurance',
      'requiresCustomsBrokerage',
      'isHazardous',
      'hazmatDetails',
      'specialInstructions',
      'internalNotes',
      'currentStep',
    ]
    const changes = afterSnapshot
      ? buildChanges(
          before as unknown as Record<string, unknown>,
          afterSnapshot as unknown as Record<string, unknown>,
          changeKeys
        )
      : {}

    return {
      actionLabel: translate('fms_projects.audit.projects.update', 'Update project'),
      resourceKind: 'fms_projects.project',
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
        } satisfies ProjectUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<ProjectUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    let existingProject = await em.findOne(FmsProject, { id: before.id }, {
      populate: ['client', 'quote', 'offer', 'originLocation', 'destinationLocation'],
    })

    let project: FmsProject
    if (!existingProject) {
      const now = new Date()
      project = em.create(FmsProject, {
        id: before.id,
        organizationId: before.organizationId,
        tenantId: before.tenantId,
        projectNumber: before.projectNumber,
        shipmentType: before.shipmentType,
        direction: before.direction,
        cargoType: before.cargoType,
        incoterm: before.incoterm,
        transportModes: before.transportModes,
        originAddress: before.originAddress,
        destinationAddress: before.destinationAddress,
        projectDate: before.projectDate,
        requestedPickupDate: before.requestedPickupDate,
        requestedDeliveryDate: before.requestedDeliveryDate,
        clientReference: before.clientReference,
        internalReference: before.internalReference,
        commodityDescription: before.commodityDescription,
        hsCode: before.hsCode,
        containerCount: before.containerCount,
        totalGrossWeight: before.totalGrossWeight,
        totalVolume: before.totalVolume,
        weightUnit: before.weightUnit,
        volumeUnit: before.volumeUnit,
        currencyCode: before.currencyCode,
        estimatedCost: before.estimatedCost,
        requiresInsurance: before.requiresInsurance,
        requiresCustomsBrokerage: before.requiresCustomsBrokerage,
        isHazardous: before.isHazardous,
        hazmatDetails: before.hazmatDetails,
        specialInstructions: before.specialInstructions,
        internalNotes: before.internalNotes,
        workflowInstanceId: before.workflowInstanceId,
        currentStep: before.currentStep,
        workflowContext: before.workflowContext,
        createdAt: before.createdAt ?? now,
        updatedAt: now,
      })
      em.persist(project)
    } else {
      project = existingProject

      project.shipmentType = before.shipmentType
      project.direction = before.direction
      project.cargoType = before.cargoType
      project.incoterm = before.incoterm
      project.transportModes = before.transportModes
      project.originAddress = before.originAddress
      project.destinationAddress = before.destinationAddress
      project.projectDate = before.projectDate
      project.requestedPickupDate = before.requestedPickupDate
      project.requestedDeliveryDate = before.requestedDeliveryDate
      project.clientReference = before.clientReference
      project.internalReference = before.internalReference
      project.commodityDescription = before.commodityDescription
      project.hsCode = before.hsCode
      project.containerCount = before.containerCount
      project.totalGrossWeight = before.totalGrossWeight
      project.totalVolume = before.totalVolume
      project.weightUnit = before.weightUnit
      project.volumeUnit = before.volumeUnit
      project.currencyCode = before.currencyCode
      project.estimatedCost = before.estimatedCost
      project.requiresInsurance = before.requiresInsurance
      project.requiresCustomsBrokerage = before.requiresCustomsBrokerage
      project.isHazardous = before.isHazardous
      project.hazmatDetails = before.hazmatDetails
      project.specialInstructions = before.specialInstructions
      project.internalNotes = before.internalNotes
      project.workflowInstanceId = before.workflowInstanceId
      project.currentStep = before.currentStep
      project.workflowContext = before.workflowContext

      // Restore relationships
      if (before.clientId) {
        const client = await em.findOne(Contractor, { id: before.clientId })
        if (client) project.client = client
      } else {
        project.client = null
      }

      if (before.quoteId) {
        const quote = await em.findOne(FmsQuote, { id: before.quoteId })
        if (quote) project.quote = quote
      } else {
        project.quote = null
      }

      if (before.offerId) {
        const offer = await em.findOne(FmsOffer, { id: before.offerId })
        if (offer) project.offer = offer
      } else {
        project.offer = null
      }

      if (before.originLocationId) {
        const location = await em.findOne(FmsLocation, { id: before.originLocationId })
        if (location) project.originLocation = location
      } else {
        project.originLocation = null
      }

      if (before.destinationLocationId) {
        const location = await em.findOne(FmsLocation, { id: before.destinationLocationId })
        if (location) project.destinationLocation = location
      } else {
        project.destinationLocation = null
      }
    }

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudUndoSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: project,
      identifiers: {
        id: project.id,
        organizationId: project.organizationId,
        tenantId: project.tenantId,
      },
      indexer: projectCrudIndexer,
    })
  },
}

const deleteProjectCommand: CommandHandler<{ body?: Record<string, unknown>; query?: Record<string, unknown> }, { projectId: string }> = {
  id: 'fms_projects.projects.delete',
  async prepare(input, ctx) {
    const id = requireId(input, 'Project id required')
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadProjectSnapshot(em, id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Project id required')
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const project = await em.findOne(FmsProject, { id, deletedAt: null }, {
      populate: ['legs', 'seaContainers', 'airUnits', 'roadUnits', 'cargo', 'invoices'],
    })
    const record = assertRecordFound(project, 'Project not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    const now = new Date()

    // Soft delete project
    record.deletedAt = now

    // Soft delete all related entities
    for (const leg of record.legs.getItems()) {
      leg.deletedAt = now
    }
    for (const container of record.seaContainers.getItems()) {
      container.deletedAt = now
    }
    for (const airUnit of record.airUnits.getItems()) {
      airUnit.deletedAt = now
    }
    for (const roadUnit of record.roadUnits.getItems()) {
      roadUnit.deletedAt = now
    }
    for (const cargo of record.cargo.getItems()) {
      cargo.deletedAt = now
    }
    for (const invoice of record.invoices.getItems()) {
      invoice.deletedAt = now
    }

    await em.flush()

    // Emit index delete events for related entities
    const indexDeletes: QueryIndexEventEntry[] = []

    for (const leg of record.legs.getItems()) {
      indexDeletes.push({
        entityType: E.fms_projects.fms_project_leg,
        recordId: leg.id,
        tenantId: record.tenantId,
        organizationId: record.organizationId,
      })
    }
    for (const container of record.seaContainers.getItems()) {
      indexDeletes.push({
        entityType: E.fms_projects.fms_sea_container,
        recordId: container.id,
        tenantId: record.tenantId,
        organizationId: record.organizationId,
      })
    }
    for (const airUnit of record.airUnits.getItems()) {
      indexDeletes.push({
        entityType: E.fms_projects.fms_air_unit,
        recordId: airUnit.id,
        tenantId: record.tenantId,
        organizationId: record.organizationId,
      })
    }
    for (const roadUnit of record.roadUnits.getItems()) {
      indexDeletes.push({
        entityType: E.fms_projects.fms_road_unit,
        recordId: roadUnit.id,
        tenantId: record.tenantId,
        organizationId: record.organizationId,
      })
    }
    for (const cargo of record.cargo.getItems()) {
      indexDeletes.push({
        entityType: E.fms_projects.fms_project_cargo,
        recordId: cargo.id,
        tenantId: record.tenantId,
        organizationId: record.organizationId,
      })
    }
    for (const invoice of record.invoices.getItems()) {
      indexDeletes.push({
        entityType: E.fms_projects.fms_project_invoice,
        recordId: invoice.id,
        tenantId: record.tenantId,
        organizationId: record.organizationId,
      })
    }

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
      indexer: projectCrudIndexer,
    })

    await emitQueryIndexDeleteEvents(ctx, indexDeletes)

    return { projectId: record.id }
  },
  buildLog: async ({ snapshots }) => {
    const before = snapshots.before as ProjectSnapshot | undefined
    if (!before) return null
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('fms_projects.audit.projects.delete', 'Delete project'),
      resourceKind: 'fms_projects.project',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      payload: {
        undo: {
          before,
        } satisfies ProjectUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<ProjectUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    // Restore project
    let project = await em.findOne(FmsProject, { id: before.id })
    if (!project) {
      const now = new Date()
      project = em.create(FmsProject, {
        id: before.id,
        organizationId: before.organizationId,
        tenantId: before.tenantId,
        projectNumber: before.projectNumber,
        shipmentType: before.shipmentType,
        direction: before.direction,
        cargoType: before.cargoType,
        incoterm: before.incoterm,
        transportModes: before.transportModes,
        originAddress: before.originAddress,
        destinationAddress: before.destinationAddress,
        projectDate: before.projectDate,
        requestedPickupDate: before.requestedPickupDate,
        requestedDeliveryDate: before.requestedDeliveryDate,
        clientReference: before.clientReference,
        internalReference: before.internalReference,
        commodityDescription: before.commodityDescription,
        hsCode: before.hsCode,
        containerCount: before.containerCount,
        totalGrossWeight: before.totalGrossWeight,
        totalVolume: before.totalVolume,
        weightUnit: before.weightUnit,
        volumeUnit: before.volumeUnit,
        currencyCode: before.currencyCode,
        estimatedCost: before.estimatedCost,
        requiresInsurance: before.requiresInsurance,
        requiresCustomsBrokerage: before.requiresCustomsBrokerage,
        isHazardous: before.isHazardous,
        hazmatDetails: before.hazmatDetails,
        specialInstructions: before.specialInstructions,
        internalNotes: before.internalNotes,
        workflowInstanceId: before.workflowInstanceId,
        currentStep: before.currentStep,
        workflowContext: before.workflowContext,
        createdAt: before.createdAt ?? now,
        updatedAt: now,
      })
      em.persist(project)
    } else {
      project.deletedAt = null
    }

    // Restore relationships
    if (before.clientId) {
      const client = await em.findOne(Contractor, { id: before.clientId })
      if (client) project.client = client
    }
    if (before.quoteId) {
      const quote = await em.findOne(FmsQuote, { id: before.quoteId })
      if (quote) project.quote = quote
    }
    if (before.offerId) {
      const offer = await em.findOne(FmsOffer, { id: before.offerId })
      if (offer) project.offer = offer
    }
    if (before.originLocationId) {
      const location = await em.findOne(FmsLocation, { id: before.originLocationId })
      if (location) project.originLocation = location
    }
    if (before.destinationLocationId) {
      const location = await em.findOne(FmsLocation, { id: before.destinationLocationId })
      if (location) project.destinationLocation = location
    }

    await em.flush()

    // Restore deleted children (they keep their own undo, we just un-delete them)
    await em.nativeUpdate(FmsProjectLeg, { project, deletedAt: { $ne: null } }, { deletedAt: null })
    await em.nativeUpdate(FmsSeaContainer, { project, deletedAt: { $ne: null } }, { deletedAt: null })
    await em.nativeUpdate(FmsAirUnit, { project, deletedAt: { $ne: null } }, { deletedAt: null })
    await em.nativeUpdate(FmsRoadUnit, { project, deletedAt: { $ne: null } }, { deletedAt: null })
    await em.nativeUpdate(FmsProjectCargo, { project, deletedAt: { $ne: null } }, { deletedAt: null })
    await em.nativeUpdate(FmsProjectInvoice, { project, deletedAt: { $ne: null } }, { deletedAt: null })

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudUndoSideEffects({
      dataEngine: de,
      action: 'created',
      entity: project,
      identifiers: {
        id: project.id,
        organizationId: project.organizationId,
        tenantId: project.tenantId,
      },
      indexer: projectCrudIndexer,
    })
  },
}

registerCommand(createProjectCommand)
registerCommand(updateProjectCommand)
registerCommand(deleteProjectCommand)
