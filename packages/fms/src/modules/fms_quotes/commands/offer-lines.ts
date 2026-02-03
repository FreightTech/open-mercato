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
import { FmsOffer, FmsOfferLine } from '../data/entities'
import {
  fmsOfferLineCreateSchema,
  fmsOfferLineUpdateSchema,
  type FmsOfferLineCreateInput,
  type FmsOfferLineUpdateInput,
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

const offerLineCrudIndexer: CrudIndexerConfig<FmsOfferLine> = {
  entityType: E.fms_quotes.fms_offer_line,
}

type OfferLineSnapshot = {
  id: string
  offerId: string
  organizationId: string
  tenantId: string
  lineNumber: number
  productId: string | null
  variantId: string | null
  sourceQuoteLineId: string | null
  productName: string | null
  chargeCode: string | null
  containerSize: string | null
  carrierId: string | null
  providerId: string | null
  reference: string | null
  validityStart: Date | null
  validityEnd: Date | null
  currencyCode: string
  unitPrice: string
  amount: string
  createdAt: Date
  updatedAt: Date
}

type OfferLineUndoPayload = {
  before?: OfferLineSnapshot | null
  after?: OfferLineSnapshot | null
}

async function loadOfferLineSnapshot(em: EntityManager, id: string): Promise<OfferLineSnapshot | null> {
  const line = await em.findOne(FmsOfferLine, { id, deletedAt: null }, { populate: ['offer'] })
  if (!line) return null

  const offerId = typeof line.offer === 'string' ? line.offer : line.offer?.id

  return {
    id: line.id,
    offerId: offerId ?? '',
    organizationId: line.organizationId,
    tenantId: line.tenantId,
    lineNumber: line.lineNumber,
    productId: line.productId ?? null,
    variantId: line.variantId ?? null,
    sourceQuoteLineId: line.sourceQuoteLineId ?? null,
    productName: line.productName ?? null,
    chargeCode: line.chargeCode ?? null,
    containerSize: line.containerSize ?? null,
    carrierId: line.carrierId ?? null,
    providerId: line.providerId ?? null,
    reference: line.reference ?? null,
    validityStart: line.validityStart ?? null,
    validityEnd: line.validityEnd ?? null,
    currencyCode: line.currencyCode,
    unitPrice: line.unitPrice,
    amount: line.amount,
    createdAt: line.createdAt,
    updatedAt: line.updatedAt,
  }
}

/**
 * Recalculate offer total from its lines
 * Note: totalAmount was removed from FmsOffer entity, but we keep this function
 * for future use if we want to store calculated totals
 */
async function recalculateOfferTotal(em: EntityManager, offerId: string): Promise<void> {
  const offer = await em.findOne(FmsOffer, { id: offerId })
  if (!offer) return

  // Update timestamp only - totalAmount is now calculated on demand
  offer.updatedAt = new Date()
}

const createOfferLineCommand: CommandHandler<FmsOfferLineCreateInput, { lineId: string }> = {
  id: 'fms_quotes.offer_lines.create',
  async execute(input, ctx) {
    const parsed = fmsOfferLineCreateSchema.parse(input)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    // Verify the offer exists and user has access
    const offer = await em.findOne(FmsOffer, { id: parsed.offerId, deletedAt: null })
    if (!offer) {
      throw new CrudHttpError(404, { error: 'Offer not found' })
    }

    ensureTenantScope(ctx, offer.tenantId)
    ensureOrganizationScope(ctx, offer.organizationId)

    // Get next line number
    const maxLine = await em.findOne(FmsOfferLine, { offer, deletedAt: null }, { orderBy: { lineNumber: 'DESC' } })
    const nextLineNumber = (maxLine?.lineNumber ?? -1) + 1

    // Calculate amount if not provided (amount = unitPrice for single line item)
    const unitPrice = parseFloat(parsed.unitPrice?.toString() ?? '0') || 0
    const amount = parsed.amount?.toString() ?? unitPrice.toFixed(4)

    const now = new Date()
    const line = em.create(FmsOfferLine, {
      offer,
      organizationId: offer.organizationId,
      tenantId: offer.tenantId,
      lineNumber: parsed.lineNumber ?? nextLineNumber,
      productId: parsed.productId ?? null,
      variantId: parsed.variantId ?? null,
      sourceQuoteLineId: parsed.sourceQuoteLineId ?? null,
      productName: parsed.productName ?? null,
      chargeCode: parsed.chargeCode ?? null,
      containerSize: parsed.containerSize ?? null,
      carrierId: parsed.carrierId ?? null,
      providerId: parsed.providerId ?? null,
      reference: parsed.reference ?? null,
      validityStart: parsed.validityStart ? new Date(parsed.validityStart) : null,
      validityEnd: parsed.validityEnd ? new Date(parsed.validityEnd) : null,
      currencyCode: parsed.currencyCode,
      unitPrice: parsed.unitPrice?.toString() ?? '0',
      amount: amount,
      createdAt: now,
      updatedAt: now,
    })

    await em.persistAndFlush(line)

    // Recalculate offer total
    await recalculateOfferTotal(em, offer.id)
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: line,
      identifiers: {
        id: line.id,
        organizationId: line.organizationId,
        tenantId: line.tenantId,
      },
      indexer: offerLineCrudIndexer,
    })

    return { lineId: line.id }
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve('em') as EntityManager
    return await loadOfferLineSnapshot(em, result.lineId)
  },
  buildLog: async ({ result, ctx }) => {
    const { translate } = await resolveTranslations()
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadOfferLineSnapshot(em, result.lineId)
    return {
      actionLabel: translate('fms_quotes.audit.offer_lines.create', 'Create offer line'),
      resourceKind: 'fms_quotes.offer_line',
      resourceId: result.lineId,
      tenantId: snapshot?.tenantId ?? null,
      organizationId: snapshot?.organizationId ?? null,
      snapshotAfter: snapshot ?? null,
      payload: {
        undo: {
          after: snapshot,
        } satisfies OfferLineUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const lineId = logEntry?.resourceId
    if (!lineId) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const line = await em.findOne(FmsOfferLine, { id: lineId }, { populate: ['offer'] })
    if (!line) return

    const offerId = typeof line.offer === 'string' ? line.offer : line.offer?.id

    em.remove(line)
    await em.flush()

    // Recalculate offer total
    if (offerId) {
      await recalculateOfferTotal(em, offerId)
      await em.flush()
    }
  },
}

const updateOfferLineCommand: CommandHandler<FmsOfferLineUpdateInput, { lineId: string }> = {
  id: 'fms_quotes.offer_lines.update',
  async prepare(input, ctx) {
    const parsed = fmsOfferLineUpdateSchema.parse(input)
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadOfferLineSnapshot(em, parsed.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const parsed = fmsOfferLineUpdateSchema.parse(input)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const line = await em.findOne(FmsOfferLine, { id: parsed.id, deletedAt: null }, { populate: ['offer'] })
    const record = assertRecordFound(line, 'Offer line not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    if (parsed.lineNumber !== undefined) record.lineNumber = parsed.lineNumber
    if (parsed.productId !== undefined) record.productId = parsed.productId
    if (parsed.variantId !== undefined) record.variantId = parsed.variantId
    if (parsed.sourceQuoteLineId !== undefined) record.sourceQuoteLineId = parsed.sourceQuoteLineId
    if (parsed.productName !== undefined) record.productName = parsed.productName
    if (parsed.chargeCode !== undefined) record.chargeCode = parsed.chargeCode
    if (parsed.containerSize !== undefined) record.containerSize = parsed.containerSize
    if (parsed.carrierId !== undefined) record.carrierId = parsed.carrierId
    if (parsed.providerId !== undefined) record.providerId = parsed.providerId
    if (parsed.reference !== undefined) record.reference = parsed.reference
    if (parsed.validityStart !== undefined) record.validityStart = parsed.validityStart ? new Date(parsed.validityStart) : null
    if (parsed.validityEnd !== undefined) record.validityEnd = parsed.validityEnd ? new Date(parsed.validityEnd) : null
    if (parsed.currencyCode !== undefined) record.currencyCode = parsed.currencyCode
    if (parsed.unitPrice !== undefined) record.unitPrice = parsed.unitPrice.toString()

    // Recalculate amount if unitPrice changed (amount = unitPrice for single line item)
    if (parsed.amount !== undefined) {
      record.amount = parsed.amount.toString()
    } else if (parsed.unitPrice !== undefined) {
      const price = parseFloat(record.unitPrice) || 0
      record.amount = price.toFixed(4)
    }

    record.updatedAt = new Date()
    await em.flush()

    // Recalculate offer total
    const offerId = typeof record.offer === 'string' ? record.offer : record.offer?.id
    if (offerId) {
      await recalculateOfferTotal(em, offerId)
      await em.flush()
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
      indexer: offerLineCrudIndexer,
    })

    return { lineId: record.id }
  },
  buildLog: async ({ snapshots, ctx }) => {
    const { translate } = await resolveTranslations()
    const before = snapshots.before as OfferLineSnapshot | undefined
    if (!before) return null
    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadOfferLineSnapshot(em, before.id)
    const changeKeys: readonly string[] = [
      'lineNumber',
      'productId',
      'variantId',
      'sourceQuoteLineId',
      'productName',
      'chargeCode',
      'containerSize',
      'carrierId',
      'providerId',
      'reference',
      'validityStart',
      'validityEnd',
      'currencyCode',
      'unitPrice',
      'amount',
    ]
    const changes = afterSnapshot
      ? buildChanges(
          before as unknown as Record<string, unknown>,
          afterSnapshot as unknown as Record<string, unknown>,
          changeKeys
        )
      : {}

    return {
      actionLabel: translate('fms_quotes.audit.offer_lines.update', 'Update offer line'),
      resourceKind: 'fms_quotes.offer_line',
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
        } satisfies OfferLineUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<OfferLineUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    let line = await em.findOne(FmsOfferLine, { id: before.id })
    if (!line) {
      const offer = await em.findOne(FmsOffer, { id: before.offerId })
      if (!offer) return
      const now = new Date()
      line = em.create(FmsOfferLine, {
        id: before.id,
        offer,
        organizationId: before.organizationId,
        tenantId: before.tenantId,
        lineNumber: before.lineNumber,
        productId: before.productId,
        variantId: before.variantId,
        sourceQuoteLineId: before.sourceQuoteLineId,
        productName: before.productName,
        chargeCode: before.chargeCode,
        containerSize: before.containerSize,
        carrierId: before.carrierId,
        providerId: before.providerId,
        reference: before.reference,
        validityStart: before.validityStart,
        validityEnd: before.validityEnd,
        currencyCode: before.currencyCode,
        unitPrice: before.unitPrice,
        amount: before.amount,
        createdAt: before.createdAt ?? now,
        updatedAt: now,
      })
      em.persist(line)
    } else {
      line.lineNumber = before.lineNumber
      line.productId = before.productId
      line.variantId = before.variantId
      line.sourceQuoteLineId = before.sourceQuoteLineId
      line.productName = before.productName
      line.chargeCode = before.chargeCode
      line.containerSize = before.containerSize
      line.carrierId = before.carrierId
      line.providerId = before.providerId
      line.reference = before.reference
      line.validityStart = before.validityStart
      line.validityEnd = before.validityEnd
      line.currencyCode = before.currencyCode
      line.unitPrice = before.unitPrice
      line.amount = before.amount
    }

    await em.flush()

    // Recalculate offer total
    await recalculateOfferTotal(em, before.offerId)
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudUndoSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: line,
      identifiers: {
        id: line.id,
        organizationId: line.organizationId,
        tenantId: line.tenantId,
      },
      indexer: offerLineCrudIndexer,
    })
  },
}

const deleteOfferLineCommand: CommandHandler<{ body?: Record<string, unknown>; query?: Record<string, unknown> }, { lineId: string }> = {
  id: 'fms_quotes.offer_lines.delete',
  async prepare(input, ctx) {
    const id = requireId(input, 'Offer line id required')
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadOfferLineSnapshot(em, id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Offer line id required')
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const line = await em.findOne(FmsOfferLine, { id, deletedAt: null }, { populate: ['offer'] })
    const record = assertRecordFound(line, 'Offer line not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    const offerId = typeof record.offer === 'string' ? record.offer : record.offer?.id

    // Soft delete
    record.deletedAt = new Date()
    await em.flush()

    // Recalculate offer total
    if (offerId) {
      await recalculateOfferTotal(em, offerId)
      await em.flush()
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
      indexer: offerLineCrudIndexer,
    })

    return { lineId: record.id }
  },
  buildLog: async ({ snapshots }) => {
    const before = snapshots.before as OfferLineSnapshot | undefined
    if (!before) return null
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('fms_quotes.audit.offer_lines.delete', 'Delete offer line'),
      resourceKind: 'fms_quotes.offer_line',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      payload: {
        undo: {
          before,
        } satisfies OfferLineUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<OfferLineUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    let line = await em.findOne(FmsOfferLine, { id: before.id })
    if (!line) {
      const offer = await em.findOne(FmsOffer, { id: before.offerId })
      if (!offer) return
      line = em.create(FmsOfferLine, {
        id: before.id,
        offer,
        organizationId: before.organizationId,
        tenantId: before.tenantId,
        lineNumber: before.lineNumber,
        productId: before.productId,
        variantId: before.variantId,
        sourceQuoteLineId: before.sourceQuoteLineId,
        productName: before.productName,
        chargeCode: before.chargeCode,
        containerSize: before.containerSize,
        carrierId: before.carrierId,
        providerId: before.providerId,
        reference: before.reference,
        validityStart: before.validityStart,
        validityEnd: before.validityEnd,
        currencyCode: before.currencyCode,
        unitPrice: before.unitPrice,
        amount: before.amount,
        createdAt: before.createdAt,
        updatedAt: before.updatedAt,
      })
      em.persist(line)
    } else {
      line.deletedAt = null
    }

    await em.flush()

    // Recalculate offer total
    await recalculateOfferTotal(em, before.offerId)
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudUndoSideEffects({
      dataEngine: de,
      action: 'created',
      entity: line,
      identifiers: {
        id: line.id,
        organizationId: line.organizationId,
        tenantId: line.tenantId,
      },
      indexer: offerLineCrudIndexer,
    })
  },
}

registerCommand(createOfferLineCommand)
registerCommand(updateOfferLineCommand)
registerCommand(deleteOfferLineCommand)
