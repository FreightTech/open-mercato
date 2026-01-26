import type { ActionLog } from '@open-mercato/core/modules/audit_logs/data/entities'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import {
  FmsChargeCode,
  FmsProduct,
  FmsProductVariant,
  FmsCarrier,
  FmsPriceType,
} from '../data/entities'
import type {
  FmsChargeCodeSnapshot,
  FmsProductSnapshot,
  FmsProductVariantSnapshot,
  FmsCarrierSnapshot,
  FmsPriceTypeSnapshot,
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
 * Serialize a variant entity to snapshot (flattened with pricing)
 */
function serializeVariantSnapshot(variant: FmsProductVariant): FmsProductVariantSnapshot {
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
    priceTypeId: variant.priceType
      ? typeof variant.priceType === 'string'
        ? variant.priceType
        : variant.priceType.id
      : null,
    isActive: variant.isActive,
    containerSize: variant.containerSize ?? null,
    // Pricing fields (flattened)
    validityStart: variant.validityStart ?? null,
    validityEnd: variant.validityEnd ?? null,
    price: variant.price ?? null,
    currencyCode: variant.currencyCode,
    reference: variant.reference ?? null,
    createdAt: variant.createdAt,
    createdBy: variant.createdBy ?? null,
    updatedAt: variant.updatedAt,
    updatedBy: variant.updatedBy ?? null,
  }
}

/**
 * Serialize a carrier entity to snapshot
 */
function serializeCarrierSnapshot(carrier: FmsCarrier): FmsCarrierSnapshot {
  return {
    id: carrier.id,
    organizationId: carrier.organizationId,
    tenantId: carrier.tenantId,
    code: carrier.code,
    name: carrier.name,
    carrierType: carrier.carrierType,
    isActive: carrier.isActive,
    createdAt: carrier.createdAt,
    createdBy: carrier.createdBy ?? null,
    updatedAt: carrier.updatedAt,
    updatedBy: carrier.updatedBy ?? null,
  }
}

/**
 * Serialize a price type entity to snapshot
 */
function serializePriceTypeSnapshot(priceType: FmsPriceType): FmsPriceTypeSnapshot {
  return {
    id: priceType.id,
    organizationId: priceType.organizationId,
    tenantId: priceType.tenantId,
    code: priceType.code,
    name: priceType.name,
    description: priceType.description ?? null,
    isActive: priceType.isActive,
    createdAt: priceType.createdAt,
    createdBy: priceType.createdBy ?? null,
    updatedAt: priceType.updatedAt,
    updatedBy: priceType.updatedBy ?? null,
  }
}

/**
 * Load a full product snapshot including variants
 */
export async function loadProductSnapshot(
  em: EntityManager,
  productId: string
): Promise<FmsProductSnapshot | null> {
  const product = await em.findOne(FmsProduct, { id: productId, deletedAt: null }, {
    populate: ['chargeCode', 'carrier', 'source', 'destination', 'location'],
  })
  if (!product) return null

  const variants = await em.find(FmsProductVariant, { product, deletedAt: null }, {
    populate: ['provider', 'priceType'],
    orderBy: { createdAt: 'asc' },
  })

  const variantSnapshots: FmsProductVariantSnapshot[] = variants.map(serializeVariantSnapshot)

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
    carrierId: product.carrier
      ? typeof product.carrier === 'string'
        ? product.carrier
        : product.carrier.id
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
 * Load a variant snapshot (flattened with pricing)
 */
export async function loadVariantSnapshot(
  em: EntityManager,
  variantId: string
): Promise<FmsProductVariantSnapshot | null> {
  const variant = await em.findOne(FmsProductVariant, { id: variantId, deletedAt: null }, {
    populate: ['provider', 'priceType', 'product'],
  })
  if (!variant) return null

  return serializeVariantSnapshot(variant)
}

/**
 * Load a carrier snapshot
 */
export async function loadCarrierSnapshot(
  em: EntityManager,
  carrierId: string
): Promise<FmsCarrierSnapshot | null> {
  const carrier = await em.findOne(FmsCarrier, { id: carrierId, deletedAt: null })
  if (!carrier) return null

  return serializeCarrierSnapshot(carrier)
}

/**
 * Load a price type snapshot
 */
export async function loadPriceTypeSnapshot(
  em: EntityManager,
  priceTypeId: string
): Promise<FmsPriceTypeSnapshot | null> {
  const priceType = await em.findOne(FmsPriceType, { id: priceTypeId, deletedAt: null })
  if (!priceType) return null

  return serializePriceTypeSnapshot(priceType)
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
    name: chargeCode.name ?? null,
    description: chargeCode.description ?? null,
    chargeUnit: chargeCode.chargeUnit,
    keywords: chargeCode.keywords ?? null,
    usage: chargeCode.usage ?? null,
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

  if (snapshot.carrierId) {
    product.carrier = em.getReference(FmsCarrier, snapshot.carrierId)
  } else {
    product.carrier = null
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
      isActive: snapshot.isActive,
      containerSize: snapshot.containerSize,
      // Pricing fields
      validityStart: snapshot.validityStart,
      validityEnd: snapshot.validityEnd,
      price: snapshot.price,
      currencyCode: snapshot.currencyCode,
      reference: snapshot.reference,
      createdAt: snapshot.createdAt,
      createdBy: snapshot.createdBy,
      updatedAt: snapshot.updatedAt,
      updatedBy: snapshot.updatedBy,
    })
    em.persist(variant)
  } else {
    variant.isActive = snapshot.isActive
    variant.containerSize = snapshot.containerSize
    variant.validityStart = snapshot.validityStart
    variant.validityEnd = snapshot.validityEnd
    variant.price = snapshot.price
    variant.currencyCode = snapshot.currencyCode
    variant.reference = snapshot.reference
    variant.deletedAt = null
  }

  // Set references
  if (snapshot.providerId) {
    variant.provider = em.getReference('Contractor', snapshot.providerId) as any
  } else {
    variant.provider = null
  }

  if (snapshot.priceTypeId) {
    variant.priceType = em.getReference(FmsPriceType, snapshot.priceTypeId)
  } else {
    variant.priceType = null
  }

  await em.flush()
  return variant
}

/**
 * Restore a carrier from snapshot (for undo operations)
 */
export async function applyCarrierSnapshot(
  em: EntityManager,
  snapshot: FmsCarrierSnapshot
): Promise<FmsCarrier> {
  let carrier = await em.findOne(FmsCarrier, { id: snapshot.id })

  if (!carrier) {
    carrier = em.create(FmsCarrier, {
      id: snapshot.id,
      organizationId: snapshot.organizationId,
      tenantId: snapshot.tenantId,
      code: snapshot.code,
      name: snapshot.name,
      carrierType: snapshot.carrierType,
      isActive: snapshot.isActive,
      createdAt: snapshot.createdAt,
      createdBy: snapshot.createdBy,
      updatedAt: snapshot.updatedAt,
      updatedBy: snapshot.updatedBy,
    })
    em.persist(carrier)
  } else {
    carrier.code = snapshot.code
    carrier.name = snapshot.name
    carrier.carrierType = snapshot.carrierType
    carrier.isActive = snapshot.isActive
    carrier.deletedAt = null
  }

  await em.flush()
  return carrier
}

/**
 * Restore a price type from snapshot (for undo operations)
 */
export async function applyPriceTypeSnapshot(
  em: EntityManager,
  snapshot: FmsPriceTypeSnapshot
): Promise<FmsPriceType> {
  let priceType = await em.findOne(FmsPriceType, { id: snapshot.id })

  if (!priceType) {
    priceType = em.create(FmsPriceType, {
      id: snapshot.id,
      organizationId: snapshot.organizationId,
      tenantId: snapshot.tenantId,
      code: snapshot.code,
      name: snapshot.name,
      description: snapshot.description,
      isActive: snapshot.isActive,
      createdAt: snapshot.createdAt,
      createdBy: snapshot.createdBy,
      updatedAt: snapshot.updatedAt,
      updatedBy: snapshot.updatedBy,
    })
    em.persist(priceType)
  } else {
    priceType.code = snapshot.code
    priceType.name = snapshot.name
    priceType.description = snapshot.description
    priceType.isActive = snapshot.isActive
    priceType.deletedAt = null
  }

  await em.flush()
  return priceType
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
      name: snapshot.name,
      description: snapshot.description,
      chargeUnit: snapshot.chargeUnit,
      keywords: snapshot.keywords,
      usage: snapshot.usage,
      isActive: snapshot.isActive,
      createdAt: snapshot.createdAt,
      createdBy: snapshot.createdBy,
      updatedAt: snapshot.updatedAt,
      updatedBy: snapshot.updatedBy,
    })
    em.persist(chargeCode)
  } else {
    chargeCode.code = snapshot.code
    chargeCode.name = snapshot.name
    chargeCode.description = snapshot.description
    chargeCode.chargeUnit = snapshot.chargeUnit
    chargeCode.keywords = snapshot.keywords
    chargeCode.usage = snapshot.usage
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
