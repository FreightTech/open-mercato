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
    summary: 'Generate combined PDF preview images for a group of offers',
    tags: ['fms_offers'],
  },
}

/**
 * GET /api/fms_offers/offers/group-preview-images?offerIds=id1,id2
 *
 * Generates PDFs for the given offers, merges them, then converts
 * each page to a PNG image for the wizard preview.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthFromRequest(request)
    if (!auth || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const offerIdsParam = url.searchParams.get('offerIds')

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

    // Generate and merge PDFs
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

    const pdfBuffer = offerIds.length === 1
      ? pdfBuffers[0]
      : await mergePdfBuffers(pdfBuffers)

    // Convert to page images
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
    console.error('[offers/group-preview-images] error:', error)
    return NextResponse.json(
      { error: 'Failed to generate group preview', message: error.message },
      { status: 500 },
    )
  }
}
