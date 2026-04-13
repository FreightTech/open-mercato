import { NextResponse } from 'next/server'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CustomsShipment, ParsedDocument } from '../../../../../../../data/entities'
import { documentFileOpenApi } from '../../../../../../../api/openapi'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['customs.manage'] },
}

export const openApi = documentFileOpenApi

export async function GET(req: Request, context: { params: Record<string, string> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const shipmentId = context.params.id
  const docId = context.params.docId

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

  const document = await em.findOne(
    ParsedDocument,
    { id: docId, shipment },
    { populate: ['fileData'] },
  )
  if (!document) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  return NextResponse.json({
    fileData: document.fileData ?? null,
    fileName: document.fileName,
    documentType: document.documentType,
  })
}
