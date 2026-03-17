import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { FmsInvoicingInvoice } from '../../../data/entities'
import { submitBatchSchema } from '../../../data/validators'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['fms_invoicing.ksef.submit'] },
}

export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parse = submitBatchSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parse.error },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const em = container.resolve('em') as EntityManager

  const tenantId = auth.actorTenantId || auth.tenantId
  const allowedOrgIds = scope?.filterIds ?? []

  const invoices = await em.find(FmsInvoicingInvoice, {
    id: { $in: parse.data.invoiceIds },
    tenantId,
    organizationId: { $in: allowedOrgIds },
    deletedAt: null,
  })

  const notFound = parse.data.invoiceIds.filter(
    (reqId) => !invoices.some((inv) => inv.id === reqId)
  )

  const notApproved = invoices.filter((inv) => inv.status !== 'approved')
  const alreadySubmitted = invoices.filter(
    (inv) => inv.ksefStatus !== 'none' && inv.ksefStatus !== 'error' && inv.ksefStatus !== 'cancelled'
  )

  const eligible = invoices.filter(
    (inv) =>
      inv.status === 'approved' &&
      (inv.ksefStatus === 'none' || inv.ksefStatus === 'error' || inv.ksefStatus === 'cancelled')
  )

  try {
    // TODO: Sprint 4 - Wire up KSeF batch session for actual submission
    // const ksefService = container.resolve('fmsInvoicingService') as InvoicingService
    // const result = await ksefService.submitBatchToKsef(eligible, { container, auth, scope })

    for (const invoice of eligible) {
      invoice.ksefStatus = 'queued'
      invoice.updatedAt = new Date()
    }
    await em.flush()

    return NextResponse.json({
      queued: eligible.map((inv) => inv.id),
      queuedCount: eligible.length,
      skipped: {
        notFound,
        notApproved: notApproved.map((inv) => inv.id),
        alreadySubmitted: alreadySubmitted.map((inv) => inv.id),
      },
      total: parse.data.invoiceIds.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to submit batch to KSeF'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'FMS Invoicing - KSeF',
  summary: 'Batch submit to KSeF',
  methods: {
    POST: {
      summary: 'Submit multiple invoices to KSeF',
      description: 'Queue a batch of approved invoices for submission to KSeF. Returns a report of queued, skipped, and failed invoices.',
    },
  },
}
