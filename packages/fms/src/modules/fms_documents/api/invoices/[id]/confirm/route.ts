import { NextRequest, NextResponse } from 'next/server'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { confirmInvoiceSchema } from '../../../../data/invoice-validators'
import '../../../../commands'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['fms_documents.invoices.manage'] },
}

export const openApi = {
  POST: {
    operationId: 'confirmInvoice',
    summary: 'Confirm invoice (step 1 verification)',
    tags: ['FMS Invoices'],
  },
}

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parse = confirmInvoiceSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parse.error },
      { status: 400 }
    )
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
    const { result } = await bus.execute('fms_documents.invoices.confirm', {
      input: { id, ...parse.data },
      ctx,
    })

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to confirm invoice'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
