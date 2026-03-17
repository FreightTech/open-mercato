import type { FmsInvoicingInvoice, FmsInvoicingLineItem } from '../../data/entities'
import {
  FA3_NAMESPACE,
  FA3_SCHEMA_VERSION_NUMBER,
  FA3_FORM_CODE,
  FA3_CODING_SYSTEM,
  FA3_SYSTEM_CODE,
  XML_NAMESPACE_XSI,
  XML_ENCODING,
  COUNTRY_CODE_POLAND,
  PAYMENT_METHOD_CODES,
  INVOICE_TYPE_CODES,
  FA3_MAX_LINE_DESCRIPTION_LENGTH,
} from './fa3-schema'
import type { VatRateCode } from '../../data/types'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) {
    return formatDate(new Date())
  }
  const dateObj = typeof date === 'string' ? new Date(date) : date
  const year = dateObj.getFullYear()
  const month = String(dateObj.getMonth() + 1).padStart(2, '0')
  const day = String(dateObj.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatAmount(amount: string | number): string {
  const numeric = typeof amount === 'string' ? parseFloat(amount) : amount
  return numeric.toFixed(2)
}

function resolvePaymentMethodCode(paymentMethod: string | null | undefined): string {
  if (!paymentMethod) {
    return PAYMENT_METHOD_CODES.TRANSFER
  }

  const normalized = paymentMethod.toLowerCase().trim()

  if (normalized === 'transfer' || normalized === 'przelew' || normalized === 'bank_transfer') {
    return PAYMENT_METHOD_CODES.TRANSFER
  }
  if (normalized === 'cash' || normalized === 'gotowka' || normalized === 'gotówka') {
    return PAYMENT_METHOD_CODES.CASH
  }
  if (normalized === 'card' || normalized === 'karta') {
    return PAYMENT_METHOD_CODES.CARD
  }
  if (normalized === 'check' || normalized === 'czek') {
    return PAYMENT_METHOD_CODES.CHECK
  }
  if (normalized === 'credit' || normalized === 'kredyt' || normalized === 'kompensata') {
    return PAYMENT_METHOD_CODES.CREDIT
  }

  return PAYMENT_METHOD_CODES.OTHER
}

function groupLinesByVatRate(lineItems: FmsInvoicingLineItem[]): Map<string, { netTotal: number; vatTotal: number }> {
  const groups = new Map<string, { netTotal: number; vatTotal: number }>()

  for (const line of lineItems) {
    const rateKey = line.vatRateCode ?? line.vatRate
    const existing = groups.get(rateKey) ?? { netTotal: 0, vatTotal: 0 }
    existing.netTotal += parseFloat(line.netAmount)
    existing.vatTotal += parseFloat(line.vatAmount)
    groups.set(rateKey, existing)
  }

  return groups
}

function isZeroRateCode(rateCode: VatRateCode | string | null | undefined): boolean {
  return rateCode === 'zw' || rateCode === 'oo' || rateCode === 'np'
}

function buildHeader(): string {
  return [
    '  <Naglowek>',
    `    <KodFormularza kodSystemowy="${FA3_SYSTEM_CODE}" wersjaSchemy="${FA3_SCHEMA_VERSION_NUMBER}">${FA3_FORM_CODE}</KodFormularza>`,
    `    <WariantFormularza>3</WariantFormularza>`,
    `    <DataWytworzeniaFa>${formatDate(new Date())}</DataWytworzeniaFa>`,
    `    <SystemInfo>${FA3_CODING_SYSTEM}</SystemInfo>`,
    '  </Naglowek>',
  ].join('\n')
}

function buildSeller(invoice: FmsInvoicingInvoice): string {
  const sellerNip = invoice.sellerTaxId?.replace(/[\s-]/g, '') ?? ''
  const sellerName = escapeXml(invoice.sellerName ?? '')
  const countryCode = invoice.sellerCountryCode ?? COUNTRY_CODE_POLAND

  const lines = [
    '  <Podmiot1>',
    '    <DaneIdentyfikacyjne>',
    `      <NIP>${escapeXml(sellerNip)}</NIP>`,
    `      <Nazwa>${sellerName}</Nazwa>`,
    '    </DaneIdentyfikacyjne>',
  ]

  if (invoice.sellerAddress) {
    const addressParts = parseAddress(invoice.sellerAddress)
    lines.push('    <Adres>')
    lines.push(`      <KodKraju>${escapeXml(countryCode)}</KodKraju>`)
    lines.push(`      <AdresL1>${escapeXml(addressParts.line1)}</AdresL1>`)
    if (addressParts.line2) {
      lines.push(`      <AdresL2>${escapeXml(addressParts.line2)}</AdresL2>`)
    }
    lines.push('    </Adres>')
  }

  lines.push('  </Podmiot1>')
  return lines.join('\n')
}

function buildBuyer(invoice: FmsInvoicingInvoice): string {
  const lines = ['  <Podmiot2>']

  const buyerName = escapeXml(invoice.buyerName ?? '')
  const countryCode = invoice.buyerCountryCode ?? COUNTRY_CODE_POLAND

  lines.push('    <DaneIdentyfikacyjne>')
  if (invoice.buyerTaxId) {
    const buyerNip = invoice.buyerTaxId.replace(/[\s-]/g, '')
    if (countryCode === COUNTRY_CODE_POLAND) {
      lines.push(`      <NIP>${escapeXml(buyerNip)}</NIP>`)
    } else {
      lines.push(`      <KodUE>${escapeXml(countryCode)}</KodUE>`)
      lines.push(`      <NrVatUE>${escapeXml(buyerNip)}</NrVatUE>`)
    }
  }
  lines.push(`    <Nazwa>${buyerName}</Nazwa>`)
  lines.push('    </DaneIdentyfikacyjne>')

  if (invoice.buyerAddress) {
    const addressParts = parseAddress(invoice.buyerAddress)
    lines.push('    <Adres>')
    lines.push(`      <KodKraju>${escapeXml(countryCode)}</KodKraju>`)
    lines.push(`      <AdresL1>${escapeXml(addressParts.line1)}</AdresL1>`)
    if (addressParts.line2) {
      lines.push(`      <AdresL2>${escapeXml(addressParts.line2)}</AdresL2>`)
    }
    lines.push('    </Adres>')
  }

  lines.push('  </Podmiot2>')
  return lines.join('\n')
}

function buildInvoiceData(invoice: FmsInvoicingInvoice, lineItems: FmsInvoicingLineItem[]): string {
  const lines = ['  <Fa>']

  lines.push(`    <KodWaluty>${escapeXml(invoice.currencyCode)}</KodWaluty>`)
  lines.push(`    <P_1>${formatDate(invoice.invoiceDate)}</P_1>`)
  lines.push(`    <P_2>${escapeXml(invoice.invoiceNumber)}</P_2>`)

  if (invoice.serviceDate) {
    lines.push(`    <P_6>${formatDate(invoice.serviceDate)}</P_6>`)
  }

  const vatGroups = groupLinesByVatRate(lineItems)

  for (const [rateKey, totals] of vatGroups) {
    if (isZeroRateCode(rateKey as VatRateCode)) {
      continue
    }

    const rateNum = parseFloat(rateKey)
    if (isNaN(rateNum)) {
      continue
    }

    if (rateNum === 23 || rateNum === 22) {
      lines.push(`    <P_13_1>${formatAmount(totals.netTotal)}</P_13_1>`)
      lines.push(`    <P_14_1>${formatAmount(totals.vatTotal)}</P_14_1>`)
    } else if (rateNum === 8 || rateNum === 7) {
      lines.push(`    <P_13_2>${formatAmount(totals.netTotal)}</P_13_2>`)
      lines.push(`    <P_14_2>${formatAmount(totals.vatTotal)}</P_14_2>`)
    } else if (rateNum === 5) {
      lines.push(`    <P_13_3>${formatAmount(totals.netTotal)}</P_13_3>`)
      lines.push(`    <P_14_3>${formatAmount(totals.vatTotal)}</P_14_3>`)
    } else if (rateNum === 0) {
      lines.push(`    <P_13_6_1>${formatAmount(totals.netTotal)}</P_13_6_1>`)
    }
  }

  for (const [rateKey, totals] of vatGroups) {
    if (rateKey === 'zw') {
      lines.push(`    <P_13_7>${formatAmount(totals.netTotal)}</P_13_7>`)
    }
  }

  lines.push(`    <P_15>${formatAmount(invoice.grossAmount)}</P_15>`)

  const paymentMethodCode = resolvePaymentMethodCode(invoice.paymentMethod)
  lines.push(`    <Adnotacje>`)
  lines.push(`      <P_16>2</P_16>`)
  lines.push(`      <P_17>2</P_17>`)
  lines.push(`      <P_18>2</P_18>`)
  lines.push(`      <P_18A>2</P_18A>`)
  lines.push(`      <Zwolnienie>`)
  lines.push(`        <P_19N>1</P_19N>`)
  lines.push(`      </Zwolnienie>`)
  lines.push(`      <NoweSrodkiTransportu>`)
  lines.push(`        <P_22N>1</P_22N>`)
  lines.push(`      </NoweSrodkiTransportu>`)
  lines.push(`      <P_23>2</P_23>`)
  lines.push(`      <PMarzy>`)
  lines.push(`        <P_PMarzyN>1</P_PMarzyN>`)
  lines.push(`      </PMarzy>`)
  lines.push(`    </Adnotacje>`)

  lines.push(`    <RodzajFaktury>${INVOICE_TYPE_CODES.VAT}</RodzajFaktury>`)

  if (invoice.dueDate) {
    lines.push(`    <TerminPlatnosci>`)
    lines.push(`      <Termin>${formatDate(invoice.dueDate)}</Termin>`)
    lines.push(`    </TerminPlatnosci>`)
  }

  lines.push(`    <FormaPlatnosci>${paymentMethodCode}</FormaPlatnosci>`)

  if (invoice.sellerBankAccount) {
    const accountCleaned = invoice.sellerBankAccount.replace(/[\s-]/g, '')
    lines.push(`    <RachunekBankowy>`)
    lines.push(`      <NrRB>${escapeXml(accountCleaned)}</NrRB>`)
    lines.push(`    </RachunekBankowy>`)
  }

  for (const lineItem of lineItems) {
    lines.push(buildLineItem(lineItem))
  }

  lines.push('  </Fa>')
  return lines.join('\n')
}

function buildLineItem(lineItem: FmsInvoicingLineItem): string {
  const lines = ['    <FaWiersz>']

  lines.push(`      <NrWierszaFa>${lineItem.lineNumber}</NrWierszaFa>`)

  if (lineItem.unit) {
    lines.push(`      <UZ>${escapeXml(lineItem.unit)}</UZ>`)
  }

  const description = lineItem.description.length > FA3_MAX_LINE_DESCRIPTION_LENGTH
    ? lineItem.description.substring(0, FA3_MAX_LINE_DESCRIPTION_LENGTH)
    : lineItem.description
  lines.push(`      <P_7>${escapeXml(description)}</P_7>`)

  lines.push(`      <P_8A>${escapeXml(lineItem.unit ?? 'szt.')}</P_8A>`)
  lines.push(`      <P_8B>${lineItem.quantity}</P_8B>`)
  lines.push(`      <P_9A>${formatAmount(lineItem.unitPriceNet)}</P_9A>`)

  if (lineItem.vatRateCode && isZeroRateCode(lineItem.vatRateCode)) {
    lines.push(`      <P_12>${escapeXml(lineItem.vatRateCode)}</P_12>`)
  } else {
    lines.push(`      <P_11>${formatAmount(lineItem.netAmount)}</P_11>`)
    lines.push(`      <P_12>${lineItem.vatRate}</P_12>`)
  }

  if (lineItem.gtuCode) {
    lines.push(`      <GTU>${escapeXml(lineItem.gtuCode)}</GTU>`)
  }

  if (lineItem.pkwiuCode) {
    lines.push(`      <PKWiU>${escapeXml(lineItem.pkwiuCode)}</PKWiU>`)
  }

  lines.push('    </FaWiersz>')
  return lines.join('\n')
}

function parseAddress(address: string): { line1: string; line2: string | null } {
  const parts = address.split('\n').map((part) => part.trim()).filter(Boolean)

  if (parts.length === 0) {
    return { line1: address.trim(), line2: null }
  }

  if (parts.length === 1) {
    return { line1: parts[0], line2: null }
  }

  return { line1: parts[0], line2: parts.slice(1).join(', ') }
}

export function buildFa3Xml(invoice: FmsInvoicingInvoice, lineItems: FmsInvoicingLineItem[]): string {
  const xmlParts = [
    `<?xml version="1.0" encoding="${XML_ENCODING}"?>`,
    `<Faktura xmlns="${FA3_NAMESPACE}" xmlns:xsi="${XML_NAMESPACE_XSI}">`,
    buildHeader(),
    buildSeller(invoice),
    buildBuyer(invoice),
    buildInvoiceData(invoice, lineItems),
    '</Faktura>',
  ]

  return xmlParts.join('\n')
}
