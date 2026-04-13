import { NextResponse } from 'next/server'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CustomsShipment, ParsedDocument, ConsistencyCheck } from '../../../../../data/entities'
import { DocumentParserService } from '../../../../../services/document-parser.service'
import { ConsistencyCheckerService } from '../../../../../services/consistency-checker.service'
import { reparseOpenApi } from '../../../../../api/openapi'
import type { NormalizedDocument } from '../../../../../data/entities'
import { mergeWeightsFromPackingList } from '../../../../../services/batch-utils'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['customs.manage'] },
}

export const openApi = reparseOpenApi

export async function POST(req: Request, context: { params: Record<string, string> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const shipmentId = context.params.id
  const { resolve } = await createRequestContainer()
  const em = resolve('em') as EntityManager

  const findFilter: Record<string, unknown> = {
    id: shipmentId,
    tenantId: auth.tenantId,
  }
  if (auth.orgId) findFilter.organizationId = auth.orgId

  const shipment = await em.findOne(CustomsShipment, findFilter)

  if (!shipment) {
    return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
  }

  shipment.status = 'parsing'
  await em.flush()

  const documents = await em.find(ParsedDocument, { shipment }, { populate: ['fileData'] })
  const parserService = new DocumentParserService()
  const checkerService = new ConsistencyCheckerService()

  let hasError = false
  const extractedByType: Record<string, NormalizedDocument | null> = {}

  for (const doc of documents) {
    const { extracted, parseError } = await parserService.parseDocument(
      doc.fileData,
      doc.documentType,
    )
    doc.extracted = extracted
    doc.parseError = parseError
    extractedByType[doc.documentType] = extracted ?? null
    if (parseError) hasError = true
  }

  await em.flush()

  // Update shipment fields
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

  // Re-run consistency checks
  const oldChecks = await em.find(ConsistencyCheck, { shipment })
  for (const old of oldChecks) em.remove(old)

  const checkResults = checkerService.runChecks(
    extractedByType['bill_of_lading'] ?? null,
    extractedByType['commercial_invoice'] ?? null,
    extractedByType['packing_list'] ?? null,
  )

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
      tenantId: auth.tenantId,
      organizationId: auth.orgId ?? shipment.organizationId,
      createdAt: new Date(),
    })
  }

  shipment.status = hasError ? 'error' : 'ready'
  await em.flush()

  return NextResponse.json({ ok: true })
}
