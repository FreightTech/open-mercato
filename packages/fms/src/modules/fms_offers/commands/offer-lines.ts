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
import { FmsOfferCalculation, FmsOfferLine } from '../data/entities'
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
  entityType: E.fms_offers.fms_offer_line,
}

type OfferLineSnapshot = {
  id: string
  calculationId: string
  organizationId: string
  tenantId: string
  lineNumber: number
  productId: string | null
  productName: string | null
  chargeCode: string | null
  chargeBasis: string | null
  containerType: string | null
  currencyCode: string
  rate: string
  buyPrice: string
  sellPrice: string
  quantity: string
  isEnabled: boolean
  sectionType: string | null
  clientGroupLabel: string | null
  createdAt: Date
  updatedAt: Date
}

type OfferLineUndoPayload = {
  before?: OfferLineSnapshot | null
  after?: OfferLineSnapshot | null
}

async function loadOfferLineSnapshot(em: EntityManager, id: string): Promise<OfferLineSnapshot | null> {
  const line = await em.findOne(FmsOfferLine, { id, deletedAt: null }, { populate: ['calculation'] })
  if (!line) return null

  const calculationId = typeof line.calculation === 'string' ? line.calculation : line.calculation?.id

  return {
    id: line.id,
    calculationId: calculationId ?? '',
    organizationId: line.organizationId,
    tenantId: line.tenantId,
    lineNumber: line.lineNumber,
    productId: line.productId ?? null,
    productName: line.productName ?? null,
    chargeCode: line.chargeCode ?? null,
    chargeBasis: line.chargeBasis ?? null,
    containerType: line.containerType ?? null,
    currencyCode: line.currencyCode,
    rate: line.rate,
    buyPrice: line.buyPrice,
    sellPrice: line.sellPrice,
    sectionType: (line as any).sectionType ?? null,
    quantity: line.quantity,
    isEnabled: line.isEnabled,
    clientGroupLabel: line.clientGroupLabel ?? null,
    createdAt: line.createdAt,
    updatedAt: line.updatedAt,
  }
}

const createOfferLineCommand: CommandHandler<FmsOfferLineCreateInput, { lineId: string }> = {
  id: 'fms_offers.offer_lines.create',
  async execute(input, ctx) {
    const parsed = fmsOfferLineCreateSchema.parse(input)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const calculation = await em.findOne(FmsOfferCalculation, { id: parsed.calculationId, deletedAt: null })
    if (!calculation) {
      throw new CrudHttpError(404, { error: 'Calculation not found' })
    }

    ensureTenantScope(ctx, calculation.tenantId)
    ensureOrganizationScope(ctx, calculation.organizationId)

    // Get next line number
    const maxLine = await em.findOne(FmsOfferLine, { calculation, deletedAt: null }, { orderBy: { lineNumber: 'DESC' } })
    const nextLineNumber = (maxLine?.lineNumber ?? -1) + 1

    const now = new Date()
    const line = em.create(FmsOfferLine, {
      calculation,
      organizationId: calculation.organizationId,
      tenantId: calculation.tenantId,
      lineNumber: parsed.lineNumber ?? nextLineNumber,
      productId: parsed.productId ?? null,
      productName: parsed.productName ?? null,
      chargeCode: parsed.chargeCode ?? null,
      chargeBasis: parsed.chargeBasis ?? null,
      containerType: parsed.containerType ?? null,
      currencyCode: parsed.currencyCode ?? 'USD',
      rate: parsed.rate?.toString() ?? '0',
      buyPrice: parsed.buyPrice?.toString() ?? '0',
      sellPrice: parsed.sellPrice?.toString() ?? '0',
      quantity: parsed.quantity?.toString() ?? '1',
      isEnabled: parsed.isEnabled ?? false,
      sectionType: parsed.sectionType ?? null,
      clientGroupLabel: parsed.clientGroupLabel ?? null,
      createdAt: now,
      updatedAt: now,
    })

    await em.persist(line).flush()

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
      actionLabel: translate('fms_offers.audit.offer_lines.create', 'Create offer line'),
      resourceKind: 'fms_offers.offer_line',
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
    const line = await em.findOne(FmsOfferLine, { id: lineId })
    if (!line) return
    em.remove(line)
    await em.flush()
  },
}

const updateOfferLineCommand: CommandHandler<FmsOfferLineUpdateInput, { lineId: string }> = {
  id: 'fms_offers.offer_lines.update',
  async prepare(input, ctx) {
    const parsed = fmsOfferLineUpdateSchema.parse(input)
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadOfferLineSnapshot(em, parsed.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const parsed = fmsOfferLineUpdateSchema.parse(input)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const line = await em.findOne(FmsOfferLine, { id: parsed.id, deletedAt: null }, { populate: ['calculation'] })
    const record = assertRecordFound(line, 'Offer line not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    if (parsed.lineNumber !== undefined) record.lineNumber = parsed.lineNumber
    if (parsed.productId !== undefined) record.productId = parsed.productId
    if (parsed.productName !== undefined) record.productName = parsed.productName
    if (parsed.chargeCode !== undefined) record.chargeCode = parsed.chargeCode
    if (parsed.chargeBasis !== undefined) record.chargeBasis = parsed.chargeBasis
    if (parsed.containerType !== undefined) record.containerType = parsed.containerType
    if (parsed.currencyCode !== undefined) record.currencyCode = parsed.currencyCode
    if (parsed.rate !== undefined) record.rate = parsed.rate.toString()
    if (parsed.buyPrice !== undefined) record.buyPrice = parsed.buyPrice.toString()
    if (parsed.sellPrice !== undefined) record.sellPrice = parsed.sellPrice.toString()
    if (parsed.quantity !== undefined) record.quantity = parsed.quantity.toString()
    if (parsed.isEnabled !== undefined) record.isEnabled = parsed.isEnabled
    if (parsed.sectionType !== undefined) (record as any).sectionType = parsed.sectionType
    if (parsed.clientGroupLabel !== undefined) record.clientGroupLabel = parsed.clientGroupLabel

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
      'productName',
      'chargeCode',
      'chargeBasis',
      'containerType',
      'currencyCode',
      'rate',
      'buyPrice',
      'sellPrice',
      'quantity',
      'isEnabled',
      'clientGroupLabel',
    ]
    const changes = afterSnapshot
      ? buildChanges(
          before as unknown as Record<string, unknown>,
          afterSnapshot as unknown as Record<string, unknown>,
          changeKeys
        )
      : {}

    return {
      actionLabel: translate('fms_offers.audit.offer_lines.update', 'Update offer line'),
      resourceKind: 'fms_offers.offer_line',
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
      const calc = await em.findOne(FmsOfferCalculation, { id: before.calculationId })
      if (!calc) return
      line = em.create(FmsOfferLine, {
        id: before.id,
        calculation: calc,
        organizationId: before.organizationId,
        tenantId: before.tenantId,
        lineNumber: before.lineNumber,
        productId: before.productId,
        productName: before.productName,
        chargeCode: before.chargeCode,
        chargeBasis: before.chargeBasis,
        containerType: before.containerType,
        currencyCode: before.currencyCode,
        rate: before.rate,
        buyPrice: before.buyPrice,
        sellPrice: before.sellPrice,
        quantity: before.quantity,
        isEnabled: before.isEnabled,
        sectionType: before.sectionType,
        clientGroupLabel: before.clientGroupLabel,
        createdAt: before.createdAt ?? new Date(),
        updatedAt: new Date(),
      })
      em.persist(line)
    } else {
      line.lineNumber = before.lineNumber
      line.productId = before.productId
      line.productName = before.productName
      line.chargeCode = before.chargeCode
      line.chargeBasis = before.chargeBasis
      line.containerType = before.containerType
      line.currencyCode = before.currencyCode
      line.rate = before.rate
      line.buyPrice = before.buyPrice
      line.sellPrice = before.sellPrice
      line.quantity = before.quantity
      line.isEnabled = before.isEnabled
      ;(line as any).sectionType = before.sectionType
      line.clientGroupLabel = before.clientGroupLabel
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
      indexer: offerLineCrudIndexer,
    })
  },
}

const deleteOfferLineCommand: CommandHandler<{ body?: Record<string, unknown>; query?: Record<string, unknown> }, { lineId: string }> = {
  id: 'fms_offers.offer_lines.delete',
  async prepare(input, ctx) {
    const id = requireId(input, 'Offer line id required')
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadOfferLineSnapshot(em, id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Offer line id required')
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const line = await em.findOne(FmsOfferLine, { id, deletedAt: null }, { populate: ['calculation'] })
    const record = assertRecordFound(line, 'Offer line not found')
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
      indexer: offerLineCrudIndexer,
    })

    return { lineId: record.id }
  },
  buildLog: async ({ snapshots }) => {
    const before = snapshots.before as OfferLineSnapshot | undefined
    if (!before) return null
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('fms_offers.audit.offer_lines.delete', 'Delete offer line'),
      resourceKind: 'fms_offers.offer_line',
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
      const calc = await em.findOne(FmsOfferCalculation, { id: before.calculationId })
      if (!calc) return
      line = em.create(FmsOfferLine, {
        id: before.id,
        calculation: calc,
        organizationId: before.organizationId,
        tenantId: before.tenantId,
        lineNumber: before.lineNumber,
        productId: before.productId,
        productName: before.productName,
        chargeCode: before.chargeCode,
        chargeBasis: before.chargeBasis,
        containerType: before.containerType,
        currencyCode: before.currencyCode,
        rate: before.rate,
        buyPrice: before.buyPrice,
        sellPrice: before.sellPrice,
        quantity: before.quantity,
        isEnabled: before.isEnabled,
        sectionType: before.sectionType,
        clientGroupLabel: before.clientGroupLabel,
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
      indexer: offerLineCrudIndexer,
    })
  },
}

registerCommand(createOfferLineCommand)
registerCommand(updateOfferLineCommand)
registerCommand(deleteOfferLineCommand)
