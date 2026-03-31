import { createHash } from 'crypto'

interface InvoiceForQr {
  invoiceNumber: string
  invoiceDate?: Date | string | null
  sellerTaxId?: string | null
  buyerTaxId?: string | null
  grossAmount: string | number
}

export function buildOfflineQrContent(invoice: InvoiceForQr): string {
  const invoiceNumber = invoice.invoiceNumber
  const invoiceDate = invoice.invoiceDate
    ? (typeof invoice.invoiceDate === 'string' ? invoice.invoiceDate : invoice.invoiceDate.toISOString().slice(0, 10))
    : new Date().toISOString().slice(0, 10)
  const sellerNip = (invoice.sellerTaxId ?? '').replace(/[\s-]/g, '')
  const buyerNip = (invoice.buyerTaxId ?? '').replace(/[\s-]/g, '')
  const grossAmount = invoice.grossAmount

  const hashInput = `${invoiceNumber}|${invoiceDate}|${sellerNip}|${buyerNip}|${grossAmount}`
  const verificationHash = createHash('sha256').update(hashInput, 'utf-8').digest('hex').substring(0, 16)

  return [invoiceNumber, invoiceDate, sellerNip, buyerNip, grossAmount, verificationHash].join('|')
}
