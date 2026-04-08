import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { FmsOffer } from '../../../../data/entities'
import { generateOfferPdf } from '../../../../lib/offer-pdf.service'

export const metadata = {
  GET: {
    requireAuth: true,
    requireFeatures: ['fms_offers.offers.view'],
  },
}

export const openApi = {
  GET: {
    summary: 'Generate offer PDF preview as page images',
    tags: ['fms_offers'],
  },
}

type Params = { params: Promise<{ id: string }> }

/**
 * GET: Generate PDF on-the-fly and return pages as base64 PNG images.
 * Used by the offer wizard preview to render the real PDF template
 * without the browser's built-in PDF viewer chrome.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id: offerId } = await params
    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')
    const auth = await getAuthFromRequest(request)

    if (!auth || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const offer = await em.findOne(FmsOffer, {
      id: offerId,
      tenantId: auth.tenantId,
      deletedAt: null,
    })

    if (!offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
    }

    const brandIdHeader = request.headers.get('x-brand-id')
    const brandIdCookie = (request as any).cookies?.get('om_brand_id')?.value
    const brandId = brandIdHeader || brandIdCookie

    const pdfBuffer = await generateOfferPdf(offerId, em, {
      tenantId: auth.tenantId,
      organizationId: offer.organizationId,
      brandId: brandId || undefined,
      userId: auth.userId || undefined,
    })

    // Polyfill DOMMatrix for pdfjs-dist in Node.js
    const { DOMMatrix } = await import('canvas')
    if (typeof globalThis.DOMMatrix === 'undefined') {
      ;(globalThis as Record<string, unknown>).DOMMatrix = DOMMatrix
    }

    const { pdf } = await import('pdf-to-img')
    const document = await pdf(Buffer.from(pdfBuffer), { scale: 2.0 })

    const pages: string[] = []
    for await (const pageImage of document) {
      pages.push(`data:image/png;base64,${Buffer.from(pageImage).toString('base64')}`)
    }

    return NextResponse.json({ pages })
  } catch (error: any) {
    console.error('[offers/preview-images] error:', error)
    return NextResponse.json(
      { error: 'Failed to generate preview', message: error.message },
      { status: 500 }
    )
  }
}
