import type { ChargeUnit, ChargeCodeUsage, CarrierType } from './types'

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
 * Snapshot type for FmsProduct (simplified)
 */
export type FmsProductSnapshot = {
  id: string
  organizationId: string
  tenantId: string
  name: string
  chargeCodeId: string | null
  isActive: boolean
  createdAt: Date
  createdBy: string | null
  updatedAt: Date
  updatedBy: string | null
}

/**
 * Snapshot type for FmsChargeCode
 */
export type FmsChargeCodeSnapshot = {
  id: string
  organizationId: string
  tenantId: string
  code: string
  name: string | null
  description: string | null
  chargeUnit: ChargeUnit
  keywords: string | null
  usage: ChargeCodeUsage | null
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

export type ChargeCodeUndoPayload = {
  before?: FmsChargeCodeSnapshot | null
  after?: FmsChargeCodeSnapshot | null
}

export type CarrierUndoPayload = {
  before?: FmsCarrierSnapshot | null
  after?: FmsCarrierSnapshot | null
}
