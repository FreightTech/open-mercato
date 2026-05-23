import type { EntityManager } from '@mikro-orm/postgresql'
import type { SubscriberContext } from '@open-mercato/events'
import { isSourceModuleAvailable } from '../bridge/invoicing'
import { KsefInvoice, KsefInvoiceLineItem, KsefSubmission } from '../data/entities'
import { emitKsefEvent } from '../events'

export const metadata = {
  event: 'invoicing.invoice.approved',
  persistent: true,
  id: 'ksef.bridge_invoice_approved',
}

interface InvoiceApprovedPayload {
  id: string
  tenantId: string
  organizationId: string
  invoiceNumber?: string
  direction?: string
  sourceModule: string
  sourceTable: string
  sourceLineItemsTable: string
  [key: string]: unknown
}

/**
 * Generic bridge subscriber: listens to invoicing.invoice.approved and
 * creates a KsefInvoice copy for KSeF submission.
 *
 * Any invoicing module can emit this event with source table info.
 * KSeF reads invoice data via Kysely without importing from the source module.
 */
export default async function handle(
  payload: InvoiceApprovedPayload,
  context?: SubscriberContext
): Promise<void> {
  const { id: invoiceId, tenantId, organizationId, sourceModule, sourceTable, sourceLineItemsTable } = payload ?? {}

  if (!invoiceId || !tenantId || !organizationId || !sourceTable || !sourceLineItemsTable) return
  if (sourceModule && !isSourceModuleAvailable(sourceModule)) return

  const resolve = context?.resolve
  if (!resolve) return

  const em = (resolve('em') as EntityManager).fork()

  try {
    const { createIntegrationStateService } = await import('@open-mercato/core/modules/integrations/lib/state-service')
    const stateService = createIntegrationStateService(em)
    const state = await stateService.get('ksef', { tenantId, organizationId })

    if (!state || !state.isEnabled) return

    const autoSubmit = (state as unknown as Record<string, unknown>).autoSubmit
    if (!autoSubmit) return

    const db = em.getKysely<any>()
    const invoiceRow = await db
      .selectFrom(sourceTable)
      .selectAll()
      .where('id', '=', invoiceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()

    if (!invoiceRow || invoiceRow.direction !== 'outgoing') return

    // Check if a KsefInvoice already exists for this external invoice
    const existingInvoice = await em.findOne(KsefInvoice, {
      externalInvoiceId: invoiceId,
      tenantId,
      organizationId,
      deletedAt: null,
    })

    if (existingInvoice) return

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
      externalInvoiceId: invoiceId,
    })
    em.persist(ksefInvoice)

    // Copy line items from source table
    const lineItemRows = await db
      .selectFrom(sourceLineItemsTable)
      .selectAll()
      .where('invoice_id', '=', invoiceId)
      .orderBy('line_number', 'asc')
      .execute()

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

    const submission = em.create(KsefSubmission, {
      organizationId,
      tenantId,
      ksefInvoiceId: ksefInvoice.id,
      invoiceId, // Bridge: keep reference to source invoice
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
