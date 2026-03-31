import type { EntityManager } from '@mikro-orm/postgresql'
import type { SubscriberContext } from '@open-mercato/events'
import { FmsInvoicingInvoice, FmsInvoicingSettings } from '../data/entities'
import { FmsInvoicingService } from '../services/invoicing.service'
import { createFmsLogger } from '../../../lib/logger'

const logger = createFmsLogger('invoicing.auto_create_from_extraction')

export const metadata = {
  event: 'fms_documents.invoice.created',
  persistent: true,
  id: 'invoicing.auto_create_from_extraction',
}

interface InvoiceCreatedPayload {
  id: string
  tenantId: string
  organizationId: string
  status?: string
  documentId?: string
}

export default async function handle(
  payload: InvoiceCreatedPayload,
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

  if (!context?.resolve) {
    logger.error('no_resolve_function', new Error('No resolve function in context'), {
      documentInvoiceId,
    })
    return
  }

  const em = (context.resolve<EntityManager>('em')).fork()

  try {
    // Check if auto-import is enabled in settings
    const settings = await em.findOne(FmsInvoicingSettings, { tenantId, organizationId })
    if (!settings || !settings.autoImportFromDocuments) {
      logger.debug('auto_import_disabled', { tenantId, organizationId })
      return
    }

    // Check if already imported (deduplication)
    const existingImport = await em.findOne(FmsInvoicingInvoice, {
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

    // Import the document invoice with 'extracted' status
    const fmsFmsInvoicingService = new FmsInvoicingService({
      container: { resolve: context.resolve } as any,
    })

    const imported = await fmsFmsInvoicingService.importFromDocumentInvoice(em, {
      sourceInvoiceId: documentInvoiceId,
      tenantId,
      organizationId,
      status: 'extracted',
    })

    logger.info('invoice_auto_created_from_extraction', {
      documentInvoiceId,
      importedInvoiceId: imported.id,
      invoiceNumber: imported.invoiceNumber,
    })
  } catch (error) {
    logger.error('auto_create_failed', error, { documentInvoiceId })

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
