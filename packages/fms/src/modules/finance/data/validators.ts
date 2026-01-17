import { z } from 'zod'

// ========================================
// Invoice Data Schemas
// ========================================

export const invoicePartySchema = z.object({
  name: z.string().nullable(),
  nip: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  postal_code: z.string().nullable(),
  bank_account: z.string().nullable(),
})

export const invoiceDatesSchema = z.object({
  creation_date: z.string().nullable(),
  payment_date: z.string().nullable(),
  service_date: z.string().nullable(),
})

export const invoiceLineItemSchema = z.object({
  description: z.string().nullable(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  unit_price_netto: z.number().nullable(),
  vat_rate: z.number().nullable(),
  netto: z.number().nullable(),
  vat: z.number().nullable(),
  brutto: z.number().nullable(),
})

export const invoiceTotalsSchema = z.object({
  netto: z.number().nullable(),
  vat: z.number().nullable(),
  brutto: z.number().nullable(),
})

export const invoiceDataSchema = z.object({
  invoice_number: z.string().nullable(),
  seller: invoicePartySchema,
  buyer: invoicePartySchema,
  dates: invoiceDatesSchema,
  line_items: z.array(invoiceLineItemSchema),
  totals: invoiceTotalsSchema,
  currency: z.string().nullable(),
  payment_method: z.string().nullable(),
  notes: z.string().nullable(),
})

// ========================================
// Extraction Schemas
// ========================================

export const extractionStrategyTypeSchema = z.enum([
  'anthropic',
  'openai',
  'gemini',
  'pymupdf_pdfplumber',
])

export const extractionStrategiesSchema = z.object({
  anthropic: z.boolean().optional().default(true),
  openai: z.boolean().optional().default(false),
  gemini: z.boolean().optional().default(true),
  pymupdf_pdfplumber: z.boolean().optional().default(true),
})

export const extractionResultSchema = z.object({
  strategy: extractionStrategyTypeSchema,
  success: z.boolean(),
  data: invoiceDataSchema.nullable(),
  error: z.string().nullable(),
  processing_time_ms: z.number(),
  confidence: z.number().optional(),
})

export const extractionResponseSchema = z.object({
  success: z.boolean(),
  results: z.array(extractionResultSchema),
  total_processing_time_ms: z.number(),
  file_url: z.string(),
  page_num: z.number(),
})

// ========================================
// Request Schemas
// ========================================

export const extractInvoiceRequestSchema = z.object({
  fileUrl: z.string().url('Invalid file URL'),
  strategies: extractionStrategiesSchema.partial().optional(),
  parallel: z.boolean().optional().default(true),
  pageNum: z.number().int().min(0).optional().default(0),
})

export const normalizationConfigSchema = z.object({
  nip: z
    .object({
      strip_prefix: z.boolean().optional(),
      digits_only: z.boolean().optional(),
    })
    .optional(),
  dates: z
    .object({
      format: z.string().optional(),
    })
    .optional(),
  bank_account: z
    .object({
      remove_spaces: z.boolean().optional(),
    })
    .optional(),
  amounts: z
    .object({
      decimal_places: z.number().int().min(0).max(10).optional(),
    })
    .optional(),
})

export const normalizeInvoiceRequestSchema = z.object({
  data: invoiceDataSchema,
  schemaConfig: normalizationConfigSchema.optional(),
})

export const validationRulesSchema = z.object({
  nip_checksum: z.boolean().optional().default(true),
  totals_math: z.boolean().optional().default(true),
  date_logic: z.boolean().optional().default(true),
  iban_format: z.boolean().optional().default(true),
})

export const validateExtractionRequestSchema = z.object({
  extractionResults: z.array(extractionResultSchema).min(1, 'At least one extraction result is required'),
  validationRules: validationRulesSchema.optional(),
})

export const visualizeOptionsSchema = z.object({
  scale: z.number().min(0.1).max(10).optional().default(2.0),
  show_legend: z.boolean().optional().default(true),
  format: z.enum(['png', 'jpeg', 'webp']).optional().default('png'),
})

export const fieldValidationSchema = z.object({
  field: z.string(),
  valid: z.boolean(),
  confidence: z.number().min(0).max(1),
  message: z.string().optional(),
})

export const validationResultSchema = z.object({
  valid: z.boolean(),
  confidence: z.number().min(0).max(1),
  field_validations: z.array(fieldValidationSchema),
  best_strategy: extractionStrategyTypeSchema.nullable(),
  merged_data: invoiceDataSchema.nullable(),
})

export const visualizeRequestSchema = z.object({
  fileUrl: z.string().url('Invalid file URL'),
  validationResult: validationResultSchema,
  options: visualizeOptionsSchema.optional(),
  pageNum: z.number().int().min(0).optional().default(0),
})

// ========================================
// Response Schemas
// ========================================

export const normalizeResponseSchema = z.object({
  success: z.boolean(),
  data: invoiceDataSchema,
  changes: z.array(
    z.object({
      field: z.string(),
      original: z.union([z.string(), z.number(), z.null()]),
      normalized: z.union([z.string(), z.number(), z.null()]),
    })
  ),
})

export const validationResponseSchema = z.object({
  success: z.boolean(),
  result: validationResultSchema,
})

export const visualizeResponseSchema = z.object({
  success: z.boolean(),
  image_base64: z.string(),
  format: z.string(),
  legend: z
    .array(
      z.object({
        color: z.string(),
        label: z.string(),
        description: z.string(),
      })
    )
    .optional(),
})

// ========================================
// Inferred Types
// ========================================

export type ExtractInvoiceRequestDto = z.infer<typeof extractInvoiceRequestSchema>
export type NormalizeInvoiceRequestDto = z.infer<typeof normalizeInvoiceRequestSchema>
export type ValidateExtractionRequestDto = z.infer<typeof validateExtractionRequestSchema>
export type VisualizeRequestDto = z.infer<typeof visualizeRequestSchema>
