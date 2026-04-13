import {
  FA3_NAMESPACE,
  FA3_SCHEMA_VERSION_NUMBER,
  FA3_FORM_CODE,
  FA3_CODING_SYSTEM,
  FA3_SYSTEM_CODE,
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

  // KOR family
  correctedInvoiceId?: string | null
  correctedKsefNumber?: string | null
  correctedInvoiceNumber?: string | null
  correctedInvoiceIssueDate?: Date | string | null
  correctionReason?: string | null
  correctionEffectType?: number | null
  correctionPeriod?: string | null

  // ZAL / KOR_ZAL
  advanceAmount?: string | number | null
  orderTotalGross?: string | number | null
  isFinalAdvance?: boolean | null

  // Foreign currency → PLN conversion
  exchangeRate?: string | number | null
  exchangeRateDate?: Date | string | null

  // Adnotacje flags
  annotCashAccounting?: boolean | null
  annotSelfBilling?: boolean | null
  annotReverseCharge?: boolean | null
  annotSplitPayment?: boolean | null
  annotIntraCommunitySupply?: boolean | null
  annotExportOfServices?: boolean | null
  annotNewTransportMeans?: boolean | null

  offlineMode?: string | null
}

/** Line item fields used by FA(3) XML generation — decoupled from ORM entity */
export interface LineItemForXml {
  lineNumber: number
  description: string
  quantity: string | number
  unit?: string | null
  unitPriceNet: string | number
  /**
   * Raw rate code. Accepts the FA(3) P_12 enum values (`23`/`22`/`8`/`7`/`5`/
   * `4`/`3`/`0 KR`/`0 WDT`/`0 EX`/`zw`/`oo`/`np I`/`np II`) and a few
   * conveniences (`0` → `0 KR`, `np` → `np I`).
   */
  vatRate: string
  vatRateCode?: string | null
  netAmount: string | number
  vatAmount: string | number
  gtuCode?: string | null
  /** StanPrzed flag — if true, values are written with opposite sign (KOR method 2). */
  isPreState?: boolean | null
}

/** Order line (Zamowienie/ZamowienieWiersz) for ZAL + KOR_ZAL. */
export interface OrderLineForXml {
  lineNumber: number
  description: string
  unit?: string | null
  quantity: string | number
  netAmount: string | number
  vatAmount: string | number
  vatRate: string
}

/** Reference to a prior advance invoice (FakturaZaliczkowa/*). */
export interface AdvanceRefForXml {
  ksefNumber?: string | null
  invoiceNumber?: string | null
  /** Stored for the application's own bookkeeping — not emitted in FA(3) XML. */
  issueDate?: Date | string | null
  /** Stored for the application's own bookkeeping — not emitted in FA(3) XML. */
  advanceAmount?: string | number | null
}

export type BuildFa3XmlOptions = {
  /**
   * Back-compat: callers that have a KSeF number in hand but have not yet
   * migrated to persisting `correctedKsefNumber` on the invoice can still
   * pass it through here — it takes precedence over the invoice field.
   */
  correctedKsefNumber?: string | null
  orderLines?: OrderLineForXml[]
  advanceRefs?: AdvanceRefForXml[]
}

// ── Helpers ──

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

function toNumber(value: string | number | null | undefined, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback
  const n = typeof value === 'number' ? value : parseFloat(value)
  return Number.isFinite(n) ? n : fallback
}

function formatAmount(amount: string | number): string {
  return toNumber(amount).toFixed(2)
}

function flagValue(flag: boolean | null | undefined): '1' | '2' {
  return flag ? '1' : '2'
}

/**
 * FA(3) v1-0E payment method codes (TFormaPlatnosci).
 * The schema uses simple numeric codes — the full legend is in the reference
 * implementations (see ksef-client-csharp). We normalize common English/
 * Polish names to the canonical code.
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

// ── VAT rate → slot mapping ──

/**
 * Slot identifiers match the FA(3) v1-0E schema sequence of P_13_x / P_14_x
 * elements under <Fa>. Each slot carries a net total (P_13_x) and, for
 * slots 1..5, a VAT total (P_14_x) plus an optional PLN-converted variant
 * (P_14_xW) when the invoice is in a foreign currency.
 *
 * Slots 6_1..11 have only a net total — no P_14.
 */
type VatSlot =
  | 'std'           // P_13_1 + P_14_1 + P_14_1W — 23% / 22% standard
  | 'red1'          // P_13_2 + P_14_2 + P_14_2W — 8% / 7%
  | 'red2'          // P_13_3 + P_14_3 + P_14_3W — 5%
  | 'taxi'          // P_13_4 + P_14_4 + P_14_4W — taxi ryczałt (4% / 3%)
  | 'oss'           // P_13_5 + P_14_5 — OSS (dział XII rozdz. 6a)
  | 'zero_kr'       // P_13_6_1 — 0% domestic (ex. WDT/export)
  | 'zero_wdt'      // P_13_6_2 — 0% WDT (intra-EU supply)
  | 'zero_ex'       // P_13_6_3 — 0% export
  | 'exempt'        // P_13_7 — zwolnione
  | 'out_of_scope'  // P_13_8 — poza terytorium kraju (non art. 100 ust. 1 pkt 4)
  | 'services_100'  // P_13_9 — art. 100 ust. 1 pkt 4 services
  | 'reverse'       // P_13_10 — odwrotne obciążenie (reverse charge)
  | 'margin'        // P_13_11 — procedura marży

/**
 * P_12 values allowed by `TStawkaPodatku`, in the exact strings KSeF expects.
 */
type P12Value =
  | '23' | '22' | '8' | '7' | '5' | '4' | '3'
  | '0 KR' | '0 WDT' | '0 EX'
  | 'zw' | 'oo'
  | 'np I' | 'np II'

/**
 * Parsed view of a VAT rate code: the FA(3) aggregate slot plus the P_12
 * enum value to write on each <FaWiersz>. Returns null when we can't map
 * the input to anything valid — callers should treat that as an error.
 */
interface VatResolution {
  slot: VatSlot
  p12: P12Value
}

function resolveVatRate(raw: string | null | undefined): VatResolution | null {
  if (raw == null) return null
  const trimmed = String(raw).trim()
  if (!trimmed) return null
  const normalized = trimmed.toLowerCase().replace(/\s+/g, ' ')

  switch (normalized) {
    case '23': return { slot: 'std', p12: '23' }
    case '22': return { slot: 'std', p12: '22' }
    case '8':  return { slot: 'red1', p12: '8' }
    case '7':  return { slot: 'red1', p12: '7' }
    case '5':  return { slot: 'red2', p12: '5' }
    case '4':  return { slot: 'taxi', p12: '4' }
    case '3':  return { slot: 'taxi', p12: '3' }

    // Zero-rated variants. Bare '0' defaults to domestic (0 KR).
    case '0':
    case '0 kr':
    case '0kr':
    case '0_kr':
      return { slot: 'zero_kr', p12: '0 KR' }
    case '0 wdt':
    case '0wdt':
    case '0_wdt':
      return { slot: 'zero_wdt', p12: '0 WDT' }
    case '0 ex':
    case '0ex':
    case '0_ex':
      return { slot: 'zero_ex', p12: '0 EX' }

    case 'zw':
      return { slot: 'exempt', p12: 'zw' }
    case 'oo':
      return { slot: 'reverse', p12: 'oo' }

    // `np` / `np I` → services supplied outside Poland (not art. 100 ust. 1 pkt 4)
    case 'np':
    case 'np i':
    case 'np_i':
      return { slot: 'out_of_scope', p12: 'np I' }
    // `np II` → services per art. 100 ust. 1 pkt 4
    case 'np ii':
    case 'np_ii':
      return { slot: 'services_100', p12: 'np II' }

    default:
      return null
  }
}

interface SlotTotals {
  netTotal: number
  vatTotal: number
}

function groupLinesBySlot(lineItems: LineItemForXml[]): Map<VatSlot, SlotTotals> {
  const groups = new Map<VatSlot, SlotTotals>()
  for (const line of lineItems) {
    const raw = line.vatRateCode ?? line.vatRate
    const resolved = resolveVatRate(raw)
    if (!resolved) continue
    const sign = line.isPreState ? -1 : 1
    const net = toNumber(line.netAmount) * sign
    const vat = toNumber(line.vatAmount) * sign
    const existing = groups.get(resolved.slot) ?? { netTotal: 0, vatTotal: 0 }
    existing.netTotal += net
    existing.vatTotal += vat
    groups.set(resolved.slot, existing)
  }
  return groups
}

// ── Fa sub-builders ──

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

function parseAddress(address: string): { line1: string; line2: string | null } {
  const parts = address.split('\n').map((part) => part.trim()).filter(Boolean)
  if (parts.length === 0) return { line1: address.trim(), line2: null }
  if (parts.length === 1) return { line1: parts[0], line2: null }
  return { line1: parts[0], line2: parts.slice(1).join(', ') }
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

  const addressParts = invoice.sellerAddress
    ? parseAddress(invoice.sellerAddress)
    : { line1: 'Brak adresu', line2: null }
  lines.push('    <Adres>')
  lines.push(`      <KodKraju>${escapeXml(countryCode)}</KodKraju>`)
  lines.push(`      <AdresL1>${escapeXml(addressParts.line1)}</AdresL1>`)
  if (addressParts.line2) lines.push(`      <AdresL2>${escapeXml(addressParts.line2)}</AdresL2>`)
  lines.push('    </Adres>')

  lines.push('  </Podmiot1>')
  return lines.join('\n')
}

function buildBuyer(invoice: InvoiceForXml): string {
  const lines = ['  <Podmiot2>']

  const countryCode = invoice.buyerCountryCode ?? COUNTRY_CODE_POLAND
  const isSimplified = invoice.invoiceType === 'UPR'

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
  // Schema: Nazwa is optional; for UPR we suppress it per Art. 106e ust. 5 pkt 3.
  if (!isSimplified && invoice.buyerName) {
    lines.push(`      <Nazwa>${escapeXml(invoice.buyerName)}</Nazwa>`)
  }
  lines.push('    </DaneIdentyfikacyjne>')

  if (!isSimplified && invoice.buyerAddress) {
    const addressParts = parseAddress(invoice.buyerAddress)
    lines.push('    <Adres>')
    lines.push(`      <KodKraju>${escapeXml(countryCode)}</KodKraju>`)
    lines.push(`      <AdresL1>${escapeXml(addressParts.line1)}</AdresL1>`)
    if (addressParts.line2) lines.push(`      <AdresL2>${escapeXml(addressParts.line2)}</AdresL2>`)
    lines.push('    </Adres>')
  }

  // JST + GV flags are mandatory in Podmiot2. Default to 2 (no).
  lines.push('    <JST>2</JST>')
  lines.push('    <GV>2</GV>')

  lines.push('  </Podmiot2>')
  return lines.join('\n')
}

function buildAdnotacje(invoice: InvoiceForXml, lineItems: LineItemForXml[]): string {
  const hasExempt = lineItems.some((l) => {
    const code = l.vatRateCode ?? l.vatRate
    const resolved = resolveVatRate(code)
    return resolved?.slot === 'exempt'
  })

  const lines = ['    <Adnotacje>']

  // P_16: cash accounting (metoda kasowa)
  lines.push(`      <P_16>${flagValue(invoice.annotCashAccounting)}</P_16>`)
  // P_17: self-billing
  lines.push(`      <P_17>${flagValue(invoice.annotSelfBilling)}</P_17>`)
  // P_18: reverse charge (full invoice-level flag)
  lines.push(`      <P_18>${flagValue(invoice.annotReverseCharge)}</P_18>`)
  // P_18A: split payment (MPP)
  lines.push(`      <P_18A>${flagValue(invoice.annotSplitPayment)}</P_18A>`)

  // Zwolnienie subtree — choice between (P_19 + P_19A) or P_19N.
  lines.push('      <Zwolnienie>')
  if (hasExempt) {
    lines.push('        <P_19>1</P_19>')
    lines.push('        <P_19A>art. 43 ust. 1</P_19A>')
  } else {
    lines.push('        <P_19N>1</P_19N>')
  }
  lines.push('      </Zwolnienie>')

  // NoweSrodkiTransportu — we do not yet model NowySrodekTransportu details,
  // so we always emit the "no" branch. A future pass should collect vehicle
  // data before setting the positive branch.
  lines.push('      <NoweSrodkiTransportu>')
  lines.push('        <P_22N>1</P_22N>')
  lines.push('      </NoweSrodkiTransportu>')

  // P_23: simplified procedure / intra-community triangular supply
  lines.push(`      <P_23>${flagValue(invoice.annotIntraCommunitySupply)}</P_23>`)

  // PMarzy — margin procedure not yet modeled; always emit the "no" branch.
  lines.push('      <PMarzy>')
  lines.push('        <P_PMarzyN>1</P_PMarzyN>')
  lines.push('      </PMarzy>')

  lines.push('    </Adnotacje>')
  return lines.join('\n')
}

function buildVatTotals(
  invoice: InvoiceForXml,
  lineItems: LineItemForXml[],
): string[] {
  const lines: string[] = []
  const groups = groupLinesBySlot(lineItems)

  const rate = toNumber(invoice.exchangeRate, 0)
  const isForeign = Boolean(invoice.currencyCode && invoice.currencyCode !== 'PLN')
  const toPln = (amount: number): number => (isForeign && rate > 0 ? amount * rate : amount)

  const emitPairedSlot = (
    slot: VatSlot,
    netField: string,
    vatField: string,
    vatWField?: string,
  ) => {
    const totals = groups.get(slot)
    if (!totals) return
    lines.push(`    <${netField}>${formatAmount(totals.netTotal)}</${netField}>`)
    lines.push(`    <${vatField}>${formatAmount(totals.vatTotal)}</${vatField}>`)
    if (vatWField && isForeign && rate > 0) {
      lines.push(`    <${vatWField}>${formatAmount(toPln(totals.vatTotal))}</${vatWField}>`)
    }
  }

  const emitNetOnlySlot = (slot: VatSlot, netField: string) => {
    const totals = groups.get(slot)
    if (!totals) return
    lines.push(`    <${netField}>${formatAmount(totals.netTotal)}</${netField}>`)
  }

  // Strict FA(3) v1-0E sequence.
  emitPairedSlot('std',  'P_13_1', 'P_14_1', 'P_14_1W')
  emitPairedSlot('red1', 'P_13_2', 'P_14_2', 'P_14_2W')
  emitPairedSlot('red2', 'P_13_3', 'P_14_3', 'P_14_3W')
  emitPairedSlot('taxi', 'P_13_4', 'P_14_4', 'P_14_4W')
  // P_13_5 / P_14_5 — no P_14_5W variant in the schema.
  const oss = groups.get('oss')
  if (oss) {
    lines.push(`    <P_13_5>${formatAmount(oss.netTotal)}</P_13_5>`)
    lines.push(`    <P_14_5>${formatAmount(oss.vatTotal)}</P_14_5>`)
  }
  emitNetOnlySlot('zero_kr',       'P_13_6_1')
  emitNetOnlySlot('zero_wdt',      'P_13_6_2')
  emitNetOnlySlot('zero_ex',       'P_13_6_3')
  emitNetOnlySlot('exempt',        'P_13_7')
  emitNetOnlySlot('out_of_scope',  'P_13_8')
  emitNetOnlySlot('services_100',  'P_13_9')
  emitNetOnlySlot('reverse',       'P_13_10')
  emitNetOnlySlot('margin',        'P_13_11')

  return lines
}

function buildKorSection(invoice: InvoiceForXml, options?: BuildFa3XmlOptions): string[] {
  const lines: string[] = []

  if (invoice.correctionReason) {
    lines.push(`    <PrzyczynaKorekty>${escapeXml(invoice.correctionReason)}</PrzyczynaKorekty>`)
  }
  const typKorekty = invoice.correctionEffectType
  if (typKorekty === 1 || typKorekty === 2 || typKorekty === 3) {
    lines.push(`    <TypKorekty>${typKorekty}</TypKorekty>`)
  }

  const ksefRef = options?.correctedKsefNumber ?? invoice.correctedKsefNumber ?? null
  // NrFaKorygowanej (seller's original number) is required in DaneFaKorygowanej.
  // If caller only supplied a KSeF number, we repeat it there as a fallback —
  // callers should persist the original number whenever possible.
  const sellerNumberRef = invoice.correctedInvoiceNumber
    ?? ksefRef
    ?? 'UNKNOWN'
  const issueDate = invoice.correctedInvoiceIssueDate ?? invoice.invoiceDate

  lines.push('    <DaneFaKorygowanej>')
  lines.push(`      <DataWystFaKorygowanej>${formatDate(issueDate)}</DataWystFaKorygowanej>`)
  lines.push(`      <NrFaKorygowanej>${escapeXml(sellerNumberRef)}</NrFaKorygowanej>`)
  if (ksefRef) {
    lines.push('      <NrKSeF>1</NrKSeF>')
    lines.push(`      <NrKSeFFaKorygowanej>${escapeXml(ksefRef)}</NrKSeFFaKorygowanej>`)
  } else {
    lines.push('      <NrKSeFN>1</NrKSeFN>')
  }
  lines.push('    </DaneFaKorygowanej>')

  if (invoice.correctionPeriod) {
    lines.push(`    <OkresFaKorygowanej>${escapeXml(invoice.correctionPeriod)}</OkresFaKorygowanej>`)
  }

  return lines
}

function buildAdvanceRefs(refs: AdvanceRefForXml[]): string[] {
  const lines: string[] = []
  for (const ref of refs) {
    lines.push('    <FakturaZaliczkowa>')
    if (ref.ksefNumber) {
      lines.push(`      <NrKSeFFaZaliczkowej>${escapeXml(ref.ksefNumber)}</NrKSeFFaZaliczkowej>`)
    } else if (ref.invoiceNumber) {
      lines.push('      <NrKSeFZN>1</NrKSeFZN>')
      lines.push(`      <NrFaZaliczkowej>${escapeXml(ref.invoiceNumber)}</NrFaZaliczkowej>`)
    }
    lines.push('    </FakturaZaliczkowa>')
  }
  return lines
}

function buildOrderSection(invoice: InvoiceForXml, orderLines: OrderLineForXml[]): string[] {
  const lines: string[] = ['    <Zamowienie>']
  if (invoice.orderTotalGross !== null && invoice.orderTotalGross !== undefined) {
    lines.push(`      <WartoscZamowienia>${formatAmount(invoice.orderTotalGross)}</WartoscZamowienia>`)
  }
  for (const ol of orderLines) {
    lines.push('      <ZamowienieWiersz>')
    lines.push(`        <NrWierszaZam>${ol.lineNumber}</NrWierszaZam>`)
    const desc = ol.description.length > FA3_MAX_LINE_DESCRIPTION_LENGTH
      ? ol.description.substring(0, FA3_MAX_LINE_DESCRIPTION_LENGTH)
      : ol.description
    lines.push(`        <P_7Z>${escapeXml(desc)}</P_7Z>`)
    if (ol.unit) lines.push(`        <P_8AZ>${escapeXml(ol.unit)}</P_8AZ>`)
    lines.push(`        <P_8BZ>${ol.quantity}</P_8BZ>`)
    lines.push(`        <P_11NettoZ>${formatAmount(ol.netAmount)}</P_11NettoZ>`)
    lines.push(`        <P_11VatZ>${formatAmount(ol.vatAmount)}</P_11VatZ>`)
    const resolvedRate = resolveVatRate(ol.vatRate)
    const p12z = resolvedRate ? resolvedRate.p12 : escapeXml(ol.vatRate)
    lines.push(`        <P_12Z>${p12z}</P_12Z>`)
    lines.push('      </ZamowienieWiersz>')
  }
  lines.push('    </Zamowienie>')
  return lines
}

function buildLineItem(lineItem: LineItemForXml): string {
  const lines = ['    <FaWiersz>']

  lines.push(`      <NrWierszaFa>${lineItem.lineNumber}</NrWierszaFa>`)

  const description = lineItem.description.length > FA3_MAX_LINE_DESCRIPTION_LENGTH
    ? lineItem.description.substring(0, FA3_MAX_LINE_DESCRIPTION_LENGTH)
    : lineItem.description
  lines.push(`      <P_7>${escapeXml(description)}</P_7>`)

  if (lineItem.unit) {
    lines.push(`      <P_8A>${escapeXml(lineItem.unit)}</P_8A>`)
  }

  lines.push(`      <P_8B>${lineItem.quantity}</P_8B>`)
  lines.push(`      <P_9A>${formatAmount(lineItem.unitPriceNet)}</P_9A>`)

  const netForXml = lineItem.isPreState ? -toNumber(lineItem.netAmount) : toNumber(lineItem.netAmount)
  lines.push(`      <P_11>${netForXml.toFixed(2)}</P_11>`)

  // P_12 must be one of the TStawkaPodatku literal values. If the caller
  // sent something unparseable, skip the element — it's minOccurs="0" so the
  // invoice can still validate.
  const rawRate = lineItem.vatRateCode ?? lineItem.vatRate
  const resolved = resolveVatRate(rawRate)
  if (resolved) {
    lines.push(`      <P_12>${resolved.p12}</P_12>`)
  }

  if (lineItem.gtuCode) {
    lines.push(`      <GTU>${escapeXml(lineItem.gtuCode)}</GTU>`)
  }

  if (lineItem.isPreState) {
    lines.push('      <StanPrzed>1</StanPrzed>')
  }

  lines.push('    </FaWiersz>')
  return lines.join('\n')
}

function buildPayment(invoice: InvoiceForXml): string {
  const lines = ['    <Platnosc>']

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

/**
 * Builds the `<Fa>` content in the exact sequence required by the XSD.
 * The schema order (see schemat_FA(3)_v1-0E.xsd, TFa sequence) is, in order:
 *
 * 1.  KodWaluty, P_1, P_1M?, P_2, WZ (0..many), P_6 or OkresFa (choice)
 * 2.  P_13_x / P_14_x / P_14_xW block
 * 3.  P_15 (gross)
 * 4.  KursWalutyZ?
 * 5.  Adnotacje (required)
 * 6.  RodzajFaktury (required)
 * 7.  KOR sequence (only when RodzajFaktury is KOR|KOR_ZAL|KOR_ROZ):
 *       PrzyczynaKorekty?, TypKorekty?, DaneFaKorygowanej (1..50000),
 *       OkresFaKorygowanej?, NrFaKorygowany?, Podmiot1K?, Podmiot2K (0..101),
 *       P_15ZK?, KursWalutyZK?
 * 8.  ZaliczkaCzesciowa (0..31)
 * 9.  FP?, TP?, DodatkowyOpis (0..many)
 * 10. FakturaZaliczkowa (0..100)
 * 11. ZwrotAkcyzy?
 * 12. FaWiersz (0..10000)
 * 13. Rozliczenie?
 * 14. Platnosc?
 * 15. WarunkiTransakcji?
 * 16. Zamowienie?
 */
function buildInvoiceData(
  invoice: InvoiceForXml,
  lineItems: LineItemForXml[],
  options?: BuildFa3XmlOptions,
): string {
  const lines: string[] = ['  <Fa>']
  const invoiceType = invoice.invoiceType ?? INVOICE_TYPE_CODES.VAT
  const isCorrection = invoiceType === 'KOR' || invoiceType === 'KOR_ZAL' || invoiceType === 'KOR_ROZ'
  const isAdvance = invoiceType === 'ZAL' || invoiceType === 'KOR_ZAL'
  const isSettlement = invoiceType === 'ROZ' || invoiceType === 'KOR_ROZ'

  lines.push(`    <KodWaluty>${escapeXml(invoice.currencyCode)}</KodWaluty>`)
  lines.push(`    <P_1>${formatDate(invoice.invoiceDate)}</P_1>`)
  lines.push(`    <P_2>${escapeXml(invoice.invoiceNumber)}</P_2>`)

  if (invoice.serviceDate) {
    lines.push(`    <P_6>${formatDate(invoice.serviceDate)}</P_6>`)
  }

  // VAT totals block.
  lines.push(...buildVatTotals(invoice, lineItems))

  // P_15 — total gross (or advance amount for ZAL invoices).
  const p15 = isAdvance && invoice.advanceAmount != null
    ? formatAmount(invoice.advanceAmount)
    : formatAmount(invoice.grossAmount)
  lines.push(`    <P_15>${p15}</P_15>`)

  lines.push(buildAdnotacje(invoice, lineItems))

  lines.push(`    <RodzajFaktury>${invoiceType}</RodzajFaktury>`)

  // KOR block — sequence must come directly after RodzajFaktury.
  if (isCorrection) {
    lines.push(...buildKorSection(invoice, options))
  }

  // FakturaZaliczkowa references — required on ROZ/KOR_ROZ, optional on
  // final-advance ZAL. Must come BEFORE FaWiersz per schema ordering.
  const advanceRefs = options?.advanceRefs ?? []
  if (isSettlement || (isAdvance && invoice.isFinalAdvance)) {
    lines.push(...buildAdvanceRefs(advanceRefs))
  }

  // Line items. ZAL is allowed to omit FaWiersz entirely (all detail lives
  // in Zamowienie). KOR can be collective with no FaWiersz. We skip emission
  // when the caller sends an empty array and the type allows it.
  for (const lineItem of lineItems) {
    lines.push(buildLineItem(lineItem))
  }

  // Platnosc — after FaWiersz, before Zamowienie.
  lines.push(buildPayment(invoice))

  // Zamowienie — ZAL / KOR_ZAL, at the end of the Fa sequence.
  if (isAdvance && options?.orderLines && options.orderLines.length > 0) {
    lines.push(...buildOrderSection(invoice, options.orderLines))
  }

  lines.push('  </Fa>')
  return lines.join('\n')
}

export function buildFa3Xml(
  invoice: InvoiceForXml,
  lineItems: LineItemForXml[],
  options?: BuildFa3XmlOptions,
): string {
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
