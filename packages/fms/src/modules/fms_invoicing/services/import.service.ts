import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { FmsInvoicingInvoice, FmsInvoicingLineItem } from '../data/entities'
import type { InvoiceDirection, InvoiceSourceType, VatRateCode } from '../data/types'

interface ImportContext {
  tenantId: string
  organizationId: string
  createdBy?: string | null
}

interface ImportResult {
  imported: number
  errors: Array<{ row: number; message: string }>
}

interface ParsedCsvInvoice {
  invoiceNumber: string
  invoiceDate: string | null
  dueDate: string | null
  serviceDate: string | null
  sellerName: string | null
  sellerTaxId: string | null
  sellerAddress: string | null
  sellerCountryCode: string | null
  sellerBankAccount: string | null
  buyerName: string | null
  buyerTaxId: string | null
  buyerAddress: string | null
  buyerCountryCode: string | null
  netAmount: string | null
  vatAmount: string | null
  grossAmount: string | null
  currencyCode: string | null
  paymentMethod: string | null
  paymentTerms: string | null
  direction: string | null
  lineDescription: string | null
  lineQuantity: string | null
  lineUnit: string | null
  lineUnitPriceNet: string | null
  lineVatRate: string | null
  lineVatRateCode: string | null
  lineNetAmount: string | null
  lineVatAmount: string | null
  lineGrossAmount: string | null
}

const CSV_HEADER_MAP: Record<string, keyof ParsedCsvInvoice> = {
  invoice_number: 'invoiceNumber',
  invoicenumber: 'invoiceNumber',
  number: 'invoiceNumber',
  numer_faktury: 'invoiceNumber',
  invoice_date: 'invoiceDate',
  invoicedate: 'invoiceDate',
  date: 'invoiceDate',
  data_faktury: 'invoiceDate',
  due_date: 'dueDate',
  duedate: 'dueDate',
  termin_platnosci: 'dueDate',
  service_date: 'serviceDate',
  servicedate: 'serviceDate',
  data_sprzedazy: 'serviceDate',
  seller_name: 'sellerName',
  sellername: 'sellerName',
  sprzedawca: 'sellerName',
  seller_tax_id: 'sellerTaxId',
  sellertaxid: 'sellerTaxId',
  seller_nip: 'sellerTaxId',
  nip_sprzedawcy: 'sellerTaxId',
  seller_address: 'sellerAddress',
  selleraddress: 'sellerAddress',
  adres_sprzedawcy: 'sellerAddress',
  seller_country: 'sellerCountryCode',
  seller_bank_account: 'sellerBankAccount',
  konto_bankowe: 'sellerBankAccount',
  buyer_name: 'buyerName',
  buyername: 'buyerName',
  nabywca: 'buyerName',
  buyer_tax_id: 'buyerTaxId',
  buyertaxid: 'buyerTaxId',
  buyer_nip: 'buyerTaxId',
  nip_nabywcy: 'buyerTaxId',
  buyer_address: 'buyerAddress',
  buyeraddress: 'buyerAddress',
  adres_nabywcy: 'buyerAddress',
  buyer_country: 'buyerCountryCode',
  net_amount: 'netAmount',
  netamount: 'netAmount',
  netto: 'netAmount',
  vat_amount: 'vatAmount',
  vatamount: 'vatAmount',
  vat: 'vatAmount',
  gross_amount: 'grossAmount',
  grossamount: 'grossAmount',
  brutto: 'grossAmount',
  currency: 'currencyCode',
  currency_code: 'currencyCode',
  waluta: 'currencyCode',
  payment_method: 'paymentMethod',
  paymentmethod: 'paymentMethod',
  metoda_platnosci: 'paymentMethod',
  payment_terms: 'paymentTerms',
  paymentterms: 'paymentTerms',
  direction: 'direction',
  kierunek: 'direction',
  line_description: 'lineDescription',
  opis_pozycji: 'lineDescription',
  line_quantity: 'lineQuantity',
  ilosc: 'lineQuantity',
  line_unit: 'lineUnit',
  jednostka: 'lineUnit',
  line_unit_price: 'lineUnitPriceNet',
  cena_netto: 'lineUnitPriceNet',
  line_vat_rate: 'lineVatRate',
  stawka_vat: 'lineVatRate',
  line_vat_rate_code: 'lineVatRateCode',
  line_net: 'lineNetAmount',
  pozycja_netto: 'lineNetAmount',
  line_vat: 'lineVatAmount',
  pozycja_vat: 'lineVatAmount',
  line_gross: 'lineGrossAmount',
  pozycja_brutto: 'lineGrossAmount',
}

export class FmsInvoiceImportService {
  private container: AppContainer

  constructor(opts: { container: AppContainer }) {
    this.container = opts.container
  }

  async importFromCsv(csvContent: string, params: ImportContext): Promise<ImportResult> {
    const lines = csvContent.split(/\r?\n/).filter((line) => line.trim().length > 0)

    if (lines.length < 2) {
      return { imported: 0, errors: [{ row: 1, message: 'CSV must contain a header row and at least one data row' }] }
    }

    const headers = this.parseCsvLine(lines[0])
    const headerMap = this.mapCsvHeaders(headers)

    if (!headerMap.invoiceNumber) {
      return { imported: 0, errors: [{ row: 1, message: 'Missing required header: invoice_number (or equivalent)' }] }
    }

    const errors: Array<{ row: number; message: string }> = []
    const invoiceGroups = new Map<string, { rows: ParsedCsvInvoice[]; firstRow: number }>()

    for (let rowIdx = 1; rowIdx < lines.length; rowIdx++) {
      const values = this.parseCsvLine(lines[rowIdx])
      const parsed = this.extractCsvRow(values, headerMap)

      if (!parsed.invoiceNumber) {
        errors.push({ row: rowIdx + 1, message: 'Missing invoice number' })
        continue
      }

      const groupKey = parsed.invoiceNumber
      if (!invoiceGroups.has(groupKey)) {
        invoiceGroups.set(groupKey, { rows: [], firstRow: rowIdx + 1 })
      }
      invoiceGroups.get(groupKey)!.rows.push(parsed)
    }

    const em: EntityManager = this.container.resolve('em')
    let imported = 0

    for (const [invoiceNumber, group] of invoiceGroups) {
      try {
        const firstRow = group.rows[0]

        const invoiceDate = firstRow.invoiceDate ? new Date(firstRow.invoiceDate) : null
        const dueDate = firstRow.dueDate ? new Date(firstRow.dueDate) : null
        const serviceDate = firstRow.serviceDate ? new Date(firstRow.serviceDate) : null

        if (invoiceDate && isNaN(invoiceDate.getTime())) {
          errors.push({ row: group.firstRow, message: `Invalid invoice date: ${firstRow.invoiceDate}` })
          continue
        }

        const direction = (firstRow.direction === 'incoming' ? 'incoming' : 'outgoing') as InvoiceDirection

        const invoice = em.create(FmsInvoicingInvoice, {
          organizationId: params.organizationId,
          tenantId: params.tenantId,
          invoiceNumber,
          invoiceDate,
          dueDate: dueDate && !isNaN(dueDate.getTime()) ? dueDate : null,
          serviceDate: serviceDate && !isNaN(serviceDate.getTime()) ? serviceDate : null,
          sellerName: firstRow.sellerName ?? null,
          sellerTaxId: firstRow.sellerTaxId ?? null,
          sellerAddress: firstRow.sellerAddress ?? null,
          sellerCountryCode: firstRow.sellerCountryCode ?? null,
          sellerBankAccount: firstRow.sellerBankAccount ?? null,
          buyerName: firstRow.buyerName ?? null,
          buyerTaxId: firstRow.buyerTaxId ?? null,
          buyerAddress: firstRow.buyerAddress ?? null,
          buyerCountryCode: firstRow.buyerCountryCode ?? null,
          netAmount: firstRow.netAmount ?? '0',
          vatAmount: firstRow.vatAmount ?? '0',
          grossAmount: firstRow.grossAmount ?? '0',
          currencyCode: firstRow.currencyCode ?? 'PLN',
          paymentMethod: firstRow.paymentMethod ?? null,
          paymentTerms: firstRow.paymentTerms ?? null,
          direction,
          sourceType: 'external_import' as InvoiceSourceType,
          sourceImportReference: `csv:${invoiceNumber}`,
          status: 'pending_review',
          createdBy: params.createdBy ?? null,
        })
        em.persist(invoice)
        await em.flush()

        let lineNumber = 1
        for (let rowIdx = 0; rowIdx < group.rows.length; rowIdx++) {
          const row = group.rows[rowIdx]
          if (!row.lineDescription) continue

          const lineItem = em.create(FmsInvoicingLineItem, {
            organizationId: params.organizationId,
            tenantId: params.tenantId,
            invoice,
            lineNumber,
            description: row.lineDescription,
            quantity: row.lineQuantity ?? '1',
            unit: row.lineUnit ?? null,
            unitPriceNet: row.lineUnitPriceNet ?? '0',
            vatRate: row.lineVatRate ?? '0',
            vatRateCode: (row.lineVatRateCode as VatRateCode) ?? null,
            netAmount: row.lineNetAmount ?? '0',
            vatAmount: row.lineVatAmount ?? '0',
            grossAmount: row.lineGrossAmount ?? '0',
          })
          em.persist(lineItem)
          lineNumber++
        }

        await em.flush()
        imported++
      } catch (err) {
        errors.push({
          row: group.firstRow,
          message: err instanceof Error ? err.message : `Failed to import invoice "${invoiceNumber}"`,
        })
      }
    }

    return { imported, errors }
  }

  async importFromXml(xmlContent: string, params: ImportContext): Promise<ImportResult> {
    const errors: Array<{ row: number; message: string }> = []
    let imported = 0
    const em: EntityManager = this.container.resolve('em')

    try {
      const invoiceBlocks = this.extractKsefInvoiceBlocks(xmlContent)

      if (invoiceBlocks.length === 0) {
        return { imported: 0, errors: [{ row: 1, message: 'No invoice elements found in XML' }] }
      }

      for (let blockIdx = 0; blockIdx < invoiceBlocks.length; blockIdx++) {
        try {
          const block = invoiceBlocks[blockIdx]
          const invoiceData = this.parseKsefInvoiceBlock(block)

          const invoice = em.create(FmsInvoicingInvoice, {
            organizationId: params.organizationId,
            tenantId: params.tenantId,
            invoiceNumber: invoiceData.invoiceNumber,
            invoiceDate: invoiceData.invoiceDate,
            dueDate: invoiceData.dueDate ?? null,
            serviceDate: invoiceData.serviceDate ?? null,
            sellerName: invoiceData.sellerName ?? null,
            sellerTaxId: invoiceData.sellerTaxId ?? null,
            sellerAddress: invoiceData.sellerAddress ?? null,
            sellerCountryCode: invoiceData.sellerCountryCode ?? 'PL',
            buyerName: invoiceData.buyerName ?? null,
            buyerTaxId: invoiceData.buyerTaxId ?? null,
            buyerAddress: invoiceData.buyerAddress ?? null,
            buyerCountryCode: invoiceData.buyerCountryCode ?? null,
            netAmount: invoiceData.netAmount ?? '0',
            vatAmount: invoiceData.vatAmount ?? '0',
            grossAmount: invoiceData.grossAmount ?? '0',
            currencyCode: invoiceData.currencyCode ?? 'PLN',
            paymentMethod: invoiceData.paymentMethod ?? null,
            direction: 'incoming' as InvoiceDirection,
            sourceType: 'external_import' as InvoiceSourceType,
            sourceImportReference: `ksef_xml:${invoiceData.invoiceNumber}`,
            status: 'pending_review',
            createdBy: params.createdBy ?? null,
          })
          em.persist(invoice)
          await em.flush()

          for (let lineIdx = 0; lineIdx < invoiceData.lineItems.length; lineIdx++) {
            const lineData = invoiceData.lineItems[lineIdx]
            const lineItem = em.create(FmsInvoicingLineItem, {
              organizationId: params.organizationId,
              tenantId: params.tenantId,
              invoice,
              lineNumber: lineIdx + 1,
              description: lineData.description ?? '',
              quantity: lineData.quantity ?? '1',
              unit: lineData.unit ?? null,
              unitPriceNet: lineData.unitPriceNet ?? '0',
              vatRate: lineData.vatRate ?? '0',
              netAmount: lineData.netAmount ?? '0',
              vatAmount: lineData.vatAmount ?? '0',
              grossAmount: lineData.grossAmount ?? '0',
            })
            em.persist(lineItem)
          }

          await em.flush()
          imported++
        } catch (err) {
          errors.push({
            row: blockIdx + 1,
            message: err instanceof Error ? err.message : `Failed to parse invoice block ${blockIdx + 1}`,
          })
        }
      }
    } catch (err) {
      errors.push({
        row: 1,
        message: err instanceof Error ? err.message : 'Failed to parse XML content',
      })
    }

    return { imported, errors }
  }

  private parseCsvLine(line: string): string[] {
    const values: string[] = []
    let current = ''
    let insideQuotes = false

    for (let charIdx = 0; charIdx < line.length; charIdx++) {
      const char = line[charIdx]
      const nextChar = charIdx + 1 < line.length ? line[charIdx + 1] : null

      if (insideQuotes) {
        if (char === '"' && nextChar === '"') {
          current += '"'
          charIdx++
        } else if (char === '"') {
          insideQuotes = false
        } else {
          current += char
        }
      } else {
        if (char === '"') {
          insideQuotes = true
        } else if (char === ',' || char === ';') {
          values.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
    }

    values.push(current.trim())
    return values
  }

  private mapCsvHeaders(headers: string[]): Record<string, number> {
    const map: Record<string, number> = {}

    for (let idx = 0; idx < headers.length; idx++) {
      const normalized = headers[idx].toLowerCase().trim().replace(/\s+/g, '_')
      const mappedKey = CSV_HEADER_MAP[normalized]
      if (mappedKey) {
        map[mappedKey] = idx
      }
    }

    return map
  }

  private extractCsvRow(values: string[], headerMap: Record<string, number>): ParsedCsvInvoice {
    const getValue = (key: keyof ParsedCsvInvoice): string | null => {
      const idx = headerMap[key]
      if (idx === undefined || idx >= values.length) return null
      const val = values[idx]
      return val && val.trim().length > 0 ? val.trim() : null
    }

    return {
      invoiceNumber: getValue('invoiceNumber') ?? '',
      invoiceDate: getValue('invoiceDate'),
      dueDate: getValue('dueDate'),
      serviceDate: getValue('serviceDate'),
      sellerName: getValue('sellerName'),
      sellerTaxId: getValue('sellerTaxId'),
      sellerAddress: getValue('sellerAddress'),
      sellerCountryCode: getValue('sellerCountryCode'),
      sellerBankAccount: getValue('sellerBankAccount'),
      buyerName: getValue('buyerName'),
      buyerTaxId: getValue('buyerTaxId'),
      buyerAddress: getValue('buyerAddress'),
      buyerCountryCode: getValue('buyerCountryCode'),
      netAmount: getValue('netAmount'),
      vatAmount: getValue('vatAmount'),
      grossAmount: getValue('grossAmount'),
      currencyCode: getValue('currencyCode'),
      paymentMethod: getValue('paymentMethod'),
      paymentTerms: getValue('paymentTerms'),
      direction: getValue('direction'),
      lineDescription: getValue('lineDescription'),
      lineQuantity: getValue('lineQuantity'),
      lineUnit: getValue('lineUnit'),
      lineUnitPriceNet: getValue('lineUnitPriceNet'),
      lineVatRate: getValue('lineVatRate'),
      lineVatRateCode: getValue('lineVatRateCode'),
      lineNetAmount: getValue('lineNetAmount'),
      lineVatAmount: getValue('lineVatAmount'),
      lineGrossAmount: getValue('lineGrossAmount'),
    }
  }

  private extractKsefInvoiceBlocks(xml: string): string[] {
    const blocks: string[] = []
    const invoiceTagPattern = /<Faktura[\s>]/g
    const closingTag = '</Faktura>'

    let match = invoiceTagPattern.exec(xml)
    while (match) {
      const startIdx = match.index
      const endIdx = xml.indexOf(closingTag, startIdx)
      if (endIdx !== -1) {
        blocks.push(xml.substring(startIdx, endIdx + closingTag.length))
      }
      match = invoiceTagPattern.exec(xml)
    }

    return blocks
  }

  private parseKsefInvoiceBlock(block: string): {
    invoiceNumber: string
    invoiceDate: Date | null
    dueDate: Date | null
    serviceDate: Date | null
    sellerName: string | null
    sellerTaxId: string | null
    sellerAddress: string | null
    sellerCountryCode: string | null
    buyerName: string | null
    buyerTaxId: string | null
    buyerAddress: string | null
    buyerCountryCode: string | null
    netAmount: string | null
    vatAmount: string | null
    grossAmount: string | null
    currencyCode: string | null
    paymentMethod: string | null
    lineItems: Array<{
      description: string | null
      quantity: string | null
      unit: string | null
      unitPriceNet: string | null
      vatRate: string | null
      netAmount: string | null
      vatAmount: string | null
      grossAmount: string | null
    }>
  } {
    const extractTag = (tagName: string, source?: string): string | null => {
      const src = source ?? block
      const openPattern = new RegExp(`<${tagName}[^>]*>`)
      const closePattern = `</${tagName}>`
      const openMatch = openPattern.exec(src)
      if (!openMatch) return null
      const startIdx = openMatch.index + openMatch[0].length
      const endIdx = src.indexOf(closePattern, startIdx)
      if (endIdx === -1) return null
      return src.substring(startIdx, endIdx).trim()
    }

    const parseDate = (value: string | null): Date | null => {
      if (!value) return null
      const parsed = new Date(value)
      return isNaN(parsed.getTime()) ? null : parsed
    }

    const invoiceNumber = extractTag('P_2') ?? extractTag('NrFaktury') ?? `KSeF-IMPORT-${Date.now()}`
    const invoiceDate = parseDate(extractTag('P_1') ?? extractTag('DataWystawienia'))
    const serviceDate = parseDate(extractTag('P_6') ?? extractTag('DataSprzedazy'))
    const dueDate = parseDate(extractTag('TerminPlatnosci'))

    const sellerSection = extractTag('Podmiot1') ?? ''
    const sellerName = extractTag('Nazwa', sellerSection) ?? extractTag('PelnaNazwa', sellerSection)
    const sellerTaxId = extractTag('NIP', sellerSection)
    const sellerAddress = [
      extractTag('Ulica', sellerSection),
      extractTag('NrDomu', sellerSection),
      extractTag('NrLokalu', sellerSection),
      extractTag('Miejscowosc', sellerSection),
      extractTag('KodPocztowy', sellerSection),
    ]
      .filter(Boolean)
      .join(', ') || null
    const sellerCountryCode = extractTag('KodKraju', sellerSection) ?? 'PL'

    const buyerSection = extractTag('Podmiot2') ?? ''
    const buyerName = extractTag('Nazwa', buyerSection) ?? extractTag('PelnaNazwa', buyerSection)
    const buyerTaxId = extractTag('NIP', buyerSection)
    const buyerAddress = [
      extractTag('Ulica', buyerSection),
      extractTag('NrDomu', buyerSection),
      extractTag('NrLokalu', buyerSection),
      extractTag('Miejscowosc', buyerSection),
      extractTag('KodPocztowy', buyerSection),
    ]
      .filter(Boolean)
      .join(', ') || null
    const buyerCountryCode = extractTag('KodKraju', buyerSection)

    const netAmount = extractTag('P_13_1') ?? extractTag('WartoscNetto')
    const vatAmount = extractTag('P_14_1') ?? extractTag('KwotaVAT')
    const grossAmount = extractTag('P_15') ?? extractTag('WartoscBrutto')
    const currencyCode = extractTag('KodWaluty') ?? 'PLN'
    const paymentMethod = extractTag('FormaPlatnosci')

    const lineItems: Array<{
      description: string | null
      quantity: string | null
      unit: string | null
      unitPriceNet: string | null
      vatRate: string | null
      netAmount: string | null
      vatAmount: string | null
      grossAmount: string | null
    }> = []

    const linePattern = /<FaWiersz[\s>]/g
    const lineClosingTag = '</FaWiersz>'
    let lineMatch = linePattern.exec(block)
    while (lineMatch) {
      const lineStart = lineMatch.index
      const lineEnd = block.indexOf(lineClosingTag, lineStart)
      if (lineEnd !== -1) {
        const lineBlock = block.substring(lineStart, lineEnd + lineClosingTag.length)
        lineItems.push({
          description: extractTag('P_7', lineBlock),
          quantity: extractTag('P_8B', lineBlock),
          unit: extractTag('P_8A', lineBlock),
          unitPriceNet: extractTag('P_9A', lineBlock),
          vatRate: extractTag('P_12', lineBlock),
          netAmount: extractTag('P_11', lineBlock),
          vatAmount: extractTag('P_11A', lineBlock),
          grossAmount: null,
        })
      }
      lineMatch = linePattern.exec(block)
    }

    return {
      invoiceNumber,
      invoiceDate,
      dueDate,
      serviceDate,
      sellerName,
      sellerTaxId,
      sellerAddress,
      sellerCountryCode,
      buyerName,
      buyerTaxId,
      buyerAddress,
      buyerCountryCode,
      netAmount,
      vatAmount,
      grossAmount,
      currencyCode,
      paymentMethod,
      lineItems,
    }
  }
}
