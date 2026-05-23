import { NextResponse } from 'next/server'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CustomsShipment, HsClassification } from '../../../../../data/entities'
import { Isztar4Service } from '../../../../../services/isztar4.service'
import { classifyOpenApi } from '../../../../../api/openapi'
import type { ProductLine } from '../../../../../data/entities'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['customs.classify'] },
}

export const openApi = classifyOpenApi

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

  const productLines: ProductLine[] = shipment.productLines ?? []
  if (productLines.length === 0) {
    return NextResponse.json({ error: 'No product lines to classify' }, { status: 400 })
  }

  const isztar4Service = new Isztar4Service()

  // Remove old classifications
  const oldClassifications = await em.find(HsClassification, { shipment })
  for (const old of oldClassifications) em.remove(old)
  await em.flush()

  // Classify all product lines in parallel
  const errors: string[] = []
  const classificationPromises = productLines.map(async (line) => {
    const { suggestions, enriched, tariffTree, aiPath, error } = await isztar4Service.classifyProductLine(line)
    if (error) {
      errors.push(`Line ${line.lineNumber} (${line.description}): ${error}`)
    }
    return em.create(HsClassification, {
      shipment,
      lineNumber: line.lineNumber,
      productDescription: line.description,
      aiSuggestions: suggestions,
      isztar4Results: enriched,
      tariffTree: tariffTree ?? null,
      aiPath: aiPath ?? null,
      tenantId: auth.tenantId!,
      organizationId: auth.orgId ?? shipment.organizationId,
      createdAt: new Date(),
    })
  })

  const classifications = await Promise.all(classificationPromises)
  await em.persist(classifications).flush()

  return NextResponse.json({
    classifications: classifications.map((classification) => ({
      id: classification.id,
      lineNumber: classification.lineNumber,
      productDescription: classification.productDescription,
      aiSuggestions: classification.aiSuggestions,
      isztar4Results: classification.isztar4Results ?? [],
      tariffTree: classification.tariffTree ?? null,
      aiPath: classification.aiPath ?? null,
    })),
    ...(errors.length > 0 ? { errors } : {}),
  })
}
