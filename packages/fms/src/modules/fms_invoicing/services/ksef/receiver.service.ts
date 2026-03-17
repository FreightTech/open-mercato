import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { FmsInvoicingInvoice } from '../../data/entities'
import type { KsefEnvironment, InvoiceDirection, InvoiceSourceType, InvoiceStatus } from '../../data/types'
import { KsefClientService, KsefApiError } from './client.service'
import type { KsefInvoiceHeader, KsefQueryCriteria } from '../../lib/ksef/types'

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

    let pageOffset = 0
    const pageSize = 100
    let hasMore = true

    while (hasMore) {
      let queryResponse
      try {
        queryResponse = await client.queryInvoices({
          queryCriteria: {
            ...queryCriteria,
          },
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
      } else {
        pageOffset += pageSize
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
    const existing = await em.findOne(FmsInvoicingInvoice, {
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
    } catch (err) {
      // Non-fatal: create invoice from header data even if XML download fails
      invoiceXml = null
    }

    const sellerName = header.subjectBy?.issuedByName?.tradeName
      ?? header.subjectBy?.issuedByName?.fullName
      ?? null

    const sellerTaxId = header.subjectBy?.issuedByIdentifier?.identifier ?? null

    const buyerName = header.subjectTo?.issuedToName?.tradeName
      ?? header.subjectTo?.issuedToName?.fullName
      ?? null

    const buyerTaxId = header.subjectTo?.issuedToIdentifier?.identifier ?? null

    const invoiceDate = header.invoicingDate ? new Date(header.invoicingDate) : null

    const invoice = em.create(FmsInvoicingInvoice, {
      organizationId: params.organizationId,
      tenantId: params.tenantId,
      invoiceNumber: header.invoiceNumber ?? header.ksefReferenceNumber,
      invoiceDate: invoiceDate && !isNaN(invoiceDate.getTime()) ? invoiceDate : null,
      sellerName,
      sellerTaxId,
      buyerName,
      buyerTaxId,
      netAmount: header.net ?? '0',
      vatAmount: header.vat ?? '0',
      grossAmount: header.gross ?? '0',
      currencyCode: 'PLN',
      direction: 'incoming' as InvoiceDirection,
      sourceType: 'ksef_received' as InvoiceSourceType,
      status: 'pending_review' as InvoiceStatus,
      ksefStatus: 'accepted',
      ksefNumber: header.ksefReferenceNumber,
      ksefReferenceNumber: header.invoiceReferenceNumber,
      ksefAcceptedAt: header.acquisitionTimestamp
        ? new Date(header.acquisitionTimestamp)
        : new Date(),
      ksefFaXml: invoiceXml,
      createdBy: params.createdBy ?? null,
    })
    em.persist(invoice)
    await em.flush()

    return 'created'
  }
}
