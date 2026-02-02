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
  createPriceCommand,
  updatePriceCommand,
  deletePriceCommand,
} from './prices'

// Re-export shared utilities for external use
export {
  loadProductSnapshot,
  loadVariantSnapshot,
  loadPriceSnapshot,
  loadChargeCodeSnapshot,
  applyProductSnapshot,
  applyVariantSnapshot,
  applyPriceSnapshot,
  applyChargeCodeSnapshot,
} from './shared'

// Export snapshot types
export type {
  FmsProductSnapshot,
  FmsProductVariantSnapshot,
  FmsProductPriceSnapshot,
  FmsChargeCodeSnapshot,
  ProductUndoPayload,
  VariantUndoPayload,
  PriceUndoPayload,
  ChargeCodeUndoPayload,
} from '../data/snapshots'
