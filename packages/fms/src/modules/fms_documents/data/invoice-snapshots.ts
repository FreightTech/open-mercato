import type { InvoiceStatus, ExtractionConfidence } from './invoice-types'

/**
 * Snapshot type for FmsInvoiceLineItem
 */
export type FmsInvoiceLineItemSnapshot = {
  id: string
  organizationId: string
  tenantId: string
  invoiceId: string
  lineNumber: number
  description: string
  quantity: string
  unit: string | null
  unitPriceNet: string
  vatRate: string
  netAmount: string
  vatAmount: string
  grossAmount: string
  productId: string | null
  chargeCodeMatchConfidence: number | null
  rawDescription: string | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Snapshot type for FmsInvoice (includes line items for cascade undo)
 */
export type FmsInvoiceSnapshot = {
  id: string
  organizationId: string
  tenantId: string

  // Invoice identification
  invoiceNumber: string | null
  invoiceDate: Date | null
  dueDate: Date | null
  serviceDate: Date | null

  // Seller details
  sellerName: string | null
  sellerTaxId: string | null
  sellerAddress: string | null

  // Buyer details
  buyerName: string | null
  buyerTaxId: string | null
  buyerAddress: string | null

  // Totals
  netAmount: string
  vatAmount: string
  grossAmount: string
  currencyCode: string

  // Source file
  attachmentId: string | null
  originalFilename: string | null

  // OCR metadata
  extractedData: Record<string, unknown> | null
  extractionConfidence: ExtractionConfidence | null
  processedAt: Date | null

  // Review workflow
  status: InvoiceStatus
  reviewedBy: string | null
  reviewedAt: Date | null
  reviewNotes: string | null

  // Audit
  createdAt: Date
  createdBy: string | null
  updatedAt: Date
  updatedBy: string | null

  // Related line items
  lineItems: FmsInvoiceLineItemSnapshot[]
}

/**
 * Undo payload types
 */
export type InvoiceUndoPayload = {
  before?: FmsInvoiceSnapshot | null
  after?: FmsInvoiceSnapshot | null
}

export type LineItemUndoPayload = {
  before?: FmsInvoiceLineItemSnapshot | null
  after?: FmsInvoiceLineItemSnapshot | null
}
