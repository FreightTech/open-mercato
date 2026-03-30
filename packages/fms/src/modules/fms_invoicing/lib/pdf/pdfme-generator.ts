import { generate } from '@pdfme/generator'
import { text, image, barcodes, line, rectangle, ellipse, svg, table } from '@pdfme/schemas'
import type { Template, Font } from '@pdfme/common'

type SchemaElement = {
  name: string
  type: string
  content?: string
  readOnly?: boolean
  [key: string]: unknown
}

type PdfmeTemplateJson = {
  basePdf: unknown
  schemas: SchemaElement[][]
  [key: string]: unknown
}

export function extractSchemaDefaults(template: PdfmeTemplateJson): Record<string, string> {
  const defaults: Record<string, string> = {}

  for (const page of template.schemas) {
    for (const element of page) {
      if (element.name && element.content) {
        const isVariablePlaceholder = /\{[^}]+\}/.test(element.content)
        if (!isVariablePlaceholder) {
          defaults[element.name] = element.content
        }
      }
    }
  }

  return defaults
}

function sanitizeInputValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return ''
    if (value.every(v => typeof v === 'string' || typeof v === 'number')) return value.join(', ')
    try { return JSON.stringify(value, null, 2) } catch { return '[Array]' }
  }
  if (typeof value === 'object') {
    try { return JSON.stringify(value, null, 2) } catch { return '[Object]' }
  }
  return String(value)
}

export function sanitizeInputs(input: Record<string, unknown>): Record<string, string> {
  const sanitized: Record<string, string> = {}
  for (const [key, value] of Object.entries(input)) {
    sanitized[key] = sanitizeInputValue(value)
  }
  return sanitized
}

export function mergeInputsWithDefaults(
  template: PdfmeTemplateJson,
  inputs: Array<Record<string, unknown>>
): Array<Record<string, string>> {
  const defaults = extractSchemaDefaults(template)

  return inputs.map(input => {
    const merged = { ...defaults, ...input }
    return sanitizeInputs(merged)
  })
}

export function fixDoubleBraceSyntax(template: PdfmeTemplateJson): PdfmeTemplateJson {
  const fixedSchemas = template.schemas.map(page =>
    page.map(element => {
      if (!element.content || typeof element.content !== 'string') return element
      const fixedContent = element.content.replace(/\{\{([^}]+)\}\}/g, '{$1}')
      if (fixedContent === element.content) return element
      return { ...element, content: fixedContent }
    })
  )

  return { ...template, schemas: fixedSchemas }
}

export const pdfmePlugins = {
  Text: text,
  Image: image,
  SVG: svg,
  Line: line,
  Rectangle: rectangle,
  Ellipse: ellipse,
  Table: table,
  QRCode: barcodes.qrcode,
  Code128: barcodes.code128,
  EAN13: barcodes.ean13,
}

export interface GeneratePdfOptions {
  fonts?: Font
}

export async function generatePdfBuffer(
  template: Template | PdfmeTemplateJson,
  inputs: Array<Record<string, unknown>>,
  options: GeneratePdfOptions = {}
): Promise<Buffer> {
  const { fonts } = options
  const hasCustomFonts = fonts && Object.keys(fonts).length > 0
  const fixedTemplate = fixDoubleBraceSyntax(template as PdfmeTemplateJson)
  const mergedInputs = mergeInputsWithDefaults(fixedTemplate, inputs)

  const pdf = await generate({
    template: fixedTemplate as Template,
    inputs: mergedInputs,
    plugins: pdfmePlugins,
    options: hasCustomFonts ? { font: fonts } : undefined,
  })

  return Buffer.from(pdf)
}
