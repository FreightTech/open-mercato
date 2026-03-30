import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import type { InvoicingService } from '../../../services/invoicing.service'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['invoicing.invoices.manage'] },
}

const importFromSalesSchema = z.object({
  salesInvoiceId: z.string().uuid(),
})

export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parse = importFromSalesSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parse.error },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()

  const tenantId = auth.actorTenantId || auth.tenantId
  const organizationId = auth.actorOrgId || auth.orgId

  if (!tenantId || !organizationId) {
    return NextResponse.json({ error: 'Missing tenant or organization context' }, { status: 400 })
  }

  try {
    const invoicingService = container.resolve('invoicingService') as InvoicingService
    const em = container.resolve('em') as import('@mikro-orm/postgresql').EntityManager

    const result = await invoicingService.importFromSalesInvoice(em, {
      salesInvoiceId: parse.data.salesInvoiceId,
      organizationId: organizationId as string,
      tenantId: tenantId as string,
      createdBy: typeof auth.userId === 'string' ? auth.userId : null,
    })

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to import invoice from sales'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Invoicing',
  summary: 'Import from sales',
  methods: {
    POST: {
      summary: 'Import invoice from sales module',
      description: 'Create an invoicing invoice from a sales module invoice',
    },
  },
}
