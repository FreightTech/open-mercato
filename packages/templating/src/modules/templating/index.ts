export const metadata = {
  id: 'templating',
  name: 'Document Templates',
  description: 'PDF document template engine using pdfme — any module can register template types',
  version: '0.1.0',
}

export default metadata

// Entity
export { DocumentTemplate, type PdfmeTemplateJson } from './data/entities'

// Validators
export {
  pdfmeTemplateJsonSchema,
  documentTemplateUpsertSchema,
  documentTemplateListSchema,
  documentTemplateGenerateSchema,
  type PdfmeTemplateJsonInput,
  type DocumentTemplateUpsertInput,
  type DocumentTemplateListInput,
  type DocumentTemplateGenerateInput,
} from './data/validators'

// PDF generator
export {
  generatePdfBuffer,
  generatePdfBytes,
  loadPdfmeTemplate,
  generatePdfFromTemplate,
  pdfmePlugins,
  extractSchemaDefaults,
  sanitizeInputs,
  mergeInputsWithDefaults,
  normalizeTemplateForSave,
  fixDoubleBraceSyntax,
  type GeneratePdfOptions,
} from './lib/pdfme-generator'

// Invoice template
export {
  DEFAULT_INVOICE_TEMPLATE,
} from './lib/templates/default-invoice-template'

export {
  mapInvoiceToInputs,
  formatLineItemsTableData,
  formatVatSummaryTableData,
} from './lib/templates/invoice-variable-mapper'
