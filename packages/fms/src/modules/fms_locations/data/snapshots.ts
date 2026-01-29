import type { LocationType } from './types'

/**
 * Snapshot type for FmsLocation (port, terminal, or contractor address)
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
  // Contractor address fields
  contractorId: string | null
  addressLine1: string | null
  addressLine2: string | null
  state: string | null
  postalCode: string | null
  isPrimary: boolean
  isActive: boolean
  googlePlaceId: string | null
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
