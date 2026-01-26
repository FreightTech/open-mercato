import { z } from 'zod'

const uuid = () => z.string().uuid()

const scoped = z.object({
  organizationId: uuid(),
  tenantId: uuid(),
})

export const pdfTemplateTypes = ['offer'] as const

export const pdfTemplateTypeSchema = z.enum(pdfTemplateTypes)

export const pageSizes = ['A4', 'A3', 'Letter', 'Legal'] as const
export const pageSizeSchema = z.enum(pageSizes)

export const pageOrientations = ['portrait', 'landscape'] as const
export const pageOrientationSchema = z.enum(pageOrientations)

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

const nullableUrl = () =>
  z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? null : val),
    z.string().url().nullable().optional()
  )

// PDF Template upsert
export const pdfTemplateUpsertSchema = scoped.extend({
  templateType: pdfTemplateTypeSchema,
  htmlTemplate: z.string().trim().min(1),
  cssStyles: nullableString(100000),
  pageSize: pageSizeSchema.optional().default('A4'),
  pageOrientation: pageOrientationSchema.optional().default('portrait'),
  isActive: z.boolean().optional().default(true),
})

export type PdfTemplateUpsertInput = z.infer<typeof pdfTemplateUpsertSchema>

// PDF Template list
export const pdfTemplateListSchema = scoped.extend({
  templateType: pdfTemplateTypeSchema.optional(),
  isActive: z.boolean().optional(),
})

export type PdfTemplateListInput = z.infer<typeof pdfTemplateListSchema>

// PDF Settings upsert
export const pdfSettingsUpsertSchema = scoped.extend({
  companyName: nullableString(255),
  companyLogoUrl: nullableUrl(),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .default('#1a365d'),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .default('#f7fafc'),
  headerHtml: nullableString(50000),
  footerHtml: nullableString(50000),
  coverPageImageUrl: nullableUrl(),
  rulesAgreementHtml: nullableString(100000),
  showPageNumbers: z.boolean().optional().default(true),
  defaultPageSize: pageSizeSchema.optional().default('A4'),
  defaultPageOrientation: pageOrientationSchema.optional().default('portrait'),
})

export type PdfSettingsUpsertInput = z.infer<typeof pdfSettingsUpsertSchema>

// Template preview request
export const pdfPreviewSchema = z.object({
  templateType: pdfTemplateTypeSchema,
  htmlTemplate: z.string().trim().min(1),
  cssStyles: z.string().optional(),
  variables: z.record(z.string(), z.any()).optional(),
  settings: z
    .object({
      companyName: z.string().optional(),
      companyLogoUrl: z.string().optional(),
      primaryColor: z.string().optional(),
      accentColor: z.string().optional(),
    })
    .optional(),
})

export type PdfPreviewInput = z.infer<typeof pdfPreviewSchema>

// Template variable validation
export const templateVariablesSchema = z.record(z.string(), z.any())

export type TemplateVariables = z.infer<typeof templateVariablesSchema>
