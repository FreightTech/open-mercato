// Module metadata
export const metadata = {
  id: 'pdf_templates',
  name: 'PDF Templates',
  description: 'Configure PDF layouts and templates for document generation',
  version: '1.0.0',
}

export default metadata

// Data
export { PdfTemplate, PdfSettings, type PdfTemplateType, type PageSize, type PageOrientation } from './data/entities'

// Validators
export {
  pdfTemplateTypes,
  pdfTemplateTypeSchema,
  pageSizes,
  pageSizeSchema,
  pageOrientations,
  pageOrientationSchema,
  pdfTemplateUpsertSchema,
  pdfSettingsUpsertSchema,
  pdfPreviewSchema,
  type PdfTemplateUpsertInput,
  type PdfSettingsUpsertInput,
  type PdfPreviewInput,
  type TemplateVariables,
} from './data/validators'

// Commands
export { loadPdfSettings } from './commands/pdf-settings'
export { loadPdfTemplate } from './commands/pdf-templates'

// Template renderer
export {
  renderPdfHtml,
  generatePdf,
  previewTemplate,
  loadPdfSettings as loadPdfSettingsForRender,
  loadPdfTemplate as loadPdfTemplateForRender,
  SAMPLE_DATA,
  type RenderPdfHtmlParams,
  type RenderPdfHtmlResult,
  type GeneratePdfParams,
} from './lib/template-renderer'

// Default templates
export { getDefaultTemplate, DEFAULT_CSS, DEFAULT_TEMPLATES } from './lib/default-templates'

// Template fields
export {
  COMMON_FIELDS,
  TEMPLATE_FIELDS,
  CONTROL_STRUCTURES,
  getFieldsForType,
  getFieldDocumentation,
  type TemplateField,
  type ControlStructure,
} from './lib/template-fields'

// Register commands (side effect)
import './commands/pdf-settings'
import './commands/pdf-templates'
