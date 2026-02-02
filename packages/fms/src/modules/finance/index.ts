export const metadata = {
  name: 'finance',
  title: 'Finance Extraction',
  version: '0.1.0',
  description: 'Invoice PDF extraction and validation using AI-powered strategies',
  author: 'Development Team',
  license: 'Proprietary',
  requires: [],
}

// Export types
export type {
  InvoiceParty,
  InvoiceDates,
  InvoiceLineItem,
  InvoiceTotals,
  InvoiceData,
  ExtractionStrategyType,
  ExtractionResult,
  ExtractionStrategies,
  ExtractionResponse,
  ExtractInvoiceRequest,
  NormalizationConfig,
  NormalizeInvoiceRequest,
  NormalizeResponse,
  ValidationRules,
  FieldValidation,
  ValidationResult,
  ValidateExtractionRequest,
  ValidationResponse,
  VisualizeOptions,
  VisualizeRequest,
  VisualizeResponse,
  FinanceApiError,
} from './data/types'

// Export validators
export {
  invoicePartySchema,
  invoiceDatesSchema,
  invoiceLineItemSchema,
  invoiceTotalsSchema,
  invoiceDataSchema,
  extractionStrategyTypeSchema,
  extractionStrategiesSchema,
  extractionResultSchema,
  extractionResponseSchema,
  extractInvoiceRequestSchema,
  normalizationConfigSchema,
  normalizeInvoiceRequestSchema,
  validationRulesSchema,
  validateExtractionRequestSchema,
  visualizeOptionsSchema,
  visualizeRequestSchema,
  normalizeResponseSchema,
  validationResponseSchema,
  visualizeResponseSchema,
} from './data/validators'

// Export service
export {
  FinanceExtractionService,
  FinanceExtractionError,
  FinanceExtractionTimeoutError,
  FinanceExtractionValidationError,
} from './services/finance-extraction.service'

// Export config
export { financeExtractionConfig } from './lib/config'
export type { FinanceExtractionConfig } from './lib/config'

// Feature flags for ACL
export const features = {
  'finance.extract': {
    name: 'Extract Invoices',
    description: 'Extract data from invoice PDFs using AI',
  },
  'finance.normalize': {
    name: 'Normalize Invoice Data',
    description: 'Normalize extracted invoice data to standard formats',
  },
  'finance.validate': {
    name: 'Validate Extraction Results',
    description: 'Cross-validate extraction results using AI judge',
  },
  'finance.visualize': {
    name: 'Visualize Extraction Results',
    description: 'Generate annotated invoice images with confidence indicators',
  },
}
