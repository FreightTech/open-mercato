// FMS Locations Command Handlers
// This file imports all command modules to register them with the command registry.
// Import this file in your application bootstrap to enable command bus support.

export {
  createPortCommand,
  updatePortCommand,
  deletePortCommand,
} from './ports'

export {
  createTerminalCommand,
  updateTerminalCommand,
  deleteTerminalCommand,
} from './terminals'

// Re-export shared utilities for external use
export {
  loadLocationSnapshot,
  applyLocationSnapshot,
} from './shared'

// Export snapshot types
export type {
  FmsLocationSnapshot,
  LocationUndoPayload,
} from '../data/snapshots'
