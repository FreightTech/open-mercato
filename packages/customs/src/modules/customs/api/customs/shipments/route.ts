import { NextResponse } from 'next/server'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CustomsShipment, ParsedDocument } from '../../../data/entities'
import { DocumentParserService } from '../../../services/document-parser.service'
import { ConsistencyCheckerService } from '../../../services/consistency-checker.service'
import { ConsistencyCheck } from '../../../data/entities'
import { shipmentListQuerySchema } from '../../../data/validators'
import { shipmentsListOpenApi } from '../../../api/openapi'
import { mergeWeightsFromPackingList } from '../../../services/batch-utils'
import type { DocumentType, NormalizedDocument } from '../../../data/entities'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['customs.view'] },
  POST: { requireAuth: true, requireFeatures: ['customs.manage'] },
}

export const openApi = shipmentsListOpenApi

export async function GET(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const rawQuery = Object.fromEntries(url.searchParams.entries())
  const query = shipmentListQuerySchema.parse(rawQuery)

  const { resolve } = await createRequestContainer()
  const em = resolve('em') as EntityManager

  const filter: Record<string, unknown> = {
    tenantId: auth.tenantId,
    deletedAt: null,
  }
  if (auth.orgId) {
    filter.organizationId = auth.orgId
  }
  if (query.status) {
    filter.status = query.status
  }

  const orderBy: Record<string, 'asc' | 'desc'> = {}
  orderBy[query.sortField] = query.sortDir

  const [items, total] = await em.findAndCount(
    CustomsShipment,
    filter,
    {
      orderBy: orderBy as never,
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    },
  )

  return NextResponse.json({
    items: items.map((shipment) => ({
      id: shipment.id,
      status: shipment.status,
      blNumber: shipment.blNumber ?? null,
      invoiceNumber: shipment.invoiceNumber ?? null,
      shipperName: shipment.shipperName ?? null,
      consigneeName: shipment.consigneeName ?? null,
      loadingPort: shipment.loadingPort ?? null,
      dischargePort: shipment.dischargePort ?? null,
      vessel: shipment.vessel ?? null,
      createdAt: shipment.createdAt.toISOString(),
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  })
}

export async function POST(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId || !auth.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const contentType = req.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const form = await req.formData()
  const blFile = form.get('bl') as File | null
  const invoiceFile = form.get('invoice') as File | null
  const packingListFile = form.get('packingList') as File | null

  if (!blFile || !invoiceFile || !packingListFile) {
    return NextResponse.json(
      { error: 'All three files are required: bl, invoice, packingList' },
      { status: 400 },
    )
  }

  const { resolve } = await createRequestContainer()
  const em = resolve('em') as EntityManager

  // Create shipment
  const now = new Date()
  const shipment = em.create(CustomsShipment, {
    tenantId: auth.tenantId,
    organizationId: auth.orgId,
    status: 'uploading',
    createdAt: now,
    updatedAt: now,
  })
  await em.persistAndFlush(shipment)

  // Store documents
  const fileEntries: Array<{ file: File; type: DocumentType }> = [
    { file: blFile, type: 'bill_of_lading' },
    { file: invoiceFile, type: 'commercial_invoice' },
    { file: packingListFile, type: 'packing_list' },
  ]

  const parsedDocs: ParsedDocument[] = []
  for (const entry of fileEntries) {
    const buffer = Buffer.from(await entry.file.arrayBuffer())
    const base64 = buffer.toString('base64')

    const doc = em.create(ParsedDocument, {
      shipment,
      documentType: entry.type,
      fileName: entry.file.name || `${entry.type}.pdf`,
      fileData: base64,
      tenantId: auth.tenantId,
      organizationId: auth.orgId,
      createdAt: new Date(),
    })
    parsedDocs.push(doc)
  }
  await em.persistAndFlush(parsedDocs)

  // Update status to parsing
  shipment.status = 'parsing'
  await em.flush()

  // Return immediately, parse in background
  const shipmentId = shipment.id

  // Background parsing (fire and forget)
  parseAndCheck(shipmentId, auth.tenantId, auth.orgId).catch((error) => {
    console.error('[customs] Background parsing failed:', error)
  })

  return NextResponse.json({ ok: true, id: shipmentId }, { status: 201 })
}

async function parseAndCheck(
  shipmentId: string,
  tenantId: string,
  orgId: string,
): Promise<void> {
  const { resolve } = await createRequestContainer()
  const em = resolve('em') as EntityManager
  const parserService = new DocumentParserService()
  const checkerService = new ConsistencyCheckerService()

  const shipment = await em.findOneOrFail(CustomsShipment, { id: shipmentId })
  const documents = await em.find(ParsedDocument, { shipment }, { populate: ['fileData'] })

  let hasError = false
  const extractedByType: Record<string, NormalizedDocument | null> = {}

  // Parse each document
  for (const doc of documents) {
    const { extracted, parseError } = await parserService.parseDocument(
      doc.fileData,
      doc.documentType,
    )
    doc.extracted = extracted
    doc.parseError = parseError
    extractedByType[doc.documentType] = extracted ?? null

    if (parseError) {
      hasError = true
    }
  }

  await em.flush()

  // Merge key fields into shipment from B/L and Invoice
  const blData = extractedByType['bill_of_lading']
  const invoiceData = extractedByType['commercial_invoice']

  if (blData) {
    shipment.blNumber = blData.documentNumber ?? null
    shipment.shipperName = blData.shipperName ?? null
    shipment.consigneeName = blData.consigneeName ?? null
    shipment.loadingPort = blData.loadingPort ?? null
    shipment.dischargePort = blData.dischargePort ?? null
    shipment.vessel = blData.vessel ?? null
    shipment.shippedOnBoard = blData.shippedOnBoard ?? null
  }

  if (invoiceData) {
    shipment.invoiceNumber = invoiceData.documentNumber ?? null
    shipment.productLines = mergeWeightsFromPackingList(invoiceData, extractedByType['packing_list'] ?? null) ?? invoiceData.productLines ?? null
  }

  // Run consistency checks
  const blDoc = extractedByType['bill_of_lading'] ?? null
  const invDoc = extractedByType['commercial_invoice'] ?? null
  const plDoc = extractedByType['packing_list'] ?? null

  const checkResults = checkerService.runChecks(blDoc, invDoc, plDoc)

  // Remove old consistency checks
  const oldChecks = await em.find(ConsistencyCheck, { shipment })
  for (const old of oldChecks) {
    em.remove(old)
  }

  // Save new consistency checks
  for (const result of checkResults) {
    em.create(ConsistencyCheck, {
      shipment,
      field: result.field,
      label: result.label,
      sourceDoc1: result.sourceDoc1,
      sourceDoc2: result.sourceDoc2,
      value1: result.value1,
      value2: result.value2,
      status: result.status,
      discrepancy: result.discrepancy,
      tenantId,
      organizationId: orgId,
      createdAt: new Date(),
    })
  }

  shipment.status = hasError ? 'error' : 'ready'
  await em.flush()
}
