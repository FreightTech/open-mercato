import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FmsInvoice, FmsInvoiceCostAllocation } from '../../../../data/entities'
import { saveAllocationsSchema } from '../../../../data/invoice-validators'
import '../../../../commands'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_documents.invoices.view'] },
  POST: { requireAuth: true, requireFeatures: ['fms_documents.invoices.manage'] },
}

export const openApi = {
  GET: {
    operationId: 'listInvoiceAllocations',
    summary: 'List cost allocations for an invoice',
    tags: ['FMS Invoice Allocations'],
  },
  POST: {
    operationId: 'saveInvoiceAllocations',
    summary: 'Save batch of cost allocations for an invoice',
    tags: ['FMS Invoice Allocations'],
  },
}

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const em = container.resolve('em') as EntityManager

  const tenantId = auth.actorTenantId || auth.tenantId
  const allowedOrgIds = scope?.filterIds ?? []

  const filter: Record<string, unknown> = { id, tenantId, deletedAt: null }
  if (allowedOrgIds.length > 0) {
    filter.organizationId = { $in: allowedOrgIds }
  }
  const invoice = await em.findOne(FmsInvoice, filter)

  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  const allocations = await em.find(
    FmsInvoiceCostAllocation,
    { invoice },
    {
      populate: ['invoiceLineItem'],
      orderBy: { createdAt: 'asc' },
    }
  )

  return NextResponse.json({
    allocations: allocations.map((a) => ({
      id: a.id,
      invoiceLineItemId: typeof a.invoiceLineItem === 'string' ? a.invoiceLineItem : a.invoiceLineItem.id,
      projectId: a.projectId,
      projectLineId: a.projectLineId,
      amount: a.amount,
      currencyCode: a.currencyCode,
      status: a.status,
      allocatedBy: a.allocatedBy,
      allocatedAt: a.allocatedAt,
      createdAt: a.createdAt,
    })),
  })
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parse = saveAllocationsSchema.safeParse(body)

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
    const { result } = await bus.execute('fms_documents.cost_allocations.save', {
      input: { invoiceId: id, ...parse.data },
      ctx,
    })

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save allocations'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
