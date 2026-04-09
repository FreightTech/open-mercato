import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { Document, DocumentPage } from '../../../../data/entities'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['documents.view'] },
}

export const metadata = routeMetadata

type RouteParams = {
  params: Promise<{ id: string }>
}

/**
 * GET /api/documents/documents/[id]/pages
 * Returns list of page metadata for a document
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params

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

  const pages = await em.find(
    DocumentPage,
    {
      document: id,
      organizationId,
      tenantId,
    },
    {
      orderBy: { pageNumber: 'ASC' },
    }
  )

  const pageData = pages.map((page) => ({
    id: page.id,
    pageNumber: page.pageNumber,
    width: page.width,
    height: page.height,
    fileSize: page.fileSize,
    imageUrl: `/api/documents/documents/${id}/pages/${page.pageNumber}/image`,
  }))

  return NextResponse.json({
    documentId: id,
    totalPages: pages.length,
    pages: pageData,
  })
}
