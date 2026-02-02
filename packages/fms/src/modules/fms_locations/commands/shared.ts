import type { ActionLog } from '@open-mercato/core/modules/audit_logs/data/entities'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { FmsLocation } from '../data/entities'
import type { FmsLocationSnapshot } from '../data/snapshots'

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
 * Load a location snapshot
 */
export async function loadLocationSnapshot(
  em: EntityManager,
  locationId: string
): Promise<FmsLocationSnapshot | null> {
  const location = await em.findOne(FmsLocation, { id: locationId, deletedAt: null })
  if (!location) return null

  return {
    id: location.id,
    organizationId: location.organizationId,
    tenantId: location.tenantId,
    code: location.code,
    name: location.name,
    type: location.type,
    locode: location.locode ?? null,
    portId: location.portId ?? null,
    lat: location.lat ?? null,
    lng: location.lng ?? null,
    city: location.city ?? null,
    country: location.country ?? null,
    createdAt: location.createdAt,
    createdBy: location.createdBy ?? null,
    updatedAt: location.updatedAt,
    updatedBy: location.updatedBy ?? null,
  }
}

/**
 * Restore a location from snapshot (for undo operations)
 */
export async function applyLocationSnapshot(
  em: EntityManager,
  snapshot: FmsLocationSnapshot
): Promise<FmsLocation> {
  let location = await em.findOne(FmsLocation, { id: snapshot.id })

  if (!location) {
    location = em.create(FmsLocation, {
      id: snapshot.id,
      organizationId: snapshot.organizationId,
      tenantId: snapshot.tenantId,
      code: snapshot.code,
      name: snapshot.name,
      type: snapshot.type,
      locode: snapshot.locode,
      portId: snapshot.portId,
      lat: snapshot.lat,
      lng: snapshot.lng,
      city: snapshot.city,
      country: snapshot.country,
      createdAt: snapshot.createdAt,
      createdBy: snapshot.createdBy,
      updatedAt: snapshot.updatedAt,
      updatedBy: snapshot.updatedBy,
    })
    em.persist(location)
  } else {
    location.code = snapshot.code
    location.name = snapshot.name
    location.type = snapshot.type
    location.locode = snapshot.locode
    location.portId = snapshot.portId
    location.lat = snapshot.lat
    location.lng = snapshot.lng
    location.city = snapshot.city
    location.country = snapshot.country
    location.deletedAt = null
  }

  await em.flush()
  return location
}
