import type { ActionLog } from '@open-mercato/core/modules/audit_logs/data/entities'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import {
  FmsChargeCode,
  FmsProduct,
  FmsCarrier,
} from '../data/entities'
import type {
  FmsChargeCodeSnapshot,
  FmsProductSnapshot,
  FmsCarrierSnapshot,
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
 * Load a product snapshot (simplified — name + chargeCode)
 */
export async function loadProductSnapshot(
  em: EntityManager,
  productId: string
): Promise<FmsProductSnapshot | null> {
  const product = await em.findOne(FmsProduct, { id: productId, deletedAt: null }, {
    populate: ['chargeCode'],
  })
  if (!product) return null

  return {
    id: product.id,
    organizationId: product.organizationId,
    tenantId: product.tenantId,
    name: product.name,
    chargeCodeId: product.chargeCode
      ? typeof product.chargeCode === 'string'
        ? product.chargeCode
        : product.chargeCode.id
      : null,
    isActive: product.isActive,
    createdAt: product.createdAt,
    createdBy: product.createdBy ?? null,
    updatedAt: product.updatedAt,
    updatedBy: product.updatedBy ?? null,
  }
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
      isActive: snapshot.isActive,
      createdAt: snapshot.createdAt,
      createdBy: snapshot.createdBy,
      updatedAt: snapshot.updatedAt,
      updatedBy: snapshot.updatedBy,
    })
    em.persist(product)
  } else {
    product.name = snapshot.name
    product.isActive = snapshot.isActive
    product.deletedAt = null
  }

  if (snapshot.chargeCodeId) {
    product.chargeCode = em.getReference(FmsChargeCode, snapshot.chargeCodeId)
  } else {
    product.chargeCode = null
  }

  await em.flush()
  return product
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
