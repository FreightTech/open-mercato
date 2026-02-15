import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsInvoice, FmsInvoicePage } from '../../../../../../data/entities'
import type { PageImageService } from '../../../../../../services/page-image.service'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_documents.invoices.view'] },
}

export const metadata = routeMetadata

type RouteParams = {
  params: Promise<{ id: string; pageNum: string }>
}

/**
 * GET /api/fms_documents/invoices/[id]/pages/[pageNum]/image
 * Returns PNG image for a specific page
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id, pageNum } = await params

  const pageNumber = parseInt(pageNum, 10)
  if (isNaN(pageNumber) || pageNumber < 1) {
    return NextResponse.json({ error: 'Invalid page number' }, { status: 400 })
  }

  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenantId = auth.actorTenantId || auth.tenantId
  const organizationId = auth.actorOrgId || auth.orgId

  if (!tenantId || !organizationId) {
    return NextResponse.json({ error: 'Missing tenant or organization context' }, { status: 400 })
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  // Verify invoice exists and user has access
  const invoice = await em.findOne(FmsInvoice, {
    id,
    organizationId,
    tenantId,
    deletedAt: null,
  })

  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  // Find the page record
  const page = await em.findOne(FmsInvoicePage, {
    invoice: id,
    pageNumber,
    organizationId,
    tenantId,
  })

  if (!page) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 })
  }

  // Get the image buffer via DI-resolved service
  const pageImageService = container.resolve<PageImageService>('fmsPageImageService')
  const imageBuffer = await pageImageService.getPageImageBuffer(page.storagePath)

  if (!imageBuffer) {
    return NextResponse.json({ error: 'Page image not found in storage' }, { status: 404 })
  }

  // Return the image with appropriate headers
  const mimeType = pageImageService.getMimeType()

  // Convert Node.js Buffer to Uint8Array for NextResponse compatibility
  const uint8Array = new Uint8Array(imageBuffer)

  return new NextResponse(uint8Array, {
    status: 200,
    headers: {
      'Content-Type': mimeType,
      'Content-Length': imageBuffer.length.toString(),
      'Cache-Control': 'private, max-age=3600',
      'Content-Disposition': `inline; filename="invoice-${id}-page-${pageNumber}.png"`,
    },
  })
}
