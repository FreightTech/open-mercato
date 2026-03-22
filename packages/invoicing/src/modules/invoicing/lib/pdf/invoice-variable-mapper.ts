type InvoiceData = {
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

type LineItemData = {
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

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}.${month}.${year}`
}

function formatAmount(value: string | null | undefined): string {
  if (!value) return '0,00'
  const num = parseFloat(value)
  if (isNaN(num)) return '0,00'
  const parts = num.toFixed(2).split('.')
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${intPart},${parts[1]}`
}

function formatQuantity(value: string): string {
  const num = parseFloat(value)
  if (isNaN(num)) return value
  // Remove trailing zeros: 1.0000 → 1, 2.5000 → 2,5, 1.2500 → 1,25
  const trimmed = num.toString()
  return trimmed.replace('.', ',')
}

function vatRateLabel(code: string | null | undefined, rate: string): string {
  if (code === 'zw') return 'zw.'
  if (code === 'oo') return 'o.o.'
  if (code === 'np') return 'n.p.'
  // Clean up: "23.00" → "23%", "8.00" → "8%", "5.50" → "5,5%"
  const num = parseFloat(rate)
  if (isNaN(num)) return `${rate}%`
  const clean = num.toString().replace('.', ',')
  return `${clean}%`
}

export function mapInvoiceToInputs(invoice: InvoiceData): Record<string, string> {
  return {
    invoiceTitle: 'FAKTURA VAT',
    invoiceNumber: invoice.invoiceNumber || '',
    invoiceDate: formatDate(invoice.invoiceDate),
    serviceDate: formatDate(invoice.serviceDate),
    dueDate: formatDate(invoice.dueDate),

    sellerLabel: 'Sprzedawca',
    sellerName: invoice.sellerName || '',
    sellerNipLabel: 'NIP',
    sellerNip: invoice.sellerTaxId || '',
    sellerAddress: invoice.sellerAddress || '',
    sellerCountry: invoice.sellerCountryCode || 'PL',
    sellerBankAccountLabel: 'Nr konta',
    sellerBankAccount: invoice.sellerBankAccount || '',

    buyerLabel: 'Nabywca',
    buyerName: invoice.buyerName || '',
    buyerNipLabel: 'NIP',
    buyerNip: invoice.buyerTaxId || '',
    buyerAddress: invoice.buyerAddress || '',
    buyerCountry: invoice.buyerCountryCode || '',

    netTotalLabel: 'Razem netto',
    netTotal: `${formatAmount(invoice.netAmount)} ${invoice.currencyCode || 'PLN'}`,
    vatTotalLabel: 'Razem VAT',
    vatTotal: `${formatAmount(invoice.vatAmount)} ${invoice.currencyCode || 'PLN'}`,
    grossTotalLabel: 'Razem brutto',
    grossTotal: `${formatAmount(invoice.grossAmount)} ${invoice.currencyCode || 'PLN'}`,

    paymentMethodLabel: 'Sposob platnosci',
    paymentMethod: invoice.paymentMethod || 'przelew',
    paymentTermsLabel: 'Termin platnosci',
    paymentTerms: invoice.paymentTerms || '',
    currencyCode: invoice.currencyCode || 'PLN',

    notes: invoice.notes || '',

    invoiceDateLabel: 'Data wystawienia',
    serviceDateLabel: 'Data sprzedazy',
    dueDateLabel: 'Termin platnosci',
    invoiceNumberLabel: 'Nr faktury',
  }
}

export function formatLineItemsTableData(lineItems: LineItemData[]): string {
  // pdfme table schema: data rows only (header defined in schema's `head` property)
  const rows = lineItems.map(li => [
    String(li.lineNumber),
    li.description,
    li.unit || 'szt.',
    formatQuantity(li.quantity),
    formatAmount(li.unitPriceNet),
    vatRateLabel(li.vatRateCode, li.vatRate),
    formatAmount(li.netAmount),
    formatAmount(li.vatAmount),
    formatAmount(li.grossAmount),
  ])

  return JSON.stringify(rows)
}

export function formatVatSummaryTableData(lineItems: LineItemData[]): string {
  const byRate = new Map<string, { net: number; vat: number; gross: number }>()

  for (const li of lineItems) {
    const key = vatRateLabel(li.vatRateCode, li.vatRate)
    const existing = byRate.get(key) || { net: 0, vat: 0, gross: 0 }
    existing.net += parseFloat(li.netAmount) || 0
    existing.vat += parseFloat(li.vatAmount) || 0
    existing.gross += parseFloat(li.grossAmount) || 0
    byRate.set(key, existing)
  }

  const rows = [...byRate.entries()].map(([rate, amounts]) => [
    rate,
    formatAmount(String(amounts.net.toFixed(2))),
    formatAmount(String(amounts.vat.toFixed(2))),
    formatAmount(String(amounts.gross.toFixed(2))),
  ])

  return JSON.stringify(rows)
}
