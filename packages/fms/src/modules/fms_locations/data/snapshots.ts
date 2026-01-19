import type { LocationType } from './types'

/**
 * Snapshot type for FmsLocation (port or terminal)
 */
export type FmsLocationSnapshot = {
  id: string
  organizationId: string
  tenantId: string
  code: string
  name: string
  type: LocationType
  locode: string | null
  portId: string | null
  lat: number | null
  lng: number | null
  city: string | null
  country: string | null
  createdAt: Date
  createdBy: string | null
  updatedAt: Date
  updatedBy: string | null
}

/**
 * Undo payload types
 */
export type LocationUndoPayload = {
  before?: FmsLocationSnapshot | null
  after?: FmsLocationSnapshot | null
}
