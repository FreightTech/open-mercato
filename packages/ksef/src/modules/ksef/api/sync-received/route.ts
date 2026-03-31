import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { syncReceivedSchema } from '../../data/validators'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['ksef.receive'] },
}

export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  const tenantId = (auth.actorTenantId as string | undefined) || auth.tenantId
  if (!tenantId) {
    return NextResponse.json({ error: 'Missing tenant context' }, { status: 400 })
  }

  const organizationId = (auth.actorOrgId || auth.orgId) as string

  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    // Empty body is OK
  }

  const parsed = syncReceivedSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  // Load KSeF credentials to get NIP
  const { createCredentialsService } = await import('@open-mercato/core/modules/integrations/lib/credentials-service')
  const credentialsService = createCredentialsService(em)
  const credentials = await credentialsService.resolve('ksef', { tenantId, organizationId })

  if (!credentials?.nip) {
    return NextResponse.json(
      { error: 'KSeF credentials not configured. Go to Integrations > KSeF to set up credentials.' },
      { status: 400 }
    )
  }

  const nip = credentials.nip as string

  try {
    const { createQueue } = await import('@open-mercato/queue')
    const receiveQueue = createQueue<{
      tenantId: string
      organizationId: string
      nip: string
      dateFrom?: string
      dateTo?: string
    }>('ksef-receive-sync', 'local')

    await receiveQueue.enqueue({
      tenantId,
      organizationId,
      nip,
      dateFrom: parsed.data.dateFrom,
      dateTo: parsed.data.dateTo,
    })

    return NextResponse.json({
      message: 'KSeF receive sync job enqueued',
      nip,
      dateFrom: parsed.data.dateFrom ?? null,
      dateTo: parsed.data.dateTo ?? null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to enqueue sync job'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'KSeF',
  summary: 'Sync received',
  methods: {
    POST: {
      summary: 'Sync received invoices from KSeF',
      description: 'Start a background job to download and import received invoices from KSeF',
    },
  },
}
