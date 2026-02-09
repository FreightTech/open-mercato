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
import { FmsOffer, FmsOfferCalculation, FmsOfferLine } from '../data/entities'
import {
  fmsOfferCalculationCreateSchema,
  fmsOfferCalculationUpdateSchema,
  type FmsOfferCalculationCreateInput,
  type FmsOfferCalculationUpdateInput,
} from '../data/validators'
import {
  ensureOrganizationScope,
  ensureTenantScope,
  extractUndoPayload,
  assertRecordFound,
  emitQueryIndexDeleteEvents,
  type QueryIndexEventEntry,
} from './shared'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { CrudIndexerConfig } from '@open-mercato/shared/lib/crud/types'
import { E } from '#generated/entities.ids.generated'

const calculationCrudIndexer: CrudIndexerConfig<FmsOfferCalculation> = {
  entityType: E.fms_offers.fms_offer_calculation,
}

type CalculationSnapshot = {
  id: string
  offerId: string
  organizationId: string
  tenantId: string
  calculationNumber: number
  label: string | null
  containers: string[] | null
  originLocationId: string | null
  destinationLocationId: string | null
  placeOfLoadingId: string | null
  placeOfDeliveryId: string | null
  createdAt: Date
  updatedAt: Date
}

type CalculationUndoPayload = {
  before?: CalculationSnapshot | null
  after?: CalculationSnapshot | null
}

async function loadCalculationSnapshot(em: EntityManager, id: string): Promise<CalculationSnapshot | null> {
  const calc = await em.findOne(FmsOfferCalculation, { id, deletedAt: null }, { populate: ['offer'] })
  if (!calc) return null

  const offerId = typeof calc.offer === 'string' ? calc.offer : calc.offer?.id

  return {
    id: calc.id,
    offerId: offerId ?? '',
    organizationId: calc.organizationId,
    tenantId: calc.tenantId,
    calculationNumber: calc.calculationNumber,
    label: calc.label ?? null,
    containers: calc.containers ?? null,
    originLocationId: calc.originLocationId ?? null,
    destinationLocationId: calc.destinationLocationId ?? null,
    placeOfLoadingId: calc.placeOfLoadingId ?? null,
    placeOfDeliveryId: calc.placeOfDeliveryId ?? null,
    createdAt: calc.createdAt,
    updatedAt: calc.updatedAt,
  }
}

/**
 * Auto-populate a calculation with all active products as disabled lines
 */
async function autoPopulateCalculation(
  em: EntityManager,
  calculation: FmsOfferCalculation,
): Promise<void> {
  const { FmsProduct } = await import('../../fms_products/data/entities')

  const products = await em.find(FmsProduct, {
    organizationId: calculation.organizationId,
    tenantId: calculation.tenantId,
    isActive: true,
    deletedAt: null,
  }, { populate: ['chargeCode'] })

  const now = new Date()
  for (let i = 0; i < products.length; i++) {
    const product = products[i]
    const chargeCodeValue = product.chargeCode?.code ?? null

    const line = em.create(FmsOfferLine, {
      calculation,
      organizationId: calculation.organizationId,
      tenantId: calculation.tenantId,
      lineNumber: i + 1,
      productId: product.id,
      productName: product.name,
      chargeCode: chargeCodeValue,
      chargeBasis: null,
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
}

const createCalculationCommand: CommandHandler<FmsOfferCalculationCreateInput, { calculationId: string }> = {
  id: 'fms_offers.calculations.create',
  async execute(input, ctx) {
    const parsed = fmsOfferCalculationCreateSchema.parse(input)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    const offer = await em.findOne(FmsOffer, { id: parsed.offerId, deletedAt: null })
    if (!offer) {
      throw new CrudHttpError(404, { error: 'Offer not found' })
    }

    ensureTenantScope(ctx, offer.tenantId)
    ensureOrganizationScope(ctx, offer.organizationId)

    // Get next calculation number
    const maxCalc = await em.findOne(FmsOfferCalculation, { offer, deletedAt: null }, { orderBy: { calculationNumber: 'DESC' } })
    const nextNumber = (maxCalc?.calculationNumber ?? 0) + 1

    const now = new Date()
    const calculation = em.create(FmsOfferCalculation, {
      offer,
      organizationId: offer.organizationId,
      tenantId: offer.tenantId,
      calculationNumber: parsed.calculationNumber ?? nextNumber,
      label: parsed.label ?? `Calculation ${nextNumber}`,
      containers: parsed.containers ?? null,
      originLocationId: parsed.originLocationId ?? null,
      destinationLocationId: parsed.destinationLocationId ?? null,
      placeOfLoadingId: parsed.placeOfLoadingId ?? null,
      placeOfDeliveryId: parsed.placeOfDeliveryId ?? null,
      createdAt: now,
      updatedAt: now,
    })

    em.persist(calculation)
    await em.flush()

    // Auto-populate with all active products
    await autoPopulateCalculation(em, calculation)
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: calculation,
      identifiers: {
        id: calculation.id,
        organizationId: calculation.organizationId,
        tenantId: calculation.tenantId,
      },
      indexer: calculationCrudIndexer,
    })

    return { calculationId: calculation.id }
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve('em') as EntityManager
    return await loadCalculationSnapshot(em, result.calculationId)
  },
  buildLog: async ({ result, ctx }) => {
    const { translate } = await resolveTranslations()
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadCalculationSnapshot(em, result.calculationId)
    return {
      actionLabel: translate('fms_offers.audit.calculations.create', 'Create calculation'),
      resourceKind: 'fms_offers.calculation',
      resourceId: result.calculationId,
      tenantId: snapshot?.tenantId ?? null,
      organizationId: snapshot?.organizationId ?? null,
      snapshotAfter: snapshot ?? null,
      payload: {
        undo: {
          after: snapshot,
        } satisfies CalculationUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const calcId = logEntry?.resourceId
    if (!calcId) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    // Delete all lines in this calculation
    await em.nativeDelete(FmsOfferLine, { calculation: calcId })

    const calc = await em.findOne(FmsOfferCalculation, { id: calcId })
    if (calc) {
      em.remove(calc)
      await em.flush()
    }
  },
}

const updateCalculationCommand: CommandHandler<FmsOfferCalculationUpdateInput, { calculationId: string }> = {
  id: 'fms_offers.calculations.update',
  async prepare(input, ctx) {
    const parsed = fmsOfferCalculationUpdateSchema.parse(input)
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadCalculationSnapshot(em, parsed.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const parsed = fmsOfferCalculationUpdateSchema.parse(input)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const calc = await em.findOne(FmsOfferCalculation, { id: parsed.id, deletedAt: null }, { populate: ['offer'] })
    const record = assertRecordFound(calc, 'Calculation not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    if (parsed.calculationNumber !== undefined) record.calculationNumber = parsed.calculationNumber
    if (parsed.label !== undefined) record.label = parsed.label
    if (parsed.containers !== undefined) record.containers = parsed.containers
    if (parsed.originLocationId !== undefined) record.originLocationId = parsed.originLocationId
    if (parsed.destinationLocationId !== undefined) record.destinationLocationId = parsed.destinationLocationId
    if (parsed.placeOfLoadingId !== undefined) record.placeOfLoadingId = parsed.placeOfLoadingId
    if (parsed.placeOfDeliveryId !== undefined) record.placeOfDeliveryId = parsed.placeOfDeliveryId

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
      indexer: calculationCrudIndexer,
    })

    return { calculationId: record.id }
  },
  buildLog: async ({ snapshots, ctx }) => {
    const { translate } = await resolveTranslations()
    const before = snapshots.before as CalculationSnapshot | undefined
    if (!before) return null
    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadCalculationSnapshot(em, before.id)
    const changeKeys: readonly string[] = [
      'calculationNumber',
      'label',
      'containers',
      'originLocationId',
      'destinationLocationId',
      'placeOfLoadingId',
      'placeOfDeliveryId',
    ]
    const changes = afterSnapshot
      ? buildChanges(
          before as unknown as Record<string, unknown>,
          afterSnapshot as unknown as Record<string, unknown>,
          changeKeys
        )
      : {}

    return {
      actionLabel: translate('fms_offers.audit.calculations.update', 'Update calculation'),
      resourceKind: 'fms_offers.calculation',
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
        } satisfies CalculationUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<CalculationUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const calc = await em.findOne(FmsOfferCalculation, { id: before.id })
    if (!calc) return

    calc.calculationNumber = before.calculationNumber
    calc.label = before.label
    calc.containers = before.containers
    calc.originLocationId = before.originLocationId
    calc.destinationLocationId = before.destinationLocationId
    calc.placeOfLoadingId = before.placeOfLoadingId
    calc.placeOfDeliveryId = before.placeOfDeliveryId

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudUndoSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: calc,
      identifiers: {
        id: calc.id,
        organizationId: calc.organizationId,
        tenantId: calc.tenantId,
      },
      indexer: calculationCrudIndexer,
    })
  },
}

const deleteCalculationCommand: CommandHandler<{ body?: Record<string, unknown>; query?: Record<string, unknown> }, { calculationId: string }> = {
  id: 'fms_offers.calculations.delete',
  async prepare(input, ctx) {
    const id = requireId(input, 'Calculation id required')
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadCalculationSnapshot(em, id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Calculation id required')
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const calc = await em.findOne(FmsOfferCalculation, { id, deletedAt: null }, { populate: ['lines'] })
    const record = assertRecordFound(calc, 'Calculation not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    // Soft delete calculation and all its lines
    record.deletedAt = new Date()
    for (const line of record.lines.getItems()) {
      line.deletedAt = new Date()
    }

    await em.flush()

    const indexDeletes: QueryIndexEventEntry[] = record.lines.getItems().map(line => ({
      entityType: E.fms_offers.fms_offer_line,
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
      indexer: calculationCrudIndexer,
    })

    await emitQueryIndexDeleteEvents(ctx, indexDeletes)

    return { calculationId: record.id }
  },
  buildLog: async ({ snapshots }) => {
    const before = snapshots.before as CalculationSnapshot | undefined
    if (!before) return null
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('fms_offers.audit.calculations.delete', 'Delete calculation'),
      resourceKind: 'fms_offers.calculation',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      payload: {
        undo: {
          before,
        } satisfies CalculationUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<CalculationUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    let calc = await em.findOne(FmsOfferCalculation, { id: before.id })
    if (!calc) {
      const offer = await em.findOne(FmsOffer, { id: before.offerId })
      if (!offer) return
      calc = em.create(FmsOfferCalculation, {
        id: before.id,
        offer,
        organizationId: before.organizationId,
        tenantId: before.tenantId,
        calculationNumber: before.calculationNumber,
        label: before.label,
        containers: before.containers,
        originLocationId: before.originLocationId,
        destinationLocationId: before.destinationLocationId,
        placeOfLoadingId: before.placeOfLoadingId,
        placeOfDeliveryId: before.placeOfDeliveryId,
        createdAt: before.createdAt,
        updatedAt: before.updatedAt,
      })
      em.persist(calc)
    } else {
      calc.deletedAt = null
    }

    // Restore soft-deleted lines
    const lines = await em.find(FmsOfferLine, { calculation: before.id })
    for (const line of lines) {
      line.deletedAt = null
    }

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudUndoSideEffects({
      dataEngine: de,
      action: 'created',
      entity: calc,
      identifiers: {
        id: calc.id,
        organizationId: calc.organizationId,
        tenantId: calc.tenantId,
      },
      indexer: calculationCrudIndexer,
    })
  },
}

registerCommand(createCalculationCommand)
registerCommand(updateCalculationCommand)
registerCommand(deleteCalculationCommand)
