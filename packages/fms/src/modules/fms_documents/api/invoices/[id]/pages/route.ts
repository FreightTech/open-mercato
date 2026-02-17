import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsInvoice, FmsInvoicePage } from '../../../../data/entities'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_documents.invoices.view'] },
}

export const metadata = routeMetadata

type RouteParams = {
  params: Promise<{ id: string }>
}

/**
 * GET /api/fms_documents/invoices/[id]/pages
 * Returns list of page metadata for an invoice
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params

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

  // Get all pages for this invoice
  const pages = await em.find(
    FmsInvoicePage,
    {
      invoice: id,
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
    imageUrl: `/api/fms_documents/invoices/${id}/pages/${page.pageNumber}/image`,
  }))

  return NextResponse.json({
    invoiceId: id,
    totalPages: pages.length,
    pages: pageData,
  })
}
