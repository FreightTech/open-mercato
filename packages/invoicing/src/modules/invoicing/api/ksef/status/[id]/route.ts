import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { InvoicingInvoice, InvoicingSettings } from '../../../../data/entities'
import { getInvoiceStatusUrl } from '../../../../lib/ksef/endpoints'
import { resolveKsefStatus } from '../../../../lib/ksef/status-codes'
import type { KsefInvoiceStatusResponse } from '../../../../lib/ksef/types'
import type { KsefEnvironment } from '../../../../data/types'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['invoicing.ksef.view'] },
}

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  const tenantId = auth.actorTenantId || auth.tenantId

  const invoice = await em.findOne(
    InvoicingInvoice,
    { id, tenantId, deletedAt: null }
  )

  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  if (
    (invoice.ksefStatus === 'submitted' || invoice.ksefStatus === 'processing') &&
    invoice.ksefReferenceNumber
  ) {
    try {
      const settings = await em.findOne(InvoicingSettings, { tenantId, organizationId: invoice.organizationId })
      const environment = (settings?.ksefEnvironment ?? 'test') as KsefEnvironment
      const statusUrl = getInvoiceStatusUrl(environment, invoice.ksefReferenceNumber)

      const response = await fetch(statusUrl, {
        signal: AbortSignal.timeout(5000),
      })

      if (response.ok) {
        const statusResult = (await response.json()) as KsefInvoiceStatusResponse
        const resolved = resolveKsefStatus(statusResult.processingCode)

        if (resolved === 'accepted') {
          invoice.ksefStatus = 'accepted'
          invoice.ksefAcceptedAt = new Date()
          if (statusResult.ksefReferenceNumber) {
            invoice.ksefNumber = statusResult.ksefReferenceNumber
          }
          invoice.ksefErrorMessage = null
          invoice.ksefErrorCode = null
          await em.persist(invoice).flush()
        } else if (resolved === 'rejected') {
          invoice.ksefStatus = 'rejected'
          invoice.ksefErrorMessage = statusResult.processingDescription
          invoice.ksefErrorCode = String(statusResult.processingCode)
          await em.persist(invoice).flush()
        } else if (resolved === 'error') {
          invoice.ksefStatus = 'error'
          invoice.ksefErrorMessage = statusResult.processingDescription
          invoice.ksefErrorCode = String(statusResult.processingCode)
          await em.persist(invoice).flush()
        }
      }
    } catch {
      // KSeF unreachable — return cached status
    }
  }

  return NextResponse.json({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    ksefStatus: invoice.ksefStatus,
    ksefNumber: invoice.ksefNumber,
    ksefSessionId: invoice.ksefSessionId,
    ksefSubmittedAt: invoice.ksefSubmittedAt,
    ksefAcceptedAt: invoice.ksefAcceptedAt,
    ksefReferenceNumber: invoice.ksefReferenceNumber,
    ksefErrorMessage: invoice.ksefErrorMessage,
    ksefErrorCode: invoice.ksefErrorCode,
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Invoicing - KSeF',
  summary: 'KSeF status',
  methods: {
    GET: {
      summary: 'Get KSeF submission status for an invoice',
      description: 'Retrieve the current KSeF submission status, reference number, and any errors',
    },
  },
}
