import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FmsInvoice } from '../../../../data/entities'
import { matchContractorByTaxId } from '../../../../services/contractor-matcher.service'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import '../../../../commands'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_documents.invoices.view'] },
  POST: { requireAuth: true, requireFeatures: ['fms_documents.invoices.manage'] },
}

export const openApi = {
  GET: {
    operationId: 'matchInvoiceContractors',
    summary: 'Match invoice seller/buyer to contractors by tax ID',
    tags: ['FMS Invoices'],
  },
  POST: {
    operationId: 'linkInvoiceContractor',
    summary: 'Link a contractor to the invoice seller or buyer',
    tags: ['FMS Invoices'],
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

  const matchScope = { tenantId: invoice.tenantId, organizationId: invoice.organizationId }

  const [sellerMatch, buyerMatch] = await Promise.all([
    matchContractorByTaxId(em, invoice.sellerTaxId, matchScope),
    matchContractorByTaxId(em, invoice.buyerTaxId, matchScope),
  ])

  return NextResponse.json({
    seller: {
      name: invoice.sellerName,
      taxId: invoice.sellerTaxId,
      contractorId: invoice.sellerContractorId ?? sellerMatch?.contractorId ?? null,
      contractorName: sellerMatch?.contractorName ?? null,
      matched: !!sellerMatch || !!invoice.sellerContractorId,
    },
    buyer: {
      name: invoice.buyerName,
      taxId: invoice.buyerTaxId,
      contractorId: invoice.buyerContractorId ?? buyerMatch?.contractorId ?? null,
      contractorName: buyerMatch?.contractorName ?? null,
      matched: !!buyerMatch || !!invoice.buyerContractorId,
    },
  })
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { party, contractorId } = body as { party: 'seller' | 'buyer'; contractorId: string }

  if (!['seller', 'buyer'].includes(party) || !contractorId) {
    return NextResponse.json({ error: 'party ("seller"/"buyer") and contractorId are required' }, { status: 400 })
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
  const updateData = party === 'seller'
    ? { sellerContractorId: contractorId }
    : { buyerContractorId: contractorId }

  try {
    const { result } = await bus.execute('fms_documents.invoices.update', {
      input: { id, ...updateData },
      ctx,
    })

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to link contractor'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
