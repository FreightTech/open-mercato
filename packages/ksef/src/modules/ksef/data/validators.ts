import { z } from 'zod'

export const ksefSubmissionStatusSchema = z.enum([
  'none', 'queued', 'submitted', 'processing', 'accepted',
  'upo_downloaded', 'rejected', 'error', 'cancelled',
])

export const ksefEnvironmentSchema = z.enum(['test', 'demo', 'production'])

export const ksefAuthTypeSchema = z.enum(['token', 'certificate'])

export const ksefSessionModeSchema = z.enum(['interactive', 'batch'])

export const offlineModeSchema = z.enum(['online', 'offline24', 'unavailability', 'emergency'])

export const submitBatchSchema = z.object({
  invoiceIds: z.array(z.string().uuid()).min(1).max(500),
})

export const syncReceivedSchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  subjectType: z.enum(['subject1', 'subject2', 'subject3']).default('subject2'),
})

export type SubmitBatchDto = z.infer<typeof submitBatchSchema>
export type SyncReceivedDto = z.infer<typeof syncReceivedSchema>

// ========================================
// KSeF Invoice schemas
// ========================================

export const ksefInvoiceDirectionSchema = z.enum(['outgoing', 'incoming'])

export const ksefInvoiceLineItemSchema = z.object({
  lineNumber: z.number().int().min(1),
  description: z.string().min(1),
  quantity: z.union([z.string(), z.number()]),
  unit: z.string().nullable().optional(),
  unitPriceNet: z.union([z.string(), z.number()]),
  netAmount: z.union([z.string(), z.number()]),
  vatAmount: z.union([z.string(), z.number()]),
  vatRate: z.string(),
  vatRateCode: z.string().nullable().optional(),
  gtuCode: z.string().nullable().optional(),
})

export const ksefInvoiceCreateSchema = z.object({
  invoiceNumber: z.string().min(1),
  invoiceDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  serviceDate: z.string().nullable().optional(),
  sellerName: z.string().nullable().optional(),
  sellerTaxId: z.string().nullable().optional(),
  sellerAddress: z.string().nullable().optional(),
  sellerCountryCode: z.string().nullable().optional(),
  sellerBankAccount: z.string().nullable().optional(),
  buyerName: z.string().nullable().optional(),
  buyerTaxId: z.string().nullable().optional(),
  buyerAddress: z.string().nullable().optional(),
  buyerCountryCode: z.string().nullable().optional(),
  netAmount: z.union([z.string(), z.number()]).optional(),
  vatAmount: z.union([z.string(), z.number()]).optional(),
  grossAmount: z.union([z.string(), z.number()]),
  currencyCode: z.string().default('PLN'),
  paymentMethod: z.string().nullable().optional(),
  invoiceType: z.string().default('VAT'),
  correctedInvoiceId: z.string().uuid().nullable().optional(),
  correctionReason: z.string().nullable().optional(),
  direction: ksefInvoiceDirectionSchema.default('outgoing'),
  externalInvoiceId: z.string().uuid().nullable().optional(),
  lineItems: z.array(ksefInvoiceLineItemSchema).min(1),
})

export const ksefInvoiceUpdateSchema = ksefInvoiceCreateSchema.partial().omit({
  direction: true,
  externalInvoiceId: true,
})

export const ksefInvoiceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  direction: ksefInvoiceDirectionSchema.optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
})

export type KsefInvoiceCreateDto = z.infer<typeof ksefInvoiceCreateSchema>
export type KsefInvoiceUpdateDto = z.infer<typeof ksefInvoiceUpdateSchema>
export type KsefInvoiceLineItemDto = z.infer<typeof ksefInvoiceLineItemSchema>
export type KsefInvoiceListQueryDto = z.infer<typeof ksefInvoiceListQuerySchema>
