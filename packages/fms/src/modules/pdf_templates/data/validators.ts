import { z } from 'zod'

const uuid = () => z.string().uuid()

const scoped = z.object({
  organizationId: uuid(),
  tenantId: uuid(),
})

export const pdfTemplateTypes = ['offer'] as const

export const pdfTemplateTypeSchema = z.enum(pdfTemplateTypes)

// Helper for nullable optional strings that accepts both null and empty string
const nullableString = (maxLength?: number) =>
  z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? null : val),
    z
      .string()
      .max(maxLength || 10000)
      .nullable()
      .optional()
  )

// ----- PDFME TEMPLATE SCHEMAS -----

/**
 * Schema position (x, y coordinates in mm)
 */
const schemaPositionSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
})

/**
 * Individual schema element in a pdfme template
 */
const pdfmeSchemaElementSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  position: schemaPositionSchema,
  width: z.number().min(0),
  height: z.number().min(0),
  content: z.string().optional(),
  // Allow additional properties for different schema types (fontSize, fontColor, etc.)
}).passthrough()

/**
 * BasePdf can be a base64 string, ArrayBuffer reference, or dimension object
 */
const basePdfSchema = z.union([
  z.string(), // base64 encoded PDF or BLANK_PDF constant
  z.object({
    width: z.number().min(1),
    height: z.number().min(1),
    padding: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  }),
])

/**
 * Full pdfme template JSON schema
 */
export const pdfmeTemplateJsonSchema = z.object({
  basePdf: basePdfSchema,
  schemas: z.array(z.array(pdfmeSchemaElementSchema)),
})

export type PdfmeTemplateJsonInput = z.infer<typeof pdfmeTemplateJsonSchema>

/**
 * Create/Update pdfme template
 */
export const pdfmeTemplateUpsertSchema = scoped.extend({
  templateType: pdfTemplateTypeSchema,
  name: z.string().trim().min(1).max(255),
  description: nullableString(1000),
  templateJson: pdfmeTemplateJsonSchema,
  previewImageUrl: nullableString(2000),
  isActive: z.boolean().optional().default(true),
})

export type PdfmeTemplateUpsertInput = z.infer<typeof pdfmeTemplateUpsertSchema>

/**
 * List pdfme templates
 */
export const pdfmeTemplateListSchema = scoped.extend({
  templateType: pdfTemplateTypeSchema.optional(),
  isActive: z.boolean().optional(),
})

export type PdfmeTemplateListInput = z.infer<typeof pdfmeTemplateListSchema>

/**
 * Generate PDF with pdfme
 */
export const pdfmeGenerateSchema = z.object({
  templateId: uuid().optional(),
  templateType: pdfTemplateTypeSchema.optional(),
  templateJson: pdfmeTemplateJsonSchema.optional(),
  inputs: z.array(z.record(z.string(), z.any())),
})

export type PdfmeGenerateInput = z.infer<typeof pdfmeGenerateSchema>
