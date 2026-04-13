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
import { FmsOffer, FmsOfferCalculation, FmsOfferLine, FmsRfq, FmsRfqItem } from '../data/entities'
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
  type: string
  rfqId: string | null
  contractorId: string | null
  carrierId: string | null
  carrierIds: string[] | null
  providerIds: string[] | null
  contactPersonId: string | null
  billingAddressId: string | null
  organizationId: string
  tenantId: string
  offerNumber: string
  version: number
  status: string
  incoterm: string | null
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
  baseCurrency: string | null
  exchangeRates: { fromCurrencyCode: string; toCurrencyCode: string; rate: string; date: string; source: string }[] | null
  costGroupingMode: string | null
  groupId: string | null
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
    type: offer.type ?? 'sell',
    rfqId: rfqId ?? null,
    contractorId: offer.contractorId ?? null,
    carrierId: offer.carrierId ?? null,
    carrierIds: offer.carrierIds ?? null,
    providerIds: offer.providerIds ?? null,
    contactPersonId: offer.contactPersonId ?? null,
    billingAddressId: offer.billingAddressId ?? null,
    organizationId: offer.organizationId,
    tenantId: offer.tenantId,
    offerNumber: offer.offerNumber,
    version: offer.version,
    status: offer.status,
    incoterm: offer.incoterm ?? null,
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
    baseCurrency: offer.baseCurrency ?? null,
    exchangeRates: offer.exchangeRates ?? null,
    costGroupingMode: offer.costGroupingMode ?? null,
    groupId: offer.groupId ?? null,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
  }
}

// Extended create schema for creating an offer (optionally from RFQ)
const createOfferInputSchema = z.object({
  type: z.string().optional(),
  rfqId: z.string().uuid().optional().nullable(),
  contractorId: z.string().uuid().optional().nullable(),
  carrierId: z.string().uuid().optional().nullable(),
  carrierIds: z.array(z.string().uuid()).optional().nullable(),
  providerIds: z.array(z.string().uuid()).optional().nullable(),
  contactPersonId: z.string().uuid().optional().nullable(),
  billingAddressId: z.string().uuid().optional().nullable(),
  validUntil: z.coerce.date(),
  incoterm: z.string().optional().nullable(),
  direction: z.string().optional().nullable(),
  transportMode: z.string().optional().nullable(),
  cargoType: z.string().optional().nullable(),
  paymentTerms: z.string().trim().max(255).optional().nullable(),
  specialTerms: z.string().trim().optional().nullable(),
  customerNotes: z.string().trim().max(2000).optional().nullable(),
  baseCurrency: z.string().trim().regex(/^[A-Z]{3}$/).optional().nullable(),
  exchangeRates: z.array(z.object({
    fromCurrencyCode: z.string().trim().regex(/^[A-Z]{3}$/),
    toCurrencyCode: z.string().trim().regex(/^[A-Z]{3}$/),
    rate: z.string().trim(),
    date: z.string().trim(),
    source: z.string().trim(),
  })).optional().nullable(),
  costGroupingMode: z.string().optional().nullable(),
  groupId: z.string().uuid().optional().nullable(),
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

    // Resolve carrierIds: prefer carrierIds array, fall back to legacy carrierId
    const resolvedCarrierIds = parsed.carrierIds ?? (parsed.carrierId ? [parsed.carrierId] : null)

    const now = new Date()
    const offer = em.create(FmsOffer, {
      organizationId: parsed.organizationId,
      tenantId: parsed.tenantId,
      offerNumber,
      type: (parsed.type as any) ?? 'sell',
      version: 1,
      status: 'draft',
      contractorId: parsed.contractorId ?? null,
      carrierId: resolvedCarrierIds?.[0] ?? parsed.carrierId ?? null,
      carrierIds: resolvedCarrierIds ?? null,
      providerIds: parsed.providerIds ?? null,
      contactPersonId: parsed.contactPersonId ?? null,
      billingAddressId: parsed.billingAddressId ?? null,
      incoterm: (parsed.incoterm as any) ?? null,
      direction: (parsed.direction as any) ?? null,
      transportMode: (parsed.transportMode as any) ?? null,
      cargoType: (parsed.cargoType as any) ?? null,
      validUntil: new Date(parsed.validUntil),
      paymentTerms: parsed.paymentTerms ?? null,
      specialTerms: parsed.specialTerms ?? null,
      customerNotes: parsed.customerNotes ?? null,
      baseCurrency: parsed.baseCurrency ?? null,
      exchangeRates: parsed.exchangeRates ?? null,
      costGroupingMode: (parsed.costGroupingMode as any) ?? null,
      groupId: parsed.groupId ?? null,
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
      offer.rfq = em.getReference(FmsRfq, rfq.id)

      // Copy shipment-level fields from RFQ if not provided
      if (!parsed.direction && rfq.direction) offer.direction = rfq.direction
      if (!parsed.transportMode && rfq.transportMode) offer.transportMode = rfq.transportMode
      if (!parsed.cargoType && rfq.cargoType) offer.cargoType = rfq.cargoType

      // Copy contractor/contact from RFQ if not provided on the offer
      if (!parsed.contractorId && rfq.contractorId) offer.contractorId = rfq.contractorId
      if (!parsed.contactPersonId && rfq.contactPersonId) offer.contactPersonId = rfq.contactPersonId

      // Copy incoterm from first RFQ item if not provided on the offer
      if (!parsed.incoterm) {
        const rfqItems = await em.find(FmsRfqItem, { rfq: rfq.id, deletedAt: null }, { orderBy: { itemNumber: 'ASC' }, limit: 1 })
        if (rfqItems.length > 0 && rfqItems[0].incoterm) {
          offer.incoterm = rfqItems[0].incoterm as any
        }
      }

      // Move RFQ to in_progress when first offer is created
      if (rfq.status === 'incoming') {
        rfq.status = 'in_progress'
        rfq.updatedAt = new Date()
      }
    }

    // Auto-resolve billing address from contractor's locations (optional, non-blocking)
    if (offer.contractorId && !offer.billingAddressId) {
      try {
        const addrRows = await em.getConnection().execute(
          `SELECT id FROM fms_locations WHERE contractor_id = ? AND product_type = 'contractor_billing' AND is_active = true AND deleted_at IS NULL ORDER BY is_primary DESC, created_at DESC LIMIT 1`,
          [offer.contractorId],
        )
        if (addrRows.length > 0) {
          offer.billingAddressId = addrRows[0].id
        }
      } catch (err) {
        console.error('[offers/create] billing address auto-resolve failed:', err)
      }
    }

    em.persist(offer)
    await em.flush()

    // Create default typed cost sections (Main Freight, Origin, Destination)
    const sectionDefaults = [
      { number: 1, sectionType: 'main_freight' as const, label: 'Main Freight' },
      { number: 2, sectionType: 'origin' as const, label: 'Origin' },
      { number: 3, sectionType: 'destination' as const, label: 'Destination' },
    ]
    for (const sec of sectionDefaults) {
      em.persist(em.create(FmsOfferCalculation, {
        offer,
        organizationId: offer.organizationId,
        tenantId: offer.tenantId,
        calculationNumber: sec.number,
        sectionType: sec.sectionType,
        label: sec.label,
        createdAt: now,
        updatedAt: now,
      }))
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
    if ((parsed as any).type !== undefined) record.type = (parsed as any).type
    if (parsed.contractorId !== undefined) record.contractorId = parsed.contractorId
    if ((parsed as any).carrierId !== undefined) {
      record.carrierId = (parsed as any).carrierId
      // Sync carrierIds from legacy carrierId if carrierIds not also provided
      if ((parsed as any).carrierIds === undefined) {
        record.carrierIds = (parsed as any).carrierId ? [(parsed as any).carrierId] : null
      }
    }
    if ((parsed as any).carrierIds !== undefined) {
      record.carrierIds = (parsed as any).carrierIds
      // Keep legacy carrierId in sync
      record.carrierId = (parsed as any).carrierIds?.[0] ?? null
    }
    if ((parsed as any).providerIds !== undefined) record.providerIds = (parsed as any).providerIds
    if (parsed.contactPersonId !== undefined) record.contactPersonId = parsed.contactPersonId
    if (parsed.billingAddressId !== undefined) record.billingAddressId = parsed.billingAddressId
    if (parsed.validUntil !== undefined) record.validUntil = new Date(parsed.validUntil)
    if ((parsed as any).incoterm !== undefined) record.incoterm = (parsed as any).incoterm
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
    if (parsed.baseCurrency !== undefined) record.baseCurrency = parsed.baseCurrency
    if (parsed.exchangeRates !== undefined) record.exchangeRates = parsed.exchangeRates
    if ((parsed as any).costGroupingMode !== undefined) record.costGroupingMode = (parsed as any).costGroupingMode
    if ((parsed as any).offerLabel !== undefined) record.offerLabel = (parsed as any).offerLabel
    if (parsed.groupId !== undefined) record.groupId = parsed.groupId

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

    // Sync RFQ status when offer status changes to accepted or declined
    if (parsed.status && record.rfq) {
      if (parsed.status === 'sent' && record.rfq.status !== 'approved' && record.rfq.status !== 'declined') {
        record.rfq.status = 'waiting_for_client'
        record.rfq.updatedAt = new Date()
      } else if (parsed.status === 'accepted') {
        record.rfq.status = 'approved'
        record.rfq.updatedAt = new Date()
      } else if (parsed.status === 'declined') {
        record.rfq.status = 'declined'
        record.rfq.updatedAt = new Date()
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
      'type',
      'status',
      'contractorId',
      'carrierId',
      'carrierIds',
      'providerIds',
      'contactPersonId',
      'billingAddressId',
      'incoterm',
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
      'costGroupingMode',
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
    offer.type = before.type as any
    offer.contractorId = before.contractorId ?? null
    offer.carrierId = before.carrierId ?? null
    offer.carrierIds = before.carrierIds ?? null
    offer.providerIds = before.providerIds ?? null
    offer.contactPersonId = before.contactPersonId ?? null
    offer.billingAddressId = before.billingAddressId ?? null
    offer.incoterm = before.incoterm as any
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
    offer.baseCurrency = before.baseCurrency
    offer.exchangeRates = before.exchangeRates
    offer.costGroupingMode = before.costGroupingMode as any
    offer.groupId = before.groupId ?? null
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
    offer.type = before.type as any
    offer.carrierId = before.carrierId ?? null
    offer.carrierIds = before.carrierIds ?? null
    offer.providerIds = before.providerIds ?? null
    offer.incoterm = before.incoterm as any
    offer.baseCurrency = before.baseCurrency
    offer.exchangeRates = before.exchangeRates
    offer.costGroupingMode = before.costGroupingMode as any
    offer.groupId = before.groupId ?? null
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
