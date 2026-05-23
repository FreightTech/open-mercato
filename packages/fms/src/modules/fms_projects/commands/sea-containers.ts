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
import type {
  ContainerOwnershipType,
  SeaContainerStatus,
  PackType,
  OnBoardStatus,
  VgmStatus,
  CustomsClearanceStatus,
  ShipmentTimestampEntry,
  FacilityLocation,
  RouteStopEntry,
  CargoEventEntry,
  SyncStatus,
} from '../data/types'

const seaContainerCrudIndexer: CrudIndexerConfig<FmsSeaContainer> = {
  entityType: E.fms_projects.fms_sea_container,
}

type SeaContainerSnapshot = {
  id: string
  projectId: string
  organizationId: string
  tenantId: string
  containerType: string | null
  containerNumber: string | null
  sealNumber: string | null
  ownershipType: ContainerOwnershipType
  bookingNumber: string | null
  bolNumber: string | null
  carrierCode: string | null
  vesselName: string | null
  vesselImo: string | null
  voyageNumber: string | null
  // Rich location data (replaces originPort/destinationPort)
  originLocation: FacilityLocation | null
  destinationLocation: FacilityLocation | null
  // Multi-source timestamps (replaces etd/eta/atd/ata)
  etdTimestamps: ShipmentTimestampEntry[] | null
  etaTimestamps: ShipmentTimestampEntry[] | null
  atdTimestamps: ShipmentTimestampEntry[] | null
  ataTimestamps: ShipmentTimestampEntry[] | null
  // Route and events
  routeStops: RouteStopEntry[] | null
  cargoEvents: CargoEventEntry[] | null
  eventCount: number
  lastEventAt: Date | null
  // Tracking integration
  trackedShipmentId: string | null
  lastSyncedAt: Date | null
  syncStatus: SyncStatus | null
  // Status and flags
  status: SeaContainerStatus
  isActive: boolean
  extra: Record<string, unknown> | null
  isHazardous: boolean
  notes: string | null
  // VGM & Customs
  vgmStatus: VgmStatus | null
  vgmWeight: string | null
  customsClearanceStatus: CustomsClearanceStatus | null
  customsClearanceLocation: string | null
  pinCode: string | null
  deliveryTime: string | null
  dropOffLocation: string | null
  cutOffDate: Date | null
  // CargoWise-aligned fields
  packsCount: number | null
  packType: PackType | null
  innersCount: number | null
  innerType: string | null
  loadingMeters: string | null
  chargeableWeight: string | null
  wvRatio: string | null
  marksAndNumbers: string | null
  hsCode: string | null
  onBoardStatus: OnBoardStatus | null
  onBoardDate: Date | null
  blIssueDate: Date | null
  originalsCount: number | null
  expressBillsCount: number | null
  carrierScac: string | null
  imoNumber: string | null
  ctoReceivalDate: Date | null
  ctoCutOffDate: Date | null
  docsDueDate: Date | null
  co2Emissions: string | null
  pickupRequiredFrom: Date | null
  pickupRequiredBy: Date | null
  estimatedPickup: Date | null
  actualPickup: Date | null
  pickupLocationId: string | null
  pickupNotes: string | null
  deliveryRequiredBy: Date | null
  estimatedDelivery: Date | null
  actualDelivery: Date | null
  deliveryLocationId: string | null
  deliveryNotes: string | null
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
    containerType: container.containerType ?? null,
    containerNumber: container.containerNumber ?? null,
    sealNumber: container.sealNumber ?? null,
    ownershipType: container.ownershipType as ContainerOwnershipType,
    bookingNumber: container.bookingNumber ?? null,
    bolNumber: container.bolNumber ?? null,
    carrierCode: container.carrierCode ?? null,
    vesselName: container.vesselName ?? null,
    vesselImo: container.vesselImo ?? null,
    voyageNumber: container.voyageNumber ?? null,
    // Rich location data
    originLocation: (container.originLocation as FacilityLocation) ?? null,
    destinationLocation: (container.destinationLocation as FacilityLocation) ?? null,
    // Multi-source timestamps
    etdTimestamps: (container.etdTimestamps as ShipmentTimestampEntry[]) ?? null,
    etaTimestamps: (container.etaTimestamps as ShipmentTimestampEntry[]) ?? null,
    atdTimestamps: (container.atdTimestamps as ShipmentTimestampEntry[]) ?? null,
    ataTimestamps: (container.ataTimestamps as ShipmentTimestampEntry[]) ?? null,
    // Route and events
    routeStops: (container.routeStops as RouteStopEntry[]) ?? null,
    cargoEvents: (container.cargoEvents as CargoEventEntry[]) ?? null,
    eventCount: container.eventCount ?? 0,
    lastEventAt: container.lastEventAt ?? null,
    // Tracking integration
    trackedShipmentId: container.trackedShipmentId ?? null,
    lastSyncedAt: container.lastSyncedAt ?? null,
    syncStatus: (container.syncStatus as SyncStatus) ?? null,
    // Status and flags
    status: container.status as SeaContainerStatus,
    isActive: container.isActive ?? true,
    extra: (container.extra as Record<string, unknown>) ?? null,
    isHazardous: container.isHazardous,
    notes: container.notes ?? null,
    // VGM & Customs
    vgmStatus: (container.vgmStatus as VgmStatus) ?? null,
    vgmWeight: container.vgmWeight ?? null,
    customsClearanceStatus: (container.customsClearanceStatus as CustomsClearanceStatus) ?? null,
    customsClearanceLocation: container.customsClearanceLocation ?? null,
    pinCode: container.pinCode ?? null,
    deliveryTime: container.deliveryTime ?? null,
    dropOffLocation: container.dropOffLocation ?? null,
    cutOffDate: container.cutOffDate ?? null,
    // CargoWise-aligned fields
    packsCount: container.packsCount ?? null,
    packType: (container.packType as PackType) ?? null,
    innersCount: container.innersCount ?? null,
    innerType: container.innerType ?? null,
    loadingMeters: container.loadingMeters ?? null,
    chargeableWeight: container.chargeableWeight ?? null,
    wvRatio: container.wvRatio ?? null,
    marksAndNumbers: container.marksAndNumbers ?? null,
    hsCode: container.hsCode ?? null,
    onBoardStatus: (container.onBoardStatus as OnBoardStatus) ?? null,
    onBoardDate: container.onBoardDate ?? null,
    blIssueDate: container.blIssueDate ?? null,
    originalsCount: container.originalsCount ?? null,
    expressBillsCount: container.expressBillsCount ?? null,
    carrierScac: container.carrierScac ?? null,
    imoNumber: container.imoNumber ?? null,
    ctoReceivalDate: container.ctoReceivalDate ?? null,
    ctoCutOffDate: container.ctoCutOffDate ?? null,
    docsDueDate: container.docsDueDate ?? null,
    co2Emissions: container.co2Emissions ?? null,
    pickupRequiredFrom: container.pickupRequiredFrom ?? null,
    pickupRequiredBy: container.pickupRequiredBy ?? null,
    estimatedPickup: container.estimatedPickup ?? null,
    actualPickup: container.actualPickup ?? null,
    pickupLocationId: container.pickupLocationId ?? null,
    pickupNotes: container.pickupNotes ?? null,
    deliveryRequiredBy: container.deliveryRequiredBy ?? null,
    estimatedDelivery: container.estimatedDelivery ?? null,
    actualDelivery: container.actualDelivery ?? null,
    deliveryLocationId: container.deliveryLocationId ?? null,
    deliveryNotes: container.deliveryNotes ?? null,
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
      bolNumber: parsed.bolNumber ?? null,
      carrierCode: parsed.carrierCode ?? null,
      vesselName: parsed.vesselName ?? null,
      vesselImo: parsed.vesselImo ?? null,
      voyageNumber: parsed.voyageNumber ?? null,
      // Rich location data
      originLocation: parsed.originLocation ?? null,
      destinationLocation: parsed.destinationLocation ?? null,
      // Multi-source timestamps
      etdTimestamps: parsed.etdTimestamps ?? null,
      etaTimestamps: parsed.etaTimestamps ?? null,
      atdTimestamps: parsed.atdTimestamps ?? null,
      ataTimestamps: parsed.ataTimestamps ?? null,
      // Route and events
      routeStops: parsed.routeStops ?? null,
      cargoEvents: parsed.cargoEvents ?? null,
      eventCount: parsed.eventCount ?? 0,
      lastEventAt: parsed.lastEventAt ?? null,
      // Tracking integration
      trackedShipmentId: parsed.trackedShipmentId ?? null,
      lastSyncedAt: parsed.lastSyncedAt ?? null,
      syncStatus: parsed.syncStatus ?? null,
      // Status and flags
      status: parsed.status ?? 'PENDING',
      isActive: parsed.isActive ?? true,
      extra: parsed.extra ?? null,
      isHazardous: parsed.isHazardous ?? false,
      notes: parsed.notes ?? null,
      // VGM & Customs
      vgmStatus: parsed.vgmStatus ?? null,
      vgmWeight: parsed.vgmWeight?.toString() ?? null,
      customsClearanceStatus: parsed.customsClearanceStatus ?? null,
      customsClearanceLocation: parsed.customsClearanceLocation ?? null,
      pinCode: parsed.pinCode ?? null,
      deliveryTime: parsed.deliveryTime ?? null,
      dropOffLocation: parsed.dropOffLocation ?? null,
      cutOffDate: parsed.cutOffDate ?? null,
      // CargoWise-aligned fields
      packsCount: parsed.packsCount ?? null,
      packType: parsed.packType ?? null,
      innersCount: parsed.innersCount ?? null,
      innerType: parsed.innerType ?? null,
      loadingMeters: parsed.loadingMeters?.toString() ?? null,
      chargeableWeight: parsed.chargeableWeight?.toString() ?? null,
      wvRatio: parsed.wvRatio?.toString() ?? null,
      marksAndNumbers: parsed.marksAndNumbers ?? null,
      hsCode: parsed.hsCode ?? null,
      onBoardStatus: parsed.onBoardStatus ?? null,
      onBoardDate: parsed.onBoardDate ?? null,
      blIssueDate: parsed.blIssueDate ?? null,
      originalsCount: parsed.originalsCount ?? null,
      expressBillsCount: parsed.expressBillsCount ?? null,
      carrierScac: parsed.carrierScac ?? null,
      imoNumber: parsed.imoNumber ?? null,
      ctoReceivalDate: parsed.ctoReceivalDate ?? null,
      ctoCutOffDate: parsed.ctoCutOffDate ?? null,
      docsDueDate: parsed.docsDueDate ?? null,
      co2Emissions: parsed.co2Emissions?.toString() ?? null,
      pickupRequiredFrom: parsed.pickupRequiredFrom ?? null,
      pickupRequiredBy: parsed.pickupRequiredBy ?? null,
      estimatedPickup: parsed.estimatedPickup ?? null,
      actualPickup: parsed.actualPickup ?? null,
      pickupLocationId: parsed.pickupLocationId ?? null,
      pickupNotes: parsed.pickupNotes ?? null,
      deliveryRequiredBy: parsed.deliveryRequiredBy ?? null,
      estimatedDelivery: parsed.estimatedDelivery ?? null,
      actualDelivery: parsed.actualDelivery ?? null,
      deliveryLocationId: parsed.deliveryLocationId ?? null,
      deliveryNotes: parsed.deliveryNotes ?? null,
      createdAt: now,
      updatedAt: now,
    })

    await em.persist(container).flush()

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
    if (parsed.bolNumber !== undefined) record.bolNumber = parsed.bolNumber
    if (parsed.carrierCode !== undefined) record.carrierCode = parsed.carrierCode
    if (parsed.vesselName !== undefined) record.vesselName = parsed.vesselName
    if (parsed.vesselImo !== undefined) record.vesselImo = parsed.vesselImo
    if (parsed.voyageNumber !== undefined) record.voyageNumber = parsed.voyageNumber
    // Rich location data
    if (parsed.originLocation !== undefined) record.originLocation = parsed.originLocation
    if (parsed.destinationLocation !== undefined) record.destinationLocation = parsed.destinationLocation
    // Multi-source timestamps
    if (parsed.etdTimestamps !== undefined) record.etdTimestamps = parsed.etdTimestamps
    if (parsed.etaTimestamps !== undefined) record.etaTimestamps = parsed.etaTimestamps
    if (parsed.atdTimestamps !== undefined) record.atdTimestamps = parsed.atdTimestamps
    if (parsed.ataTimestamps !== undefined) record.ataTimestamps = parsed.ataTimestamps
    // Route and events
    if (parsed.routeStops !== undefined) record.routeStops = parsed.routeStops
    if (parsed.cargoEvents !== undefined) record.cargoEvents = parsed.cargoEvents
    if (parsed.eventCount !== undefined) record.eventCount = parsed.eventCount
    if (parsed.lastEventAt !== undefined) record.lastEventAt = parsed.lastEventAt
    // Tracking integration
    if (parsed.trackedShipmentId !== undefined) record.trackedShipmentId = parsed.trackedShipmentId
    if (parsed.lastSyncedAt !== undefined) record.lastSyncedAt = parsed.lastSyncedAt
    if (parsed.syncStatus !== undefined) record.syncStatus = parsed.syncStatus
    // Status and flags
    if (parsed.status !== undefined) record.status = parsed.status
    if (parsed.isActive !== undefined) record.isActive = parsed.isActive
    if (parsed.extra !== undefined) record.extra = parsed.extra
    if (parsed.isHazardous !== undefined) record.isHazardous = parsed.isHazardous
    if (parsed.notes !== undefined) record.notes = parsed.notes
    // VGM & Customs
    if (parsed.vgmStatus !== undefined) record.vgmStatus = parsed.vgmStatus
    if (parsed.vgmWeight !== undefined) record.vgmWeight = parsed.vgmWeight?.toString() ?? null
    if (parsed.customsClearanceStatus !== undefined) record.customsClearanceStatus = parsed.customsClearanceStatus
    if (parsed.customsClearanceLocation !== undefined) record.customsClearanceLocation = parsed.customsClearanceLocation
    if (parsed.pinCode !== undefined) record.pinCode = parsed.pinCode
    if (parsed.deliveryTime !== undefined) record.deliveryTime = parsed.deliveryTime
    if (parsed.dropOffLocation !== undefined) record.dropOffLocation = parsed.dropOffLocation
    if (parsed.cutOffDate !== undefined) record.cutOffDate = parsed.cutOffDate
    // CargoWise-aligned fields
    if (parsed.packsCount !== undefined) record.packsCount = parsed.packsCount
    if (parsed.packType !== undefined) record.packType = parsed.packType
    if (parsed.innersCount !== undefined) record.innersCount = parsed.innersCount
    if (parsed.innerType !== undefined) record.innerType = parsed.innerType
    if (parsed.loadingMeters !== undefined) record.loadingMeters = parsed.loadingMeters?.toString() ?? null
    if (parsed.chargeableWeight !== undefined) record.chargeableWeight = parsed.chargeableWeight?.toString() ?? null
    if (parsed.wvRatio !== undefined) record.wvRatio = parsed.wvRatio?.toString() ?? null
    if (parsed.marksAndNumbers !== undefined) record.marksAndNumbers = parsed.marksAndNumbers
    if (parsed.hsCode !== undefined) record.hsCode = parsed.hsCode
    if (parsed.onBoardStatus !== undefined) record.onBoardStatus = parsed.onBoardStatus
    if (parsed.onBoardDate !== undefined) record.onBoardDate = parsed.onBoardDate
    if (parsed.blIssueDate !== undefined) record.blIssueDate = parsed.blIssueDate
    if (parsed.originalsCount !== undefined) record.originalsCount = parsed.originalsCount
    if (parsed.expressBillsCount !== undefined) record.expressBillsCount = parsed.expressBillsCount
    if (parsed.carrierScac !== undefined) record.carrierScac = parsed.carrierScac
    if (parsed.imoNumber !== undefined) record.imoNumber = parsed.imoNumber
    if (parsed.ctoReceivalDate !== undefined) record.ctoReceivalDate = parsed.ctoReceivalDate
    if (parsed.ctoCutOffDate !== undefined) record.ctoCutOffDate = parsed.ctoCutOffDate
    if (parsed.docsDueDate !== undefined) record.docsDueDate = parsed.docsDueDate
    if (parsed.co2Emissions !== undefined) record.co2Emissions = parsed.co2Emissions?.toString() ?? null
    if (parsed.pickupRequiredFrom !== undefined) record.pickupRequiredFrom = parsed.pickupRequiredFrom
    if (parsed.pickupRequiredBy !== undefined) record.pickupRequiredBy = parsed.pickupRequiredBy
    if (parsed.estimatedPickup !== undefined) record.estimatedPickup = parsed.estimatedPickup
    if (parsed.actualPickup !== undefined) record.actualPickup = parsed.actualPickup
    if (parsed.pickupLocationId !== undefined) record.pickupLocationId = parsed.pickupLocationId
    if (parsed.pickupNotes !== undefined) record.pickupNotes = parsed.pickupNotes
    if (parsed.deliveryRequiredBy !== undefined) record.deliveryRequiredBy = parsed.deliveryRequiredBy
    if (parsed.estimatedDelivery !== undefined) record.estimatedDelivery = parsed.estimatedDelivery
    if (parsed.actualDelivery !== undefined) record.actualDelivery = parsed.actualDelivery
    if (parsed.deliveryLocationId !== undefined) record.deliveryLocationId = parsed.deliveryLocationId
    if (parsed.deliveryNotes !== undefined) record.deliveryNotes = parsed.deliveryNotes

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
      'bookingNumber', 'bolNumber', 'carrierCode', 'vesselName', 'vesselImo', 'voyageNumber',
      // Rich location data
      'originLocation', 'destinationLocation',
      // Multi-source timestamps
      'etdTimestamps', 'etaTimestamps', 'atdTimestamps', 'ataTimestamps',
      // Route and events
      'routeStops', 'cargoEvents', 'eventCount', 'lastEventAt',
      // Tracking integration
      'trackedShipmentId', 'lastSyncedAt', 'syncStatus',
      // Status and flags
      'status', 'isActive', 'extra', 'isHazardous', 'notes',
      // VGM & Customs
      'vgmStatus', 'vgmWeight', 'customsClearanceStatus', 'customsClearanceLocation',
      'pinCode', 'deliveryTime', 'dropOffLocation', 'cutOffDate',
      // CargoWise-aligned fields
      'packsCount', 'packType', 'innersCount', 'innerType',
      'loadingMeters', 'chargeableWeight', 'wvRatio',
      'marksAndNumbers', 'hsCode',
      'onBoardStatus', 'onBoardDate', 'blIssueDate', 'originalsCount', 'expressBillsCount',
      'carrierScac', 'imoNumber',
      'ctoReceivalDate', 'ctoCutOffDate', 'docsDueDate',
      'co2Emissions',
      'pickupRequiredFrom', 'pickupRequiredBy', 'estimatedPickup', 'actualPickup', 'pickupLocationId', 'pickupNotes',
      'deliveryRequiredBy', 'estimatedDelivery', 'actualDelivery', 'deliveryLocationId', 'deliveryNotes',
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
        bolNumber: before.bolNumber,
        carrierCode: before.carrierCode,
        vesselName: before.vesselName,
        vesselImo: before.vesselImo,
        voyageNumber: before.voyageNumber,
        // Rich location data
        originLocation: before.originLocation,
        destinationLocation: before.destinationLocation,
        // Multi-source timestamps
        etdTimestamps: before.etdTimestamps,
        etaTimestamps: before.etaTimestamps,
        atdTimestamps: before.atdTimestamps,
        ataTimestamps: before.ataTimestamps,
        // Route and events
        routeStops: before.routeStops,
        cargoEvents: before.cargoEvents,
        eventCount: before.eventCount,
        lastEventAt: before.lastEventAt,
        // Tracking integration
        trackedShipmentId: before.trackedShipmentId,
        lastSyncedAt: before.lastSyncedAt,
        syncStatus: before.syncStatus,
        // Status and flags
        status: before.status,
        isActive: before.isActive,
        extra: before.extra,
        isHazardous: before.isHazardous,
        notes: before.notes,
        // VGM & Customs
        vgmStatus: before.vgmStatus,
        vgmWeight: before.vgmWeight,
        customsClearanceStatus: before.customsClearanceStatus,
        customsClearanceLocation: before.customsClearanceLocation,
        pinCode: before.pinCode,
        deliveryTime: before.deliveryTime,
        dropOffLocation: before.dropOffLocation,
        cutOffDate: before.cutOffDate,
        // CargoWise-aligned fields
        packsCount: before.packsCount,
        packType: before.packType,
        innersCount: before.innersCount,
        innerType: before.innerType,
        loadingMeters: before.loadingMeters,
        chargeableWeight: before.chargeableWeight,
        wvRatio: before.wvRatio,
        marksAndNumbers: before.marksAndNumbers,
        hsCode: before.hsCode,
        onBoardStatus: before.onBoardStatus,
        onBoardDate: before.onBoardDate,
        blIssueDate: before.blIssueDate,
        originalsCount: before.originalsCount,
        expressBillsCount: before.expressBillsCount,
        carrierScac: before.carrierScac,
        imoNumber: before.imoNumber,
        ctoReceivalDate: before.ctoReceivalDate,
        ctoCutOffDate: before.ctoCutOffDate,
        docsDueDate: before.docsDueDate,
        co2Emissions: before.co2Emissions,
        pickupRequiredFrom: before.pickupRequiredFrom,
        pickupRequiredBy: before.pickupRequiredBy,
        estimatedPickup: before.estimatedPickup,
        actualPickup: before.actualPickup,
        pickupLocationId: before.pickupLocationId,
        pickupNotes: before.pickupNotes,
        deliveryRequiredBy: before.deliveryRequiredBy,
        estimatedDelivery: before.estimatedDelivery,
        actualDelivery: before.actualDelivery,
        deliveryLocationId: before.deliveryLocationId,
        deliveryNotes: before.deliveryNotes,
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
      container.bolNumber = before.bolNumber
      container.carrierCode = before.carrierCode
      container.vesselName = before.vesselName
      container.vesselImo = before.vesselImo
      container.voyageNumber = before.voyageNumber
      // Rich location data
      container.originLocation = before.originLocation
      container.destinationLocation = before.destinationLocation
      // Multi-source timestamps
      container.etdTimestamps = before.etdTimestamps
      container.etaTimestamps = before.etaTimestamps
      container.atdTimestamps = before.atdTimestamps
      container.ataTimestamps = before.ataTimestamps
      // Route and events
      container.routeStops = before.routeStops
      container.cargoEvents = before.cargoEvents
      container.eventCount = before.eventCount
      container.lastEventAt = before.lastEventAt
      // Tracking integration
      container.trackedShipmentId = before.trackedShipmentId
      container.lastSyncedAt = before.lastSyncedAt
      container.syncStatus = before.syncStatus
      // Status and flags
      container.status = before.status
      container.isActive = before.isActive
      container.extra = before.extra
      container.isHazardous = before.isHazardous
      container.notes = before.notes
      // VGM & Customs
      container.vgmStatus = before.vgmStatus
      container.vgmWeight = before.vgmWeight
      container.customsClearanceStatus = before.customsClearanceStatus
      container.customsClearanceLocation = before.customsClearanceLocation
      container.pinCode = before.pinCode
      container.deliveryTime = before.deliveryTime
      container.dropOffLocation = before.dropOffLocation
      container.cutOffDate = before.cutOffDate
      // CargoWise-aligned fields
      container.packsCount = before.packsCount
      container.packType = before.packType
      container.innersCount = before.innersCount
      container.innerType = before.innerType
      container.loadingMeters = before.loadingMeters
      container.chargeableWeight = before.chargeableWeight
      container.wvRatio = before.wvRatio
      container.marksAndNumbers = before.marksAndNumbers
      container.hsCode = before.hsCode
      container.onBoardStatus = before.onBoardStatus
      container.onBoardDate = before.onBoardDate
      container.blIssueDate = before.blIssueDate
      container.originalsCount = before.originalsCount
      container.expressBillsCount = before.expressBillsCount
      container.carrierScac = before.carrierScac
      container.imoNumber = before.imoNumber
      container.ctoReceivalDate = before.ctoReceivalDate
      container.ctoCutOffDate = before.ctoCutOffDate
      container.docsDueDate = before.docsDueDate
      container.co2Emissions = before.co2Emissions
      container.pickupRequiredFrom = before.pickupRequiredFrom
      container.pickupRequiredBy = before.pickupRequiredBy
      container.estimatedPickup = before.estimatedPickup
      container.actualPickup = before.actualPickup
      container.pickupLocationId = before.pickupLocationId
      container.pickupNotes = before.pickupNotes
      container.deliveryRequiredBy = before.deliveryRequiredBy
      container.estimatedDelivery = before.estimatedDelivery
      container.actualDelivery = before.actualDelivery
      container.deliveryLocationId = before.deliveryLocationId
      container.deliveryNotes = before.deliveryNotes
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
        bolNumber: before.bolNumber,
        carrierCode: before.carrierCode,
        vesselName: before.vesselName,
        vesselImo: before.vesselImo,
        voyageNumber: before.voyageNumber,
        // Rich location data
        originLocation: before.originLocation,
        destinationLocation: before.destinationLocation,
        // Multi-source timestamps
        etdTimestamps: before.etdTimestamps,
        etaTimestamps: before.etaTimestamps,
        atdTimestamps: before.atdTimestamps,
        ataTimestamps: before.ataTimestamps,
        // Route and events
        routeStops: before.routeStops,
        cargoEvents: before.cargoEvents,
        eventCount: before.eventCount,
        lastEventAt: before.lastEventAt,
        // Tracking integration
        trackedShipmentId: before.trackedShipmentId,
        lastSyncedAt: before.lastSyncedAt,
        syncStatus: before.syncStatus,
        // Status and flags
        status: before.status,
        isActive: before.isActive,
        extra: before.extra,
        isHazardous: before.isHazardous,
        notes: before.notes,
        // VGM & Customs
        vgmStatus: before.vgmStatus,
        vgmWeight: before.vgmWeight,
        customsClearanceStatus: before.customsClearanceStatus,
        customsClearanceLocation: before.customsClearanceLocation,
        pinCode: before.pinCode,
        deliveryTime: before.deliveryTime,
        dropOffLocation: before.dropOffLocation,
        cutOffDate: before.cutOffDate,
        // CargoWise-aligned fields
        packsCount: before.packsCount,
        packType: before.packType,
        innersCount: before.innersCount,
        innerType: before.innerType,
        loadingMeters: before.loadingMeters,
        chargeableWeight: before.chargeableWeight,
        wvRatio: before.wvRatio,
        marksAndNumbers: before.marksAndNumbers,
        hsCode: before.hsCode,
        onBoardStatus: before.onBoardStatus,
        onBoardDate: before.onBoardDate,
        blIssueDate: before.blIssueDate,
        originalsCount: before.originalsCount,
        expressBillsCount: before.expressBillsCount,
        carrierScac: before.carrierScac,
        imoNumber: before.imoNumber,
        ctoReceivalDate: before.ctoReceivalDate,
        ctoCutOffDate: before.ctoCutOffDate,
        docsDueDate: before.docsDueDate,
        co2Emissions: before.co2Emissions,
        pickupRequiredFrom: before.pickupRequiredFrom,
        pickupRequiredBy: before.pickupRequiredBy,
        estimatedPickup: before.estimatedPickup,
        actualPickup: before.actualPickup,
        pickupLocationId: before.pickupLocationId,
        pickupNotes: before.pickupNotes,
        deliveryRequiredBy: before.deliveryRequiredBy,
        estimatedDelivery: before.estimatedDelivery,
        actualDelivery: before.actualDelivery,
        deliveryLocationId: before.deliveryLocationId,
        deliveryNotes: before.deliveryNotes,
        createdAt: before.createdAt ?? now,
        updatedAt: now,
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
