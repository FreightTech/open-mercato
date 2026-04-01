import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { KsefSubmission, KsefInvoice, KsefInvoiceLineItem } from '../data/entities'
import type { KsefEnvironment } from '../data/types'
import { KsefClientService, KsefApiError } from './client.service'
import { getInvoiceByKsefNumberUrl } from '../lib/endpoints'
import type { KsefInvoiceHeader, KsefQueryCriteria, KsefDownloadInvoiceResponse } from '../lib/types'
import {
  extractInvoiceNumberFromFa3,
  extractSellerNipFromFa3,
  extractBuyerNipFromFa3,
  extractInvoiceDateFromFa3,
  extractGrossAmountFromFa3,
  extractLineItemsFromFa3,
} from '../lib/xml-parser'

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
 * Syncs received invoices from KSeF. Creates KsefInvoice (direction: incoming)
 * records with linked KsefSubmission records.
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
      const downloadUrl = getInvoiceByKsefNumberUrl(params.environment, header.ksefReferenceNumber)
      const downloadResponse = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${params.sessionToken}`,
          'Accept': 'application/json',
        },
      })
      if (downloadResponse.ok) {
        const result = (await downloadResponse.json()) as KsefDownloadInvoiceResponse
        invoiceXml = result.invoiceBody ?? null
      }
    } catch {
      invoiceXml = null
    }

    // Create KsefInvoice (direction: incoming) from header data
    const ksefInvoice = em.create(KsefInvoice, {
      organizationId: params.organizationId,
      tenantId: params.tenantId,
      invoiceNumber: header.invoiceNumber ?? extractInvoiceNumberFromFa3(invoiceXml ?? '') ?? 'UNKNOWN',
      invoiceDate: header.invoicingDate ? new Date(header.invoicingDate) : null,
      sellerName: header.subjectBy?.issuedByName?.tradeName ?? header.subjectBy?.issuedByName?.fullName ?? null,
      sellerTaxId: header.subjectBy?.issuedByIdentifier?.identifier ?? extractSellerNipFromFa3(invoiceXml ?? '') ?? null,
      buyerName: header.subjectTo?.issuedToName?.tradeName ?? header.subjectTo?.issuedToName?.fullName ?? null,
      buyerTaxId: header.subjectTo?.issuedToIdentifier?.identifier ?? extractBuyerNipFromFa3(invoiceXml ?? '') ?? null,
      netAmount: header.net ?? '0',
      vatAmount: header.vat ?? '0',
      grossAmount: header.gross ?? extractGrossAmountFromFa3(invoiceXml ?? '') ?? '0',
      currencyCode: 'PLN',
      direction: 'incoming',
    })
    em.persist(ksefInvoice)

    // Parse line items from XML if available
    if (invoiceXml) {
      const parsedLines = extractLineItemsFromFa3(invoiceXml)
      for (const line of parsedLines) {
        const lineItem = em.create(KsefInvoiceLineItem, {
          invoice: ksefInvoice,
          lineNumber: parseInt(line.lineNumber ?? '0', 10),
          description: line.description ?? '',
          quantity: line.quantity ?? '1',
          unitPriceNet: line.unitPrice ?? '0',
          netAmount: line.netAmount ?? '0',
          vatAmount: '0',
          vatRate: line.vatRate ?? '0',
        })
        em.persist(lineItem)
      }
    }

    // Create KsefSubmission linked to KsefInvoice
    const submission = em.create(KsefSubmission, {
      organizationId: params.organizationId,
      tenantId: params.tenantId,
      ksefInvoiceId: ksefInvoice.id,
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
