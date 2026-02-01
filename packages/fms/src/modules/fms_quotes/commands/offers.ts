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
import { FmsOffer, FmsOfferLine, FmsQuote, FmsQuoteLine } from '../data/entities'
import {
  fmsOfferCreateSchema,
  fmsOfferUpdateSchema,
  type FmsOfferCreateInput,
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
  entityType: E.fms_quotes.fms_offer,
}

type OfferLineSnapshot = {
  id: string
  lineNumber: number
  productId: string | null
  variantId: string | null
  sourceQuoteLineId: string | null
  productName: string | null
  chargeCode: string | null
  productType: string | null
  containerSize: string | null
  providerName: string | null
  providerId: string | null
  reference: string | null
  validityStart: Date | null
  validityEnd: Date | null
  quantity: string
  currencyCode: string
  unitPrice: string
  amount: string
  createdAt: Date
  updatedAt: Date
}

type OfferSnapshot = {
  id: string
  quoteId: string
  organizationId: string
  tenantId: string
  offerNumber: string
  version: number
  status: string
  contractType: string
  carrierName: string | null
  validUntil: Date | null
  currencyCode: string
  totalAmount: string
  paymentTerms: string | null
  specialTerms: string | null
  customerNotes: string | null
  notes: string | null
  supersededById: string | null
  assignedToId: string | null
  documentId: string | null
  sentAt: Date | null
  createdAt: Date
  updatedAt: Date
  lines: OfferLineSnapshot[]
}

type OfferUndoPayload = {
  before?: OfferSnapshot | null
  after?: OfferSnapshot | null
}

async function loadOfferSnapshot(em: EntityManager, id: string): Promise<OfferSnapshot | null> {
  const offer = await em.findOne(FmsOffer, { id, deletedAt: null }, {
    populate: ['quote', 'lines'],
  })
  if (!offer) return null

  const quoteId = typeof offer.quote === 'string' ? offer.quote : offer.quote?.id
  const lines = offer.lines.getItems().filter(l => !l.deletedAt)

  return {
    id: offer.id,
    quoteId: quoteId ?? '',
    organizationId: offer.organizationId,
    tenantId: offer.tenantId,
    offerNumber: offer.offerNumber,
    version: offer.version,
    status: offer.status,
    contractType: offer.contractType,
    carrierName: offer.carrierName ?? null,
    validUntil: offer.validUntil ?? null,
    currencyCode: offer.currencyCode,
    totalAmount: offer.totalAmount,
    paymentTerms: offer.paymentTerms ?? null,
    specialTerms: offer.specialTerms ?? null,
    customerNotes: offer.customerNotes ?? null,
    notes: offer.notes ?? null,
    supersededById: offer.supersededById ?? null,
    assignedToId: offer.assignedToId ?? null,
    documentId: offer.documentId ?? null,
    sentAt: offer.sentAt ?? null,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
    lines: lines.map(line => ({
      id: line.id,
      lineNumber: line.lineNumber,
      productId: line.productId ?? null,
      variantId: line.variantId ?? null,
      sourceQuoteLineId: line.sourceQuoteLineId ?? null,
      productName: line.productName ?? null,
      chargeCode: line.chargeCode ?? null,
      productType: line.productType ?? null,
      containerSize: line.containerSize ?? null,
      providerName: line.providerName ?? null,
      providerId: line.providerId ?? null,
      reference: line.reference ?? null,
      validityStart: line.validityStart ?? null,
      validityEnd: line.validityEnd ?? null,
      quantity: line.quantity,
      currencyCode: line.currencyCode,
      unitPrice: line.unitPrice,
      amount: line.amount,
      createdAt: line.createdAt,
      updatedAt: line.updatedAt,
    })),
  }
}

// Extended create schema for offer with line selection
const createOfferInputSchema = z.object({
  quoteId: z.string().uuid(),
  lineIds: z.array(z.string().uuid()).optional(),
  validUntil: z.coerce.date(),
  paymentTerms: z.string().trim().max(255).optional().nullable(),
  specialTerms: z.string().trim().max(2000).optional().nullable(),
  customerNotes: z.string().trim().max(2000).optional().nullable(),
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
})

type CreateOfferInput = z.infer<typeof createOfferInputSchema>

const createOfferCommand: CommandHandler<CreateOfferInput, { offerId: string }> = {
  id: 'fms_quotes.offers.create',
  async execute(input, ctx) {
    const parsed = createOfferInputSchema.parse(input)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    // Verify the quote exists and user has access
    const quote = await em.findOne(FmsQuote, { id: parsed.quoteId, deletedAt: null }, { populate: ['lines'] })
    if (!quote) {
      throw new CrudHttpError(404, { error: 'Quote not found' })
    }

    ensureTenantScope(ctx, quote.tenantId)
    ensureOrganizationScope(ctx, quote.organizationId)

    // Count existing offers for this quote to determine version number
    const existingOffers = await em.count(FmsOffer, { quote: quote.id, deletedAt: null })
    const version = existingOffers + 1

    // Generate offer number
    const offerNumber = await generateOfferNumber(em, quote.tenantId, quote.organizationId)

    // Get quote lines to include (all lines if no specific lineIds provided)
    const quoteLines = await em.find(FmsQuoteLine, {
      quote: quote.id,
      deletedAt: null,
      ...(parsed.lineIds?.length ? { id: { $in: parsed.lineIds } } : {}),
    })

    if (quoteLines.length === 0) {
      throw new CrudHttpError(400, { error: 'No lines to include in offer' })
    }

    // Calculate total from selected lines (sum of unitSales * quantity)
    let totalAmount = 0
    for (const line of quoteLines) {
      const qty = parseFloat(line.quantity) || 1
      const sales = parseFloat(line.unitSales) || 0
      totalAmount += qty * sales
    }

    const now = new Date()
    const offer = em.create(FmsOffer, {
      quote,
      organizationId: quote.organizationId,
      tenantId: quote.tenantId,
      offerNumber,
      version,
      status: 'draft',
      contractType: 'spot',
      validUntil: new Date(parsed.validUntil),
      currencyCode: quote.currencyCode || 'USD',
      totalAmount: totalAmount.toFixed(4),
      paymentTerms: parsed.paymentTerms ?? null,
      specialTerms: parsed.specialTerms ?? null,
      customerNotes: parsed.customerNotes ?? null,
      createdAt: now,
      updatedAt: now,
    })

    em.persist(offer)

    // Create offer lines from quote lines (snapshot with product traceability)
    for (let i = 0; i < quoteLines.length; i++) {
      const quoteLine = quoteLines[i]
      const qty = parseFloat(quoteLine.quantity) || 1
      const unitPrice = parseFloat(quoteLine.unitSales) || 0
      const amount = qty * unitPrice

      const offerLine = em.create(FmsOfferLine, {
        offer,
        organizationId: quote.organizationId,
        tenantId: quote.tenantId,
        lineNumber: i + 1,
        // Copy product references (for traceability)
        productId: quoteLine.productId || null,
        variantId: quoteLine.variantId || null,
        sourceQuoteLineId: quoteLine.id,
        // Snapshot fields from quote line
        productName: quoteLine.productName || null,
        chargeCode: quoteLine.chargeCode ?? null,
        productType: quoteLine.productType ?? null,
        containerSize: quoteLine.containerSize ?? null,
        providerName: quoteLine.providerName ?? null,
        providerId: quoteLine.providerId ?? null,
        reference: quoteLine.reference ?? null,
        validityStart: quoteLine.validityStart ?? null,
        validityEnd: quoteLine.validityEnd ?? null,
        // Pricing
        quantity: quoteLine.quantity,
        currencyCode: quoteLine.currencyCode || 'USD',
        unitPrice: quoteLine.unitSales,
        amount: amount.toFixed(4),
        createdAt: now,
        updatedAt: now,
      })

      em.persist(offerLine)
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
      actionLabel: translate('fms_quotes.audit.offers.create', 'Create offer'),
      resourceKind: 'fms_quotes.offer',
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
    const offer = await em.findOne(FmsOffer, { id: offerId }, { populate: ['lines'] })
    if (!offer) return

    // Delete all lines
    await em.nativeDelete(FmsOfferLine, { offer })

    em.remove(offer)
    await em.flush()
  },
}

const updateOfferCommand: CommandHandler<FmsOfferUpdateInput, { offerId: string }> = {
  id: 'fms_quotes.offers.update',
  async prepare(input, ctx) {
    const parsed = fmsOfferUpdateSchema.parse(input)
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadOfferSnapshot(em, parsed.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const parsed = fmsOfferUpdateSchema.parse(input)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const offer = await em.findOne(FmsOffer, { id: parsed.id, deletedAt: null })
    const record = assertRecordFound(offer, 'Offer not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    if (parsed.status !== undefined) record.status = parsed.status
    if (parsed.contractType !== undefined) record.contractType = parsed.contractType
    if (parsed.carrierName !== undefined) record.carrierName = parsed.carrierName
    if (parsed.validUntil !== undefined) record.validUntil = new Date(parsed.validUntil)
    if (parsed.currencyCode !== undefined) record.currencyCode = parsed.currencyCode
    if (parsed.totalAmount !== undefined) record.totalAmount = parsed.totalAmount.toString()
    if (parsed.paymentTerms !== undefined) record.paymentTerms = parsed.paymentTerms
    if (parsed.specialTerms !== undefined) record.specialTerms = parsed.specialTerms
    if (parsed.customerNotes !== undefined) record.customerNotes = parsed.customerNotes
    if (parsed.notes !== undefined) record.notes = parsed.notes
    if (parsed.supersededById !== undefined) record.supersededById = parsed.supersededById
    if (parsed.documentId !== undefined) record.documentId = parsed.documentId
    if (parsed.version !== undefined) record.version = parsed.version

    // Handle quoteId change - link to a different quote
    if (parsed.quoteId !== undefined) {
      const newQuote = await em.findOne(FmsQuote, { id: parsed.quoteId, deletedAt: null })
      if (!newQuote) {
        throw new CrudHttpError(404, { error: 'Quote not found' })
      }
      ensureTenantScope(ctx, newQuote.tenantId)
      ensureOrganizationScope(ctx, newQuote.organizationId)
      record.quote = newQuote
    }

    // Handle assignedToId (module isomorphism - no direct User relationship)
    if (parsed.assignedToId !== undefined) {
      record.assignedToId = parsed.assignedToId
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
      'status',
      'contractType',
      'carrierName',
      'validUntil',
      'currencyCode',
      'totalAmount',
      'paymentTerms',
      'specialTerms',
      'customerNotes',
      'notes',
      'supersededById',
      'assignedToId',
      'documentId',
      'sentAt',
      'version',
      'quoteId',
    ]
    const changes = afterSnapshot
      ? buildChanges(
          before as unknown as Record<string, unknown>,
          afterSnapshot as unknown as Record<string, unknown>,
          changeKeys
        )
      : {}

    return {
      actionLabel: translate('fms_quotes.audit.offers.update', 'Update offer'),
      resourceKind: 'fms_quotes.offer',
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
    if (!offer) {
      const quote = await em.findOne(FmsQuote, { id: before.quoteId })
      if (!quote) return
      const now = new Date()
      offer = em.create(FmsOffer, {
        id: before.id,
        quote,
        organizationId: before.organizationId,
        tenantId: before.tenantId,
        offerNumber: before.offerNumber,
        version: before.version,
        status: before.status as any,
        contractType: before.contractType as any,
        carrierName: before.carrierName,
        validUntil: before.validUntil,
        currencyCode: before.currencyCode,
        totalAmount: before.totalAmount,
        paymentTerms: before.paymentTerms,
        specialTerms: before.specialTerms,
        customerNotes: before.customerNotes,
        notes: before.notes,
        supersededById: before.supersededById,
        documentId: before.documentId,
        createdAt: before.createdAt ?? now,
        updatedAt: now,
      })
      em.persist(offer)
    } else {
      offer.status = before.status as any
      offer.contractType = before.contractType as any
      offer.carrierName = before.carrierName
      offer.validUntil = before.validUntil
      offer.currencyCode = before.currencyCode
      offer.totalAmount = before.totalAmount
      offer.paymentTerms = before.paymentTerms
      offer.specialTerms = before.specialTerms
      offer.customerNotes = before.customerNotes
      offer.notes = before.notes
      offer.supersededById = before.supersededById
      offer.documentId = before.documentId
    }

    // Restore assignedToId (module isomorphism - no direct User relationship)
    offer.assignedToId = before.assignedToId ?? null

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
  id: 'fms_quotes.offers.delete',
  async prepare(input, ctx) {
    const id = requireId(input, 'Offer id required')
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadOfferSnapshot(em, id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Offer id required')
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const offer = await em.findOne(FmsOffer, { id, deletedAt: null }, { populate: ['lines'] })
    const record = assertRecordFound(offer, 'Offer not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    // Only allow deleting draft offers
    if (record.status !== 'draft') {
      throw new CrudHttpError(400, { error: 'Only draft offers can be deleted' })
    }

    // Soft delete offer
    record.deletedAt = new Date()

    // Soft delete all lines
    for (const line of record.lines.getItems()) {
      line.deletedAt = new Date()
    }

    await em.flush()

    const indexDeletes: QueryIndexEventEntry[] = record.lines.getItems().map(line => ({
      entityType: E.fms_quotes.fms_offer_line,
      recordId: line.id,
      tenantId: record.tenantId,
      organizationId: record.organizationId,
    }))

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
      actionLabel: translate('fms_quotes.audit.offers.delete', 'Delete offer'),
      resourceKind: 'fms_quotes.offer',
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

    // Restore offer
    let offer = await em.findOne(FmsOffer, { id: before.id })
    if (!offer) {
      const quote = await em.findOne(FmsQuote, { id: before.quoteId })
      if (!quote) return
      offer = em.create(FmsOffer, {
        id: before.id,
        quote,
        organizationId: before.organizationId,
        tenantId: before.tenantId,
        offerNumber: before.offerNumber,
        version: before.version,
        status: before.status as any,
        contractType: before.contractType as any,
        carrierName: before.carrierName,
        validUntil: before.validUntil,
        currencyCode: before.currencyCode,
        totalAmount: before.totalAmount,
        paymentTerms: before.paymentTerms,
        specialTerms: before.specialTerms,
        customerNotes: before.customerNotes,
        notes: before.notes,
        supersededById: before.supersededById,
        documentId: before.documentId,
        createdAt: before.createdAt,
        updatedAt: before.updatedAt,
      })
      em.persist(offer)
    } else {
      offer.deletedAt = null
    }

    // Restore assignedToId (module isomorphism - no direct User relationship)
    if (before.assignedToId) {
      offer.assignedToId = before.assignedToId
    }

    await em.flush()

    // Restore lines
    for (const lineSnapshot of before.lines) {
      let line = await em.findOne(FmsOfferLine, { id: lineSnapshot.id })
      if (!line) {
        line = em.create(FmsOfferLine, {
          id: lineSnapshot.id,
          offer,
          organizationId: before.organizationId,
          tenantId: before.tenantId,
          lineNumber: lineSnapshot.lineNumber,
          productId: lineSnapshot.productId,
          variantId: lineSnapshot.variantId,
          sourceQuoteLineId: lineSnapshot.sourceQuoteLineId,
          productName: lineSnapshot.productName,
          chargeCode: lineSnapshot.chargeCode,
          productType: lineSnapshot.productType,
          containerSize: lineSnapshot.containerSize,
          providerName: lineSnapshot.providerName,
          providerId: lineSnapshot.providerId,
          reference: lineSnapshot.reference,
          validityStart: lineSnapshot.validityStart,
          validityEnd: lineSnapshot.validityEnd,
          quantity: lineSnapshot.quantity,
          currencyCode: lineSnapshot.currencyCode,
          unitPrice: lineSnapshot.unitPrice,
          amount: lineSnapshot.amount,
          createdAt: lineSnapshot.createdAt,
          updatedAt: lineSnapshot.updatedAt,
        })
        em.persist(line)
      } else {
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

    // Emit upsert for restored lines
    const lineUpserts: QueryIndexEventEntry[] = before.lines.map(line => ({
      entityType: E.fms_quotes.fms_offer_line,
      recordId: line.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
    }))
    await emitQueryIndexUpsertEvents(ctx, lineUpserts)
  },
}

registerCommand(createOfferCommand)
registerCommand(updateOfferCommand)
registerCommand(deleteOfferCommand)
