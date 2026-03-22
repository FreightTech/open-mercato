import type { EntityManager } from '@mikro-orm/postgresql'
import type { SubscriberContext } from '@open-mercato/events'
import { InvoicingInvoice, InvoicingSettings } from '../data/entities'
import { InvoicingService } from '../services/invoicing.service'
import { createInvoicingLogger } from '../../../lib/logger'

const logger = createInvoicingLogger('invoicing.auto_import_from_documents')

export const metadata = {
  event: 'fms_documents.invoice.updated',
  persistent: true,
  id: 'invoicing.auto_import_from_documents',
}

interface DocumentInvoicePayload {
  id: string
  tenantId: string
  organizationId: string
  status?: string
}

export default async function handle(
  payload: DocumentInvoicePayload,
  context?: SubscriberContext
): Promise<void> {
  const documentInvoiceId = payload?.id
  const tenantId = payload?.tenantId
  const organizationId = payload?.organizationId

  if (!documentInvoiceId || !tenantId || !organizationId) {
    logger.warn('missing_required_fields', {
      documentInvoiceId,
      tenantId: !!tenantId,
      organizationId: !!organizationId,
    })
    return
  }

  const resolve = context?.resolve
  if (!resolve) {
    logger.error('no_resolve_function', new Error('No resolve function in context'), {
      documentInvoiceId,
    })
    return
  }

  const em = (resolve('em') as EntityManager).fork()

  try {
    // Check if auto-import is enabled in settings
    const settings = await em.findOne(InvoicingSettings, { tenantId, organizationId })
    if (!settings || !settings.autoImportFromDocuments) {
      logger.debug('auto_import_disabled', { tenantId, organizationId })
      return
    }

    // Check if the source document invoice is approved
    const knex = em.getKnex()
    const sourceRows = await knex.raw<{ rows: Array<{ id: string; status: string }> }>(
      `SELECT id, status FROM fms_invoices
       WHERE id = ? AND organization_id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [documentInvoiceId, organizationId, tenantId]
    )

    const source = sourceRows.rows[0]
    if (!source) {
      logger.warn('source_invoice_not_found', { documentInvoiceId })
      return
    }

    if (source.status !== 'approved') {
      logger.debug('source_invoice_not_approved', {
        documentInvoiceId,
        status: source.status,
      })
      return
    }

    // Check if already imported
    const existingImport = await em.findOne(InvoicingInvoice, {
      sourceDocumentInvoiceId: documentInvoiceId,
      tenantId,
      organizationId,
      deletedAt: null,
    })

    if (existingImport) {
      logger.debug('already_imported', {
        documentInvoiceId,
        existingInvoiceId: existingImport.id,
      })
      return
    }

    // Import the document invoice into invoicing
    const invoicingService = new InvoicingService({
      container: { resolve } as any,
    })

    const imported = await invoicingService.importFromDocumentInvoice(em, {
      sourceInvoiceId: documentInvoiceId,
      tenantId,
      organizationId,
    })

    logger.info('invoice_auto_imported', {
      documentInvoiceId,
      importedInvoiceId: imported.id,
      invoiceNumber: imported.invoiceNumber,
    })
  } catch (error) {
    logger.error('auto_import_failed', error, { documentInvoiceId })

    const errorMessage = error instanceof Error ? error.message : String(error)
    const isNonRetryable =
      error instanceof TypeError ||
      error instanceof ReferenceError ||
      errorMessage.includes('already exists') ||
      errorMessage.includes('constraint')

    if (isNonRetryable) {
      logger.error('non_retryable_error', error, { documentInvoiceId })
      return
    }

    throw error
  }
}
