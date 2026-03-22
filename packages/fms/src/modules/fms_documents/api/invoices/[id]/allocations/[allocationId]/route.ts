import { NextRequest, NextResponse } from 'next/server'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import '../../../../../commands'

export const metadata = {
  DELETE: { requireAuth: true, requireFeatures: ['fms_documents.invoices.manage'] },
}

export const openApi = {
  DELETE: {
    operationId: 'removeInvoiceAllocation',
    summary: 'Remove a cost allocation from an invoice',
    tags: ['FMS Invoice Allocations'],
  },
}

type RouteContext = { params: Promise<{ id: string; allocationId: string }> }

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id, allocationId } = await context.params
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    const { result } = await bus.execute('fms_documents.cost_allocations.remove', {
      input: { invoiceId: id, allocationId },
      ctx,
    })

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to remove allocation'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
