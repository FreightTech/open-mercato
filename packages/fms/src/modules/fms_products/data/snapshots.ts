import type { ChargeCodeFieldSchema, ChargeUnit, ContractType, ProductType } from './types'

/**
 * Snapshot type for FmsProductPrice
 */
export type FmsProductPriceSnapshot = {
  id: string
  organizationId: string
  tenantId: string
  variantId: string
  validityStart: Date
  validityEnd: Date | null
  contractType: ContractType
  contractNumber: string | null
  price: string
  currencyCode: string
  isActive: boolean
  createdAt: Date
  createdBy: string | null
  updatedAt: Date
  updatedBy: string | null
}

/**
 * Snapshot type for FmsProductVariant (includes prices for cascade undo)
 */
export type FmsProductVariantSnapshot = {
  id: string
  organizationId: string
  tenantId: string
  productId: string
  providerId: string | null
  variantType: 'container' | 'simple'
  name: string | null
  isDefault: boolean
  isActive: boolean
  containerSize: string | null
  containerType: string | null
  weightLimit: number | null
  weightUnit: string | null
  createdAt: Date
  createdBy: string | null
  updatedAt: Date
  updatedBy: string | null
  prices: FmsProductPriceSnapshot[]
}

/**
 * Snapshot type for FmsProduct (includes variants and prices for cascade undo)
 */
export type FmsProductSnapshot = {
  id: string
  organizationId: string
  tenantId: string
  name: string
  productType: ProductType
  chargeCodeId: string | null
  serviceProviderId: string | null
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
  description: string | null
  chargeUnit: ChargeUnit
  fieldSchema: ChargeCodeFieldSchema | null
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

export type PriceUndoPayload = {
  before?: FmsProductPriceSnapshot | null
  after?: FmsProductPriceSnapshot | null
}

export type ChargeCodeUndoPayload = {
  before?: FmsChargeCodeSnapshot | null
  after?: FmsChargeCodeSnapshot | null
}
