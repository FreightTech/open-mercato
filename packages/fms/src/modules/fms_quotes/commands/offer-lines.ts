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
  productName: string | null
  chargeCode: string | null
  containerSize: string | null
  chargeName: string | null
  chargeCategory: string | null
  chargeUnit: string | null
  containerType: string | null
  quantity: string
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
    productName: line.productName ?? null,
    chargeCode: line.chargeCode ?? null,
    containerSize: line.containerSize ?? null,
    chargeName: line.chargeName ?? null,
    chargeCategory: line.chargeCategory ?? null,
    chargeUnit: line.chargeUnit ?? null,
    containerType: line.containerType ?? null,
    quantity: line.quantity,
    currencyCode: line.currencyCode,
    unitPrice: line.unitPrice,
    amount: line.amount,
    createdAt: line.createdAt,
    updatedAt: line.updatedAt,
  }
}

/**
 * Recalculate offer total from its lines
 */
async function recalculateOfferTotal(em: EntityManager, offerId: string): Promise<void> {
  const offer = await em.findOne(FmsOffer, { id: offerId })
  if (!offer) return

  const lines = await em.find(FmsOfferLine, { offer, deletedAt: null })
  let total = 0
  for (const line of lines) {
    total += parseFloat(line.amount) || 0
  }

  offer.totalAmount = total.toFixed(4)
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

    // Calculate amount if not provided
    const quantity = parseFloat(parsed.quantity?.toString() ?? '1') || 1
    const unitPrice = parseFloat(parsed.unitPrice?.toString() ?? '0') || 0
    const amount = parsed.amount?.toString() ?? (quantity * unitPrice).toFixed(4)

    const now = new Date()
    const line = em.create(FmsOfferLine, {
      offer,
      organizationId: offer.organizationId,
      tenantId: offer.tenantId,
      lineNumber: parsed.lineNumber ?? nextLineNumber,
      productName: parsed.productName ?? null,
      chargeCode: parsed.chargeCode ?? null,
      containerSize: parsed.containerSize ?? null,
      chargeName: parsed.chargeName ?? 'New Charge',
      chargeCategory: parsed.chargeCategory ?? 'transport',
      chargeUnit: parsed.chargeUnit ?? 'per_container',
      containerType: parsed.containerType ?? null,
      quantity: parsed.quantity?.toString() ?? '1',
      currencyCode: parsed.currencyCode ?? offer.currencyCode ?? 'USD',
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
    if (parsed.productName !== undefined) record.productName = parsed.productName
    if (parsed.chargeCode !== undefined) record.chargeCode = parsed.chargeCode
    if (parsed.containerSize !== undefined) record.containerSize = parsed.containerSize
    if (parsed.chargeName !== undefined) record.chargeName = parsed.chargeName
    if (parsed.chargeCategory !== undefined) record.chargeCategory = parsed.chargeCategory
    if (parsed.chargeUnit !== undefined) record.chargeUnit = parsed.chargeUnit
    if (parsed.containerType !== undefined) record.containerType = parsed.containerType ?? null
    if (parsed.quantity !== undefined) record.quantity = parsed.quantity.toString()
    if (parsed.currencyCode !== undefined) record.currencyCode = parsed.currencyCode
    if (parsed.unitPrice !== undefined) record.unitPrice = parsed.unitPrice.toString()

    // Recalculate amount if quantity or unitPrice changed
    if (parsed.amount !== undefined) {
      record.amount = parsed.amount.toString()
    } else if (parsed.quantity !== undefined || parsed.unitPrice !== undefined) {
      const qty = parseFloat(record.quantity) || 1
      const price = parseFloat(record.unitPrice) || 0
      record.amount = (qty * price).toFixed(4)
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
      'productName',
      'chargeCode',
      'containerSize',
      'chargeName',
      'chargeCategory',
      'chargeUnit',
      'containerType',
      'quantity',
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
        productName: before.productName,
        chargeCode: before.chargeCode,
        containerSize: before.containerSize,
        chargeName: before.chargeName,
        chargeCategory: before.chargeCategory as any,
        chargeUnit: before.chargeUnit as any,
        containerType: before.containerType as any,
        quantity: before.quantity,
        currencyCode: before.currencyCode,
        unitPrice: before.unitPrice,
        amount: before.amount,
        createdAt: before.createdAt ?? now,
        updatedAt: now,
      })
      em.persist(line)
    } else {
      line.lineNumber = before.lineNumber
      line.productName = before.productName
      line.chargeCode = before.chargeCode
      line.containerSize = before.containerSize
      line.chargeName = before.chargeName
      line.chargeCategory = before.chargeCategory as any
      line.chargeUnit = before.chargeUnit as any
      line.containerType = before.containerType as any
      line.quantity = before.quantity
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
        productName: before.productName,
        chargeCode: before.chargeCode,
        containerSize: before.containerSize,
        chargeName: before.chargeName,
        chargeCategory: before.chargeCategory as any,
        chargeUnit: before.chargeUnit as any,
        containerType: before.containerType as any,
        quantity: before.quantity,
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
