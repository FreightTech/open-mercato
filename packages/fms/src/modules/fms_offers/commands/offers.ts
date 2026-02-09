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
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { FmsOffer, FmsOfferCalculation, FmsOfferLine, FmsRfq } from '../data/entities'
import {
  fmsOfferUpdateSchema,
  type FmsOfferUpdateInput,
} from '../data/validators'
import {
  ensureOrganizationScope,
  ensureTenantScope,
  extractUndoPayload,
  assertRecordFound,
  emitQueryIndexDeleteEvents,
  emitQueryIndexUpsertEvents,
  generateOfferNumber,
  type QueryIndexEventEntry,
} from './shared'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { CrudIndexerConfig } from '@open-mercato/shared/lib/crud/types'
import { E } from '#generated/entities.ids.generated'
import { z } from 'zod'

const offerCrudIndexer: CrudIndexerConfig<FmsOffer> = {
  entityType: E.fms_offers.fms_offer,
}

type OfferSnapshot = {
  id: string
  rfqId: string | null
  organizationId: string
  tenantId: string
  offerNumber: string
  version: number
  status: string
  direction: string | null
  transportMode: string | null
  cargoType: string | null
  validUntil: Date | null
  paymentTerms: string | null
  specialTerms: string | null
  customerNotes: string | null
  notes: string | null
  supersededById: string | null
  assignedToId: string | null
  operationalGuardianId: string | null
  businessGuardianId: string | null
  documentId: string | null
  sentAt: Date | null
  exchangeRates: { fromCurrencyCode: string; toCurrencyCode: string; rate: string; date: string; source: string }[] | null
  createdAt: Date
  updatedAt: Date
}

type OfferUndoPayload = {
  before?: OfferSnapshot | null
  after?: OfferSnapshot | null
}

async function loadOfferSnapshot(em: EntityManager, id: string): Promise<OfferSnapshot | null> {
  const offer = await em.findOne(FmsOffer, { id, deletedAt: null }, {
    populate: ['rfq'],
  })
  if (!offer) return null

  const rfqId = offer.rfq ? (typeof offer.rfq === 'string' ? offer.rfq : offer.rfq?.id) : null

  return {
    id: offer.id,
    rfqId: rfqId ?? null,
    organizationId: offer.organizationId,
    tenantId: offer.tenantId,
    offerNumber: offer.offerNumber,
    version: offer.version,
    status: offer.status,
    direction: offer.direction ?? null,
    transportMode: offer.transportMode ?? null,
    cargoType: offer.cargoType ?? null,
    validUntil: offer.validUntil ?? null,
    paymentTerms: offer.paymentTerms ?? null,
    specialTerms: offer.specialTerms ?? null,
    customerNotes: offer.customerNotes ?? null,
    notes: offer.notes ?? null,
    supersededById: offer.supersededById ?? null,
    assignedToId: offer.assignedToId ?? null,
    operationalGuardianId: offer.operationalGuardianId ?? null,
    businessGuardianId: offer.businessGuardianId ?? null,
    documentId: offer.documentId ?? null,
    sentAt: offer.sentAt ?? null,
    exchangeRates: offer.exchangeRates ?? null,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
  }
}

// Extended create schema for creating an offer (optionally from RFQ)
const createOfferInputSchema = z.object({
  rfqId: z.string().uuid().optional().nullable(),
  validUntil: z.coerce.date(),
  direction: z.string().optional().nullable(),
  transportMode: z.string().optional().nullable(),
  cargoType: z.string().optional().nullable(),
  paymentTerms: z.string().trim().max(255).optional().nullable(),
  specialTerms: z.string().trim().max(2000).optional().nullable(),
  customerNotes: z.string().trim().max(2000).optional().nullable(),
  exchangeRates: z.array(z.object({
    fromCurrencyCode: z.string().trim().regex(/^[A-Z]{3}$/),
    toCurrencyCode: z.string().trim().regex(/^[A-Z]{3}$/),
    rate: z.string().trim(),
    date: z.string().trim(),
    source: z.string().trim(),
  })).optional().nullable(),
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
})

type CreateOfferInput = z.infer<typeof createOfferInputSchema>

const createOfferCommand: CommandHandler<CreateOfferInput, { offerId: string }> = {
  id: 'fms_offers.offers.create',
  async execute(input, ctx) {
    const parsed = createOfferInputSchema.parse(input)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    // Generate offer number
    const offerNumber = await generateOfferNumber(em, parsed.tenantId, parsed.organizationId)

    const now = new Date()
    const offer = em.create(FmsOffer, {
      organizationId: parsed.organizationId,
      tenantId: parsed.tenantId,
      offerNumber,
      version: 1,
      status: 'draft',
      direction: (parsed.direction as any) ?? null,
      transportMode: (parsed.transportMode as any) ?? null,
      cargoType: (parsed.cargoType as any) ?? null,
      validUntil: new Date(parsed.validUntil),
      paymentTerms: parsed.paymentTerms ?? null,
      specialTerms: parsed.specialTerms ?? null,
      customerNotes: parsed.customerNotes ?? null,
      exchangeRates: parsed.exchangeRates ?? null,
      createdAt: now,
      updatedAt: now,
    })

    // Link to RFQ if provided
    if (parsed.rfqId) {
      const rfq = await em.findOne(FmsRfq, { id: parsed.rfqId, deletedAt: null })
      if (!rfq) {
        throw new CrudHttpError(404, { error: 'RFQ not found' })
      }
      ensureTenantScope(ctx, rfq.tenantId)
      ensureOrganizationScope(ctx, rfq.organizationId)
      offer.rfq = rfq

      // Copy shipment-level fields from RFQ if not provided
      if (!parsed.direction && rfq.direction) offer.direction = rfq.direction
      if (!parsed.transportMode && rfq.transportMode) offer.transportMode = rfq.transportMode
      if (!parsed.cargoType && rfq.cargoType) offer.cargoType = rfq.cargoType
    }

    em.persist(offer)
    await em.flush()

    // Create a default calculation with auto-populated products
    const { FmsProduct } = await import('../../fms_products/data/entities')

    const calculation = em.create(FmsOfferCalculation, {
      offer,
      organizationId: offer.organizationId,
      tenantId: offer.tenantId,
      calculationNumber: 1,
      label: 'Calculation 1',
      createdAt: now,
      updatedAt: now,
    })
    em.persist(calculation)
    await em.flush()

    // Auto-populate with active products
    const products = await em.find(FmsProduct, {
      organizationId: offer.organizationId,
      tenantId: offer.tenantId,
      isActive: true,
      deletedAt: null,
    }, { populate: ['chargeCode'] })

    for (let i = 0; i < products.length; i++) {
      const product = products[i]
      const line = em.create(FmsOfferLine, {
        calculation,
        organizationId: offer.organizationId,
        tenantId: offer.tenantId,
        lineNumber: i + 1,
        productId: product.id,
        productName: product.name,
        chargeCode: product.chargeCode?.code ?? null,
        currencyCode: 'USD',
        rate: '0',
        buyPrice: '0',
        sellPrice: '0',
        isEnabled: false,
        createdAt: now,
        updatedAt: now,
      })
      em.persist(line)
    }

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: offer,
      identifiers: {
        id: offer.id,
        organizationId: offer.organizationId,
        tenantId: offer.tenantId,
      },
      indexer: offerCrudIndexer,
    })

    return { offerId: offer.id }
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve('em') as EntityManager
    return await loadOfferSnapshot(em, result.offerId)
  },
  buildLog: async ({ result, ctx }) => {
    const { translate } = await resolveTranslations()
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadOfferSnapshot(em, result.offerId)
    return {
      actionLabel: translate('fms_offers.audit.offers.create', 'Create offer'),
      resourceKind: 'fms_offers.offer',
      resourceId: result.offerId,
      tenantId: snapshot?.tenantId ?? null,
      organizationId: snapshot?.organizationId ?? null,
      snapshotAfter: snapshot ?? null,
      payload: {
        undo: {
          after: snapshot,
        } satisfies OfferUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const offerId = logEntry?.resourceId
    if (!offerId) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const offer = await em.findOne(FmsOffer, { id: offerId }, { populate: ['calculations'] })
    if (!offer) return

    // Delete all calculations and their lines
    for (const calc of offer.calculations.getItems()) {
      await em.nativeDelete(FmsOfferLine, { calculation: calc })
    }
    await em.nativeDelete(FmsOfferCalculation, { offer })

    em.remove(offer)
    await em.flush()
  },
}

const updateOfferCommand: CommandHandler<FmsOfferUpdateInput, { offerId: string }> = {
  id: 'fms_offers.offers.update',
  async prepare(input, ctx) {
    const parsed = fmsOfferUpdateSchema.parse(input)
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadOfferSnapshot(em, parsed.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const parsed = fmsOfferUpdateSchema.parse(input)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const offer = await em.findOne(FmsOffer, { id: parsed.id, deletedAt: null }, { populate: ['rfq'] })
    const record = assertRecordFound(offer, 'Offer not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    if (parsed.status !== undefined) record.status = parsed.status
    if (parsed.validUntil !== undefined) record.validUntil = new Date(parsed.validUntil)
    if (parsed.direction !== undefined) record.direction = parsed.direction
    if (parsed.transportMode !== undefined) record.transportMode = parsed.transportMode
    if (parsed.cargoType !== undefined) record.cargoType = parsed.cargoType
    if (parsed.paymentTerms !== undefined) record.paymentTerms = parsed.paymentTerms
    if (parsed.specialTerms !== undefined) record.specialTerms = parsed.specialTerms
    if (parsed.customerNotes !== undefined) record.customerNotes = parsed.customerNotes
    if (parsed.notes !== undefined) record.notes = parsed.notes
    if (parsed.supersededById !== undefined) record.supersededById = parsed.supersededById
    if (parsed.documentId !== undefined) record.documentId = parsed.documentId
    if (parsed.version !== undefined) record.version = parsed.version
    if (parsed.exchangeRates !== undefined) record.exchangeRates = parsed.exchangeRates

    // Handle rfqId change
    if (parsed.rfqId !== undefined) {
      if (parsed.rfqId === null) {
        record.rfq = null
      } else {
        const newRfq = await em.findOne(FmsRfq, { id: parsed.rfqId, deletedAt: null })
        if (!newRfq) {
          throw new CrudHttpError(404, { error: 'RFQ not found' })
        }
        ensureTenantScope(ctx, newRfq.tenantId)
        ensureOrganizationScope(ctx, newRfq.organizationId)
        record.rfq = newRfq
      }
    }

    if (parsed.assignedToId !== undefined) record.assignedToId = parsed.assignedToId
    if (parsed.operationalGuardianId !== undefined) record.operationalGuardianId = parsed.operationalGuardianId
    if (parsed.businessGuardianId !== undefined) record.businessGuardianId = parsed.businessGuardianId

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
      indexer: offerCrudIndexer,
    })

    return { offerId: record.id }
  },
  buildLog: async ({ snapshots, ctx }) => {
    const { translate } = await resolveTranslations()
    const before = snapshots.before as OfferSnapshot | undefined
    if (!before) return null
    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadOfferSnapshot(em, before.id)
    const changeKeys: readonly string[] = [
      'status',
      'direction',
      'transportMode',
      'cargoType',
      'validUntil',
      'paymentTerms',
      'specialTerms',
      'customerNotes',
      'notes',
      'supersededById',
      'assignedToId',
      'documentId',
      'sentAt',
      'version',
      'rfqId',
    ]
    const changes = afterSnapshot
      ? buildChanges(
          before as unknown as Record<string, unknown>,
          afterSnapshot as unknown as Record<string, unknown>,
          changeKeys
        )
      : {}

    return {
      actionLabel: translate('fms_offers.audit.offers.update', 'Update offer'),
      resourceKind: 'fms_offers.offer',
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
        } satisfies OfferUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<OfferUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    let offer = await em.findOne(FmsOffer, { id: before.id })
    if (!offer) return

    offer.status = before.status as any
    offer.direction = before.direction as any
    offer.transportMode = before.transportMode as any
    offer.cargoType = before.cargoType as any
    offer.validUntil = before.validUntil
    offer.paymentTerms = before.paymentTerms
    offer.specialTerms = before.specialTerms
    offer.customerNotes = before.customerNotes
    offer.notes = before.notes
    offer.supersededById = before.supersededById
    offer.documentId = before.documentId
    offer.exchangeRates = before.exchangeRates
    offer.operationalGuardianId = before.operationalGuardianId ?? null
    offer.businessGuardianId = before.businessGuardianId ?? null
    offer.assignedToId = before.assignedToId ?? null

    if (before.rfqId) {
      offer.rfq = em.getReference(FmsRfq, before.rfqId)
    } else {
      offer.rfq = null
    }

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudUndoSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: offer,
      identifiers: {
        id: offer.id,
        organizationId: offer.organizationId,
        tenantId: offer.tenantId,
      },
      indexer: offerCrudIndexer,
    })
  },
}

const deleteOfferCommand: CommandHandler<{ body?: Record<string, unknown>; query?: Record<string, unknown> }, { offerId: string }> = {
  id: 'fms_offers.offers.delete',
  async prepare(input, ctx) {
    const id = requireId(input, 'Offer id required')
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadOfferSnapshot(em, id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Offer id required')
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const offer = await em.findOne(FmsOffer, { id, deletedAt: null }, { populate: ['calculations'] })
    const record = assertRecordFound(offer, 'Offer not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    if (record.status !== 'draft') {
      throw new CrudHttpError(400, { error: 'Only draft offers can be deleted' })
    }

    // Soft delete offer
    record.deletedAt = new Date()

    // Soft delete all calculations and their lines
    const indexDeletes: QueryIndexEventEntry[] = []
    for (const calc of record.calculations.getItems()) {
      calc.deletedAt = new Date()
      const lines = await em.find(FmsOfferLine, { calculation: calc })
      for (const line of lines) {
        line.deletedAt = new Date()
        indexDeletes.push({
          entityType: E.fms_offers.fms_offer_line,
          recordId: line.id,
          tenantId: record.tenantId,
          organizationId: record.organizationId,
        })
      }
    }

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
      indexer: offerCrudIndexer,
    })

    await emitQueryIndexDeleteEvents(ctx, indexDeletes)

    return { offerId: record.id }
  },
  buildLog: async ({ snapshots }) => {
    const before = snapshots.before as OfferSnapshot | undefined
    if (!before) return null
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('fms_offers.audit.offers.delete', 'Delete offer'),
      resourceKind: 'fms_offers.offer',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      payload: {
        undo: {
          before,
        } satisfies OfferUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<OfferUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    let offer = await em.findOne(FmsOffer, { id: before.id })
    if (!offer) return

    offer.deletedAt = null
    offer.exchangeRates = before.exchangeRates
    offer.operationalGuardianId = before.operationalGuardianId ?? null
    offer.businessGuardianId = before.businessGuardianId ?? null
    offer.assignedToId = before.assignedToId ?? null

    // Restore calculations and lines
    const calcs = await em.find(FmsOfferCalculation, { offer: before.id })
    for (const calc of calcs) {
      calc.deletedAt = null
      const lines = await em.find(FmsOfferLine, { calculation: calc })
      for (const line of lines) {
        line.deletedAt = null
      }
    }

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudUndoSideEffects({
      dataEngine: de,
      action: 'created',
      entity: offer,
      identifiers: {
        id: offer.id,
        organizationId: offer.organizationId,
        tenantId: offer.tenantId,
      },
      indexer: offerCrudIndexer,
    })
  },
}

registerCommand(createOfferCommand)
registerCommand(updateOfferCommand)
registerCommand(deleteOfferCommand)
