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
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { FmsQuote, FmsQuoteLine, FmsOffer, FmsOfferLine } from '../data/entities'
import { FmsLocation } from '../../fms_locations/data/entities'
import { Contractor } from '../../contractors/data/entities'
import { User } from '@open-mercato/core/modules/auth/data/entities'
import {
  fmsQuoteCreateSchema,
  fmsQuoteUpdateSchema,
  type FmsQuoteCreateInput,
  type FmsQuoteUpdateInput,
} from '../data/validators'
import {
  ensureOrganizationScope,
  ensureTenantScope,
  extractUndoPayload,
  assertRecordFound,
  emitQueryIndexDeleteEvents,
  emitQueryIndexUpsertEvents,
  generateQuoteNumber,
  type QueryIndexEventEntry,
} from './shared'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { CrudIndexerConfig } from '@open-mercato/shared/lib/crud/types'
import { E } from '#generated/entities.ids.generated'

const quoteCrudIndexer: CrudIndexerConfig<FmsQuote> = {
  entityType: E.fms_quotes.fms_quote,
}

type QuoteLineSnapshot = {
  id: string
  quoteId: string
  lineNumber: number
  productId: string | null
  variantId: string | null
  priceId: string | null
  productName: string
  chargeCode: string | null
  productType: string | null
  providerName: string | null
  containerSize: string | null
  contractType: string | null
  quantity: string
  currencyCode: string
  unitCost: string
  marginPercent: string
  unitSales: string
  createdAt: Date
  updatedAt: Date
}

type QuoteSnapshot = {
  id: string
  organizationId: string
  tenantId: string
  quoteNumber: string | null
  clientId: string | null
  assignedToId: string | null
  containerCount: number | null
  status: string
  direction: string | null
  incoterm: string | null
  cargoType: string | null
  modes: string[] | null
  validUntil: Date | null
  currencyCode: string
  notes: string | null
  originPortIds: string[]
  destinationPortIds: string[]
  createdAt: Date
  updatedAt: Date
  lines: QuoteLineSnapshot[]
}

type QuoteUndoPayload = {
  before?: QuoteSnapshot | null
  after?: QuoteSnapshot | null
}

async function loadQuoteSnapshot(em: EntityManager, id: string): Promise<QuoteSnapshot | null> {
  const quote = await em.findOne(FmsQuote, { id, deletedAt: null }, {
    populate: ['client', 'assignedTo', 'originPorts', 'destinationPorts', 'lines'],
  })
  if (!quote) return null

  const lines = quote.lines.getItems().filter(l => !l.deletedAt)

  return {
    id: quote.id,
    organizationId: quote.organizationId,
    tenantId: quote.tenantId,
    quoteNumber: quote.quoteNumber ?? null,
    clientId: quote.client?.id ?? null,
    assignedToId: quote.assignedTo?.id ?? null,
    containerCount: quote.containerCount ?? null,
    status: quote.status,
    direction: quote.direction ?? null,
    incoterm: quote.incoterm ?? null,
    cargoType: quote.cargoType ?? null,
    modes: quote.modes ?? null,
    validUntil: quote.validUntil ?? null,
    currencyCode: quote.currencyCode,
    notes: quote.notes ?? null,
    originPortIds: quote.originPorts.getItems().map(p => p.id),
    destinationPortIds: quote.destinationPorts.getItems().map(p => p.id),
    createdAt: quote.createdAt,
    updatedAt: quote.updatedAt,
    lines: lines.map(line => ({
      id: line.id,
      quoteId: quote.id,
      lineNumber: line.lineNumber,
      productId: line.productId ?? null,
      variantId: line.variantId ?? null,
      priceId: line.priceId ?? null,
      productName: line.productName,
      chargeCode: line.chargeCode ?? null,
      productType: line.productType ?? null,
      providerName: line.providerName ?? null,
      containerSize: line.containerSize ?? null,
      contractType: line.contractType ?? null,
      quantity: line.quantity,
      currencyCode: line.currencyCode,
      unitCost: line.unitCost,
      marginPercent: line.marginPercent,
      unitSales: line.unitSales,
      createdAt: line.createdAt,
      updatedAt: line.updatedAt,
    })),
  }
}

const createQuoteCommand: CommandHandler<FmsQuoteCreateInput, { quoteId: string }> = {
  id: 'fms_quotes.quotes.create',
  async execute(input, ctx) {
    const parsed = fmsQuoteCreateSchema.parse(input)
    ensureTenantScope(ctx, parsed.tenantId)
    ensureOrganizationScope(ctx, parsed.organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    // Generate quote number if not provided
    let quoteNumber = parsed.quoteNumber
    if (!quoteNumber) {
      quoteNumber = await generateQuoteNumber(em, parsed.tenantId)
    }

    const now = new Date()
    const quote = em.create(FmsQuote, {
      organizationId: parsed.organizationId,
      tenantId: parsed.tenantId,
      quoteNumber,
      containerCount: parsed.containerCount ?? null,
      status: parsed.status ?? 'draft',
      direction: parsed.direction ?? null,
      incoterm: parsed.incoterm ?? null,
      cargoType: parsed.cargoType ?? null,
      modes: parsed.modes ?? null,
      validUntil: parsed.validUntil ?? null,
      currencyCode: parsed.currencyCode ?? 'USD',
      notes: parsed.notes ?? null,
      createdAt: now,
      updatedAt: now,
    })

    // Handle client relationship - use getReference to avoid MikroORM identity map issues
    if (parsed.clientId) {
      quote.client = em.getReference(Contractor, parsed.clientId)
    }

    // Handle assignedTo relationship - use getReference to avoid MikroORM identity map issues
    if (parsed.assignedToId) {
      quote.assignedTo = em.getReference(User, parsed.assignedToId)
    }

    em.persist(quote)
    await em.flush()

    // Handle origin ports (many-to-many)
    if (parsed.originPortIds?.length) {
      const ports = await em.find(FmsLocation, { id: { $in: parsed.originPortIds } })
      quote.originPorts.set(ports)
    }

    // Handle destination ports (many-to-many)
    if (parsed.destinationPortIds?.length) {
      const ports = await em.find(FmsLocation, { id: { $in: parsed.destinationPortIds } })
      quote.destinationPorts.set(ports)
    }

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: quote,
      identifiers: {
        id: quote.id,
        organizationId: quote.organizationId,
        tenantId: quote.tenantId,
      },
      indexer: quoteCrudIndexer,
    })

    return { quoteId: quote.id }
  },
  captureAfter: async (_input, result, ctx) => {
    const em = ctx.container.resolve('em') as EntityManager
    return await loadQuoteSnapshot(em, result.quoteId)
  },
  buildLog: async ({ result, ctx }) => {
    const { translate } = await resolveTranslations()
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadQuoteSnapshot(em, result.quoteId)
    return {
      actionLabel: translate('fms_quotes.audit.quotes.create', 'Create quote'),
      resourceKind: 'fms_quotes.quote',
      resourceId: result.quoteId,
      tenantId: snapshot?.tenantId ?? null,
      organizationId: snapshot?.organizationId ?? null,
      snapshotAfter: snapshot ?? null,
      payload: {
        undo: {
          after: snapshot,
        } satisfies QuoteUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const quoteId = logEntry?.resourceId
    if (!quoteId) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const quote = await em.findOne(FmsQuote, { id: quoteId }, { populate: ['lines', 'offers'] })
    if (!quote) return

    // Delete all related lines
    await em.nativeDelete(FmsQuoteLine, { quote })

    // Delete all related offers and their lines
    const offers = quote.offers?.getItems() ?? []
    for (const offer of offers) {
      await em.nativeDelete(FmsOfferLine, { offer })
    }
    await em.nativeDelete(FmsOffer, { quote })

    // Clear many-to-many relationships
    quote.originPorts.removeAll()
    quote.destinationPorts.removeAll()
    await em.flush()

    em.remove(quote)
    await em.flush()
  },
}

const updateQuoteCommand: CommandHandler<FmsQuoteUpdateInput, { quoteId: string }> = {
  id: 'fms_quotes.quotes.update',
  async prepare(input, ctx) {
    const parsed = fmsQuoteUpdateSchema.parse(input)
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadQuoteSnapshot(em, parsed.id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const parsed = fmsQuoteUpdateSchema.parse(input)
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const quote = await em.findOne(FmsQuote, { id: parsed.id, deletedAt: null }, {
      populate: ['originPorts', 'destinationPorts'],
    })
    const record = assertRecordFound(quote, 'Quote not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    if (parsed.quoteNumber !== undefined) record.quoteNumber = parsed.quoteNumber
    if (parsed.containerCount !== undefined) record.containerCount = parsed.containerCount
    if (parsed.status !== undefined) record.status = parsed.status
    if (parsed.direction !== undefined) record.direction = parsed.direction
    if (parsed.incoterm !== undefined) record.incoterm = parsed.incoterm
    if (parsed.cargoType !== undefined) record.cargoType = parsed.cargoType
    if (parsed.modes !== undefined) record.modes = parsed.modes
    if (parsed.validUntil !== undefined) record.validUntil = parsed.validUntil
    if (parsed.currencyCode !== undefined) record.currencyCode = parsed.currencyCode
    if (parsed.notes !== undefined) record.notes = parsed.notes

    // Handle client relationship - use getReference to avoid MikroORM identity map issues
    if (parsed.clientId !== undefined) {
      if (parsed.clientId === null) {
        record.client = null
      } else {
        record.client = em.getReference(Contractor, parsed.clientId)
      }
    }

    // Handle assignedTo relationship - use getReference to avoid MikroORM identity map issues
    if (parsed.assignedToId !== undefined) {
      if (parsed.assignedToId === null) {
        record.assignedTo = null
      } else {
        record.assignedTo = em.getReference(User, parsed.assignedToId)
      }
    }

    // Handle origin ports
    if (parsed.originPortIds !== undefined) {
      if (Array.isArray(parsed.originPortIds) && parsed.originPortIds.length > 0) {
        const ports = await em.find(FmsLocation, { id: { $in: parsed.originPortIds } })
        record.originPorts.set(ports)
      } else {
        record.originPorts.removeAll()
      }
    }

    // Handle destination ports
    if (parsed.destinationPortIds !== undefined) {
      if (Array.isArray(parsed.destinationPortIds) && parsed.destinationPortIds.length > 0) {
        const ports = await em.find(FmsLocation, { id: { $in: parsed.destinationPortIds } })
        record.destinationPorts.set(ports)
      } else {
        record.destinationPorts.removeAll()
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
      indexer: quoteCrudIndexer,
    })

    return { quoteId: record.id }
  },
  buildLog: async ({ snapshots, ctx }) => {
    const { translate } = await resolveTranslations()
    const before = snapshots.before as QuoteSnapshot | undefined
    if (!before) return null
    const em = ctx.container.resolve('em') as EntityManager
    const afterSnapshot = await loadQuoteSnapshot(em, before.id)
    const changeKeys: readonly string[] = [
      'quoteNumber',
      'clientId',
      'assignedToId',
      'containerCount',
      'status',
      'direction',
      'incoterm',
      'cargoType',
      'modes',
      'validUntil',
      'currencyCode',
      'notes',
    ]
    const changes = afterSnapshot
      ? buildChanges(
          before as unknown as Record<string, unknown>,
          afterSnapshot as unknown as Record<string, unknown>,
          changeKeys
        )
      : {}

    // Check for port changes
    const originChanged = JSON.stringify(before.originPortIds) !== JSON.stringify(afterSnapshot?.originPortIds)
    const destChanged = JSON.stringify(before.destinationPortIds) !== JSON.stringify(afterSnapshot?.destinationPortIds)
    if (originChanged) {
      (changes as Record<string, unknown>).originPortIds = {
        from: before.originPortIds,
        to: afterSnapshot?.originPortIds,
      }
    }
    if (destChanged) {
      (changes as Record<string, unknown>).destinationPortIds = {
        from: before.destinationPortIds,
        to: afterSnapshot?.destinationPortIds,
      }
    }

    return {
      actionLabel: translate('fms_quotes.audit.quotes.update', 'Update quote'),
      resourceKind: 'fms_quotes.quote',
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
        } satisfies QuoteUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<QuoteUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    let existingQuote = await em.findOne(FmsQuote, { id: before.id }, {
      populate: ['originPorts', 'destinationPorts'],
    })

    let quote: FmsQuote
    if (!existingQuote) {
      const now = new Date()
      quote = em.create(FmsQuote, {
        id: before.id,
        organizationId: before.organizationId,
        tenantId: before.tenantId,
        quoteNumber: before.quoteNumber,
        containerCount: before.containerCount,
        status: before.status as any,
        direction: before.direction as any,
        incoterm: before.incoterm as any,
        cargoType: before.cargoType as any,
        modes: before.modes as any,
        validUntil: before.validUntil,
        currencyCode: before.currencyCode,
        notes: before.notes,
        createdAt: before.createdAt ?? now,
        updatedAt: now,
      })
      em.persist(quote)
    } else {
      quote = existingQuote

      quote.quoteNumber = before.quoteNumber
      quote.containerCount = before.containerCount
      quote.status = before.status as any
      quote.direction = before.direction as any
      quote.incoterm = before.incoterm as any
      quote.cargoType = before.cargoType as any
      quote.modes = before.modes as any
      quote.validUntil = before.validUntil
      quote.currencyCode = before.currencyCode
      quote.notes = before.notes

      // Restore client - use getReference to avoid MikroORM identity map issues
      if (before.clientId) {
        quote.client = em.getReference(Contractor, before.clientId)
      } else {
        quote.client = null
      }

      // Restore assignedTo - use getReference to avoid MikroORM identity map issues
      if (before.assignedToId) {
        quote.assignedTo = em.getReference(User, before.assignedToId)
      } else {
        quote.assignedTo = null
      }

      // Restore origin ports
      if (before.originPortIds?.length) {
        const ports = await em.find(FmsLocation, { id: { $in: before.originPortIds } })
        quote.originPorts.set(ports)
      } else {
        quote.originPorts.removeAll()
      }

      // Restore destination ports
      if (before.destinationPortIds?.length) {
        const ports = await em.find(FmsLocation, { id: { $in: before.destinationPortIds } })
        quote.destinationPorts.set(ports)
      } else {
        quote.destinationPorts.removeAll()
      }
    }

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudUndoSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: quote,
      identifiers: {
        id: quote.id,
        organizationId: quote.organizationId,
        tenantId: quote.tenantId,
      },
      indexer: quoteCrudIndexer,
    })
  },
}

const deleteQuoteCommand: CommandHandler<{ body?: Record<string, unknown>; query?: Record<string, unknown> }, { quoteId: string }> = {
  id: 'fms_quotes.quotes.delete',
  async prepare(input, ctx) {
    const id = requireId(input, 'Quote id required')
    const em = ctx.container.resolve('em') as EntityManager
    const snapshot = await loadQuoteSnapshot(em, id)
    return snapshot ? { before: snapshot } : {}
  },
  async execute(input, ctx) {
    const id = requireId(input, 'Quote id required')
    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const snapshot = await loadQuoteSnapshot(em, id)
    const quote = await em.findOne(FmsQuote, { id, deletedAt: null }, {
      populate: ['lines', 'offers'],
    })
    const record = assertRecordFound(quote, 'Quote not found')
    ensureTenantScope(ctx, record.tenantId)
    ensureOrganizationScope(ctx, record.organizationId)

    // Soft delete quote
    record.deletedAt = new Date()

    // Soft delete all lines
    for (const line of record.lines.getItems()) {
      line.deletedAt = new Date()
    }

    // Soft delete all offers and their lines
    for (const offer of record.offers.getItems()) {
      offer.deletedAt = new Date()
      const offerLines = await em.find(FmsOfferLine, { offer })
      for (const offerLine of offerLines) {
        offerLine.deletedAt = new Date()
      }
    }

    await em.flush()

    const indexDeletes: QueryIndexEventEntry[] = []

    // Index deletes for lines
    if (snapshot?.lines) {
      for (const line of snapshot.lines) {
        indexDeletes.push({
          entityType: E.fms_quotes.fms_quote_line,
          recordId: line.id,
          tenantId: record.tenantId,
          organizationId: record.organizationId,
        })
      }
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
      indexer: quoteCrudIndexer,
    })

    await emitQueryIndexDeleteEvents(ctx, indexDeletes)

    return { quoteId: record.id }
  },
  buildLog: async ({ snapshots }) => {
    const before = snapshots.before as QuoteSnapshot | undefined
    if (!before) return null
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('fms_quotes.audit.quotes.delete', 'Delete quote'),
      resourceKind: 'fms_quotes.quote',
      resourceId: before.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
      snapshotBefore: before,
      payload: {
        undo: {
          before,
        } satisfies QuoteUndoPayload,
      },
    }
  },
  undo: async ({ logEntry, ctx }) => {
    const payload = extractUndoPayload<QuoteUndoPayload>(logEntry)
    const before = payload?.before
    if (!before) return
    const em = (ctx.container.resolve('em') as EntityManager).fork()

    // Restore quote
    let quote = await em.findOne(FmsQuote, { id: before.id })
    if (!quote) {
      quote = em.create(FmsQuote, {
        id: before.id,
        organizationId: before.organizationId,
        tenantId: before.tenantId,
        quoteNumber: before.quoteNumber,
        containerCount: before.containerCount,
        status: before.status as any,
        direction: before.direction as any,
        incoterm: before.incoterm as any,
        cargoType: before.cargoType as any,
        modes: before.modes as any,
        validUntil: before.validUntil,
        currencyCode: before.currencyCode,
        notes: before.notes,
        createdAt: before.createdAt,
        updatedAt: before.updatedAt,
      })
      em.persist(quote)
    } else {
      quote.deletedAt = null
    }

    // Restore client - use getReference to avoid MikroORM identity map issues
    if (before.clientId) {
      quote.client = em.getReference(Contractor, before.clientId)
    }

    // Restore assignedTo - use getReference to avoid MikroORM identity map issues
    if (before.assignedToId) {
      quote.assignedTo = em.getReference(User, before.assignedToId)
    }

    await em.flush()

    // Restore origin ports
    if (before.originPortIds?.length) {
      const ports = await em.find(FmsLocation, { id: { $in: before.originPortIds } })
      quote.originPorts.set(ports)
    }

    // Restore destination ports
    if (before.destinationPortIds?.length) {
      const ports = await em.find(FmsLocation, { id: { $in: before.destinationPortIds } })
      quote.destinationPorts.set(ports)
    }

    await em.flush()

    // Restore lines
    for (const lineSnapshot of before.lines) {
      let line = await em.findOne(FmsQuoteLine, { id: lineSnapshot.id })
      if (!line) {
        line = em.create(FmsQuoteLine, {
          id: lineSnapshot.id,
          quote,
          organizationId: before.organizationId,
          tenantId: before.tenantId,
          lineNumber: lineSnapshot.lineNumber,
          productId: lineSnapshot.productId,
          variantId: lineSnapshot.variantId,
          priceId: lineSnapshot.priceId,
          productName: lineSnapshot.productName,
          chargeCode: lineSnapshot.chargeCode,
          productType: lineSnapshot.productType,
          providerName: lineSnapshot.providerName,
          containerSize: lineSnapshot.containerSize,
          contractType: lineSnapshot.contractType,
          quantity: lineSnapshot.quantity,
          currencyCode: lineSnapshot.currencyCode,
          unitCost: lineSnapshot.unitCost,
          marginPercent: lineSnapshot.marginPercent,
          unitSales: lineSnapshot.unitSales,
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
      entity: quote,
      identifiers: {
        id: quote.id,
        organizationId: quote.organizationId,
        tenantId: quote.tenantId,
      },
      indexer: quoteCrudIndexer,
    })

    // Emit upsert for restored lines
    const lineUpserts: QueryIndexEventEntry[] = before.lines.map(line => ({
      entityType: E.fms_quotes.fms_quote_line,
      recordId: line.id,
      tenantId: before.tenantId,
      organizationId: before.organizationId,
    }))
    await emitQueryIndexUpsertEvents(ctx, lineUpserts)
  },
}

registerCommand(createQuoteCommand)
registerCommand(updateQuoteCommand)
registerCommand(deleteQuoteCommand)
