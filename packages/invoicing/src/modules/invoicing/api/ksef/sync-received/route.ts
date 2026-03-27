import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { InvoicingSettings } from '../../../data/entities'
import { syncReceivedSchema } from '../../../data/validators'
import type { ReceiveSyncPayload } from '../../../workers/ksef-receive-sync'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['invoicing.ksef.receive'] },
}

export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const parse = syncReceivedSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parse.error },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  const tenantId = (auth.actorTenantId as string | undefined) || auth.tenantId
  const organizationId = (auth.actorOrgId as string | undefined) || auth.orgId

  if (!tenantId || !organizationId) {
    return NextResponse.json({ error: 'Missing tenant or organization context' }, { status: 400 })
  }

  try {
    const settings = await em.findOne(InvoicingSettings, { tenantId, organizationId })
    const nip = settings?.defaultSellerNip

    if (!nip) {
      return NextResponse.json(
        { error: 'Default seller NIP is not configured in invoicing settings' },
        { status: 400 }
      )
    }

    const dateFrom = parse.data.dateFrom?.toISOString().slice(0, 10)
    const dateTo = parse.data.dateTo?.toISOString().slice(0, 10)

    const { createQueue } = await import('@open-mercato/queue')
    const receiveQueue = createQueue<ReceiveSyncPayload>('invoicing-ksef-receive-sync', 'local')
    await receiveQueue.enqueue({
      tenantId,
      organizationId,
      nip,
      dateFrom,
      dateTo,
    })

    return NextResponse.json({
      message: 'Receive sync job enqueued',
      nip,
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to sync received invoices from KSeF'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Invoicing - KSeF',
  summary: 'Sync received invoices',
  methods: {
    POST: {
      summary: 'Sync received invoices from KSeF',
      description: 'Download and import invoices received via KSeF within the specified date range',
    },
  },
}
