// FMS Products Command Handlers
// This file imports all command modules to register them with the command registry.
// Import this file in your application bootstrap to enable command bus support.

export {
  createProductCommand,
  updateProductCommand,
  deleteProductCommand,
} from './products'

export {
  createChargeCodeCommand,
  updateChargeCodeCommand,
  deleteChargeCodeCommand,
} from './charge-codes'

export {
  createVariantCommand,
  updateVariantCommand,
  deleteVariantCommand,
} from './variants'

export {
  createCarrierCommand,
  updateCarrierCommand,
  deleteCarrierCommand,
} from './carriers'

export {
  createPriceTypeCommand,
  updatePriceTypeCommand,
  deletePriceTypeCommand,
} from './price-types'

// Re-export shared utilities for external use
export {
  loadProductSnapshot,
  loadVariantSnapshot,
  loadChargeCodeSnapshot,
  loadCarrierSnapshot,
  loadPriceTypeSnapshot,
  applyProductSnapshot,
  applyVariantSnapshot,
  applyChargeCodeSnapshot,
  applyCarrierSnapshot,
  applyPriceTypeSnapshot,
} from './shared'

// Export snapshot types
export type {
  FmsProductSnapshot,
  FmsProductVariantSnapshot,
  FmsChargeCodeSnapshot,
  FmsCarrierSnapshot,
  FmsPriceTypeSnapshot,
  ProductUndoPayload,
  VariantUndoPayload,
  ChargeCodeUndoPayload,
  CarrierUndoPayload,
  PriceTypeUndoPayload,
} from '../data/snapshots'
