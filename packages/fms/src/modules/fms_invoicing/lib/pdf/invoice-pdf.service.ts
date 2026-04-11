import { generatePdfBuffer, DEFAULT_INVOICE_TEMPLATE, mapInvoiceToInputs, formatLineItemsTableData } from '@open-mercato/templating/modules/templating/index'

type InvoiceForPdf = {
  invoiceNumber: string
  invoiceDate?: Date | string | null
  dueDate?: Date | string | null
  serviceDate?: Date | string | null
  sellerName?: string | null
  sellerTaxId?: string | null
  sellerAddress?: string | null
  sellerCountryCode?: string | null
  sellerBankAccount?: string | null
  buyerName?: string | null
  buyerTaxId?: string | null
  buyerAddress?: string | null
  buyerCountryCode?: string | null
  netAmount?: string | null
  vatAmount?: string | null
  grossAmount?: string | null
  currencyCode?: string | null
  paymentMethod?: string | null
  paymentTerms?: string | null
  notes?: string | null
}

type LineItemForPdf = {
  lineNumber: number
  description: string
  quantity: string
  unit?: string | null
  unitPriceNet: string
  vatRate: string
  vatRateCode?: string | null
  netAmount: string
  vatAmount: string
  grossAmount: string
}

export async function generateInvoicePdf(
  invoice: InvoiceForPdf,
  lineItems: LineItemForPdf[]
): Promise<Buffer> {
  const inputs = mapInvoiceToInputs(invoice)
  inputs.lineItemsTable = formatLineItemsTableData(lineItems)

  return generatePdfBuffer(DEFAULT_INVOICE_TEMPLATE, [inputs])
}
