// FMS Products Command Handlers
// This file imports all command modules to register them with the command registry.
// Import this file in your application bootstrap to enable command bus support.

export {
  createProductCommand,
  updateProductCommand,
  deleteProductCommand,
} from './products'

export {
  createCarrierCommand,
  updateCarrierCommand,
  deleteCarrierCommand,
} from './carriers'

// Re-export shared utilities for external use
export {
  loadProductSnapshot,
  loadCarrierSnapshot,
  applyProductSnapshot,
  applyCarrierSnapshot,
} from './shared'

// Export snapshot types
export type {
  FmsProductSnapshot,
  FmsCarrierSnapshot,
  ProductUndoPayload,
  CarrierUndoPayload,
} from '../data/snapshots'
