import type { EntityManager } from '@mikro-orm/postgresql'
import type { SubscriberContext } from '@open-mercato/events'
import { isFmsInvoicingAvailable } from '../bridge/fms-invoicing'
import { KsefInvoice, KsefInvoiceLineItem, KsefSubmission } from '../data/entities'
import { emitKsefEvent } from '../events'

export const metadata = {
  event: 'fms_invoicing.invoice.approved',
  persistent: true,
  id: 'ksef.bridge_fms_auto_submit',
}

interface InvoiceApprovedPayload {
  id: string
  tenantId: string
  organizationId: string
  invoiceNumber?: string
  direction?: string
  [key: string]: unknown
}

/**
 * Bridge subscriber: listens to fms_invoicing.invoice.approved and
 * creates a KsefInvoice copy for KSeF submission.
 *
 * Only active when fms_invoicing is co-installed.
 */
export default async function handle(
  payload: InvoiceApprovedPayload,
  context?: SubscriberContext
): Promise<void> {
  if (!isFmsInvoicingAvailable()) return

  const fmsInvoiceId = payload?.id
  const tenantId = payload?.tenantId
  const organizationId = payload?.organizationId

  if (!fmsInvoiceId || !tenantId || !organizationId) return

  const resolve = context?.resolve
  if (!resolve) return

  const em = (resolve('em') as EntityManager).fork()

  try {
    // Check if KSeF integration is enabled and auto-submit is configured
    const { createIntegrationStateService } = await import('@open-mercato/core/modules/integrations/lib/state-service')
    const stateService = createIntegrationStateService(em)
    const state = await stateService.get('ksef', { tenantId, organizationId })

    if (!state || !state.isEnabled) return

    const autoSubmit = (state as Record<string, unknown>).autoSubmit
    if (!autoSubmit) return

    // Load the FMS invoice via raw Knex (bridge-only code)
    const knex = (em as unknown as { getConnection: () => { getKnex: () => unknown } }).getConnection().getKnex()
    const invoiceRow = await (knex as any)('fms_invoicing_invoices')
      .select('*')
      .where('id', fmsInvoiceId)
      .whereNull('deleted_at')
      .first()

    if (!invoiceRow || invoiceRow.direction !== 'outgoing') return

    // Check if a KsefInvoice already exists for this external invoice
    const existingInvoice = await em.findOne(KsefInvoice, {
      externalInvoiceId: fmsInvoiceId,
      tenantId,
      organizationId,
      deletedAt: null,
    })

    if (existingInvoice) return

    // Create KsefInvoice from FMS invoice data
    const ksefInvoice = em.create(KsefInvoice, {
      organizationId,
      tenantId,
      invoiceNumber: invoiceRow.invoice_number,
      invoiceDate: invoiceRow.invoice_date ? new Date(invoiceRow.invoice_date) : null,
      dueDate: invoiceRow.due_date ? new Date(invoiceRow.due_date) : null,
      serviceDate: invoiceRow.service_date ? new Date(invoiceRow.service_date) : null,
      sellerName: invoiceRow.seller_name,
      sellerTaxId: invoiceRow.seller_tax_id,
      sellerAddress: invoiceRow.seller_address,
      sellerCountryCode: invoiceRow.seller_country_code,
      sellerBankAccount: invoiceRow.seller_bank_account,
      buyerName: invoiceRow.buyer_name,
      buyerTaxId: invoiceRow.buyer_tax_id,
      buyerAddress: invoiceRow.buyer_address,
      buyerCountryCode: invoiceRow.buyer_country_code,
      netAmount: invoiceRow.net_amount ?? '0',
      vatAmount: invoiceRow.vat_amount ?? '0',
      grossAmount: invoiceRow.gross_amount ?? '0',
      currencyCode: invoiceRow.currency_code ?? 'PLN',
      paymentMethod: invoiceRow.payment_method,
      invoiceType: invoiceRow.invoice_type ?? 'VAT',
      correctedInvoiceId: invoiceRow.corrected_invoice_id,
      correctionReason: invoiceRow.correction_reason,
      direction: 'outgoing',
      externalInvoiceId: fmsInvoiceId,
    })
    em.persist(ksefInvoice)

    // Copy line items
    const lineItemRows = await (knex as any)('fms_invoicing_line_items')
      .select('*')
      .where('invoice_id', fmsInvoiceId)
      .orderBy('line_number', 'asc')

    for (const row of lineItemRows) {
      const lineItem = em.create(KsefInvoiceLineItem, {
        invoice: ksefInvoice,
        lineNumber: row.line_number ?? 1,
        description: row.description ?? '',
        quantity: String(row.quantity ?? '1'),
        unitPriceNet: String(row.unit_price_net ?? '0'),
        netAmount: String(row.net_amount ?? '0'),
        vatAmount: String(row.vat_amount ?? '0'),
        vatRate: row.vat_rate ?? '0',
        vatRateCode: row.vat_rate_code,
        gtuCode: row.gtu_code,
        unit: row.unit,
      })
      em.persist(lineItem)
    }

    // Create submission and queue
    const submission = em.create(KsefSubmission, {
      organizationId,
      tenantId,
      ksefInvoiceId: ksefInvoice.id,
      invoiceId: fmsInvoiceId, // Bridge: keep reference to FMS invoice
    })
    submission.status = 'queued'
    em.persist(submission)
    await em.flush()

    const { createQueue } = await import('@open-mercato/queue')
    const submitQueue = createQueue<{
      invoiceId: string
      submissionId: string
      tenantId: string
      organizationId: string
    }>('ksef-submit', 'local')

    await submitQueue.enqueue({
      invoiceId: ksefInvoice.id,
      submissionId: submission.id,
      tenantId,
      organizationId,
    })

    await emitKsefEvent('ksef.submission.queued', {
      id: submission.id,
      invoiceId: ksefInvoice.id,
      tenantId,
      organizationId,
      status: 'queued',
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const isNonRetryable =
      error instanceof TypeError ||
      error instanceof ReferenceError ||
      errorMessage.includes('validation') ||
      errorMessage.includes('constraint')

    if (isNonRetryable) return

    throw error
  }
}
