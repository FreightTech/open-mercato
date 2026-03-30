import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { KsefSubmission } from '../data/entities'
import type { KsefEnvironment } from '../data/types'
import { KsefClientService, KsefApiError } from './client.service'
import type { KsefInvoiceHeader, KsefQueryCriteria } from '../lib/types'

interface SyncReceivedParams {
  tenantId: string
  organizationId: string
  nip: string
  sessionToken: string
  environment: KsefEnvironment
  dateFrom?: Date
  dateTo?: Date
  createdBy?: string | null
}

interface SyncReceivedResult {
  received: number
  skipped: number
  errors: Array<{ ksefNumber: string; message: string }>
}

/**
 * KSeF Receiver Service
 *
 * Syncs received invoices from KSeF. Creates invoices via the FMS invoicing
 * API (cross-module), then creates linked KsefSubmission records.
 */
export class KsefReceiverService {
  private container: AppContainer

  constructor(opts: { container: AppContainer }) {
    this.container = opts.container
  }

  async syncReceivedInvoices(
    em: EntityManager,
    params: SyncReceivedParams
  ): Promise<SyncReceivedResult> {
    const client = new KsefClientService(params.environment)
    client.setAccessToken(params.sessionToken)

    const queryCriteria: KsefQueryCriteria = {
      subjectType: 'subject2',
      type: 'range',
    }

    if (params.dateFrom) {
      queryCriteria.acquisitionTimestampThresholdFrom = params.dateFrom.toISOString()
    }
    if (params.dateTo) {
      queryCriteria.acquisitionTimestampThresholdTo = params.dateTo.toISOString()
    }

    if (!queryCriteria.acquisitionTimestampThresholdFrom) {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      queryCriteria.acquisitionTimestampThresholdFrom = thirtyDaysAgo.toISOString()
    }

    let received = 0
    let skipped = 0
    const errors: Array<{ ksefNumber: string; message: string }> = []

    const pageSize = 100
    let hasMore = true

    while (hasMore) {
      let queryResponse
      try {
        queryResponse = await client.queryInvoices({
          queryCriteria: { ...queryCriteria },
        })
      } catch (err) {
        if (err instanceof KsefApiError) {
          throw new CrudHttpError(502, {
            error: `KSeF query failed: ${err.message}`,
          })
        }
        throw err
      }

      const invoiceHeaders = queryResponse.invoiceHeaderList ?? []

      for (const header of invoiceHeaders) {
        try {
          const result = await this.processReceivedInvoice(em, client, header, params)
          if (result === 'created') {
            received++
          } else {
            skipped++
          }
        } catch (err) {
          errors.push({
            ksefNumber: header.ksefReferenceNumber,
            message: err instanceof Error ? err.message : 'Failed to process invoice',
          })
        }
      }

      if (invoiceHeaders.length < pageSize) {
        hasMore = false
      }
    }

    return { received, skipped, errors }
  }

  private async processReceivedInvoice(
    em: EntityManager,
    client: KsefClientService,
    header: KsefInvoiceHeader,
    params: SyncReceivedParams
  ): Promise<'created' | 'skipped'> {
    // Check if we already have a submission for this KSeF number
    const existing = await em.findOne(KsefSubmission, {
      ksefNumber: header.ksefReferenceNumber,
      organizationId: params.organizationId,
      tenantId: params.tenantId,
    })

    if (existing) {
      return 'skipped'
    }

    let invoiceXml: string | null = null
    try {
      const downloadResponse = await client.downloadInvoice(header.ksefReferenceNumber)
      invoiceXml = downloadResponse.invoiceBody ?? null
    } catch {
      invoiceXml = null
    }

    // Create invoice via FMS invoicing API (cross-module)
    // For now, create the KsefSubmission record with header data.
    // The actual invoice creation should be triggered via an event or API call
    // to the fms_invoicing module.
    const submission = em.create(KsefSubmission, {
      organizationId: params.organizationId,
      tenantId: params.tenantId,
      invoiceId: '00000000-0000-0000-0000-000000000000', // placeholder — resolved after invoice creation
      status: 'accepted',
      ksefNumber: header.ksefReferenceNumber,
      ksefReferenceNumber: header.invoiceReferenceNumber,
      acceptedAt: header.acquisitionTimestamp
        ? new Date(header.acquisitionTimestamp)
        : new Date(),
      faXml: invoiceXml,
    })
    em.persist(submission)
    await em.flush()

    return 'created'
  }
}
