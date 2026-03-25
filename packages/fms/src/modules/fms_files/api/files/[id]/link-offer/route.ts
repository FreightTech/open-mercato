/**
 * FMS Files Module - Link Offer API
 * Links an existing offer to a file and imports enabled offer lines as file lines
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsFile, FmsFileLine } from '../../../../data/entities'
import { FmsOffer } from '../../../../../fms_offers/data/entities'
import { buildScopeFilters } from '../../../../lib/scope-filters'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['fms_files.lines.manage'] },
}

const paramsSchema = z.object({ id: z.string().uuid() })
const bodySchema = z.object({ offerId: z.string().uuid() })

export async function POST(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const paramsResult = paramsSchema.safeParse({ id: ctx.params?.id })
  if (!paramsResult.success) {
    return NextResponse.json({ error: 'Invalid file id' }, { status: 400 })
  }

  const body = await req.json()
  const bodyResult = bodySchema.safeParse(body)
  if (!bodyResult.success) {
    return NextResponse.json({ error: 'Invalid request body', details: bodyResult.error }, { status: 400 })
  }

  const fileId = paramsResult.data.id
  const offerId = bodyResult.data.offerId

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager
  const scopeFilters = buildScopeFilters(auth, scope)

  const file = await em.findOne(FmsFile, { id: fileId, deletedAt: null, ...scopeFilters })
  if (!file) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  if (file.offerId != null) {
    return NextResponse.json({ error: 'File already has a linked offer' }, { status: 400 })
  }

  // Check if offer is already linked to another file
  const existingFile = await em.findOne(FmsFile, { offerId, deletedAt: null })
  if (existingFile) {
    return NextResponse.json({ error: 'This offer is already linked to another file' }, { status: 400 })
  }

  const offer = await em.findOne(FmsOffer, {
    id: offerId,
    deletedAt: null,
    ...scopeFilters,
  }, { populate: ['rfq', 'calculations', 'calculations.lines'] })

  if (!offer) {
    return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
  }

  const now = new Date()
  file.offerId = offer.id
  if (offer.rfq) {
    file.rfqId = offer.rfq.id
  }
  file.updatedAt = now

  const existingLinesCount = await em.count(FmsFileLine, { file: fileId, deletedAt: null })

  let lineIndex = 0
  const calculations = offer.calculations.getItems().filter((c) => !c.deletedAt)
  for (const calc of calculations) {
    const enabledLines = calc.lines.getItems().filter((l) => !l.deletedAt && l.isEnabled)
    for (const offerLine of enabledLines) {
      const fileLine = em.create(FmsFileLine, {
        organizationId: file.organizationId,
        tenantId: file.tenantId,
        file,
        lineNumber: existingLinesCount + lineIndex + 1,
        sourceOfferLineId: offerLine.id,
        sourceType: 'offer',
        productId: offerLine.productId ?? null,
        priceId: null,
        productName: offerLine.productName?.trim() || 'Unknown Product',
        chargeCode: offerLine.chargeCode ?? null,
        chargeCategory: null,
        chargeUnit: null,
        containerType: offerLine.containerType ?? null,
        containerSize: null,
        quantity: '1',
        currencyCode: offerLine.currencyCode || 'USD',
        soldUnitPrice: offerLine.sellPrice || '0',
        soldAmount: offerLine.sellPrice || '0',
        estimatedUnitCost: null,
        estimatedCost: null,
        actualUnitCost: null,
        actualCost: null,
        actualSellUnitPrice: null,
        actualSellAmount: null,
        createdAt: now,
        updatedAt: now,
      })
      em.persist(fileLine)
      lineIndex++
    }
  }

  await em.flush()

  return NextResponse.json({ ok: true, linesImported: lineIndex })
}

export const openApi = {
  post: { operationId: 'linkOfferToFmsFile', summary: 'Link an offer to a file', tags: ['FMS Files'], responses: { 200: { description: 'Linked' } } },
}
