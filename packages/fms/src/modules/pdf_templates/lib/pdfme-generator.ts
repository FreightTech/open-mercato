import { generate } from '@pdfme/generator'
import { text, image, barcodes, line, rectangle, ellipse, svg } from '@pdfme/schemas'
import type { Template, Font } from '@pdfme/common'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { PdfmeTemplateJson } from '../data/entities'

/**
 * Extract all field names and their content from a pdfme template's schemas.
 * Used to ensure inputs cover all template fields with their default content.
 * 
 * This is critical for custom elements (images, text) that have static content
 * defined in the designer but are not marked as readOnly.
 */
export function extractSchemaDefaults(template: PdfmeTemplateJson): Record<string, string> {
  const defaults: Record<string, string> = {}
  
  for (const page of template.schemas) {
    for (const element of page) {
      if (element.name && element.content) {
        // Only use content if it's not a variable placeholder
        // Variable placeholders look like {variableName} (single braces for pdfme)
        const isVariablePlaceholder = /\{[^}]+\}/.test(element.content)
        if (!isVariablePlaceholder) {
          defaults[element.name] = element.content
        }
      }
    }
  }
  
  return defaults
}

/**
 * Sanitize a value for pdfme input.
 * Converts any non-string value to a string representation.
 * This prevents [object Object] from appearing in PDFs.
 */
function sanitizeInputValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    // For arrays, try to create a readable representation
    // If it's an array of objects with common structure, format nicely
    if (value.length === 0) {
      return ''
    }
    // Check if it's an array of simple values
    if (value.every(v => typeof v === 'string' || typeof v === 'number')) {
      return value.join(', ')
    }
    // For complex arrays (like routes), return JSON for debugging
    // In production, these should be pre-formatted as strings
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return '[Array]'
    }
  }
  if (typeof value === 'object') {
    // For objects, try JSON stringify
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return '[Object]'
    }
  }
  return String(value)
}

/**
 * Sanitize all values in an input record to ensure they are strings.
 * This prevents [object Object] from appearing in PDFs when
 * non-string values are accidentally passed.
 */
export function sanitizeInputs(input: Record<string, unknown>): Record<string, string> {
  const sanitized: Record<string, string> = {}
  for (const [key, value] of Object.entries(input)) {
    sanitized[key] = sanitizeInputValue(value)
  }
  return sanitized
}

/**
 * Merge schema defaults with provided inputs.
 * Schema defaults are used as fallback for any missing input values.
 * All values are sanitized to strings to prevent [object Object] in PDFs.
 */
export function mergeInputsWithDefaults(
  template: PdfmeTemplateJson,
  inputs: Array<Record<string, unknown>>
): Array<Record<string, string>> {
  const defaults = extractSchemaDefaults(template)
  
  return inputs.map(input => {
    const merged = {
      ...defaults,  // Schema content as base
      ...input,     // Provided inputs override defaults
    }
    // Sanitize all values to ensure they are strings
    return sanitizeInputs(merged)
  })
}

/**
 * Schema element type for normalization.
 * Uses a flexible type to handle both zod-inferred and interface types.
 */
type SchemaElement = {
  name: string
  type: string
  content?: string
  readOnly?: boolean
  [key: string]: unknown
}

/**
 * Template type for normalization.
 * Uses a flexible type to handle both zod-inferred and interface types.
 */
type TemplateForNormalization = {
  basePdf: unknown
  schemas: SchemaElement[][]
  [key: string]: unknown
}

/**
 * Normalize a template for saving by marking elements with content as readOnly.
 * 
 * In pdfme, elements with readOnly:true use their `content` property directly
 * and apply `replacePlaceholders()` to substitute {variableName} with values
 * from the inputs array. This ensures that:
 * - Static images render correctly (content = base64 data)
 * - Static text renders correctly (content = literal text)
 * - Variable placeholders ({name}) get substituted with actual values
 * 
 * IMPORTANT: pdfme uses SINGLE braces {variable}, not double braces {{variable}}.
 * Double braces are interpreted as JavaScript object literals and will cause
 * [object Object] to appear in the PDF output.
 * 
 * Without readOnly:true, pdfme looks up `input[element.name]` directly,
 * which doesn't support placeholder substitution.
 * 
 * Call this before saving a template to the database.
 */
export function normalizeTemplateForSave<T extends TemplateForNormalization>(template: T): T {
  const normalizedSchemas = template.schemas.map(page =>
    page.map(element => {
      // Skip elements that are already readOnly
      if (element.readOnly) {
        return element
      }
      
      // Skip elements without content - they rely on inputs[name] directly
      if (!element.content) {
        return element
      }
      
      // Mark ALL elements with content as readOnly
      // This enables pdfme's replacePlaceholders() for variable substitution
      // AND ensures static content (images, text) renders correctly
      return {
        ...element,
        readOnly: true,
      }
    })
  )
  
  return {
    ...template,
    schemas: normalizedSchemas,
  } as T
}

/**
 * Fix double brace syntax in template content.
 * 
 * pdfme uses single braces {variable} for placeholders.
 * Double braces {{variable}} are incorrectly interpreted as JavaScript object
 * literals, resulting in [object Object] in the PDF output.
 * 
 * This function converts all {{variable}} to {variable} in template content.
 * Call this when loading templates that may have been saved with incorrect syntax.
 */
export function fixDoubleBraceSyntax(template: PdfmeTemplateJson): PdfmeTemplateJson {
  const fixedSchemas = template.schemas.map(page =>
    page.map(element => {
      if (!element.content || typeof element.content !== 'string') {
        return element
      }
      
      // Replace {{variable}} with {variable}
      // Matches {{ followed by any non-} characters followed by }}
      const fixedContent = element.content.replace(/\{\{([^}]+)\}\}/g, '{$1}')
      
      if (fixedContent === element.content) {
        return element
      }
      
      return {
        ...element,
        content: fixedContent,
      }
    })
  )
  
  return {
    ...template,
    schemas: fixedSchemas,
  }
}

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
 * All input values are automatically sanitized to strings to prevent
 * [object Object] from appearing in PDFs when objects are accidentally passed.
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

  // Fix any double brace syntax {{var}} to single brace {var}
  // pdfme uses single braces for placeholders; double braces cause [object Object]
  const fixedTemplate = fixDoubleBraceSyntax(template as PdfmeTemplateJson)

  // Merge schema defaults (content) with provided inputs and sanitize all values to strings
  // This ensures:
  // 1. Custom elements with static content (images, text) render correctly
  // 2. Non-string values (objects, arrays) are converted to strings (prevents [object Object])
  const mergedInputs = mergeInputsWithDefaults(
    fixedTemplate,
    inputs
  )

  const pdf = await generate({
    template: fixedTemplate as Template,
    inputs: mergedInputs,
    plugins: pdfmePlugins,
    options: hasCustomFonts ? { font: fonts } : undefined,
  })

  return Buffer.from(pdf)
}

/**
 * Generates a PDF and returns it as a Uint8Array.
 * Useful when you need the raw bytes without Node.js Buffer.
 * 
 * All input values are automatically sanitized to strings.
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

  // Fix any double brace syntax {{var}} to single brace {var}
  // pdfme uses single braces for placeholders; double braces cause [object Object]
  const fixedTemplate = fixDoubleBraceSyntax(template as PdfmeTemplateJson)

  // Merge schema defaults (content) with provided inputs and sanitize all values
  const mergedInputs = mergeInputsWithDefaults(
    fixedTemplate,
    inputs
  )

  return await generate({
    template: fixedTemplate as Template,
    inputs: mergedInputs,
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
