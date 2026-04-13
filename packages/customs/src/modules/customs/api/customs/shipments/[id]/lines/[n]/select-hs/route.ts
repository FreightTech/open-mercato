import { NextResponse } from 'next/server'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CustomsShipment, HsClassification } from '../../../../../../../data/entities'
import type { HsSuggestion, Isztar4EnrichedResult } from '../../../../../../../data/entities'
import { selectHsCodeSchema } from '../../../../../../../data/validators'
import { selectHsOpenApi } from '../../../../../../../api/openapi'
import { Isztar4Service } from '../../../../../../../services/isztar4.service'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['customs.manage'] },
}

export const openApi = selectHsOpenApi

export async function POST(req: Request, context: { params: Record<string, string> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const shipmentId = context.params.id
  const lineNumber = parseInt(context.params.n, 10)

  if (isNaN(lineNumber)) {
    return NextResponse.json({ error: 'Invalid line number' }, { status: 400 })
  }

  const body = await req.json()
  const parseResult = selectHsCodeSchema.safeParse(body)
  if (!parseResult.success) {
    return NextResponse.json({ error: 'Invalid input', details: parseResult.error.issues }, { status: 400 })
  }

  let { hsCode, description, dutyRate } = parseResult.data
  const { enrich } = parseResult.data

  // If enrich flag is set, look up the code in ISZTAR4 and add as a full suggestion entry
  let manualEnrichment: Isztar4EnrichedResult | null = null
  if (enrich) {
    const isztar4Service = new Isztar4Service()
    const enriched = await isztar4Service.enrichFromIsztar4(hsCode)
    manualEnrichment = enriched
    if (enriched.valid) {
      description = enriched.description
      dutyRate = enriched.dutyAmount ?? dutyRate
    }
  }

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

  const classification = await em.findOne(HsClassification, {
    shipment,
    lineNumber,
  })

  if (!classification) {
    return NextResponse.json({ error: 'Classification not found for this line' }, { status: 404 })
  }

  // When applying a manual code, integrate it into the suggestions list
  // BUT only if it doesn't already exist as an AI suggestion
  if (enrich && manualEnrichment) {
    const existingIdx = classification.aiSuggestions.findIndex((s) => s.hsCode === hsCode && s.source !== 'manual')
    if (existingIdx === -1) {
      // Code not in AI suggestions — add as manual entry
      const suggestions = [...classification.aiSuggestions]
      const isztar4Results = [...(classification.isztar4Results ?? [])]

      // Remove any previous manual entry
      const manualIdx = suggestions.findIndex((s) => s.source === 'manual')
      if (manualIdx !== -1) {
        suggestions.splice(manualIdx, 1)
        isztar4Results.splice(manualIdx, 1)
      }

      // Add new manual entry at the top
      const manualSuggestion: HsSuggestion = {
        hsCode,
        description: manualEnrichment.valid ? manualEnrichment.description : (description ?? hsCode),
        reasoning: 'Manually entered by customs broker',
        confidence: 'high',
        source: 'manual',
      }
      suggestions.unshift(manualSuggestion)
      isztar4Results.unshift(manualEnrichment)

      classification.aiSuggestions = suggestions
      classification.isztar4Results = isztar4Results
    }
    // If code exists as AI suggestion, just select it (fall through to selection below)
  }

  classification.selectedHsCode = hsCode
  classification.selectedDescription = description ?? null
  classification.selectedDutyRate = dutyRate ?? null
  classification.selectedAt = new Date()

  await em.flush()

  return NextResponse.json({ ok: true })
}
