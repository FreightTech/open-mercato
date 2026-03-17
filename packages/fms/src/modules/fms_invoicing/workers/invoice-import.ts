import type { QueuedJob, JobContext, WorkerMeta } from '@open-mercato/queue'
import type { EntityManager } from '@mikro-orm/core'
import { FmsInvoicingInvoice, FmsInvoicingLineItem } from '../data/entities'
import { createFmsLogger } from '../../../lib/logger'
import { emitFmsInvoicingEvent } from '../events'
import type { ImportEventPayload } from '../events'

export const IMPORT_QUEUE_NAME = 'fms-invoicing-import'

export const metadata: WorkerMeta = {
  queue: IMPORT_QUEUE_NAME,
  concurrency: 3,
  id: 'fms-invoicing-import',
}

export type ImportPayload = {
  content: string
  format: 'csv' | 'xml'
  tenantId: string
  organizationId: string
  createdBy?: string
}

const logger = createFmsLogger('fms_invoicing.invoice_import')

type HandlerContext = { resolve: <T = unknown>(name: string) => T }

export default async function handle(
  job: QueuedJob<ImportPayload>,
  ctx: JobContext & HandlerContext
): Promise<void> {
  const em = ctx.resolve<EntityManager>('em')
  const { content, format, tenantId, organizationId, createdBy } = job.payload

  logger.info('starting_import', { format, tenantId, organizationId, contentLength: content.length })

  try {
    let importedCount = 0

    if (format === 'csv') {
      importedCount = await importFromCsv(em, content, tenantId, organizationId, createdBy)
    } else if (format === 'xml') {
      importedCount = await importFromXml(em, content, tenantId, organizationId, createdBy)
    } else {
      throw new Error(`Unsupported import format: ${format}`)
    }

    logger.info('import_completed', {
      format,
      importedCount,
      tenantId,
      organizationId,
    })

    const eventPayload: ImportEventPayload = {
      tenantId,
      organizationId,
      count: importedCount,
      sourceType: format,
    }

    await emitFmsInvoicingEvent('fms_invoicing.import.completed', eventPayload)
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err)

    logger.error('import_failed', err, { format, tenantId, organizationId })

    const failedPayload: ImportEventPayload = {
      tenantId,
      organizationId,
      count: 0,
      sourceType: format,
      errorMessage,
    }

    await emitFmsInvoicingEvent('fms_invoicing.import.failed', failedPayload)

    throw err
  }
}

interface CsvInvoiceRow {
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  sellerName: string
  sellerTaxId: string
  sellerAddress: string
  buyerName: string
  buyerTaxId: string
  buyerAddress: string
  netAmount: string
  vatAmount: string
  grossAmount: string
  currencyCode: string
  paymentMethod: string
  description: string
  direction: string
}

async function importFromCsv(
  em: EntityManager,
  content: string,
  tenantId: string,
  organizationId: string,
  createdBy?: string
): Promise<number> {
  const lines = content.split('\n').filter((line) => line.trim().length > 0)
  if (lines.length < 2) {
    throw new Error('CSV file must contain a header row and at least one data row')
  }

  const headerLine = lines[0]
  const headers = parseCsvLine(headerLine)

  const columnMap = new Map<string, number>()
  for (let idx = 0; idx < headers.length; idx++) {
    const normalized = headers[idx].trim().toLowerCase().replace(/\s+/g, '_')
    columnMap.set(normalized, idx)
  }

  let importedCount = 0

  for (let rowIdx = 1; rowIdx < lines.length; rowIdx++) {
    const values = parseCsvLine(lines[rowIdx])
    if (values.length === 0) continue

    const getValue = (key: string): string => {
      const idx = columnMap.get(key)
      if (idx === undefined || idx >= values.length) return ''
      return values[idx].trim()
    }

    const invoiceNumber = getValue('invoice_number') || `IMPORT-${Date.now()}-${rowIdx}`

    // Check for duplicate import reference
    const importRef = `csv:${invoiceNumber}:${rowIdx}`
    const existing = await em.findOne(FmsInvoicingInvoice, {
      sourceImportReference: importRef,
      tenantId,
      organizationId,
      deletedAt: null,
    })

    if (existing) {
      logger.debug('skipping_duplicate', { invoiceNumber, importRef })
      continue
    }

    const invoice = em.create(FmsInvoicingInvoice, {
      tenantId,
      organizationId,
      invoiceNumber,
      invoiceDate: parseDate(getValue('invoice_date')),
      dueDate: parseDate(getValue('due_date')),
      sellerName: getValue('seller_name') || null,
      sellerTaxId: getValue('seller_tax_id') || null,
      sellerAddress: getValue('seller_address') || null,
      buyerName: getValue('buyer_name') || null,
      buyerTaxId: getValue('buyer_tax_id') || null,
      buyerAddress: getValue('buyer_address') || null,
      netAmount: getValue('net_amount') || '0',
      vatAmount: getValue('vat_amount') || '0',
      grossAmount: getValue('gross_amount') || '0',
      currencyCode: getValue('currency_code') || 'PLN',
      paymentMethod: getValue('payment_method') || null,
      direction: (getValue('direction') === 'incoming' ? 'incoming' : 'outgoing') as 'incoming' | 'outgoing',
      sourceType: 'external_import',
      sourceImportReference: importRef,
      status: 'draft',
      createdBy: createdBy ?? null,
    })
    em.persist(invoice)

    // Create a single line item if description is provided
    const description = getValue('description')
    if (description) {
      const lineItem = em.create(FmsInvoicingLineItem, {
        tenantId,
        organizationId,
        invoice,
        lineNumber: 1,
        description,
        quantity: '1',
        unitPriceNet: getValue('net_amount') || '0',
        vatRate: '0',
        netAmount: getValue('net_amount') || '0',
        vatAmount: getValue('vat_amount') || '0',
        grossAmount: getValue('gross_amount') || '0',
      })
      em.persist(lineItem)
    }

    importedCount++
  }

  await em.flush()
  return importedCount
}

async function importFromXml(
  em: EntityManager,
  content: string,
  tenantId: string,
  organizationId: string,
  createdBy?: string
): Promise<number> {
  // Simple XML import: store raw XML and create a draft invoice from minimal attributes
  // A full XML parser would be used in production; here we extract basic fields via regex

  const extractXmlValue = (xml: string, tagName: string): string | null => {
    const regex = new RegExp(`<${tagName}>([^<]*)</${tagName}>`, 'i')
    const match = xml.match(regex)
    return match ? match[1].trim() : null
  }

  const invoiceNumber = extractXmlValue(content, 'P_2')
    ?? extractXmlValue(content, 'InvoiceNumber')
    ?? `XML-IMPORT-${Date.now()}`

  // Check idempotency
  const importRef = `xml:${invoiceNumber}`
  const existing = await em.findOne(FmsInvoicingInvoice, {
    sourceImportReference: importRef,
    tenantId,
    organizationId,
    deletedAt: null,
  })

  if (existing) {
    logger.debug('skipping_duplicate_xml', { invoiceNumber, importRef })
    return 0
  }

  const invoiceDateStr = extractXmlValue(content, 'P_1')
  const netAmount = extractXmlValue(content, 'P_15') ?? '0'
  const vatAmount = extractXmlValue(content, 'P_16') ?? '0'
  const grossAmount = String(parseFloat(netAmount) + parseFloat(vatAmount))

  const sellerNip = extractXmlValue(content, 'NIP')

  const invoice = em.create(FmsInvoicingInvoice, {
    tenantId,
    organizationId,
    invoiceNumber,
    invoiceDate: parseDate(invoiceDateStr),
    netAmount,
    vatAmount,
    grossAmount,
    sellerTaxId: sellerNip,
    direction: 'incoming',
    sourceType: 'external_import',
    sourceImportReference: importRef,
    status: 'draft',
    ksefFaXml: content,
    createdBy: createdBy ?? null,
  })

  em.persist(invoice)
  await em.flush()

  return 1
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let idx = 0; idx < line.length; idx++) {
    const char = line[idx]
    if (char === '"') {
      if (inQuotes && idx + 1 < line.length && line[idx + 1] === '"') {
        current += '"'
        idx++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }

  result.push(current)
  return result
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  if (isNaN(parsed.getTime())) return null
  return parsed
}
