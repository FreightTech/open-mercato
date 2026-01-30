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
 * Snapshot type for FmsPriceType
 */
export type FmsPriceTypeSnapshot = {
  id: string
  organizationId: string
  tenantId: string
  code: string
  name: string
  description: string | null
  isActive: boolean
  createdAt: Date
  createdBy: string | null
  updatedAt: Date
  updatedBy: string | null
}

/**
 * Snapshot type for FmsProductVariant (flattened with pricing)
 */
export type FmsProductVariantSnapshot = {
  id: string
  organizationId: string
  tenantId: string
  productId: string
  providerId: string | null
  isActive: boolean
  containerSize: string | null
  // Pricing fields (flattened from FmsProductPrice)
  validityStart: Date | null
  validityEnd: Date | null
  price: string | null
  currencyCode: string
  reference: string | null
  createdAt: Date
  createdBy: string | null
  updatedAt: Date
  updatedBy: string | null
}

/**
 * Snapshot type for FmsProduct (includes variants for cascade undo)
 */
export type FmsProductSnapshot = {
  id: string
  organizationId: string
  tenantId: string
  name: string
  chargeCodeId: string | null
  carrierId: string | null
  internalNotes: string | null
  isActive: boolean
  loop: string | null
  sourceId: string | null
  destinationId: string | null
  transitTime: number | null
  locationId: string | null
  description: string | null
  createdAt: Date
  createdBy: string | null
  updatedAt: Date
  updatedBy: string | null
  variants: FmsProductVariantSnapshot[]
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
  keywords: string[] | null
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

export type VariantUndoPayload = {
  before?: FmsProductVariantSnapshot | null
  after?: FmsProductVariantSnapshot | null
}

export type ChargeCodeUndoPayload = {
  before?: FmsChargeCodeSnapshot | null
  after?: FmsChargeCodeSnapshot | null
}

export type CarrierUndoPayload = {
  before?: FmsCarrierSnapshot | null
  after?: FmsCarrierSnapshot | null
}

export type PriceTypeUndoPayload = {
  before?: FmsPriceTypeSnapshot | null
  after?: FmsPriceTypeSnapshot | null
}
