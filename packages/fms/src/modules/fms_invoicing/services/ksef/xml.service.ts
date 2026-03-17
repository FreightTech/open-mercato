import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { FmsInvoicingInvoice, FmsInvoicingLineItem } from '../../data/entities'
import type { VatRateCode } from '../../data/types'

const FA3_NAMESPACE = 'http://crd.gov.pl/wzor/2023/06/29/12648/'
const FA3_SCHEMA_VERSION = 'FA(3)'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function formatDate(date: Date | null | undefined): string | null {
  if (!date) return null
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatAmount(amount: string): string {
  const parsed = parseFloat(amount)
  if (isNaN(parsed)) return '0.00'
  return parsed.toFixed(2)
}

function formatQuantity(quantity: string): string {
  const parsed = parseFloat(quantity)
  if (isNaN(parsed)) return '1.0000'
  return parsed.toFixed(4)
}

function mapVatRateToKsef(vatRate: string, vatRateCode?: VatRateCode | null): string {
  if (vatRateCode) {
    switch (vatRateCode) {
      case '23':
      case '8':
      case '5':
      case '0':
        return vatRateCode
      case 'zw':
        return 'zw'
      case 'oo':
        return 'oo'
      case 'np':
        return 'np'
    }
  }

  const numericRate = parseFloat(vatRate)
  if (isNaN(numericRate)) return '23'

  if (numericRate === 23) return '23'
  if (numericRate === 8) return '8'
  if (numericRate === 5) return '5'
  if (numericRate === 0) return '0'

  return String(numericRate)
}

export class KsefXmlService {
  async generateFa3Xml(em: EntityManager, invoiceId: string): Promise<string> {
    const invoice = await em.findOne(FmsInvoicingInvoice, { id: invoiceId, deletedAt: null })
    if (!invoice) {
      throw new CrudHttpError(404, { error: 'Invoice not found' })
    }

    const lineItems = await em.find(
      FmsInvoicingLineItem,
      { invoice: invoiceId },
      { orderBy: { lineNumber: 'asc' } }
    )

    if (lineItems.length === 0) {
      throw new CrudHttpError(400, { error: 'Invoice has no line items. At least one line item is required for KSeF submission.' })
    }

    return this.buildFa3Xml(invoice, lineItems)
  }

  private buildFa3Xml(invoice: FmsInvoicingInvoice, lineItems: FmsInvoicingLineItem[]): string {
    const invoiceDate = formatDate(invoice.invoiceDate)
    if (!invoiceDate) {
      throw new CrudHttpError(400, { error: 'Invoice date is required for KSeF submission' })
    }

    if (!invoice.sellerTaxId) {
      throw new CrudHttpError(400, { error: 'Seller tax ID (NIP) is required for KSeF submission' })
    }

    if (!invoice.buyerTaxId) {
      throw new CrudHttpError(400, { error: 'Buyer tax ID (NIP) is required for KSeF submission' })
    }

    const serviceDate = formatDate(invoice.serviceDate)
    const dueDate = formatDate(invoice.dueDate)

    const vatRateGroups = this.groupByVatRate(lineItems)

    const xmlParts: string[] = []
    xmlParts.push(`<?xml version="1.0" encoding="UTF-8"?>`)
    xmlParts.push(`<Faktura xmlns="${FA3_NAMESPACE}">`)
    xmlParts.push(`  <Naglowek>`)
    xmlParts.push(`    <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="${FA3_SCHEMA_VERSION}">FA</KodFormularza>`)
    xmlParts.push(`    <WariantFormularza>3</WariantFormularza>`)
    xmlParts.push(`    <DataWytworzeniaFa>${new Date().toISOString()}</DataWytworzeniaFa>`)
    xmlParts.push(`    <SystemInfo>open-mercato</SystemInfo>`)
    xmlParts.push(`  </Naglowek>`)

    // Seller (Podmiot1)
    xmlParts.push(`  <Podmiot1>`)
    xmlParts.push(`    <DaneIdentyfikacyjne>`)
    xmlParts.push(`      <NIP>${escapeXml(invoice.sellerTaxId)}</NIP>`)
    if (invoice.sellerName) {
      xmlParts.push(`      <Nazwa>${escapeXml(invoice.sellerName)}</Nazwa>`)
    }
    xmlParts.push(`    </DaneIdentyfikacyjne>`)
    if (invoice.sellerAddress) {
      xmlParts.push(`    <Adres>`)
      xmlParts.push(`      <KodKraju>${escapeXml(invoice.sellerCountryCode ?? 'PL')}</KodKraju>`)
      xmlParts.push(`      <AdresL1>${escapeXml(invoice.sellerAddress)}</AdresL1>`)
      xmlParts.push(`    </Adres>`)
    }
    xmlParts.push(`  </Podmiot1>`)

    // Buyer (Podmiot2)
    xmlParts.push(`  <Podmiot2>`)
    xmlParts.push(`    <DaneIdentyfikacyjne>`)
    xmlParts.push(`      <NIP>${escapeXml(invoice.buyerTaxId)}</NIP>`)
    if (invoice.buyerName) {
      xmlParts.push(`      <Nazwa>${escapeXml(invoice.buyerName)}</Nazwa>`)
    }
    xmlParts.push(`    </DaneIdentyfikacyjne>`)
    if (invoice.buyerAddress) {
      xmlParts.push(`    <Adres>`)
      xmlParts.push(`      <KodKraju>${escapeXml(invoice.buyerCountryCode ?? 'PL')}</KodKraju>`)
      xmlParts.push(`      <AdresL1>${escapeXml(invoice.buyerAddress)}</AdresL1>`)
      xmlParts.push(`    </Adres>`)
    }
    xmlParts.push(`  </Podmiot2>`)

    // Invoice body (Fa)
    xmlParts.push(`  <Fa>`)
    xmlParts.push(`    <KodWaluty>${escapeXml(invoice.currencyCode)}</KodWaluty>`)
    xmlParts.push(`    <P_1>${invoiceDate}</P_1>`)
    xmlParts.push(`    <P_2>${escapeXml(invoice.invoiceNumber)}</P_2>`)
    if (serviceDate) {
      xmlParts.push(`    <P_6>${serviceDate}</P_6>`)
    }

    // VAT rate summaries (P_13_* and P_14_*)
    for (const group of vatRateGroups) {
      const rateSuffix = this.getVatRateSuffix(group.rateCode)
      xmlParts.push(`    <P_13_${rateSuffix}>${formatAmount(group.netTotal)}</P_13_${rateSuffix}>`)
      xmlParts.push(`    <P_14_${rateSuffix}>${formatAmount(group.vatTotal)}</P_14_${rateSuffix}>`)
    }

    // Gross total
    xmlParts.push(`    <P_15>${formatAmount(invoice.grossAmount)}</P_15>`)

    // Payment
    if (dueDate) {
      xmlParts.push(`    <TerminPlatnosci>`)
      xmlParts.push(`      <Termin>${dueDate}</Termin>`)
      xmlParts.push(`    </TerminPlatnosci>`)
    }
    if (invoice.paymentMethod) {
      xmlParts.push(`    <FormaPlatnosci>${escapeXml(invoice.paymentMethod)}</FormaPlatnosci>`)
    }
    if (invoice.sellerBankAccount) {
      xmlParts.push(`    <RachunekBankowy>`)
      xmlParts.push(`      <NrRB>${escapeXml(invoice.sellerBankAccount)}</NrRB>`)
      xmlParts.push(`    </RachunekBankowy>`)
    }

    // Line items (FaWiersz)
    for (const lineItem of lineItems) {
      xmlParts.push(`    <FaWiersz>`)
      xmlParts.push(`      <NrWierszaFa>${lineItem.lineNumber}</NrWierszaFa>`)
      if (lineItem.unit) {
        xmlParts.push(`      <P_8A>${escapeXml(lineItem.unit)}</P_8A>`)
      }
      xmlParts.push(`      <P_8B>${formatQuantity(lineItem.quantity)}</P_8B>`)
      xmlParts.push(`      <P_7>${escapeXml(lineItem.description)}</P_7>`)
      xmlParts.push(`      <P_9A>${formatAmount(lineItem.unitPriceNet)}</P_9A>`)
      xmlParts.push(`      <P_11>${formatAmount(lineItem.netAmount)}</P_11>`)
      xmlParts.push(`      <P_11A>${formatAmount(lineItem.vatAmount)}</P_11A>`)
      xmlParts.push(`      <P_12>${mapVatRateToKsef(lineItem.vatRate, lineItem.vatRateCode)}</P_12>`)
      if (lineItem.gtuCode) {
        xmlParts.push(`      <GTU>${escapeXml(lineItem.gtuCode)}</GTU>`)
      }
      if (lineItem.pkwiuCode) {
        xmlParts.push(`      <PKWiU>${escapeXml(lineItem.pkwiuCode)}</PKWiU>`)
      }
      xmlParts.push(`    </FaWiersz>`)
    }

    xmlParts.push(`  </Fa>`)
    xmlParts.push(`</Faktura>`)

    return xmlParts.join('\n')
  }

  private groupByVatRate(lineItems: FmsInvoicingLineItem[]): Array<{
    rateCode: string
    netTotal: string
    vatTotal: string
  }> {
    const groups = new Map<string, { net: number; vat: number }>()

    for (const lineItem of lineItems) {
      const rateCode = mapVatRateToKsef(lineItem.vatRate, lineItem.vatRateCode)
      const existing = groups.get(rateCode) ?? { net: 0, vat: 0 }
      existing.net += parseFloat(lineItem.netAmount) || 0
      existing.vat += parseFloat(lineItem.vatAmount) || 0
      groups.set(rateCode, existing)
    }

    return Array.from(groups.entries()).map(([rateCode, totals]) => ({
      rateCode,
      netTotal: totals.net.toFixed(2),
      vatTotal: totals.vat.toFixed(2),
    }))
  }

  private getVatRateSuffix(rateCode: string): string {
    switch (rateCode) {
      case '23':
        return '1'
      case '8':
        return '2'
      case '5':
        return '3'
      case '0':
        return '4'
      case 'zw':
        return '5'
      case 'oo':
        return '6'
      case 'np':
        return '7'
      default:
        return '1'
    }
  }
}
