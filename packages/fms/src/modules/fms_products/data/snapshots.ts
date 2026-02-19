import type { ChargeUnit, CarrierType, ProductTransportMode } from './types'

/**
 * Snapshot type for FmsCarrier
 */
export type FmsCarrierSnapshot = {
  id: string
  organizationId: string
  tenantId: string
  code: string
  name: string
  carrierType: CarrierType
  isActive: boolean
  createdAt: Date
  createdBy: string | null
  updatedAt: Date
  updatedBy: string | null
}

/**
 * Snapshot type for FmsProduct
 */
export type FmsProductSnapshot = {
  id: string
  organizationId: string
  tenantId: string
  name: string
  chargeCode: string | null
  chargeUnit: ChargeUnit | null
  transportMode: ProductTransportMode | null
  isActive: boolean
  createdAt: Date
  createdBy: string | null
  updatedAt: Date
  updatedBy: string | null
}

/**
 * Undo payload types
 */
export type ProductUndoPayload = {
  before?: FmsProductSnapshot | null
  after?: FmsProductSnapshot | null
}

export type CarrierUndoPayload = {
  before?: FmsCarrierSnapshot | null
  after?: FmsCarrierSnapshot | null
}
