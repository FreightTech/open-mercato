import {
  FA3_NAMESPACE,
  FA3_SCHEMA_VERSION_NUMBER,
  FA3_FORM_CODE,
  FA3_CODING_SYSTEM,
  FA3_SYSTEM_CODE,
  XML_NAMESPACE_XSI,
  XML_ENCODING,
  COUNTRY_CODE_POLAND,
  INVOICE_TYPE_CODES,
  FA3_MAX_LINE_DESCRIPTION_LENGTH,
} from './fa3-schema'

/** Invoice fields used by FA(3) XML generation — decoupled from ORM entity */
export interface InvoiceForXml {
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
  grossAmount: string | number
  currencyCode: string
  paymentMethod?: string | null
  invoiceType?: string | null
  correctedInvoiceId?: string | null
  correctionReason?: string | null
  offlineMode?: string | null
}

/** Line item fields used by FA(3) XML generation — decoupled from ORM entity */
export interface LineItemForXml {
  lineNumber: number
  description: string
  quantity: string | number
  unit?: string | null
  unitPriceNet: string | number
  vatRate: string
  vatRateCode?: string | null
  netAmount: string | number
  vatAmount: string | number
  gtuCode?: string | null
}

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

/**
 * FA(3) v1-0E payment method codes.
 * 1=Cash, 2=Card, 3=Voucher, 4=Check, 5=Credit, 6=Bank Transfer, 7=Mobile
 */
function resolvePaymentMethodCode(paymentMethod: string | null | undefined): string {
  if (!paymentMethod) return '6' // default: bank transfer

  const normalized = paymentMethod.toLowerCase().trim()

  if (normalized === 'transfer' || normalized === 'przelew' || normalized === 'bank_transfer') return '6'
  if (normalized === 'cash' || normalized === 'gotowka' || normalized === 'gotówka') return '1'
  if (normalized === 'card' || normalized === 'karta') return '2'
  if (normalized === 'check' || normalized === 'czek') return '4'
  if (normalized === 'credit' || normalized === 'kredyt' || normalized === 'kompensata') return '5'

  return '6'
}

function groupLinesByVatRate(lineItems: LineItemForXml[]): Map<string, { netTotal: number; vatTotal: number }> {
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

function buildHeader(): string {
  return [
    '  <Naglowek>',
    `    <KodFormularza kodSystemowy="${FA3_SYSTEM_CODE}" wersjaSchemy="${FA3_SCHEMA_VERSION_NUMBER}">${FA3_FORM_CODE}</KodFormularza>`,
    `    <WariantFormularza>3</WariantFormularza>`,
    `    <DataWytworzeniaFa>${new Date().toISOString()}</DataWytworzeniaFa>`,
    `    <SystemInfo>${FA3_CODING_SYSTEM}</SystemInfo>`,
    '  </Naglowek>',
  ].join('\n')
}

function buildSeller(invoice: InvoiceForXml): string {
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

  // Adres is required for Podmiot1 per XSD
  const addressParts = invoice.sellerAddress
    ? parseAddress(invoice.sellerAddress)
    : { line1: 'Brak adresu', line2: null }
  lines.push('    <Adres>')
  lines.push(`      <KodKraju>${escapeXml(countryCode)}</KodKraju>`)
  lines.push(`      <AdresL1>${escapeXml(addressParts.line1)}</AdresL1>`)
  if (addressParts.line2) {
    lines.push(`      <AdresL2>${escapeXml(addressParts.line2)}</AdresL2>`)
  }
  lines.push('    </Adres>')

  lines.push('  </Podmiot1>')
  return lines.join('\n')
}

function buildBuyer(invoice: InvoiceForXml): string {
  const lines = ['  <Podmiot2>']

  const buyerName = escapeXml(invoice.buyerName ?? '')
  const countryCode = invoice.buyerCountryCode ?? COUNTRY_CODE_POLAND

  // DaneIdentyfikacyjne — contains ID choice + Nazwa (per TPodmiot2 in XSD)
  lines.push('    <DaneIdentyfikacyjne>')
  if (invoice.buyerTaxId) {
    const buyerNip = invoice.buyerTaxId.replace(/[\s-]/g, '')
    if (countryCode === COUNTRY_CODE_POLAND) {
      lines.push(`      <NIP>${escapeXml(buyerNip)}</NIP>`)
    } else {
      lines.push(`      <KodUE>${escapeXml(countryCode)}</KodUE>`)
      lines.push(`      <NrVatUE>${escapeXml(buyerNip)}</NrVatUE>`)
    }
  } else {
    lines.push('      <BrakID>1</BrakID>')
  }
  // Nazwa inside DaneIdentyfikacyjne (TPodmiot2 sequence: choice + optional Nazwa)
  if (buyerName) {
    lines.push(`      <Nazwa>${buyerName}</Nazwa>`)
  }
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

  // Required flags
  lines.push('    <JST>2</JST>')
  lines.push('    <GV>2</GV>')

  lines.push('  </Podmiot2>')
  return lines.join('\n')
}

function buildAdnotacje(lineItems: LineItemForXml[]): string {
  const hasExempt = lineItems.some((l) => {
    const code = l.vatRateCode ?? l.vatRate
    return code === 'zw'
  })

  const lines = ['    <Adnotacje>']

  // P_16: cash method flag (1=yes, 2=no) — always 2 for standard invoices
  lines.push('      <P_16>2</P_16>')
  // P_17: self-billing flag (1=yes, 2=no)
  lines.push('      <P_17>2</P_17>')
  // P_18: reverse charge flag (1=yes, 2=no)
  lines.push('      <P_18>2</P_18>')
  // P_18A: split payment flag (1=yes, 2=no)
  lines.push('      <P_18A>2</P_18A>')

  // Zwolnienie: tax exemption section
  lines.push('      <Zwolnienie>')
  if (hasExempt) {
    lines.push('        <P_19>1</P_19>')
    lines.push('        <P_19A>art. 43 ust. 1</P_19A>')
  } else {
    lines.push('        <P_19N>1</P_19N>')
  }
  lines.push('      </Zwolnienie>')

  // NoweSrodkiTransportu: new transport means section
  lines.push('      <NoweSrodkiTransportu>')
  lines.push('        <P_22N>1</P_22N>')
  lines.push('      </NoweSrodkiTransportu>')

  // P_23: simplified procedure flag (1=yes, 2=no)
  lines.push('      <P_23>2</P_23>')

  // PMarzy: margin procedure section
  lines.push('      <PMarzy>')
  lines.push('        <P_PMarzyN>1</P_PMarzyN>')
  lines.push('      </PMarzy>')

  lines.push('    </Adnotacje>')
  return lines.join('\n')
}

function buildInvoiceData(invoice: InvoiceForXml, lineItems: LineItemForXml[], options?: BuildFa3XmlOptions): string {
  const lines = ['  <Fa>']

  lines.push(`    <KodWaluty>${escapeXml(invoice.currencyCode)}</KodWaluty>`)
  lines.push(`    <P_1>${formatDate(invoice.invoiceDate)}</P_1>`)
  lines.push(`    <P_2>${escapeXml(invoice.invoiceNumber)}</P_2>`)

  if (invoice.serviceDate) {
    lines.push(`    <P_6>${formatDate(invoice.serviceDate)}</P_6>`)
  }

  // VAT rate groups (P_13_x = net, P_14_x = tax)
  const vatGroups = groupLinesByVatRate(lineItems)

  for (const [rateKey, totals] of vatGroups) {
    const rateNum = parseFloat(rateKey)
    if (isNaN(rateNum)) {
      // Special codes: zw, oo, np
      if (rateKey === 'zw') {
        lines.push(`    <P_13_8>${formatAmount(totals.netTotal)}</P_13_8>`)
      } else if (rateKey === 'oo') {
        lines.push(`    <P_13_9>${formatAmount(totals.netTotal)}</P_13_9>`)
      } else if (rateKey === 'np') {
        lines.push(`    <P_13_10>${formatAmount(totals.netTotal)}</P_13_10>`)
      }
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
    } else if (rateNum === 3 || rateNum === 4) {
      lines.push(`    <P_13_4>${formatAmount(totals.netTotal)}</P_13_4>`)
      lines.push(`    <P_14_4>${formatAmount(totals.vatTotal)}</P_14_4>`)
    } else if (rateNum === 0) {
      lines.push(`    <P_13_5>${formatAmount(totals.netTotal)}</P_13_5>`)
      lines.push(`    <P_14_5>${formatAmount(totals.vatTotal)}</P_14_5>`)
    }
  }

  // P_15 = total gross amount (kwota naleznosci ogolem)
  lines.push(`    <P_15>${formatAmount(invoice.grossAmount)}</P_15>`)

  // Adnotacje (mandatory) — contains P_16 flag and other required annotation flags
  lines.push(buildAdnotacje(lineItems))

  lines.push(`    <RodzajFaktury>${invoice.invoiceType ?? INVOICE_TYPE_CODES.VAT}</RodzajFaktury>`)

  // Correction invoice elements
  if (invoice.invoiceType === 'KOR' || invoice.invoiceType === 'KOR_ZAL' || invoice.invoiceType === 'KOR_ROZ') {
    if (options?.correctedKsefNumber) {
      lines.push(`    <NrFaKorygowanej>${escapeXml(options.correctedKsefNumber)}</NrFaKorygowanej>`)
    }
    if (invoice.correctionReason) {
      lines.push(`    <PrzyczynaKorekty>${escapeXml(invoice.correctionReason)}</PrzyczynaKorekty>`)
    }
    lines.push(`    <TypKorekty>1</TypKorekty>`)
  }

  // Line items — FA(3) v1-0E uses P_ field names per XSD
  for (const lineItem of lineItems) {
    lines.push(buildLineItem(lineItem))
  }

  // Platnosc — payment terms section (contains TerminPlatnosci, FormaPlatnosci, RachunekBankowy)
  lines.push(buildPayment(invoice))

  // Offline mode annotation
  if (invoice.offlineMode && invoice.offlineMode !== 'online') {
    lines.push('    <DodatkowyOpis>')
    lines.push('      <Klucz>OfflineMode</Klucz>')
    lines.push(`      <Wartosc>${escapeXml(invoice.offlineMode)}</Wartosc>`)
    lines.push('    </DodatkowyOpis>')
  }

  lines.push('  </Fa>')
  return lines.join('\n')
}

function buildPayment(invoice: InvoiceForXml): string {
  const lines = ['    <Platnosc>']

  // TerminPlatnosci — complexType with optional Termin date
  if (invoice.dueDate) {
    lines.push('      <TerminPlatnosci>')
    lines.push(`        <Termin>${formatDate(invoice.dueDate)}</Termin>`)
    lines.push('      </TerminPlatnosci>')
  }

  const paymentMethodCode = resolvePaymentMethodCode(invoice.paymentMethod)
  lines.push(`      <FormaPlatnosci>${paymentMethodCode}</FormaPlatnosci>`)

  if (invoice.sellerBankAccount) {
    const accountCleaned = invoice.sellerBankAccount.replace(/[\s-]/g, '')
    lines.push('      <RachunekBankowy>')
    lines.push(`        <NrRB>${escapeXml(accountCleaned)}</NrRB>`)
    lines.push('      </RachunekBankowy>')
  }

  lines.push('    </Platnosc>')
  return lines.join('\n')
}

function buildLineItem(lineItem: LineItemForXml): string {
  const lines = ['    <FaWiersz>']

  // NrWierszaFa — line number
  lines.push(`      <NrWierszaFa>${lineItem.lineNumber}</NrWierszaFa>`)

  // P_7 — item description (nazwa towaru/uslugi)
  const description = lineItem.description.length > FA3_MAX_LINE_DESCRIPTION_LENGTH
    ? lineItem.description.substring(0, FA3_MAX_LINE_DESCRIPTION_LENGTH)
    : lineItem.description
  lines.push(`      <P_7>${escapeXml(description)}</P_7>`)

  // P_8A — unit of measure (miara)
  if (lineItem.unit) {
    lines.push(`      <P_8A>${escapeXml(lineItem.unit)}</P_8A>`)
  }

  // P_8B — quantity (ilosc)
  lines.push(`      <P_8B>${lineItem.quantity}</P_8B>`)

  // P_9A — unit price net (cena jednostkowa netto)
  lines.push(`      <P_9A>${formatAmount(lineItem.unitPriceNet)}</P_9A>`)

  // P_11 — net value (wartosc sprzedazy netto)
  lines.push(`      <P_11>${formatAmount(lineItem.netAmount)}</P_11>`)

  // P_12 — tax rate (stawka podatku) per TStawkaPodatku enum
  const vatRateCode = lineItem.vatRateCode ?? lineItem.vatRate
  if (vatRateCode === 'zw' || vatRateCode === 'oo') {
    lines.push(`      <P_12>${escapeXml(vatRateCode)}</P_12>`)
  } else if (vatRateCode === 'np') {
    lines.push(`      <P_12>np I</P_12>`)
  } else {
    const rateNum = parseFloat(vatRateCode)
    lines.push(`      <P_12>${rateNum}</P_12>`)
  }

  // GTU — goods/services code (optional)
  if (lineItem.gtuCode) {
    lines.push(`      <GTU>${escapeXml(lineItem.gtuCode)}</GTU>`)
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

export type BuildFa3XmlOptions = {
  correctedKsefNumber?: string | null
}

export function buildFa3Xml(invoice: InvoiceForXml, lineItems: LineItemForXml[], options?: BuildFa3XmlOptions): string {
  const xmlParts = [
    `<?xml version="1.0" encoding="${XML_ENCODING}"?>`,
    `<Faktura xmlns="${FA3_NAMESPACE}">`,
    buildHeader(),
    buildSeller(invoice),
    buildBuyer(invoice),
    buildInvoiceData(invoice, lineItems, options),
    '</Faktura>',
  ]

  return xmlParts.join('\n')
}
