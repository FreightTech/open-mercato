import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { KsefInvoice, KsefInvoiceLineItem, KsefSubmission } from '../../../data/entities'

export const metadata = {
  DELETE: { requireAuth: true, requireFeatures: ['ksef.submit'] },
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  const tenantId = (auth.actorTenantId as string | undefined) || auth.tenantId
  const organizationId = (auth.actorOrgId || auth.orgId) as string

  if (!tenantId) {
    return NextResponse.json({ error: 'Missing tenant context' }, { status: 400 })
  }

  const url = new URL(request.url)
  const direction = url.searchParams.get('direction') // 'incoming', 'outgoing', or null for all

  const invoiceWhere: Record<string, unknown> = { tenantId, organizationId }
  if (direction) invoiceWhere.direction = direction

  // Find all matching invoices
  const invoices = await em.find(KsefInvoice, invoiceWhere)
  const invoiceIds = invoices.map((inv) => inv.id)

  if (invoiceIds.length === 0) {
    // Still clear orphan submissions
    const orphansSub = await em.nativeDelete(KsefSubmission, { tenantId, organizationId })
    if (orphansSub > 0) {
      const { createIntegrationLogService } = await import('@open-mercato/core/modules/integrations/lib/log-service')
      const log = createIntegrationLogService(em).scoped('ksef', { tenantId, organizationId })
      await log.info(`Cleared ${orphansSub} orphan submission(s)`, { direction: direction ?? 'all' })
    }
    return NextResponse.json({ deleted: 0, submissions: orphansSub })
  }

  // Delete line items for these invoices
  await em.nativeDelete(KsefInvoiceLineItem, { invoice: { $in: invoiceIds } })

  // Delete ALL submissions for this scope (includes orphans and those linked by ksefNumber)
  await em.nativeDelete(KsefSubmission, { tenantId, organizationId })

  // Delete the invoices themselves
  const deleted = await em.nativeDelete(KsefInvoice, { id: { $in: invoiceIds } })

  const { createIntegrationLogService } = await import('@open-mercato/core/modules/integrations/lib/log-service')
  const log = createIntegrationLogService(em).scoped('ksef', { tenantId, organizationId })
  await log.info(`Cleared ${deleted} synced invoice(s)`, { direction: direction ?? 'all', deleted })

  return NextResponse.json({ deleted })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'KSeF',
  summary: 'Clear synced invoices',
  methods: {
    DELETE: {
      summary: 'Delete all synced KSeF invoices',
      description: 'Removes synced invoices and their submissions from the database. Use for testing to allow re-syncing.',
    },
  },
}
