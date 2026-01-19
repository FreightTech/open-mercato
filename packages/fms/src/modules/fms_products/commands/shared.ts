import type { ActionLog } from '@open-mercato/core/modules/audit_logs/data/entities'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import {
  FmsChargeCode,
  FmsProduct,
  FmsProductVariant,
  FmsProductPrice,
} from '../data/entities'
import type {
  FmsChargeCodeSnapshot,
  FmsProductSnapshot,
  FmsProductVariantSnapshot,
  FmsProductPriceSnapshot,
} from '../data/snapshots'

export { ensureOrganizationScope } from '@open-mercato/shared/lib/commands/scope'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Safely extract a user ID from the auth context.
 * Returns null if the sub is not a valid UUID (e.g., API key auth).
 */
export function getUserIdFromAuth(ctx: CommandRuntimeContext): string | null {
  const sub = ctx.auth?.sub
  if (typeof sub === 'string' && UUID_REGEX.test(sub)) {
    return sub
  }
  return null
}

type UndoEnvelope<T> = {
  undo?: T
  value?: { undo?: T }
  __redoInput?: unknown
  [key: string]: unknown
}

export function ensureTenantScope(ctx: CommandRuntimeContext, tenantId: string): void {
  const currentTenant = ctx.auth?.tenantId ?? null
  if (currentTenant && currentTenant !== tenantId) {
    throw new CrudHttpError(403, { error: 'Forbidden' })
  }
}

export function extractUndoPayload<T>(logEntry: ActionLog | null | undefined): T | null {
  if (!logEntry) return null
  const payload = logEntry.commandPayload as UndoEnvelope<T> | undefined
  if (!payload || typeof payload !== 'object') return null
  if (payload.undo) return payload.undo
  if (payload.value && typeof payload.value === 'object' && payload.value.undo) {
    return payload.value.undo as T
  }
  const entries = Object.entries(payload).find(([key]) => key !== '__redoInput')
  if (entries && entries[1] && typeof entries[1] === 'object' && 'undo' in (entries[1] as Record<string, unknown>)) {
    return (entries[1] as { undo?: T }).undo ?? null
  }
  return null
}

export function assertRecordFound<T>(record: T | null | undefined, message: string): T {
  if (!record) throw new CrudHttpError(404, { error: message })
  return record
}

/**
 * Serialize a price entity to snapshot
 */
function serializePriceSnapshot(price: FmsProductPrice): FmsProductPriceSnapshot {
  return {
    id: price.id,
    organizationId: price.organizationId,
    tenantId: price.tenantId,
    variantId: typeof price.variant === 'string' ? price.variant : price.variant.id,
    validityStart: price.validityStart,
    validityEnd: price.validityEnd ?? null,
    contractType: price.contractType,
    contractNumber: price.contractNumber ?? null,
    price: price.price,
    currencyCode: price.currencyCode,
    isActive: price.isActive,
    createdAt: price.createdAt,
    createdBy: price.createdBy ?? null,
    updatedAt: price.updatedAt,
    updatedBy: price.updatedBy ?? null,
  }
}

/**
 * Serialize a variant entity to snapshot (with prices)
 */
function serializeVariantSnapshot(
  variant: FmsProductVariant,
  prices: FmsProductPrice[]
): FmsProductVariantSnapshot {
  return {
    id: variant.id,
    organizationId: variant.organizationId,
    tenantId: variant.tenantId,
    productId: typeof variant.product === 'string' ? variant.product : variant.product.id,
    providerId: variant.provider
      ? typeof variant.provider === 'string'
        ? variant.provider
        : variant.provider.id
      : null,
    variantType: variant.variantType,
    name: variant.name ?? null,
    isDefault: variant.isDefault,
    isActive: variant.isActive,
    containerSize: variant.containerSize ?? null,
    containerType: variant.containerType ?? null,
    weightLimit: variant.weightLimit ?? null,
    weightUnit: variant.weightUnit ?? null,
    createdAt: variant.createdAt,
    createdBy: variant.createdBy ?? null,
    updatedAt: variant.updatedAt,
    updatedBy: variant.updatedBy ?? null,
    prices: prices.map(serializePriceSnapshot),
  }
}

/**
 * Load a full product snapshot including variants and prices
 */
export async function loadProductSnapshot(
  em: EntityManager,
  productId: string
): Promise<FmsProductSnapshot | null> {
  const product = await em.findOne(FmsProduct, { id: productId, deletedAt: null }, {
    populate: ['chargeCode', 'serviceProvider', 'source', 'destination', 'location'],
  })
  if (!product) return null

  const variants = await em.find(FmsProductVariant, { product, deletedAt: null }, {
    populate: ['provider'],
    orderBy: { createdAt: 'asc' },
  })

  const variantSnapshots: FmsProductVariantSnapshot[] = []
  for (const variant of variants) {
    const prices = await em.find(FmsProductPrice, { variant, deletedAt: null }, {
      orderBy: { createdAt: 'asc' },
    })
    variantSnapshots.push(serializeVariantSnapshot(variant, prices))
  }

  return {
    id: product.id,
    organizationId: product.organizationId,
    tenantId: product.tenantId,
    name: product.name,
    productType: product.productType,
    chargeCodeId: product.chargeCode
      ? typeof product.chargeCode === 'string'
        ? product.chargeCode
        : product.chargeCode.id
      : null,
    serviceProviderId: product.serviceProvider
      ? typeof product.serviceProvider === 'string'
        ? product.serviceProvider
        : product.serviceProvider.id
      : null,
    internalNotes: product.internalNotes ?? null,
    isActive: product.isActive,
    loop: product.loop ?? null,
    sourceId: product.source
      ? typeof product.source === 'string'
        ? product.source
        : product.source.id
      : null,
    destinationId: product.destination
      ? typeof product.destination === 'string'
        ? product.destination
        : product.destination.id
      : null,
    transitTime: product.transitTime ?? null,
    locationId: product.location
      ? typeof product.location === 'string'
        ? product.location
        : product.location.id
      : null,
    description: product.description ?? null,
    createdAt: product.createdAt,
    createdBy: product.createdBy ?? null,
    updatedAt: product.updatedAt,
    updatedBy: product.updatedBy ?? null,
    variants: variantSnapshots,
  }
}

/**
 * Load a variant snapshot including prices
 */
export async function loadVariantSnapshot(
  em: EntityManager,
  variantId: string
): Promise<FmsProductVariantSnapshot | null> {
  const variant = await em.findOne(FmsProductVariant, { id: variantId, deletedAt: null }, {
    populate: ['provider', 'product'],
  })
  if (!variant) return null

  const prices = await em.find(FmsProductPrice, { variant, deletedAt: null }, {
    orderBy: { createdAt: 'asc' },
  })

  return serializeVariantSnapshot(variant, prices)
}

/**
 * Load a price snapshot
 */
export async function loadPriceSnapshot(
  em: EntityManager,
  priceId: string
): Promise<FmsProductPriceSnapshot | null> {
  const price = await em.findOne(FmsProductPrice, { id: priceId, deletedAt: null }, {
    populate: ['variant'],
  })
  if (!price) return null

  return serializePriceSnapshot(price)
}

/**
 * Load a charge code snapshot
 */
export async function loadChargeCodeSnapshot(
  em: EntityManager,
  chargeCodeId: string
): Promise<FmsChargeCodeSnapshot | null> {
  const chargeCode = await em.findOne(FmsChargeCode, { id: chargeCodeId, deletedAt: null })
  if (!chargeCode) return null

  return {
    id: chargeCode.id,
    organizationId: chargeCode.organizationId,
    tenantId: chargeCode.tenantId,
    code: chargeCode.code,
    description: chargeCode.description ?? null,
    chargeUnit: chargeCode.chargeUnit,
    fieldSchema: chargeCode.fieldSchema ?? null,
    isActive: chargeCode.isActive,
    createdAt: chargeCode.createdAt,
    createdBy: chargeCode.createdBy ?? null,
    updatedAt: chargeCode.updatedAt,
    updatedBy: chargeCode.updatedBy ?? null,
  }
}

/**
 * Restore a product from snapshot (for undo operations)
 */
export async function applyProductSnapshot(
  em: EntityManager,
  snapshot: FmsProductSnapshot
): Promise<FmsProduct> {
  let product = await em.findOne(FmsProduct, { id: snapshot.id })

  if (!product) {
    product = em.create(FmsProduct, {
      id: snapshot.id,
      organizationId: snapshot.organizationId,
      tenantId: snapshot.tenantId,
      name: snapshot.name,
      productType: snapshot.productType,
      internalNotes: snapshot.internalNotes,
      isActive: snapshot.isActive,
      loop: snapshot.loop,
      transitTime: snapshot.transitTime,
      description: snapshot.description,
      createdAt: snapshot.createdAt,
      createdBy: snapshot.createdBy,
      updatedAt: snapshot.updatedAt,
      updatedBy: snapshot.updatedBy,
    })
    em.persist(product)
  } else {
    product.name = snapshot.name
    product.productType = snapshot.productType
    product.internalNotes = snapshot.internalNotes
    product.isActive = snapshot.isActive
    product.loop = snapshot.loop
    product.transitTime = snapshot.transitTime
    product.description = snapshot.description
    product.deletedAt = null
  }

  // Set references
  if (snapshot.chargeCodeId) {
    product.chargeCode = em.getReference(FmsChargeCode, snapshot.chargeCodeId)
  } else {
    product.chargeCode = null
  }

  await em.flush()
  return product
}

/**
 * Restore a variant from snapshot (for undo operations)
 */
export async function applyVariantSnapshot(
  em: EntityManager,
  snapshot: FmsProductVariantSnapshot
): Promise<FmsProductVariant> {
  let variant = await em.findOne(FmsProductVariant, { id: snapshot.id })

  if (!variant) {
    variant = em.create(FmsProductVariant, {
      id: snapshot.id,
      organizationId: snapshot.organizationId,
      tenantId: snapshot.tenantId,
      product: em.getReference(FmsProduct, snapshot.productId),
      variantType: snapshot.variantType,
      name: snapshot.name,
      isDefault: snapshot.isDefault,
      isActive: snapshot.isActive,
      containerSize: snapshot.containerSize,
      containerType: snapshot.containerType,
      weightLimit: snapshot.weightLimit,
      weightUnit: snapshot.weightUnit,
      createdAt: snapshot.createdAt,
      createdBy: snapshot.createdBy,
      updatedAt: snapshot.updatedAt,
      updatedBy: snapshot.updatedBy,
    })
    em.persist(variant)
  } else {
    variant.variantType = snapshot.variantType
    variant.name = snapshot.name
    variant.isDefault = snapshot.isDefault
    variant.isActive = snapshot.isActive
    variant.containerSize = snapshot.containerSize
    variant.containerType = snapshot.containerType
    variant.weightLimit = snapshot.weightLimit
    variant.weightUnit = snapshot.weightUnit
    variant.deletedAt = null
  }

  await em.flush()
  return variant
}

/**
 * Restore a price from snapshot (for undo operations)
 */
export async function applyPriceSnapshot(
  em: EntityManager,
  snapshot: FmsProductPriceSnapshot
): Promise<FmsProductPrice> {
  let price = await em.findOne(FmsProductPrice, { id: snapshot.id })

  if (!price) {
    price = em.create(FmsProductPrice, {
      id: snapshot.id,
      organizationId: snapshot.organizationId,
      tenantId: snapshot.tenantId,
      variant: em.getReference(FmsProductVariant, snapshot.variantId),
      validityStart: snapshot.validityStart,
      validityEnd: snapshot.validityEnd,
      contractType: snapshot.contractType,
      contractNumber: snapshot.contractNumber,
      price: snapshot.price,
      currencyCode: snapshot.currencyCode,
      isActive: snapshot.isActive,
      createdAt: snapshot.createdAt,
      createdBy: snapshot.createdBy,
      updatedAt: snapshot.updatedAt,
      updatedBy: snapshot.updatedBy,
    })
    em.persist(price)
  } else {
    price.validityStart = snapshot.validityStart
    price.validityEnd = snapshot.validityEnd
    price.contractType = snapshot.contractType
    price.contractNumber = snapshot.contractNumber
    price.price = snapshot.price
    price.currencyCode = snapshot.currencyCode
    price.isActive = snapshot.isActive
    price.deletedAt = null
  }

  await em.flush()
  return price
}

/**
 * Restore a charge code from snapshot (for undo operations)
 */
export async function applyChargeCodeSnapshot(
  em: EntityManager,
  snapshot: FmsChargeCodeSnapshot
): Promise<FmsChargeCode> {
  let chargeCode = await em.findOne(FmsChargeCode, { id: snapshot.id })

  if (!chargeCode) {
    chargeCode = em.create(FmsChargeCode, {
      id: snapshot.id,
      organizationId: snapshot.organizationId,
      tenantId: snapshot.tenantId,
      code: snapshot.code,
      description: snapshot.description,
      chargeUnit: snapshot.chargeUnit,
      fieldSchema: snapshot.fieldSchema,
      isActive: snapshot.isActive,
      createdAt: snapshot.createdAt,
      createdBy: snapshot.createdBy,
      updatedAt: snapshot.updatedAt,
      updatedBy: snapshot.updatedBy,
    })
    em.persist(chargeCode)
  } else {
    chargeCode.code = snapshot.code
    chargeCode.description = snapshot.description
    chargeCode.chargeUnit = snapshot.chargeUnit
    chargeCode.fieldSchema = snapshot.fieldSchema
    chargeCode.isActive = snapshot.isActive
    chargeCode.deletedAt = null
  }

  await em.flush()
  return chargeCode
}

export type QueryIndexEventEntry = {
  entityType: string
  recordId: string
  tenantId: string | null
  organizationId: string | null
}

type QueryIndexEventKind = 'delete' | 'upsert'

function normalizeEventEntries(entries: readonly QueryIndexEventEntry[]): QueryIndexEventEntry[] {
  const map = new Map<string, QueryIndexEventEntry>()
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const entityType = String(entry.entityType ?? '')
    const recordId = String(entry.recordId ?? '')
    if (!entityType || !recordId) continue
    const key = [
      entityType,
      recordId,
      entry.organizationId ?? '__org__',
      entry.tenantId ?? '__tenant__',
    ].join('|')
    if (!map.has(key)) {
      map.set(key, {
        entityType,
        recordId,
        organizationId: entry.organizationId ?? null,
        tenantId: entry.tenantId ?? null,
      })
    }
  }
  return Array.from(map.values())
}

async function emitQueryIndexEvents(
  ctx: CommandRuntimeContext,
  entries: readonly QueryIndexEventEntry[],
  kind: QueryIndexEventKind,
): Promise<void> {
  const normalized = normalizeEventEntries(entries)
  if (!normalized.length) return

  let bus: { emitEvent(event: string, payload: any, options?: any): Promise<void> } | null = null
  try {
    bus = ctx.container.resolve('eventBus')
  } catch {
    bus = null
  }
  if (!bus) return

  const eventName = kind === 'delete' ? 'query_index.delete_one' : 'query_index.upsert_one'
  const crudAction = kind === 'delete' ? 'deleted' : 'updated'

  await Promise.all(
    normalized.map((entry) =>
      bus!
        .emitEvent(
          eventName,
          {
            entityType: entry.entityType,
            recordId: entry.recordId,
            organizationId: entry.organizationId ?? null,
            tenantId: entry.tenantId ?? null,
            crudAction,
          },
        )
        .catch(() => undefined),
    ),
  )
}

export async function emitQueryIndexDeleteEvents(
  ctx: CommandRuntimeContext,
  entries: readonly QueryIndexEventEntry[],
): Promise<void> {
  await emitQueryIndexEvents(ctx, entries, 'delete')
}

export async function emitQueryIndexUpsertEvents(
  ctx: CommandRuntimeContext,
  entries: readonly QueryIndexEventEntry[],
): Promise<void> {
  await emitQueryIndexEvents(ctx, entries, 'upsert')
}
