import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { buildFa3Xml, type InvoiceForXml, type LineItemForXml, type BuildFa3XmlOptions } from '../lib/xml-builder'

/**
 * KSeF XML Service
 *
 * Generates FA(3) XML for invoice submission. Loads invoice data via
 * raw Knex queries to avoid importing FMS invoicing ORM entities.
 */
export class KsefXmlService {
  async generateFa3Xml(em: EntityManager, invoiceId: string): Promise<string> {
    const knex = (em as unknown as { getConnection: () => { getKnex: () => unknown } }).getConnection().getKnex() as {
      (table: string): { select: (...args: unknown[]) => { where: (col: string, val: unknown) => { whereNull: (col: string) => { first: () => Promise<Record<string, unknown> | undefined> } } } }
      (table: string): { select: (...args: unknown[]) => { where: (col: string, val: unknown) => { orderBy: (col: string, dir: string) => Promise<Array<Record<string, unknown>>> } } }
    }

    // Load invoice from fms_invoicing_invoices table via raw query (cross-module, no ORM import)
    const invoiceRow = await (knex as any)('fms_invoicing_invoices')
      .select('*')
      .where('id', invoiceId)
      .whereNull('deleted_at')
      .first()

    if (!invoiceRow) {
      throw new CrudHttpError(404, { error: 'Invoice not found' })
    }

    const lineItemRows = await (knex as any)('fms_invoicing_line_items')
      .select('*')
      .where('invoice_id', invoiceId)
      .orderBy('line_number', 'asc')

    if (!lineItemRows || lineItemRows.length === 0) {
      throw new CrudHttpError(400, { error: 'Invoice has no line items. At least one line item is required for KSeF submission.' })
    }

    const invoice: InvoiceForXml = {
      invoiceNumber: invoiceRow.invoice_number,
      invoiceDate: invoiceRow.invoice_date,
      dueDate: invoiceRow.due_date,
      serviceDate: invoiceRow.service_date,
      sellerName: invoiceRow.seller_name,
      sellerTaxId: invoiceRow.seller_tax_id,
      sellerAddress: invoiceRow.seller_address,
      sellerCountryCode: invoiceRow.seller_country_code,
      sellerBankAccount: invoiceRow.seller_bank_account,
      buyerName: invoiceRow.buyer_name,
      buyerTaxId: invoiceRow.buyer_tax_id,
      buyerAddress: invoiceRow.buyer_address,
      buyerCountryCode: invoiceRow.buyer_country_code,
      grossAmount: invoiceRow.gross_amount,
      currencyCode: invoiceRow.currency_code,
      paymentMethod: invoiceRow.payment_method,
      invoiceType: invoiceRow.invoice_type,
      correctedInvoiceId: invoiceRow.corrected_invoice_id,
      correctionReason: invoiceRow.correction_reason,
      offlineMode: null,
    }

    const lineItems: LineItemForXml[] = lineItemRows.map((row: Record<string, unknown>) => ({
      lineNumber: row.line_number as number,
      description: row.description as string,
      quantity: row.quantity as string,
      unit: row.unit as string | null,
      unitPriceNet: row.unit_price_net as string,
      vatRate: row.vat_rate as string,
      vatRateCode: row.vat_rate_code as string | null,
      netAmount: row.net_amount as string,
      vatAmount: row.vat_amount as string,
      gtuCode: row.gtu_code as string | null,
    }))

    const options: BuildFa3XmlOptions = {}

    // For correction invoices, look up the corrected invoice's KSeF number
    if (invoice.correctedInvoiceId) {
      const correctedSubmission = await em.findOne(
        (await import('../data/entities')).KsefSubmission,
        { invoiceId: invoice.correctedInvoiceId }
      )
      if (correctedSubmission?.ksefNumber) {
        options.correctedKsefNumber = correctedSubmission.ksefNumber
      }
    }

    return buildFa3Xml(invoice, lineItems, options)
  }
}
