import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { FmsOffer } from '../../data/entities'
import { generateOfferPdf } from '../../lib/offer-pdf.service'
import { mergePdfBuffers } from '../../lib/merge-pdfs'

export const metadata = {
  GET: {
    requireAuth: true,
    requireFeatures: ['fms_offers.offers.view'],
  },
}

export const openApi = {
  GET: {
    summary: 'Generate combined or individual PDFs for a group of offers',
    tags: ['fms_offers'],
  },
}

/**
 * GET /api/fms_offers/offers/group-pdf?offerIds=id1,id2&mode=combined|separate
 *
 * - combined (default): merges all offer PDFs into a single document
 * - separate: returns a JSON array of base64-encoded individual PDFs
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthFromRequest(request)
    if (!auth || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const offerIdsParam = url.searchParams.get('offerIds')
    const mode = url.searchParams.get('mode') || 'combined'

    if (!offerIdsParam) {
      return NextResponse.json({ error: 'offerIds query parameter is required' }, { status: 400 })
    }

    const offerIds = offerIdsParam.split(',').map((id) => id.trim()).filter(Boolean)
    if (offerIds.length === 0) {
      return NextResponse.json({ error: 'At least one offer ID is required' }, { status: 400 })
    }

    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')

    // Verify all offers exist and belong to the tenant
    const offers = await em.find(FmsOffer, {
      id: { $in: offerIds },
      tenantId: auth.tenantId,
      deletedAt: null,
    })

    if (offers.length !== offerIds.length) {
      return NextResponse.json({ error: 'One or more offers not found' }, { status: 404 })
    }

    const brandIdHeader = request.headers.get('x-brand-id')
    const brandIdCookie = (request as any).cookies?.get('om_brand_id')?.value
    const brandId = brandIdHeader || brandIdCookie

    // Generate PDFs for each offer (preserve the requested order)
    const pdfBuffers: Buffer[] = []
    for (const id of offerIds) {
      const offer = offers.find((o) => o.id === id)!
      const buf = await generateOfferPdf(id, em, {
        tenantId: auth.tenantId,
        organizationId: offer.organizationId,
        brandId: brandId || undefined,
        userId: auth.userId || undefined,
      })
      pdfBuffers.push(buf)
    }

    if (mode === 'separate') {
      // Return individual PDFs as base64 with metadata
      const results = pdfBuffers.map((buf, i) => ({
        offerId: offerIds[i],
        offerNumber: offers.find((o) => o.id === offerIds[i])?.offerNumber || '',
        pdf: buf.toString('base64'),
      }))
      return NextResponse.json({ pdfs: results })
    }

    // Combined mode — merge all PDFs into one
    const mergedBuffer = await mergePdfBuffers(pdfBuffers)
    const firstOffer = offers.find((o) => o.id === offerIds[0])
    const fileName = offerIds.length === 1
      ? `${firstOffer?.offerNumber || 'offer'}.pdf`
      : `offers-group-${firstOffer?.groupId || Date.now()}.pdf`

    return new NextResponse(new Uint8Array(mergedBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(mergedBuffer.length),
        'Content-Disposition': `inline; filename="${fileName}"`,
      },
    })
  } catch (error: any) {
    console.error('[offers/group-pdf] error:', error)
    return NextResponse.json(
      { error: 'Failed to generate group PDF', message: error.message },
      { status: 500 },
    )
  }
}
