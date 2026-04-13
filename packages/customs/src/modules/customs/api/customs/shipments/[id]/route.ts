import { NextResponse } from 'next/server'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CustomsShipment, ParsedDocument, ConsistencyCheck, HsClassification } from '../../../../data/entities'
import { shipmentDetailOpenApi } from '../../../../api/openapi'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['customs.view'] },
  DELETE: { requireAuth: true, requireFeatures: ['customs.manage'] },
}

export const openApi = shipmentDetailOpenApi

export async function GET(req: Request, context: { params: Record<string, string> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const shipmentId = context.params.id
  if (!shipmentId) {
    return NextResponse.json({ error: 'Shipment ID required' }, { status: 400 })
  }

  const { resolve } = await createRequestContainer()
  const em = resolve('em') as EntityManager

  const filter: Record<string, unknown> = {
    id: shipmentId,
    tenantId: auth.tenantId,
    deletedAt: null,
  }
  if (auth.orgId) {
    filter.organizationId = auth.orgId
  }

  const shipment = await em.findOne(CustomsShipment, filter)

  if (!shipment) {
    return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
  }

  const documents = await em.find(ParsedDocument, { shipment }, {
    fields: ['id', 'documentType', 'fileName', 'extracted', 'parseError', 'createdAt'],
  })

  const consistencyChecks = await em.find(ConsistencyCheck, { shipment }, {
    orderBy: { status: 'asc' } as never,
  })

  const hsClassifications = await em.find(HsClassification, { shipment }, {
    orderBy: { lineNumber: 'asc' } as never,
  })

  return NextResponse.json({
    shipment: {
      id: shipment.id,
      status: shipment.status,
      blNumber: shipment.blNumber ?? null,
      invoiceNumber: shipment.invoiceNumber ?? null,
      shipperName: shipment.shipperName ?? null,
      consigneeName: shipment.consigneeName ?? null,
      loadingPort: shipment.loadingPort ?? null,
      dischargePort: shipment.dischargePort ?? null,
      vessel: shipment.vessel ?? null,
      shippedOnBoard: shipment.shippedOnBoard ?? null,
      productLines: shipment.productLines ?? [],
      createdAt: shipment.createdAt.toISOString(),
      updatedAt: shipment.updatedAt.toISOString(),
    },
    documents: documents.map((doc) => ({
      id: doc.id,
      documentType: doc.documentType,
      fileName: doc.fileName,
      extracted: doc.extracted ?? null,
      parseError: doc.parseError ?? null,
      createdAt: doc.createdAt.toISOString(),
    })),
    consistencyChecks: consistencyChecks.map((check) => ({
      id: check.id,
      field: check.field,
      label: check.label,
      sourceDoc1: check.sourceDoc1,
      sourceDoc2: check.sourceDoc2,
      value1: check.value1,
      value2: check.value2,
      status: check.status,
      discrepancy: check.discrepancy ?? null,
    })),
    hsClassifications: hsClassifications.map((classification) => ({
      id: classification.id,
      lineNumber: classification.lineNumber,
      productDescription: classification.productDescription,
      aiSuggestions: classification.aiSuggestions,
      isztar4Results: classification.isztar4Results ?? [],
      tariffTree: classification.tariffTree ?? null,
      aiPath: classification.aiPath ?? null,
      selectedHsCode: classification.selectedHsCode ?? null,
      selectedDescription: classification.selectedDescription ?? null,
      selectedDutyRate: classification.selectedDutyRate ?? null,
      selectedAt: classification.selectedAt?.toISOString() ?? null,
    })),
  })
}

export async function DELETE(req: Request, context: { params: Record<string, string> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const shipmentId = context.params.id
  if (!shipmentId) {
    return NextResponse.json({ error: 'Shipment ID required' }, { status: 400 })
  }

  const { resolve } = await createRequestContainer()
  const em = resolve('em') as EntityManager

  const filter: Record<string, unknown> = {
    id: shipmentId,
    tenantId: auth.tenantId,
    deletedAt: null,
  }
  if (auth.orgId) {
    filter.organizationId = auth.orgId
  }

  const shipment = await em.findOne(CustomsShipment, filter)

  if (!shipment) {
    return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
  }

  shipment.deletedAt = new Date()
  await em.flush()

  return NextResponse.json({ ok: true })
}
