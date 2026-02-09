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
import { FmsRfq } from '../data/entities'
import {
  fmsRfqCreateSchema,
  fmsRfqUpdateSchema,
  type FmsRfqCreateInput,
  type FmsRfqUpdateInput,
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

const rfqCrudIndexer: CrudIndexerConfig<FmsRfq> = {
  entityType: E.fms_offers.fms_rfq,
}

type RfqSnapshot = {
  id: string
  organizationId: string
  tenantId: string
  title: string | null
  description: string | null
  origin: string | null
  destination: string | null
  originLocationId: string | null
  destinationLocationId: string | null
  placeOfLoading: string | null
  placeOfLoadingId: string | null
  placeOfDelivery: string | null
  placeOfDeliveryId: string | null
  containerCount: number | null
  direction: string | null
  transportMode: string | null
  cargoType: string | null
  companyName: string | null
  contactPerson: string | null
  context: string | null
  status: string
  assignedToId: string | null
  createdAt: Date
  updatedAt: Date
}

type RfqUndoPayload = {
  before?: RfqSnapshot | null
  after?: RfqSnapshot | null
}

async function loadRfqSnapshot(em: EntityManager, id: string): Promise<RfqSnapshot | null> {
  const rfq = await em.findOne(FmsRfq, { id, deletedAt: null })
  if (!rfq) return null

  return {
    id: rfq.id,
    organizationId: rfq.organizationId,
    tenantId: rfq.tenantId,
    title: rfq.title ?? null,
    description: rfq.description ?? null,
    origin: rfq.origin ?? null,
    destination: rfq.destination ?? null,
    originLocationId: rfq.originLocationId ?? null,
    destinationLocationId: rfq.destinationLocationId ?? null,
    placeOfLoading: rfq.placeOfLoading ?? null,
    placeOfLoadingId: rfq.placeOfLoadingId ?? null,
    placeOfDelivery: rfq.placeOfDelivery ?? null,
    placeOfDeliveryId: rfq.placeOfDeliveryId ?? null,
    containerCount: rfq.containerCount ?? null,
    direction: rfq.direction ?? null,
    transportMode: rfq.transportMode ?? null,
    cargoType: rfq.cargoType ?? null,
    companyName: rfq.companyName ?? null,
    contactPerson: rfq.contactPerson ?? null,
    context: rfq.context ?? null,
    status: rfq.status ?? 'incoming',
    assignedToId: rfq.assignedToId ?? null,
    createdAt: rfq.createdAt,
    updatedAt: rfq.updatedAt,
  }
}

const createRfqCommand: CommandHandler<FmsRfqCreateInput, { rfqId: string }> = {
  id: 'fms_offers.rfq.create',
  async execute(input, ctx) {
    const parsed = fmsRfqCreateSchema.parse(input)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const now = new Date()
    const rfq = em.create(FmsRfq, {
      organizationId: parsed.organizationId,
      tenantId: parsed.tenantId,
      title: parsed.title ?? null,
      description: parsed.description ?? null,
      origin: parsed.origin ?? null,
      destination: parsed.destination ?? null,
      originLocationId: parsed.originLocationId ?? null,
      destinationLocationId: parsed.destinationLocationId ?? null,
      placeOfLoading: parsed.placeOfLoading ?? null,
      placeOfLoadingId: parsed.placeOfLoadingId ?? null,
      placeOfDelivery: parsed.placeOfDelivery ?? null,
      placeOfDeliveryId: parsed.placeOfDeliveryId ?? null,
      containerCount: parsed.containerCount ?? null,
      direction: parsed.direction ?? null,
      transportMode: parsed.transportMode ?? null,
      cargoType: parsed.cargoType ?? null,
      companyName: parsed.companyName ?? null,
      contactPerson: parsed.contactPerson ?? null,
      context: parsed.context ?? null,
      status: parsed.status ?? 'incoming',
      assignedToId: parsed.assignedToId ?? null,
      createdAt: now,
      updatedAt: now,
    })

    await em.persistAndFlush(rfq)

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: rfq,
      identifiers: {
        id: rfq.id,
        organizationId: rfq.organizationId,
        tenantId: rfq.tenantId,
      },
      indexer: rfqCrudIndexer,
    })

    return { rfqId: rfq.id }
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve('em') as EntityManager
    return await loadRfqSnapshot(em, result.rfqId)
  },
  buildLog: async ({ result, ctx }) => {
    const { translate } = await resolveTranslations()
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadRfqSnapshot(em, result.rfqId)
    return {
      actionLabel: translate('fms_offers.audit.rfq.create', 'Create RFQ'),
      resourceKind: 'fms_offers.rfq',
      resourceId: result.rfqId,
      tenantId: snapshot?.tenantId ?? null,
      organizationId: snapshot?.organizationId ?? null,
      snapshotAfter: snapshot ?? null,
      payload: {
        undo: {
          after: snapshot,
        } satisfies RfqUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const rfqId = logEntry?.resourceId
    if (!rfqId) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const rfq = await em.findOne(FmsRfq, { id: rfqId })
    if (!rfq) return
    em.remove(rfq)
    await em.flush()
  },
}

const updateRfqCommand: CommandHandler<FmsRfqUpdateInput, { rfqId: string }> = {
  id: 'fms_offers.rfq.update',
  async prepare(input, ctx) {
    const parsed = fmsRfqUpdateSchema.parse(input)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const snapshot = await loadRfqSnapshot(em, parsed.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const parsed = fmsRfqUpdateSchema.parse(input)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const rfq = await em.findOne(FmsRfq, { id: parsed.id, deletedAt: null })
    const record = assertRecordFound(rfq, 'RFQ not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    if (parsed.title !== undefined) record.title = parsed.title
    if (parsed.description !== undefined) record.description = parsed.description
    if (parsed.origin !== undefined) record.origin = parsed.origin
    if (parsed.destination !== undefined) record.destination = parsed.destination
    if (parsed.originLocationId !== undefined) record.originLocationId = parsed.originLocationId
    if (parsed.destinationLocationId !== undefined) record.destinationLocationId = parsed.destinationLocationId
    if (parsed.placeOfLoading !== undefined) record.placeOfLoading = parsed.placeOfLoading
    if (parsed.placeOfLoadingId !== undefined) record.placeOfLoadingId = parsed.placeOfLoadingId
    if (parsed.placeOfDelivery !== undefined) record.placeOfDelivery = parsed.placeOfDelivery
    if (parsed.placeOfDeliveryId !== undefined) record.placeOfDeliveryId = parsed.placeOfDeliveryId
    if (parsed.containerCount !== undefined) record.containerCount = parsed.containerCount
    if (parsed.direction !== undefined) record.direction = parsed.direction
    if (parsed.transportMode !== undefined) record.transportMode = parsed.transportMode
    if (parsed.cargoType !== undefined) record.cargoType = parsed.cargoType
    if (parsed.companyName !== undefined) record.companyName = parsed.companyName
    if (parsed.contactPerson !== undefined) record.contactPerson = parsed.contactPerson
    if (parsed.context !== undefined) record.context = parsed.context
    if (parsed.status !== undefined) record.status = parsed.status as any
    if (parsed.assignedToId !== undefined) record.assignedToId = parsed.assignedToId

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
      indexer: rfqCrudIndexer,
    })

    return { rfqId: record.id }
  },
  buildLog: async ({ snapshots, ctx }) => {
    const { translate } = await resolveTranslations()
    const before = snapshots.before as RfqSnapshot | undefined
    if (!before) return null
    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadRfqSnapshot(em, before.id)
    const changeKeys: readonly string[] = [
      'title',
      'description',
      'origin',
      'destination',
      'originLocationId',
      'destinationLocationId',
      'placeOfLoading',
      'placeOfLoadingId',
      'placeOfDelivery',
      'placeOfDeliveryId',
      'containerCount',
      'direction',
      'transportMode',
      'cargoType',
      'companyName',
      'contactPerson',
      'context',
      'status',
      'assignedToId',
    ]
    const changes = afterSnapshot
      ? buildChanges(
          before as unknown as Record<string, unknown>,
          afterSnapshot as unknown as Record<string, unknown>,
          changeKeys
        )
      : {}

    return {
      actionLabel: translate('fms_offers.audit.rfq.update', 'Update RFQ'),
      resourceKind: 'fms_offers.rfq',
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
        } satisfies RfqUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<RfqUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const rfq = await em.findOne(FmsRfq, { id: before.id })
    if (!rfq) return

    rfq.title = before.title
    rfq.description = before.description
    rfq.origin = before.origin
    rfq.destination = before.destination
    rfq.originLocationId = before.originLocationId
    rfq.destinationLocationId = before.destinationLocationId
    rfq.placeOfLoading = before.placeOfLoading
    rfq.placeOfLoadingId = before.placeOfLoadingId
    rfq.placeOfDelivery = before.placeOfDelivery
    rfq.placeOfDeliveryId = before.placeOfDeliveryId
    rfq.containerCount = before.containerCount
    rfq.direction = before.direction as any
    rfq.transportMode = before.transportMode as any
    rfq.cargoType = before.cargoType as any
    rfq.companyName = before.companyName
    rfq.contactPerson = before.contactPerson
    rfq.context = before.context
    rfq.status = before.status as any
    rfq.assignedToId = before.assignedToId

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudUndoSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: rfq,
      identifiers: {
        id: rfq.id,
        organizationId: rfq.organizationId,
        tenantId: rfq.tenantId,
      },
      indexer: rfqCrudIndexer,
    })
  },
}

const deleteRfqCommand: CommandHandler<{ body?: Record<string, unknown>; query?: Record<string, unknown> }, { rfqId: string }> = {
  id: 'fms_offers.rfq.delete',
  async prepare(input, ctx) {
    const id = requireId(input, 'RFQ id required')
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadRfqSnapshot(em, id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const id = requireId(input, 'RFQ id required')
    const em = ctx.container.resolve('em') as EntityManager
    const rfq = await em.findOne(FmsRfq, { id, deletedAt: null })
    const record = assertRecordFound(rfq, 'RFQ not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

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
      indexer: rfqCrudIndexer,
    })

    return { rfqId: record.id }
  },
  buildLog: async ({ snapshots }) => {
    const before = snapshots.before as RfqSnapshot | undefined
    if (!before) return null
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('fms_offers.audit.rfq.delete', 'Delete RFQ'),
      resourceKind: 'fms_offers.rfq',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      payload: {
        undo: {
          before,
        } satisfies RfqUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<RfqUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    let rfq = await em.findOne(FmsRfq, { id: before.id })
    if (!rfq) {
      rfq = em.create(FmsRfq, {
        id: before.id,
        organizationId: before.organizationId,
        tenantId: before.tenantId,
        title: before.title,
        description: before.description,
        origin: before.origin,
        destination: before.destination,
        originLocationId: before.originLocationId,
        destinationLocationId: before.destinationLocationId,
        placeOfLoading: before.placeOfLoading,
        placeOfLoadingId: before.placeOfLoadingId,
        placeOfDelivery: before.placeOfDelivery,
        placeOfDeliveryId: before.placeOfDeliveryId,
        containerCount: before.containerCount,
        direction: before.direction as any,
        transportMode: before.transportMode as any,
        cargoType: before.cargoType as any,
        companyName: before.companyName,
        contactPerson: before.contactPerson,
        context: before.context,
        status: before.status as any,
        assignedToId: before.assignedToId,
        createdAt: before.createdAt,
        updatedAt: before.updatedAt,
      })
      em.persist(rfq)
    } else {
      rfq.deletedAt = null
    }

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudUndoSideEffects({
      dataEngine: de,
      action: 'created',
      entity: rfq,
      identifiers: {
        id: rfq.id,
        organizationId: rfq.organizationId,
        tenantId: rfq.tenantId,
      },
      indexer: rfqCrudIndexer,
    })
  },
}

registerCommand(createRfqCommand)
registerCommand(updateRfqCommand)
registerCommand(deleteRfqCommand)
