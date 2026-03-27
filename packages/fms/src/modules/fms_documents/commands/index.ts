// Register all commands when this module is imported
import './documents'
import './invoices'
import './cost-allocations'
import './process'

// Re-export document commands
export {
  createDocumentCommand,
  updateDocumentCommand,
  deleteDocumentCommand,
  updateDocumentDataCommand,
} from './documents'

// Re-export invoice commands
export {
  createInvoiceCommand,
  updateInvoiceCommand,
  deleteInvoiceCommand,
  approveInvoiceCommand,
  rejectInvoiceCommand,
  matchChargeCodeCommand,
  confirmInvoiceCommand,
  toggleExcludeCommand,
} from './invoices'

// Re-export cost allocation commands
export {
  saveCostAllocationsCommand,
  removeCostAllocationCommand,
} from './cost-allocations'

// Re-export process command
export { processDocumentCommand } from './process'

// Re-export shared utilities
export {
  loadDocumentSnapshot,
  applyDocumentSnapshot,
  getUserIdFromAuth,
} from './shared'
