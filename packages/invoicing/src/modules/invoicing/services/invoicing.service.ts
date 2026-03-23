import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import {
  InvoicingInvoice,
  InvoicingLineItem,
  InvoicingSettings,
} from '../data/entities'
import type { InvoiceDirection, InvoiceSourceType, InvoiceStatus } from '../data/types'

interface ImportFromDocumentParams {
  sourceInvoiceId: string
  tenantId: string
  organizationId: string
  createdBy?: string | null
  status?: string
}

interface ImportFromSalesParams {
  salesInvoiceId: string
  tenantId: string
  organizationId: string
  createdBy?: string | null
}

interface DocumentInvoiceRow {
  id: string
  invoice_number: string | null
  invoice_date: Date | null
  due_date: Date | null
  service_date: Date | null
  seller_name: string | null
  seller_tax_id: string | null
  seller_address: string | null
  buyer_name: string | null
  buyer_tax_id: string | null
  buyer_address: string | null
  net_amount: string | null
  vat_amount: string | null
  gross_amount: string | null
  currency_code: string | null
  document_id: string | null
  attachment_id: string | null
}

interface DocumentLineItemRow {
  id: string
  description: string
  quantity: string | null
  unit: string | null
  unit_price_net: string | null
  vat_rate: string | null
  net_amount: string | null
  vat_amount: string | null
  gross_amount: string | null
}

interface SalesInvoiceRow {
  id: string
  document_number: string | null
  issue_date: Date | null
  due_date: Date | null
  service_date: Date | null
  seller_name: string | null
  seller_tax_id: string | null
  seller_address: string | null
  buyer_name: string | null
  buyer_tax_id: string | null
  buyer_address: string | null
  net_total: string | null
  vat_total: string | null
  gross_total: string | null
  currency_code: string | null
  payment_method: string | null
}

interface SalesLineItemRow {
  name: string | null
  description: string | null
  quantity: string | null
  unit: string | null
  unit_price: string | null
  vat_rate: string | null
  net_amount: string | null
  vat_amount: string | null
  gross_amount: string | null
}

export class InvoicingService {
  private container: AppContainer

  constructor(opts: { container: AppContainer }) {
    this.container = opts.container
  }

  async getOrCreateSettings(
    em: EntityManager,
    tenantId: string,
    organizationId: string
  ): Promise<InvoicingSettings> {
    let settings = await em.findOne(InvoicingSettings, {
      tenantId,
      organizationId,
    })

    if (!settings) {
      settings = em.create(InvoicingSettings, {
        tenantId,
        organizationId,
      })
      em.persist(settings)
      await em.flush()
    }

    return settings
  }

  async importFromDocumentInvoice(
    em: EntityManager,
    params: ImportFromDocumentParams
  ): Promise<InvoicingInvoice> {
    const existingImport = await em.findOne(InvoicingInvoice, {
      sourceDocumentInvoiceId: params.sourceInvoiceId,
      organizationId: params.organizationId,
      tenantId: params.tenantId,
      deletedAt: null,
    })

    if (existingImport) {
      throw new CrudHttpError(409, {
        error: 'An invoice already exists for this document extraction',
      })
    }

    const knex = em.getKnex()

    const sourceRows = await knex.raw<{ rows: DocumentInvoiceRow[] }>(
      `SELECT id, invoice_number, invoice_date, due_date, service_date,
              seller_name, seller_tax_id, seller_address,
              buyer_name, buyer_tax_id, buyer_address,
              net_amount, vat_amount, gross_amount, currency_code,
              document_id, attachment_id
       FROM fms_invoices
       WHERE id = ? AND organization_id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [params.sourceInvoiceId, params.organizationId, params.tenantId]
    )

    const source = sourceRows.rows[0]
    if (!source) {
      throw new CrudHttpError(404, { error: 'Source document invoice not found' })
    }

    const invoice = em.create(InvoicingInvoice, {
      organizationId: params.organizationId,
      tenantId: params.tenantId,
      invoiceNumber: source.invoice_number ?? `IMPORT-${Date.now()}`,
      invoiceDate: source.invoice_date ?? null,
      dueDate: source.due_date ?? null,
      serviceDate: source.service_date ?? null,
      sellerName: source.seller_name ?? null,
      sellerTaxId: source.seller_tax_id ?? null,
      sellerAddress: source.seller_address ?? null,
      buyerName: source.buyer_name ?? null,
      buyerTaxId: source.buyer_tax_id ?? null,
      buyerAddress: source.buyer_address ?? null,
      netAmount: source.net_amount ?? '0',
      vatAmount: source.vat_amount ?? '0',
      grossAmount: source.gross_amount ?? '0',
      currencyCode: source.currency_code ?? 'PLN',
      direction: 'incoming' as InvoiceDirection,
      sourceType: 'document_extraction' as InvoiceSourceType,
      sourceDocumentInvoiceId: params.sourceInvoiceId,
      sourceDocumentId: source.document_id ?? null,
      attachmentId: source.attachment_id ?? null,
      status: (params.status ?? 'pending_review') as InvoiceStatus,
      createdBy: params.createdBy ?? null,
    })
    em.persist(invoice)
    await em.flush()

    const lineItemRows = await knex.raw<{ rows: DocumentLineItemRow[] }>(
      `SELECT id, description, quantity, unit, unit_price_net, vat_rate,
              net_amount, vat_amount, gross_amount
       FROM fms_invoice_line_items
       WHERE invoice_id = ? AND organization_id = ? AND tenant_id = ?
       ORDER BY line_number ASC`,
      [params.sourceInvoiceId, params.organizationId, params.tenantId]
    )

    for (let idx = 0; idx < lineItemRows.rows.length; idx++) {
      const row = lineItemRows.rows[idx]
      const lineItem = em.create(InvoicingLineItem, {
        organizationId: params.organizationId,
        tenantId: params.tenantId,
        invoice,
        lineNumber: idx + 1,
        description: row.description ?? '',
        quantity: row.quantity ?? '1',
        unit: row.unit ?? null,
        unitPriceNet: row.unit_price_net ?? '0',
        vatRate: row.vat_rate ?? '0',
        netAmount: row.net_amount ?? '0',
        vatAmount: row.vat_amount ?? '0',
        grossAmount: row.gross_amount ?? '0',
        sourceLineItemId: row.id,
      })
      em.persist(lineItem)
    }

    await em.flush()
    return invoice
  }

  async importFromSalesInvoice(
    em: EntityManager,
    params: ImportFromSalesParams
  ): Promise<InvoicingInvoice> {
    const existingImport = await em.findOne(InvoicingInvoice, {
      sourceSalesInvoiceId: params.salesInvoiceId,
      organizationId: params.organizationId,
      tenantId: params.tenantId,
      deletedAt: null,
    })

    if (existingImport) {
      throw new CrudHttpError(409, {
        error: 'An invoice already exists for this sales invoice',
      })
    }

    const knex = em.getKnex()

    const sourceRows = await knex.raw<{ rows: SalesInvoiceRow[] }>(
      `SELECT id, document_number, issue_date, due_date, service_date,
              seller_name, seller_tax_id, seller_address,
              buyer_name, buyer_tax_id, buyer_address,
              net_total, vat_total, gross_total, currency_code, payment_method
       FROM sales_invoices
       WHERE id = ? AND organization_id = ? AND tenant_id = ?`,
      [params.salesInvoiceId, params.organizationId, params.tenantId]
    )

    const source = sourceRows.rows[0]
    if (!source) {
      throw new CrudHttpError(404, { error: 'Source sales invoice not found' })
    }

    const invoice = em.create(InvoicingInvoice, {
      organizationId: params.organizationId,
      tenantId: params.tenantId,
      invoiceNumber: source.document_number ?? `SALES-${Date.now()}`,
      invoiceDate: source.issue_date ?? null,
      dueDate: source.due_date ?? null,
      serviceDate: source.service_date ?? null,
      sellerName: source.seller_name ?? null,
      sellerTaxId: source.seller_tax_id ?? null,
      sellerAddress: source.seller_address ?? null,
      buyerName: source.buyer_name ?? null,
      buyerTaxId: source.buyer_tax_id ?? null,
      buyerAddress: source.buyer_address ?? null,
      netAmount: source.net_total ?? '0',
      vatAmount: source.vat_total ?? '0',
      grossAmount: source.gross_total ?? '0',
      currencyCode: source.currency_code ?? 'PLN',
      paymentMethod: source.payment_method ?? null,
      direction: 'outgoing' as InvoiceDirection,
      sourceType: 'sales_import' as InvoiceSourceType,
      sourceSalesInvoiceId: params.salesInvoiceId,
      status: 'draft' as InvoiceStatus,
      createdBy: params.createdBy ?? null,
    })
    em.persist(invoice)
    await em.flush()

    const lineItemRows = await knex.raw<{ rows: SalesLineItemRow[] }>(
      `SELECT name, description, quantity, unit, unit_price,
              vat_rate, net_amount, vat_amount, gross_amount
       FROM sales_invoice_lines
       WHERE invoice_id = ? AND organization_id = ? AND tenant_id = ?
       ORDER BY position ASC`,
      [params.salesInvoiceId, params.organizationId, params.tenantId]
    )

    for (let idx = 0; idx < lineItemRows.rows.length; idx++) {
      const row = lineItemRows.rows[idx]
      const lineItem = em.create(InvoicingLineItem, {
        organizationId: params.organizationId,
        tenantId: params.tenantId,
        invoice,
        lineNumber: idx + 1,
        description: row.description ?? row.name ?? '',
        quantity: row.quantity ?? '1',
        unit: row.unit ?? null,
        unitPriceNet: row.unit_price ?? '0',
        vatRate: row.vat_rate ?? '0',
        netAmount: row.net_amount ?? '0',
        vatAmount: row.vat_amount ?? '0',
        grossAmount: row.gross_amount ?? '0',
      })
      em.persist(lineItem)
    }

    await em.flush()
    return invoice
  }

  async recalculateTotals(em: EntityManager, invoiceId: string): Promise<void> {
    const lineItems = await em.find(InvoicingLineItem, { invoice: invoiceId })

    let netTotal = 0
    let vatTotal = 0
    let grossTotal = 0

    for (const lineItem of lineItems) {
      netTotal += parseFloat(lineItem.netAmount) || 0
      vatTotal += parseFloat(lineItem.vatAmount) || 0
      grossTotal += parseFloat(lineItem.grossAmount) || 0
    }

    const invoice = await em.findOne(InvoicingInvoice, { id: invoiceId })
    if (!invoice) {
      throw new CrudHttpError(404, { error: 'Invoice not found' })
    }

    invoice.netAmount = netTotal.toFixed(2)
    invoice.vatAmount = vatTotal.toFixed(2)
    invoice.grossAmount = grossTotal.toFixed(2)
    await em.flush()
  }
}
