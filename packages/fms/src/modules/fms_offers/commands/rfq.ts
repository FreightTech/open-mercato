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
import { FmsRfq, FmsRfqItem } from '../data/entities'
import {
  fmsRfqCreateSchema,
  fmsRfqUpdateSchema,
  fmsRfqItemCreateSchema,
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
  contractorId: string | null
  contactPerson: string | null
  contactPersonId: string | null
  context: string | null
  status: string
  assignedToId: string | null
  rawText: string | null
  senderEmail: string | null
  senderName: string | null
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
    contractorId: rfq.contractorId ?? null,
    contactPerson: rfq.contactPerson ?? null,
    contactPersonId: rfq.contactPersonId ?? null,
    context: rfq.context ?? null,
    status: rfq.status ?? 'incoming',
    assignedToId: rfq.assignedToId ?? null,
    rawText: rfq.rawText ?? null,
    senderEmail: rfq.senderEmail ?? null,
    senderName: rfq.senderName ?? null,
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
      contractorId: parsed.contractorId ?? null,
      contactPerson: parsed.contactPerson ?? null,
      contactPersonId: parsed.contactPersonId ?? null,
      context: parsed.context ?? null,
      status: parsed.status ?? 'incoming',
      assignedToId: parsed.assignedToId ?? null,
      rawText: parsed.rawText ?? null,
      senderEmail: parsed.senderEmail ?? null,
      senderName: parsed.senderName ?? null,
      extractedData: parsed.extractedData ?? null,
      highlights: (parsed.highlights as FmsRfq['highlights']) ?? null,
      createdAt: now,
      updatedAt: now,
    })

    await em.persist(rfq).flush()

    // Create RFQ items if provided (from LLM extraction)
    const items = (input as any).items as Array<Record<string, unknown>> | undefined
    if (items && Array.isArray(items) && items.length > 0) {
      const itemEm = (ctx.container.resolve('em') as EntityManager).fork()
      for (let i = 0; i < items.length; i++) {
        const itemData = fmsRfqItemCreateSchema.parse({
          ...items[i],
          rfqId: rfq.id,
          organizationId: rfq.organizationId,
          tenantId: rfq.tenantId,
          itemNumber: i + 1,
        })
        itemEm.create(FmsRfqItem, {
          rfq: itemEm.getReference(FmsRfq, rfq.id),
          organizationId: itemData.organizationId,
          tenantId: itemData.tenantId,
          itemNumber: itemData.itemNumber ?? i + 1,
          containerType: itemData.containerType ?? null,
          containerCount: itemData.containerCount ?? null,
          origin: itemData.origin ?? null,
          destination: itemData.destination ?? null,
          originLocationId: itemData.originLocationId ?? null,
          destinationLocationId: itemData.destinationLocationId ?? null,
          cargoDescription: itemData.cargoDescription ?? null,
          weightKg: itemData.weightKg != null ? String(itemData.weightKg) : null,
          readinessDate: itemData.readinessDate ?? null,
          incoterm: itemData.incoterm ?? null,
          transportMode: itemData.transportMode ?? null,
          notes: itemData.notes ?? null,
        })
      }
      await itemEm.flush()
    }

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
    if (parsed.contractorId !== undefined) record.contractorId = parsed.contractorId
    if (parsed.contactPerson !== undefined) record.contactPerson = parsed.contactPerson
    if (parsed.contactPersonId !== undefined) record.contactPersonId = parsed.contactPersonId
    if (parsed.context !== undefined) record.context = parsed.context
    if (parsed.status !== undefined) record.status = parsed.status as any
    if (parsed.assignedToId !== undefined) record.assignedToId = parsed.assignedToId
    if (parsed.rawText !== undefined) record.rawText = parsed.rawText
    if (parsed.senderEmail !== undefined) record.senderEmail = parsed.senderEmail
    if (parsed.senderName !== undefined) record.senderName = parsed.senderName
    if (parsed.extractedData !== undefined) record.extractedData = parsed.extractedData
    if (parsed.highlights !== undefined) record.highlights = parsed.highlights as FmsRfq['highlights']

    record.updatedAt = new Date()
    await em.flush()

    // Handle items: if provided, soft-delete existing items and create new ones
    const items = (input as any).items as Array<Record<string, unknown>> | undefined
    if (items && Array.isArray(items)) {
      const itemEm = (ctx.container.resolve('em') as EntityManager).fork()
      // Soft-delete existing items
      const existingItems = await itemEm.find(FmsRfqItem, { rfq: record.id, deletedAt: null })
      for (const existing of existingItems) {
        existing.deletedAt = new Date()
      }
      await itemEm.flush()

      // Create new items
      if (items.length > 0) {
        const createEm = (ctx.container.resolve('em') as EntityManager).fork()
        const itemNow = new Date()
        for (let i = 0; i < items.length; i++) {
          const itemData = fmsRfqItemCreateSchema.parse({
            ...items[i],
            rfqId: record.id,
            organizationId: record.organizationId,
            tenantId: record.tenantId,
            itemNumber: i + 1,
          })
          createEm.create(FmsRfqItem, {
            rfq: createEm.getReference(FmsRfq, record.id),
            organizationId: itemData.organizationId,
            tenantId: itemData.tenantId,
            itemNumber: itemData.itemNumber ?? i + 1,
            containerType: itemData.containerType ?? null,
            containerCount: itemData.containerCount ?? null,
            origin: itemData.origin ?? null,
            destination: itemData.destination ?? null,
            originLocationId: itemData.originLocationId ?? null,
            destinationLocationId: itemData.destinationLocationId ?? null,
            cargoDescription: itemData.cargoDescription ?? null,
            weightKg: itemData.weightKg != null ? String(itemData.weightKg) : null,
            readinessDate: itemData.readinessDate ?? null,
            incoterm: itemData.incoterm ?? null,
            transportMode: itemData.transportMode ?? null,
            notes: itemData.notes ?? null,
            createdAt: itemNow,
            updatedAt: itemNow,
          })
        }
        await createEm.flush()
      }
    }

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
      'contractorId',
      'contactPerson',
      'contactPersonId',
      'context',
      'status',
      'assignedToId',
      'rawText',
      'senderEmail',
      'senderName',
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
    rfq.contractorId = before.contractorId
    rfq.contactPerson = before.contactPerson
    rfq.contactPersonId = before.contactPersonId
    rfq.context = before.context
    rfq.status = before.status as any
    rfq.assignedToId = before.assignedToId
    rfq.rawText = before.rawText
    rfq.senderEmail = before.senderEmail
    rfq.senderName = before.senderName

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
        contractorId: before.contractorId,
        contactPerson: before.contactPerson,
        contactPersonId: before.contactPersonId,
        context: before.context,
        status: before.status as any,
        assignedToId: before.assignedToId,
        rawText: before.rawText,
        senderEmail: before.senderEmail,
        senderName: before.senderName,
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
