import type {
  InvoiceDirection,
  InvoiceSourceType,
  InvoiceStatus,
  KsefStatus,
  VatRateCode,
} from './types'

export type FmsInvoicingLineItemSnapshot = {
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
  vatRateCode: VatRateCode | null
  netAmount: string
  vatAmount: string
  grossAmount: string
  productId: string | null
  gtuCode: string | null
  pkwiuCode: string | null
  createdAt: Date
  updatedAt: Date
}

export type FmsInvoicingInvoiceSnapshot = {
  id: string
  organizationId: string
  tenantId: string

  invoiceNumber: string
  invoiceDate: Date | null
  dueDate: Date | null
  serviceDate: Date | null

  sellerName: string | null
  sellerTaxId: string | null
  sellerAddress: string | null
  sellerCountryCode: string | null
  sellerBankAccount: string | null

  buyerName: string | null
  buyerTaxId: string | null
  buyerAddress: string | null
  buyerCountryCode: string | null

  netAmount: string
  vatAmount: string
  grossAmount: string
  currencyCode: string

  paymentMethod: string | null
  paymentTerms: string | null

  direction: InvoiceDirection
  sourceType: InvoiceSourceType
  sourceDocumentInvoiceId: string | null
  sourceSalesInvoiceId: string | null
  sourceImportReference: string | null
  attachmentId: string | null

  status: InvoiceStatus
  ksefStatus: KsefStatus
  ksefNumber: string | null

  notes: string | null
  metadata: Record<string, unknown> | null

  reviewedBy: string | null
  reviewedAt: Date | null
  reviewNotes: string | null

  createdAt: Date
  createdBy: string | null
  updatedAt: Date
  updatedBy: string | null

  lineItems: FmsInvoicingLineItemSnapshot[]
}

export type InvoiceUndoPayload = {
  before?: FmsInvoicingInvoiceSnapshot | null
  after?: FmsInvoicingInvoiceSnapshot | null
}
