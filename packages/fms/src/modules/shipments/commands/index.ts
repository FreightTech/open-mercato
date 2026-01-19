// Shipments Command Handlers
// This file imports all command modules to register them with the command registry.
// Import this file in your application bootstrap to enable command bus support.

export {
  createShipmentCommand,
  updateShipmentCommand,
  deleteShipmentCommand,
} from './shipments'

export {
  createContainerCommand,
  updateContainerCommand,
  deleteContainerCommand,
} from './containers'

export {
  createDocumentCommand,
  updateDocumentCommand,
  deleteDocumentCommand,
} from './documents'

export {
  createTaskCommand,
  updateTaskCommand,
  deleteTaskCommand,
} from './tasks'

// Re-export shared utilities for external use
export {
  loadShipmentSnapshot,
  applyShipmentSnapshot,
  loadContainerSnapshot,
  applyContainerSnapshot,
  loadDocumentSnapshot,
  applyDocumentSnapshot,
  loadTaskSnapshot,
  applyTaskSnapshot,
} from './shared'

// Export snapshot types
export type {
  ShipmentSnapshot,
  ShipmentContainerSnapshot,
  ShipmentDocumentSnapshot,
  ShipmentTaskSnapshot,
  ShipmentUndoPayload,
  ContainerUndoPayload,
  DocumentUndoPayload,
  TaskUndoPayload,
} from '../data/snapshots'
