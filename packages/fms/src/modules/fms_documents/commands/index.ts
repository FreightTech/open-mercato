/**
 * FMS Documents Commands
 *
 * This module provides command bus handlers for document operations
 * with full audit logging and undo capability.
 */

// Re-export commands
export {
  createDocumentCommand,
  updateDocumentCommand,
  deleteDocumentCommand,
} from './documents'

// Re-export shared utilities
export {
  loadDocumentSnapshot,
  applyDocumentSnapshot,
  getUserIdFromAuth,
} from './shared'
