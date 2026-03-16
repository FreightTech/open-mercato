// Module metadata
export const metadata = {
  id: 'pdf_templates',
  name: 'PDF Templates',
  description: 'Configure PDF layouts and templates for document generation using pdfme',
  version: '2.0.0',
}

export default metadata

// Data
export { PdfmeTemplate, type PdfTemplateType, type PdfmeTemplateJson } from './data/entities'

// Validators
export {
  pdfTemplateTypes,
  pdfTemplateTypeSchema,
  pdfmeTemplateJsonSchema,
  pdfmeTemplateUpsertSchema,
  pdfmeTemplateListSchema,
  pdfmeGenerateSchema,
  type PdfmeTemplateJsonInput,
  type PdfmeTemplateUpsertInput,
  type PdfmeTemplateListInput,
  type PdfmeGenerateInput,
} from './data/validators'

// Pdfme generator
export {
  generatePdfBuffer,
  generatePdfBytes,
  loadPdfmeTemplate,
  generatePdfFromTemplate,
  pdfmePlugins,
} from './lib/pdfme-generator'

// Pdfme default templates
export {
  DEFAULT_OFFER_TEMPLATE,
  BLANK_A4_TEMPLATE,
  COVER_PAGE_TEMPLATE,
  getDefaultPdfmeTemplate,
  OFFER_TEMPLATE_VARIABLES,
  A4,
  DEFAULT_PADDING,
  PRIMARY_COLOR,
  type OfferTemplateVariable,
} from './lib/default-pdfme-templates'

// Offer variable mapper
export {
  mapOfferToInputs,
  settingsToBranding,
  DEFAULT_LABELS,
  type OfferData,
  type BrandingData,
  type OfferLabels,
} from './lib/offer-variable-mapper'
