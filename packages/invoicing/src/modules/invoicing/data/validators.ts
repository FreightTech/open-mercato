import { z } from 'zod'

// ========================================
// Enum Validators
// ========================================

export const invoiceDirectionSchema = z.enum(['outgoing', 'incoming'])

export const invoiceSourceTypeSchema = z.enum([
  'manual',
  'document_extraction',
  'sales_import',
  'external_import',
  'ksef_received',
])

export const invoiceStatusSchema = z.enum([
  'draft',
  'extracted',
  'pending_review',
  'approved',
  'rejected',
  'sent',
  'paid',
  'cancelled',
])

export const ksefStatusSchema = z.enum([
  'none',
  'queued',
  'submitted',
  'processing',
  'accepted',
  'upo_downloaded',
  'rejected',
  'error',
  'cancelled',
])

export const ksefEnvironmentSchema = z.enum(['test', 'demo', 'production'])

export const ksefAuthTypeSchema = z.enum(['token', 'certificate'])

export const ksefSessionModeSchema = z.enum(['interactive', 'batch'])

export const offlineModeSchema = z.enum(['online', 'offline24', 'unavailability', 'emergency'])

export const invoiceTypeCodeSchema = z.enum(['VAT', 'KOR', 'KOR_ZAL', 'KOR_ROZ', 'ZAL', 'ROZ', 'UPR'])

export const vatRateCodeSchema = z.enum(['23', '8', '5', '0', 'zw', 'oo', 'np'])

// ========================================
// Amount helpers
// ========================================

const amountRegex = /^-?\d+(\.\d{1,2})?$/
const quantityRegex = /^-?\d+(\.\d{1,4})?$/

// ========================================
// Line Item Schema
// ========================================

export const lineItemSchema = z.object({
  lineNumber: z.number().int().min(1),
  description: z.string().min(1).max(512),
  quantity: z.string().regex(quantityRegex, 'Invalid quantity format').default('1'),
  unit: z.string().max(50).optional().nullable(),
  unitPriceNet: z.string().regex(quantityRegex, 'Invalid price format').default('0'),
  vatRate: z.string().regex(amountRegex, 'Invalid VAT rate').default('0'),
  vatRateCode: vatRateCodeSchema.optional().nullable(),
  netAmount: z.string().regex(amountRegex, 'Invalid amount').default('0'),
  vatAmount: z.string().regex(amountRegex, 'Invalid amount').default('0'),
  grossAmount: z.string().regex(amountRegex, 'Invalid amount').default('0'),
  productId: z.string().uuid().optional().nullable(),
  gtuCode: z.string().max(10).optional().nullable(),
  pkwiuCode: z.string().max(20).optional().nullable(),
})

// ========================================
// Invoice CRUD Schemas
// ========================================

export const createInvoiceSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),

  invoiceNumber: z.string().min(1).max(100),
  invoiceDate: z.coerce.date().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  serviceDate: z.coerce.date().optional().nullable(),

  sellerName: z.string().max(500).optional().nullable(),
  sellerTaxId: z.string().max(50).optional().nullable(),
  sellerAddress: z.string().max(1000).optional().nullable(),
  sellerCountryCode: z.string().max(2).optional().nullable(),
  sellerBankAccount: z.string().max(100).optional().nullable(),

  buyerName: z.string().max(500).optional().nullable(),
  buyerTaxId: z.string().max(50).optional().nullable(),
  buyerAddress: z.string().max(1000).optional().nullable(),
  buyerCountryCode: z.string().max(2).optional().nullable(),

  netAmount: z.string().regex(amountRegex, 'Invalid amount').optional().default('0'),
  vatAmount: z.string().regex(amountRegex, 'Invalid amount').optional().default('0'),
  grossAmount: z.string().regex(amountRegex, 'Invalid amount').optional().default('0'),
  currencyCode: z.string().length(3).regex(/^[A-Z]{3}$/).default('PLN'),

  paymentMethod: z.string().max(50).optional().nullable(),
  paymentTerms: z.string().max(200).optional().nullable(),

  direction: invoiceDirectionSchema.optional().default('outgoing'),
  sourceType: invoiceSourceTypeSchema.optional().default('manual'),
  sourceDocumentInvoiceId: z.string().uuid().optional().nullable(),
  sourceDocumentId: z.string().uuid().optional().nullable(),
  sourceSalesInvoiceId: z.string().uuid().optional().nullable(),
  sourceImportReference: z.string().max(500).optional().nullable(),
  attachmentId: z.string().uuid().optional().nullable(),

  status: invoiceStatusSchema.optional().default('draft'),
  invoiceType: invoiceTypeCodeSchema.optional().default('VAT'),
  correctedInvoiceId: z.string().uuid().optional().nullable(),
  correctionReason: z.string().max(2000).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),

  lineItems: z.array(lineItemSchema).optional(),

  createdBy: z.string().uuid().optional().nullable(),
})

export const updateInvoiceSchema = z.object({
  invoiceNumber: z.string().min(1).max(100).optional(),
  invoiceDate: z.coerce.date().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  serviceDate: z.coerce.date().optional().nullable(),

  sellerName: z.string().max(500).optional().nullable(),
  sellerTaxId: z.string().max(50).optional().nullable(),
  sellerAddress: z.string().max(1000).optional().nullable(),
  sellerCountryCode: z.string().max(2).optional().nullable(),
  sellerBankAccount: z.string().max(100).optional().nullable(),

  buyerName: z.string().max(500).optional().nullable(),
  buyerTaxId: z.string().max(50).optional().nullable(),
  buyerAddress: z.string().max(1000).optional().nullable(),
  buyerCountryCode: z.string().max(2).optional().nullable(),

  netAmount: z.string().regex(amountRegex, 'Invalid amount').optional(),
  vatAmount: z.string().regex(amountRegex, 'Invalid amount').optional(),
  grossAmount: z.string().regex(amountRegex, 'Invalid amount').optional(),
  currencyCode: z.string().length(3).regex(/^[A-Z]{3}$/).optional(),

  paymentMethod: z.string().max(50).optional().nullable(),
  paymentTerms: z.string().max(200).optional().nullable(),

  direction: invoiceDirectionSchema.optional(),
  status: invoiceStatusSchema.optional(),
  invoiceType: invoiceTypeCodeSchema.optional(),
  correctedInvoiceId: z.string().uuid().optional().nullable(),
  correctionReason: z.string().max(2000).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),

  lineItems: z.array(lineItemSchema).optional(),

  updatedBy: z.string().uuid().optional().nullable(),
})

export const approveInvoiceSchema = z.object({
  reviewNotes: z.string().max(2000).optional().nullable(),
  reviewedBy: z.string().uuid().optional().nullable(),
})

export const rejectInvoiceSchema = z.object({
  reviewNotes: z.string().min(1, 'Rejection reason is required').max(2000),
  reviewedBy: z.string().uuid().optional().nullable(),
})

// ========================================
// Settings Schema
// ========================================

export const updateSettingsSchema = z.object({
  ksefEnvironment: ksefEnvironmentSchema.optional(),
  ksefAutoSubmit: z.boolean().optional(),
  ksefSessionMode: ksefSessionModeSchema.optional(),
  defaultSellerName: z.string().max(500).optional().nullable(),
  defaultSellerNip: z.string().max(20).optional().nullable(),
  defaultSellerAddress: z.string().max(1000).optional().nullable(),
  defaultSellerCountryCode: z.string().max(2).optional().nullable(),
  defaultSellerBankAccount: z.string().max(100).optional().nullable(),
  defaultPaymentMethod: z.string().max(50).optional().nullable(),
  autoImportFromDocuments: z.boolean().optional(),
  autoImportFromSales: z.boolean().optional(),
  offlineMode: offlineModeSchema.optional(),
})

// ========================================
// Credential Schemas
// ========================================

export const createCredentialSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  nip: z.string().min(10).max(10).regex(/^\d{10}$/, 'NIP must be exactly 10 digits'),
  authType: ksefAuthTypeSchema,
  ksefToken: z.string().optional().nullable(),
  certificatePem: z.string().optional().nullable(),
  privateKeyPem: z.string().optional().nullable(),
  environment: ksefEnvironmentSchema.optional().default('test'),
  label: z.string().max(200).optional().nullable(),
})

export const updateCredentialSchema = z.object({
  ksefToken: z.string().optional().nullable(),
  certificatePem: z.string().optional().nullable(),
  privateKeyPem: z.string().optional().nullable(),
  environment: ksefEnvironmentSchema.optional(),
  isActive: z.boolean().optional(),
  label: z.string().max(200).optional().nullable(),
})

// ========================================
// KSeF Submission Schemas
// ========================================

export const submitBatchSchema = z.object({
  invoiceIds: z.array(z.string().uuid()).min(1).max(500),
})

export const syncReceivedSchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
})

// ========================================
// Query Schemas
// ========================================

export const invoiceListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  q: z.string().optional(),
  status: invoiceStatusSchema.optional(),
  ksefStatus: ksefStatusSchema.optional(),
  direction: invoiceDirectionSchema.optional(),
  sourceType: invoiceSourceTypeSchema.optional(),
  invoiceType: invoiceTypeCodeSchema.optional(),
  sellerTaxId: z.string().optional(),
  buyerTaxId: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  sortField: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
})

// ========================================
// Derived Types
// ========================================

export type CreateInvoiceDto = z.infer<typeof createInvoiceSchema>
export type UpdateInvoiceDto = z.infer<typeof updateInvoiceSchema>
export type ApproveInvoiceDto = z.infer<typeof approveInvoiceSchema>
export type RejectInvoiceDto = z.infer<typeof rejectInvoiceSchema>
export type UpdateSettingsDto = z.infer<typeof updateSettingsSchema>
export type CreateCredentialDto = z.infer<typeof createCredentialSchema>
export type UpdateCredentialDto = z.infer<typeof updateCredentialSchema>
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>
