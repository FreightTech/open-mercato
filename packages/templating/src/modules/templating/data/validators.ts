import { z } from 'zod'

const uuid = () => z.string().uuid()

const scoped = z.object({
  organizationId: uuid(),
  tenantId: uuid(),
})

const nullableString = (maxLength?: number) =>
  z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? null : val),
    z
      .string()
      .max(maxLength || 10000)
      .nullable()
      .optional()
  )

const schemaPositionSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
})

const pdfmeSchemaElementSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  position: schemaPositionSchema,
  width: z.number().min(0),
  height: z.number().min(0),
  content: z.string().optional(),
}).passthrough()

const basePdfSchema = z.union([
  z.string(),
  z.object({
    width: z.number().min(1),
    height: z.number().min(1),
    padding: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  }),
])

export const pdfmeTemplateJsonSchema = z.object({
  basePdf: basePdfSchema,
  schemas: z.array(z.array(pdfmeSchemaElementSchema)),
})

export type PdfmeTemplateJsonInput = z.infer<typeof pdfmeTemplateJsonSchema>

export const documentTemplateUpsertSchema = scoped.extend({
  templateType: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(255),
  description: nullableString(1000),
  templateJson: pdfmeTemplateJsonSchema,
  previewImageUrl: nullableString(2000),
  isActive: z.boolean().optional().default(true),
})

export type DocumentTemplateUpsertInput = z.infer<typeof documentTemplateUpsertSchema>

export const documentTemplateListSchema = scoped.extend({
  templateType: z.string().optional(),
  isActive: z.boolean().optional(),
})

export type DocumentTemplateListInput = z.infer<typeof documentTemplateListSchema>

export const documentTemplateGenerateSchema = z.object({
  templateId: uuid().optional(),
  templateType: z.string().optional(),
  templateJson: pdfmeTemplateJsonSchema.optional(),
  inputs: z.array(z.record(z.string(), z.any())),
})

export type DocumentTemplateGenerateInput = z.infer<typeof documentTemplateGenerateSchema>
