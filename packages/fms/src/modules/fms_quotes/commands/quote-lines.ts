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
import { FmsQuote, FmsQuoteLine } from '../data/entities'
import {
  fmsQuoteLineCreateSchema,
  fmsQuoteLineUpdateSchema,
  type FmsQuoteLineCreateInput,
  type FmsQuoteLineUpdateInput,
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

const quoteLineCrudIndexer: CrudIndexerConfig<FmsQuoteLine> = {
  entityType: E.fms_quotes.fms_quote_line,
}

type QuoteLineSnapshot = {
  id: string
  quoteId: string
  organizationId: string
  tenantId: string
  lineNumber: number
  productId: string | null
  variantId: string | null
  providerId: string | null
  productName: string
  chargeCode: string | null
  productType: string | null
  providerName: string | null
  containerSize: string | null
  reference: string | null
  validityStart: Date | null
  validityEnd: Date | null
  quantity: string
  currencyCode: string
  unitCost: string
  marginPercent: string
  unitSales: string
  createdAt: Date
  updatedAt: Date
}

type QuoteLineUndoPayload = {
  before?: QuoteLineSnapshot | null
  after?: QuoteLineSnapshot | null
}

async function loadQuoteLineSnapshot(em: EntityManager, id: string): Promise<QuoteLineSnapshot | null> {
  const line = await em.findOne(FmsQuoteLine, { id, deletedAt: null }, { populate: ['quote'] })
  if (!line) return null

  const quoteId = typeof line.quote === 'string' ? line.quote : line.quote?.id

  return {
    id: line.id,
    quoteId: quoteId ?? '',
    organizationId: line.organizationId,
    tenantId: line.tenantId,
    lineNumber: line.lineNumber,
    productId: line.productId ?? null,
    variantId: line.variantId ?? null,
    providerId: line.providerId ?? null,
    productName: line.productName,
    chargeCode: line.chargeCode ?? null,
    productType: line.productType ?? null,
    providerName: line.providerName ?? null,
    containerSize: line.containerSize ?? null,
    reference: line.reference ?? null,
    validityStart: line.validityStart ?? null,
    validityEnd: line.validityEnd ?? null,
    quantity: line.quantity,
    currencyCode: line.currencyCode,
    unitCost: line.unitCost,
    marginPercent: line.marginPercent,
    unitSales: line.unitSales,
    createdAt: line.createdAt,
    updatedAt: line.updatedAt,
  }
}

const createQuoteLineCommand: CommandHandler<FmsQuoteLineCreateInput, { lineId: string }> = {
  id: 'fms_quotes.quote_lines.create',
  async execute(input, ctx) {
    const parsed = fmsQuoteLineCreateSchema.parse(input)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    // Verify the quote exists and user has access
    const quote = await em.findOne(FmsQuote, { id: parsed.quoteId, deletedAt: null })
    if (!quote) {
      throw new (await import('@open-mercato/shared/lib/crud/errors')).CrudHttpError(404, { error: 'Quote not found' })
    }

    ensureTenantScope(ctx, quote.tenantId)
    ensureOrganizationScope(ctx, quote.organizationId)

    // Use a reference to avoid MikroORM treating the quote as a new entity
    const quoteRef = em.getReference(FmsQuote, parsed.quoteId)

    // Get next line number
    const maxLine = await em.findOne(FmsQuoteLine, { quote: quoteRef, deletedAt: null }, { orderBy: { lineNumber: 'DESC' } })
    const nextLineNumber = (maxLine?.lineNumber ?? -1) + 1

    const now = new Date()
    const line = em.create(FmsQuoteLine, {
      quote: quoteRef,
      organizationId: quote.organizationId,
      tenantId: quote.tenantId,
      lineNumber: parsed.lineNumber ?? nextLineNumber,
      productId: parsed.productId ?? null,
      variantId: parsed.variantId ?? null,
      providerId: parsed.providerId ?? null,
      productName: parsed.productName ?? 'New Product',
      chargeCode: parsed.chargeCode ?? null,
      productType: parsed.productType ?? null,
      providerName: parsed.providerName ?? null,
      containerSize: parsed.containerSize ?? null,
      reference: parsed.reference ?? null,
      validityStart: parsed.validityStart ? new Date(parsed.validityStart) : null,
      validityEnd: parsed.validityEnd ? new Date(parsed.validityEnd) : null,
      quantity: parsed.quantity?.toString() ?? '1',
      currencyCode: parsed.currencyCode ?? quote.currencyCode ?? 'USD',
      unitCost: parsed.unitCost?.toString() ?? '0',
      marginPercent: parsed.marginPercent?.toString() ?? '0',
      unitSales: parsed.unitSales?.toString() ?? '0',
      createdAt: now,
      updatedAt: now,
    })

    await em.persistAndFlush(line)

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
      indexer: quoteLineCrudIndexer,
    })

    return { lineId: line.id }
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve('em') as EntityManager
    return await loadQuoteLineSnapshot(em, result.lineId)
  },
  buildLog: async ({ result, ctx }) => {
    const { translate } = await resolveTranslations()
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadQuoteLineSnapshot(em, result.lineId)
    return {
      actionLabel: translate('fms_quotes.audit.quote_lines.create', 'Create quote line'),
      resourceKind: 'fms_quotes.quote_line',
      resourceId: result.lineId,
      tenantId: snapshot?.tenantId ?? null,
      organizationId: snapshot?.organizationId ?? null,
      snapshotAfter: snapshot ?? null,
      payload: {
        undo: {
          after: snapshot,
        } satisfies QuoteLineUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const lineId = logEntry?.resourceId
    if (!lineId) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const line = await em.findOne(FmsQuoteLine, { id: lineId })
    if (!line) return
    em.remove(line)
    await em.flush()
  },
}

const updateQuoteLineCommand: CommandHandler<FmsQuoteLineUpdateInput, { lineId: string }> = {
  id: 'fms_quotes.quote_lines.update',
  async prepare(input, ctx) {
    const parsed = fmsQuoteLineUpdateSchema.parse(input)
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadQuoteLineSnapshot(em, parsed.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const parsed = fmsQuoteLineUpdateSchema.parse(input)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const line = await em.findOne(FmsQuoteLine, { id: parsed.id, deletedAt: null })
    const record = assertRecordFound(line, 'Quote line not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    if (parsed.lineNumber !== undefined) record.lineNumber = parsed.lineNumber
    if (parsed.productId !== undefined) record.productId = parsed.productId
    if (parsed.variantId !== undefined) record.variantId = parsed.variantId
    if (parsed.providerId !== undefined) record.providerId = parsed.providerId
    if (parsed.productName !== undefined) record.productName = parsed.productName
    if (parsed.chargeCode !== undefined) record.chargeCode = parsed.chargeCode ?? null
    if (parsed.productType !== undefined) record.productType = parsed.productType ?? null
    if (parsed.providerName !== undefined) record.providerName = parsed.providerName ?? null
    if (parsed.containerSize !== undefined) record.containerSize = parsed.containerSize ?? null
    if (parsed.reference !== undefined) record.reference = parsed.reference ?? null
    if (parsed.validityStart !== undefined) record.validityStart = parsed.validityStart ? new Date(parsed.validityStart) : null
    if (parsed.validityEnd !== undefined) record.validityEnd = parsed.validityEnd ? new Date(parsed.validityEnd) : null
    if (parsed.quantity !== undefined) record.quantity = parsed.quantity.toString()
    if (parsed.currencyCode !== undefined) record.currencyCode = parsed.currencyCode
    if (parsed.unitCost !== undefined) record.unitCost = parsed.unitCost.toString()
    if (parsed.marginPercent !== undefined) record.marginPercent = parsed.marginPercent.toString()
    if (parsed.unitSales !== undefined) record.unitSales = parsed.unitSales.toString()

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
      indexer: quoteLineCrudIndexer,
    })

    return { lineId: record.id }
  },
  buildLog: async ({ snapshots, ctx }) => {
    const { translate } = await resolveTranslations()
    const before = snapshots.before as QuoteLineSnapshot | undefined
    if (!before) return null
    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadQuoteLineSnapshot(em, before.id)
    const changeKeys: readonly string[] = [
      'lineNumber',
      'productId',
      'variantId',
      'providerId',
      'productName',
      'chargeCode',
      'productType',
      'providerName',
      'containerSize',
      'reference',
      'validityStart',
      'validityEnd',
      'quantity',
      'currencyCode',
      'unitCost',
      'marginPercent',
      'unitSales',
    ]
    const changes = afterSnapshot
      ? buildChanges(
          before as unknown as Record<string, unknown>,
          afterSnapshot as unknown as Record<string, unknown>,
          changeKeys
        )
      : {}

    return {
      actionLabel: translate('fms_quotes.audit.quote_lines.update', 'Update quote line'),
      resourceKind: 'fms_quotes.quote_line',
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
        } satisfies QuoteLineUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<QuoteLineUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    let line = await em.findOne(FmsQuoteLine, { id: before.id })
    if (!line) {
      const quote = await em.findOne(FmsQuote, { id: before.quoteId })
      if (!quote) return
      const now = new Date()
      line = em.create(FmsQuoteLine, {
        id: before.id,
        quote,
        organizationId: before.organizationId,
        tenantId: before.tenantId,
        lineNumber: before.lineNumber,
        productId: before.productId,
        variantId: before.variantId,
        providerId: before.providerId,
        productName: before.productName,
        chargeCode: before.chargeCode,
        productType: before.productType,
        providerName: before.providerName,
        containerSize: before.containerSize,
        reference: before.reference,
        validityStart: before.validityStart,
        validityEnd: before.validityEnd,
        quantity: before.quantity,
        currencyCode: before.currencyCode,
        unitCost: before.unitCost,
        marginPercent: before.marginPercent,
        unitSales: before.unitSales,
        createdAt: before.createdAt ?? now,
        updatedAt: now,
      })
      em.persist(line)
    } else {
      line.lineNumber = before.lineNumber
      line.productId = before.productId
      line.variantId = before.variantId
      line.providerId = before.providerId
      line.productName = before.productName
      line.chargeCode = before.chargeCode
      line.productType = before.productType
      line.providerName = before.providerName
      line.containerSize = before.containerSize
      line.reference = before.reference
      line.validityStart = before.validityStart
      line.validityEnd = before.validityEnd
      line.quantity = before.quantity
      line.currencyCode = before.currencyCode
      line.unitCost = before.unitCost
      line.marginPercent = before.marginPercent
      line.unitSales = before.unitSales
    }

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
      indexer: quoteLineCrudIndexer,
    })
  },
}

const deleteQuoteLineCommand: CommandHandler<{ body?: Record<string, unknown>; query?: Record<string, unknown> }, { lineId: string }> = {
  id: 'fms_quotes.quote_lines.delete',
  async prepare(input, ctx) {
    const id = requireId(input, 'Quote line id required')
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadQuoteLineSnapshot(em, id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Quote line id required')
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const line = await em.findOne(FmsQuoteLine, { id, deletedAt: null })
    const record = assertRecordFound(line, 'Quote line not found')
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
      indexer: quoteLineCrudIndexer,
    })

    return { lineId: record.id }
  },
  buildLog: async ({ snapshots }) => {
    const before = snapshots.before as QuoteLineSnapshot | undefined
    if (!before) return null
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('fms_quotes.audit.quote_lines.delete', 'Delete quote line'),
      resourceKind: 'fms_quotes.quote_line',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      payload: {
        undo: {
          before,
        } satisfies QuoteLineUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<QuoteLineUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    let line = await em.findOne(FmsQuoteLine, { id: before.id })
    if (!line) {
      const quote = await em.findOne(FmsQuote, { id: before.quoteId })
      if (!quote) return
      line = em.create(FmsQuoteLine, {
        id: before.id,
        quote,
        organizationId: before.organizationId,
        tenantId: before.tenantId,
        lineNumber: before.lineNumber,
        productId: before.productId,
        variantId: before.variantId,
        providerId: before.providerId,
        productName: before.productName,
        chargeCode: before.chargeCode,
        productType: before.productType,
        providerName: before.providerName,
        containerSize: before.containerSize,
        reference: before.reference,
        validityStart: before.validityStart,
        validityEnd: before.validityEnd,
        quantity: before.quantity,
        currencyCode: before.currencyCode,
        unitCost: before.unitCost,
        marginPercent: before.marginPercent,
        unitSales: before.unitSales,
        createdAt: before.createdAt,
        updatedAt: before.updatedAt,
      })
      em.persist(line)
    } else {
      line.deletedAt = null
    }

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
      indexer: quoteLineCrudIndexer,
    })
  },
}

registerCommand(createQuoteLineCommand)
registerCommand(updateQuoteLineCommand)
registerCommand(deleteQuoteLineCommand)
