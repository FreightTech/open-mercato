import { NextRequest, NextResponse } from 'next/server'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import '../../../../commands'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['fms_documents.invoices.manage'] },
}

export const openApi = {
  POST: {
    operationId: 'toggleInvoiceLineExclude',
    summary: 'Toggle excluded state for a line item and recalculate totals',
    tags: ['FMS Invoices'],
  },
}

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { lineItemId } = body as { lineItemId: string }

  if (!lineItemId) {
    return NextResponse.json({ error: 'lineItemId is required' }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })

  const ctx: CommandRuntimeContext = {
    container,
    auth,
    organizationScope: scope,
    selectedOrganizationId: (auth.actorOrgId || auth.orgId) as string,
    organizationIds: scope?.filterIds ?? null,
    request,
  }

  const bus = new CommandBus()

  try {
    const { result } = await bus.execute('fms_documents.line_items.toggle_exclude', {
      input: { lineItemId },
      ctx,
    })

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to toggle exclude'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
