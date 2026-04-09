import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { Document, DocumentPage } from '../../../../../../data/entities'
import type { PageImageService } from '../../../../../../services/page-image.service'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['documents.view'] },
}

export const metadata = routeMetadata

type RouteParams = {
  params: Promise<{ id: string; pageNum: string }>
}

/**
 * GET /api/documents/documents/[id]/pages/[pageNum]/image
 * Returns PNG image for a specific document page
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

  if (!auth.orgId || !auth.tenantId) {
    return NextResponse.json({ error: 'Missing tenant or organization context' }, { status: 400 })
  }

  const organizationId = auth.orgId
  const tenantId = auth.tenantId

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  const document = await em.findOne(Document, {
    id,
    organizationId,
    tenantId,
    deletedAt: null,
  })

  if (!document) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const page = await em.findOne(DocumentPage, {
    document: id,
    pageNumber,
    organizationId,
    tenantId,
  })

  if (!page) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 })
  }

  const pageImageService = container.resolve<PageImageService>('documentPageImageService')
  const imageBuffer = await pageImageService.getPageImageBuffer(page.storagePath)

  if (!imageBuffer || imageBuffer.length === 0) {
    return NextResponse.json({ error: 'Page image not found in storage' }, { status: 404 })
  }

  const mimeType = pageImageService.getMimeType()

  return new NextResponse(new Uint8Array(imageBuffer), {
    status: 200,
    headers: {
      'Content-Type': mimeType,
      'Content-Length': imageBuffer.length.toString(),
      'Cache-Control': 'private, no-cache',
      'Content-Disposition': `inline; filename="document-${id}-page-${pageNumber}.png"`,
    },
  })
}
