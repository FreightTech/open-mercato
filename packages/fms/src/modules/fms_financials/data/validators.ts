import { z } from 'zod'

/**
 * Invoice status enum validator
 */
export const invoiceStatusSchema = z.enum(['pending_review', 'approved', 'rejected', 'matched'])

/**
 * Extraction confidence enum validator
 */
export const extractionConfidenceSchema = z.enum(['HIGH', 'MEDIUM', 'LOW'])

/**
 * Document type enum validator
 */
export const documentTypeSchema = z.enum([
  'invoice',
  'bill_of_lading',
  'delivery_note',
  'customs_declaration',
  'unknown',
])

/**
 * Transportation metadata schema
 */
export const transportationMetadataSchema = z.object({
  blNumber: z.string().optional().nullable(),
  containerNumbers: z.array(z.string()).optional(),
  vesselName: z.string().optional().nullable(),
  vesselImo: z.string().optional().nullable(),
  voyageNumber: z.string().optional().nullable(),
  portOfLoading: z.string().optional().nullable(),
  portOfDischarge: z.string().optional().nullable(),
  etd: z.string().optional().nullable(),
  eta: z.string().optional().nullable(),
  bookingNumber: z.string().optional().nullable(),
  carrierName: z.string().optional().nullable(),
  carrierScac: z.string().optional().nullable(),
})

// ========================================
// FmsInvoice Validators
// ========================================

/**
 * Create invoice schema (for manual creation or after OCR extraction)
 */
export const createInvoiceSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),

  // Invoice identification
  invoiceNumber: z.string().max(100).optional().nullable(),
  invoiceDate: z.coerce.date().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  serviceDate: z.coerce.date().optional().nullable(),

  // Seller details
  sellerName: z.string().max(500).optional().nullable(),
  sellerTaxId: z.string().max(50).optional().nullable(),
  sellerAddress: z.string().max(1000).optional().nullable(),

  // Buyer details
  buyerName: z.string().max(500).optional().nullable(),
  buyerTaxId: z.string().max(50).optional().nullable(),
  buyerAddress: z.string().max(1000).optional().nullable(),

  // Totals
  netAmount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid amount format').optional().default('0'),
  vatAmount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid amount format').optional().default('0'),
  grossAmount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid amount format').optional().default('0'),
  currencyCode: z.string().length(3).regex(/^[A-Z]{3}$/).default('PLN'),

  // Source file
  attachmentId: z.string().uuid().optional().nullable(),
  originalFilename: z.string().max(500).optional().nullable(),

  // OCR data
  extractedData: z.record(z.string(), z.unknown()).optional().nullable(),
  extractionConfidence: extractionConfidenceSchema.optional().nullable(),
  processedAt: z.coerce.date().optional().nullable(),

  // Document type detection
  documentType: documentTypeSchema.optional().default('invoice'),
  documentTypeConfidence: z.number().int().min(0).max(100).optional().nullable(),

  // Transportation metadata
  transportationMetadata: transportationMetadataSchema.optional().nullable(),
  blNumber: z.string().max(50).optional().nullable(),
  containerNumbers: z.array(z.string()).optional().nullable(),
  vesselName: z.string().max(200).optional().nullable(),
  voyageNumber: z.string().max(50).optional().nullable(),
  customReference: z.string().max(500).optional().nullable(),

  // Status
  status: invoiceStatusSchema.optional().default('pending_review'),

  // Line items (for bulk creation)
  lineItems: z.array(z.object({
    lineNumber: z.number().int().min(1),
    description: z.string().min(1).max(2000),
    quantity: z.string().regex(/^\d+(\.\d{1,4})?$/).default('1'),
    unit: z.string().max(50).optional().nullable(),
    unitPriceNet: z.string().regex(/^\d+(\.\d{1,4})?$/).default('0'),
    vatRate: z.string().regex(/^\d+(\.\d{1,2})?$/).default('0'),
    netAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).default('0'),
    vatAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).default('0'),
    grossAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).default('0'),
    chargeCodeId: z.string().uuid().optional().nullable(),
    chargeCodeMatchConfidence: z.number().int().min(0).max(100).optional().nullable(),
    rawDescription: z.string().max(2000).optional().nullable(),
  })).optional(),

  createdBy: z.string().uuid().optional().nullable(),
})

/**
 * Update invoice schema - uses explicit field definitions to avoid defaults being applied
 */
export const updateInvoiceSchema = z.object({
  // Invoice identification
  invoiceNumber: z.string().max(100).optional().nullable(),
  invoiceDate: z.coerce.date().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  serviceDate: z.coerce.date().optional().nullable(),

  // Seller details
  sellerName: z.string().max(500).optional().nullable(),
  sellerTaxId: z.string().max(50).optional().nullable(),
  sellerAddress: z.string().max(1000).optional().nullable(),

  // Buyer details
  buyerName: z.string().max(500).optional().nullable(),
  buyerTaxId: z.string().max(50).optional().nullable(),
  buyerAddress: z.string().max(1000).optional().nullable(),

  // Totals - NO defaults, just optional
  netAmount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid amount format').optional(),
  vatAmount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid amount format').optional(),
  grossAmount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid amount format').optional(),
  currencyCode: z.string().length(3).regex(/^[A-Z]{3}$/).optional(),

  // Source file
  attachmentId: z.string().uuid().optional().nullable(),
  originalFilename: z.string().max(500).optional().nullable(),

  // OCR data
  extractedData: z.record(z.string(), z.unknown()).optional().nullable(),
  extractionConfidence: extractionConfidenceSchema.optional().nullable(),
  processedAt: z.coerce.date().optional().nullable(),

  // Document type detection
  documentType: documentTypeSchema.optional(),
  documentTypeConfidence: z.number().int().min(0).max(100).optional().nullable(),

  // Transportation metadata
  transportationMetadata: transportationMetadataSchema.optional().nullable(),
  blNumber: z.string().max(50).optional().nullable(),
  containerNumbers: z.array(z.string()).optional().nullable(),
  vesselName: z.string().max(200).optional().nullable(),
  voyageNumber: z.string().max(50).optional().nullable(),
  customReference: z.string().max(500).optional().nullable(),

  // Status - NO default
  status: invoiceStatusSchema.optional(),

  // Audit
  updatedBy: z.string().uuid().optional().nullable(),
})

export type CreateInvoiceDto = z.infer<typeof createInvoiceSchema>
export type UpdateInvoiceDto = z.infer<typeof updateInvoiceSchema>

// ========================================
// FmsInvoiceLineItem Validators
// ========================================

/**
 * Create line item schema
 */
export const createLineItemSchema = z.object({
  organizationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  invoiceId: z.string().uuid(),
  lineNumber: z.number().int().min(1),
  description: z.string().min(1).max(2000),
  quantity: z.string().regex(/^\d+(\.\d{1,4})?$/).default('1'),
  unit: z.string().max(50).optional().nullable(),
  unitPriceNet: z.string().regex(/^\d+(\.\d{1,4})?$/).default('0'),
  vatRate: z.string().regex(/^\d+(\.\d{1,2})?$/).default('0'),
  netAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).default('0'),
  vatAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).default('0'),
  grossAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).default('0'),
  chargeCodeId: z.string().uuid().optional().nullable(),
  chargeCodeMatchConfidence: z.number().int().min(0).max(100).optional().nullable(),
  rawDescription: z.string().max(2000).optional().nullable(),
})

/**
 * Update line item schema
 */
export const updateLineItemSchema = createLineItemSchema
  .partial()
  .omit({ organizationId: true, tenantId: true, invoiceId: true })

export type CreateLineItemDto = z.infer<typeof createLineItemSchema>
export type UpdateLineItemDto = z.infer<typeof updateLineItemSchema>

// ========================================
// Invoice Review Validators
// ========================================

/**
 * Approve invoice schema
 */
export const approveInvoiceSchema = z.object({
  reviewNotes: z.string().max(2000).optional().nullable(),
  reviewedBy: z.string().uuid().optional().nullable(),
})

/**
 * Reject invoice schema
 */
export const rejectInvoiceSchema = z.object({
  reviewNotes: z.string().min(1, 'Rejection reason is required').max(2000),
  reviewedBy: z.string().uuid().optional().nullable(),
})

export type ApproveInvoiceDto = z.infer<typeof approveInvoiceSchema>
export type RejectInvoiceDto = z.infer<typeof rejectInvoiceSchema>

// ========================================
// Match Charge Code Validator
// ========================================

/**
 * Match line item to charge code schema
 */
export const matchChargeCodeSchema = z.object({
  lineItemId: z.string().uuid(),
  chargeCodeId: z.string().uuid(),
  confidence: z.number().int().min(0).max(100).optional().default(100),
})

export type MatchChargeCodeDto = z.infer<typeof matchChargeCodeSchema>

// ========================================
// Query/Filter Validators
// ========================================

/**
 * Invoice list query schema
 */
export const invoiceListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  q: z.string().optional(),
  status: invoiceStatusSchema.optional(),
  sellerName: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  sortField: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
})

export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>
