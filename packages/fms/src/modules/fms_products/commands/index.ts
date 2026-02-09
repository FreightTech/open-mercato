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
  createCarrierCommand,
  updateCarrierCommand,
  deleteCarrierCommand,
} from './carriers'

// Re-export shared utilities for external use
export {
  loadProductSnapshot,
  loadChargeCodeSnapshot,
  loadCarrierSnapshot,
  applyProductSnapshot,
  applyChargeCodeSnapshot,
  applyCarrierSnapshot,
} from './shared'

// Export snapshot types
export type {
  FmsProductSnapshot,
  FmsChargeCodeSnapshot,
  FmsCarrierSnapshot,
  ProductUndoPayload,
  ChargeCodeUndoPayload,
  CarrierUndoPayload,
} from '../data/snapshots'
