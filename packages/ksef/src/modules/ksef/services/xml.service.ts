import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { buildFa3Xml, type InvoiceForXml, type LineItemForXml, type BuildFa3XmlOptions } from '../lib/xml-builder'
import { KsefInvoice, KsefInvoiceLineItem, KsefSubmission } from '../data/entities'

/**
 * KSeF XML Service
 *
 * Generates FA(3) XML for invoice submission. Loads invoice data from
 * KSeF-owned entities (KsefInvoice + KsefInvoiceLineItem).
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
      { orderBy: { lineNumber: 'asc' } }
    )

    if (!lineItemEntities || lineItemEntities.length === 0) {
      throw new CrudHttpError(400, { error: 'Invoice has no line items. At least one line item is required for KSeF submission.' })
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
      correctionReason: invoiceEntity.correctionReason,
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
    }))

    const options: BuildFa3XmlOptions = {}

    // For correction invoices, look up the corrected invoice's KSeF number
    if (invoice.correctedInvoiceId) {
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
