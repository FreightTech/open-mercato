import { generate } from '@pdfme/generator'
import { text, image, barcodes, line, rectangle, ellipse, svg } from '@pdfme/schemas'
import type { Template, Font } from '@pdfme/common'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { PdfmeTemplateJson } from '../data/entities'

/**
 * Available pdfme plugins/schema types.
 * These are the building blocks for template elements.
 */
export const pdfmePlugins = {
  // Text elements
  Text: text,
  
  // Media elements
  Image: image,
  SVG: svg,
  
  // Shape elements
  Line: line,
  Rectangle: rectangle,
  Ellipse: ellipse,
  
  // Barcode elements
  QRCode: barcodes.qrcode,
  Code128: barcodes.code128,
  EAN13: barcodes.ean13,
}

// Note: pdfme has built-in default fonts (Roboto).
// Custom fonts can be passed via GeneratePdfOptions.fonts
// When providing custom fonts, exactly one must have fallback: true
// See: https://pdfme.com/docs/custom-fonts

export interface GeneratePdfOptions {
  /** Custom fonts to use */
  fonts?: Font
  /** Language for text direction (e.g., 'en', 'ar' for RTL) */
  language?: string
}

/**
 * Generates a PDF buffer using pdfme.
 * 
 * @param template - The pdfme template (basePdf + schemas)
 * @param inputs - Array of input objects mapping schema names to values
 * @param options - Optional generation options
 * @returns PDF as a Buffer
 * 
 * @example
 * ```typescript
 * const pdf = await generatePdfBuffer(template, [{
 *   companyName: 'Acme Corp',
 *   offerNumber: 'OFF-001',
 *   clientName: 'Customer Inc',
 * }])
 * ```
 */
export async function generatePdfBuffer(
  template: Template | PdfmeTemplateJson,
  inputs: Array<Record<string, unknown>>,
  options: GeneratePdfOptions = {}
): Promise<Buffer> {
  const { fonts } = options

  // Only pass font options if fonts are explicitly configured with at least one font
  // pdfme has built-in default fonts that work without configuration
  const hasCustomFonts = fonts && Object.keys(fonts).length > 0

  const pdf = await generate({
    template: template as Template,
    inputs: inputs as Record<string, string>[],
    plugins: pdfmePlugins,
    options: hasCustomFonts ? { font: fonts } : undefined,
  })

  return Buffer.from(pdf)
}

/**
 * Generates a PDF and returns it as a Uint8Array.
 * Useful when you need the raw bytes without Node.js Buffer.
 */
export async function generatePdfBytes(
  template: Template | PdfmeTemplateJson,
  inputs: Array<Record<string, unknown>>,
  options: GeneratePdfOptions = {}
): Promise<Uint8Array> {
  const { fonts } = options

  // Only pass font options if fonts are explicitly configured with at least one font
  // pdfme has built-in default fonts that work without configuration
  const hasCustomFonts = fonts && Object.keys(fonts).length > 0

  return await generate({
    template: template as Template,
    inputs: inputs as Record<string, string>[],
    plugins: pdfmePlugins,
    options: hasCustomFonts ? { font: fonts } : undefined,
  })
}

/**
 * Load a pdfme template from the database.
 */
export async function loadPdfmeTemplate(
  em: EntityManager,
  params: {
    tenantId: string
    organizationId: string
    templateType: string
  }
): Promise<{ templateJson: PdfmeTemplateJson; name: string } | null> {
  const { PdfmeTemplate } = await import('../data/entities')
  type PdfTemplateType = 'offer'

  const template = await em.findOne(PdfmeTemplate, {
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    templateType: params.templateType as PdfTemplateType,
    isActive: true,
    deletedAt: null,
  })

  if (!template) {
    return null
  }

  return {
    templateJson: template.templateJson,
    name: template.name,
  }
}

/**
 * Generate PDF from a stored template.
 * 
 * @param em - EntityManager for database access
 * @param params - Template lookup parameters and input data
 * @returns PDF buffer or null if template not found
 */
export async function generatePdfFromTemplate(
  em: EntityManager,
  params: {
    tenantId: string
    organizationId: string
    templateType: string
    inputs: Array<Record<string, unknown>>
    options?: GeneratePdfOptions
  }
): Promise<Buffer | null> {
  const template = await loadPdfmeTemplate(em, {
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    templateType: params.templateType,
  })

  if (!template) {
    return null
  }

  return generatePdfBuffer(template.templateJson, params.inputs, params.options)
}
