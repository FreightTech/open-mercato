import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import {
  buildFa3Xml,
  type InvoiceForXml,
  type LineItemForXml,
  type OrderLineForXml,
  type AdvanceRefForXml,
  type BuildFa3XmlOptions,
} from '../lib/xml-builder'
import {
  KsefInvoice,
  KsefInvoiceLineItem,
  KsefInvoiceOrderLine,
  KsefInvoiceAdvanceRef,
  KsefSubmission,
} from '../data/entities'

/**
 * KSeF XML Service
 *
 * Generates FA(3) XML for invoice submission. Loads invoice data from
 * KSeF-owned entities (KsefInvoice + KsefInvoiceLineItem) plus, when the
 * RodzajFaktury requires it, order lines (Zamowienie) and advance
 * references (FakturaZaliczkowa).
 */
export class KsefXmlService {
  async generateFa3Xml(em: EntityManager, ksefInvoiceId: string): Promise<string> {
    const invoiceEntity = await em.findOne(KsefInvoice, { id: ksefInvoiceId, deletedAt: null })

    if (!invoiceEntity) {
      throw new CrudHttpError(404, { error: 'Invoice not found' })
    }

    const lineItemEntities = await em.find(
      KsefInvoiceLineItem,
      { invoice: ksefInvoiceId },
      { orderBy: { lineNumber: 'asc' } },
    )

    const isAdvance = invoiceEntity.invoiceType === 'ZAL' || invoiceEntity.invoiceType === 'KOR_ZAL'
    if ((!lineItemEntities || lineItemEntities.length === 0) && !isAdvance) {
      throw new CrudHttpError(400, {
        error:
          'Invoice has no line items. At least one line item is required for KSeF submission (ZAL uses Zamowienie instead).',
      })
    }

    const invoice: InvoiceForXml = {
      invoiceNumber: invoiceEntity.invoiceNumber,
      invoiceDate: invoiceEntity.invoiceDate,
      dueDate: invoiceEntity.dueDate,
      serviceDate: invoiceEntity.serviceDate,
      sellerName: invoiceEntity.sellerName,
      sellerTaxId: invoiceEntity.sellerTaxId,
      sellerAddress: invoiceEntity.sellerAddress,
      sellerCountryCode: invoiceEntity.sellerCountryCode,
      sellerBankAccount: invoiceEntity.sellerBankAccount,
      buyerName: invoiceEntity.buyerName,
      buyerTaxId: invoiceEntity.buyerTaxId,
      buyerAddress: invoiceEntity.buyerAddress,
      buyerCountryCode: invoiceEntity.buyerCountryCode,
      grossAmount: invoiceEntity.grossAmount,
      currencyCode: invoiceEntity.currencyCode,
      paymentMethod: invoiceEntity.paymentMethod,
      invoiceType: invoiceEntity.invoiceType,
      correctedInvoiceId: invoiceEntity.correctedInvoiceId,
      correctedKsefNumber: invoiceEntity.correctedKsefNumber,
      correctedInvoiceNumber: invoiceEntity.correctedInvoiceNumber,
      correctedInvoiceIssueDate: invoiceEntity.correctedInvoiceIssueDate,
      correctionReason: invoiceEntity.correctionReason,
      correctionEffectType: invoiceEntity.correctionEffectType,
      correctionPeriod: invoiceEntity.correctionPeriod,
      advanceAmount: invoiceEntity.advanceAmount,
      orderTotalGross: invoiceEntity.orderTotalGross,
      isFinalAdvance: invoiceEntity.isFinalAdvance,
      exchangeRate: invoiceEntity.exchangeRate,
      exchangeRateDate: invoiceEntity.exchangeRateDate,
      annotCashAccounting: invoiceEntity.annotCashAccounting,
      annotSelfBilling: invoiceEntity.annotSelfBilling,
      annotReverseCharge: invoiceEntity.annotReverseCharge,
      annotSplitPayment: invoiceEntity.annotSplitPayment,
      annotIntraCommunitySupply: invoiceEntity.annotIntraCommunitySupply,
      annotExportOfServices: invoiceEntity.annotExportOfServices,
      annotNewTransportMeans: invoiceEntity.annotNewTransportMeans,
      offlineMode: null,
    }

    const lineItems: LineItemForXml[] = lineItemEntities.map((li) => ({
      lineNumber: li.lineNumber,
      description: li.description,
      quantity: li.quantity,
      unit: li.unit,
      unitPriceNet: li.unitPriceNet,
      vatRate: li.vatRate,
      vatRateCode: li.vatRateCode,
      netAmount: li.netAmount,
      vatAmount: li.vatAmount,
      gtuCode: li.gtuCode,
      isPreState: li.isPreState,
    }))

    const options: BuildFa3XmlOptions = {}

    // Zamowienie (order lines) — ZAL / KOR_ZAL
    if (isAdvance) {
      const orderLineEntities = await em.find(
        KsefInvoiceOrderLine,
        { invoice: ksefInvoiceId },
        { orderBy: { lineNumber: 'asc' } },
      )
      const orderLines: OrderLineForXml[] = orderLineEntities.map((ol) => ({
        lineNumber: ol.lineNumber,
        description: ol.description,
        unit: ol.unit,
        quantity: ol.quantity,
        netAmount: ol.netAmount,
        vatAmount: ol.vatAmount,
        vatRate: ol.vatRate,
      }))
      if (orderLines.length > 0) options.orderLines = orderLines
    }

    // FakturaZaliczkowa references — ROZ, KOR_ROZ, final ZAL
    const needsAdvanceRefs =
      invoiceEntity.invoiceType === 'ROZ' ||
      invoiceEntity.invoiceType === 'KOR_ROZ' ||
      (isAdvance && invoiceEntity.isFinalAdvance)
    if (needsAdvanceRefs) {
      const advanceRefEntities = await em.find(
        KsefInvoiceAdvanceRef,
        { invoice: ksefInvoiceId },
      )
      const advanceRefs: AdvanceRefForXml[] = advanceRefEntities.map((ar) => ({
        ksefNumber: ar.ksefNumber,
        invoiceNumber: ar.invoiceNumber,
        issueDate: ar.issueDate,
        advanceAmount: ar.advanceAmount,
      }))
      if (advanceRefs.length > 0) options.advanceRefs = advanceRefs
    }

    // Back-compat: pre-column-split invoices still store only the local
    // `correctedInvoiceId` UUID. Resolve it to a KSeF number at generation time.
    if (!invoice.correctedKsefNumber && invoice.correctedInvoiceId) {
      const correctedSubmission = await em.findOne(KsefSubmission, {
        ksefInvoiceId: invoice.correctedInvoiceId,
      })
      if (correctedSubmission?.ksefNumber) {
        options.correctedKsefNumber = correctedSubmission.ksefNumber
      }
    }

    return buildFa3Xml(invoice, lineItems, options)
  }
}
