import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FmsInvoice, FmsInvoiceLineItem } from '../../../data/entities'
import { updateInvoiceSchema, approveInvoiceSchema, rejectInvoiceSchema } from '../../../data/validators'
// Import to register commands
import '../../../commands'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_financials.invoices.view'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_financials.invoices.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_financials.invoices.delete'] },
  POST: { requireAuth: true, requireFeatures: ['fms_financials.invoices.approve'] },
}

export const metadata = routeMetadata

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

  const invoice = await em.findOne(
    FmsInvoice,
    {
      id,
      tenantId,
      organizationId: { $in: allowedOrgIds },
      deletedAt: null,
    }
  )

  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  // Load line items
  const lineItems = await em.find(
    FmsInvoiceLineItem,
    { invoice },
    {
      populate: ['product'],
      orderBy: { lineNumber: 'asc' },
    }
  )

  return NextResponse.json({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    serviceDate: invoice.serviceDate,
    sellerName: invoice.sellerName,
    sellerTaxId: invoice.sellerTaxId,
    sellerAddress: invoice.sellerAddress,
    buyerName: invoice.buyerName,
    buyerTaxId: invoice.buyerTaxId,
    buyerAddress: invoice.buyerAddress,
    netAmount: invoice.netAmount,
    vatAmount: invoice.vatAmount,
    grossAmount: invoice.grossAmount,
    currencyCode: invoice.currencyCode,
    status: invoice.status,
    extractionConfidence: invoice.extractionConfidence,
    extractedData: invoice.extractedData,
    attachmentId: invoice.attachmentId,
    originalFilename: invoice.originalFilename,
    processedAt: invoice.processedAt,
    reviewedBy: invoice.reviewedBy,
    reviewedAt: invoice.reviewedAt,
    reviewNotes: invoice.reviewNotes,
    // Document type
    documentType: invoice.documentType,
    documentTypeConfidence: invoice.documentTypeConfidence,
    // Transportation metadata / References
    blNumber: invoice.blNumber,
    vesselName: invoice.vesselName,
    voyageNumber: invoice.voyageNumber,
    containerNumbers: invoice.containerNumbers,
    transportationMetadata: invoice.transportationMetadata,
    customReference: invoice.customReference,
    organizationId: invoice.organizationId,
    tenantId: invoice.tenantId,
    createdAt: invoice.createdAt,
    createdBy: invoice.createdBy,
    updatedAt: invoice.updatedAt,
    updatedBy: invoice.updatedBy,
    lineItems: lineItems.map((li) => ({
      id: li.id,
      lineNumber: li.lineNumber,
      description: li.description,
      quantity: li.quantity,
      unit: li.unit,
      unitPriceNet: li.unitPriceNet,
      vatRate: li.vatRate,
      netAmount: li.netAmount,
      vatAmount: li.vatAmount,
      grossAmount: li.grossAmount,
      productId: li.product?.id ?? null,
      productName: li.product?.name ?? null,
      chargeCode: li.product?.chargeCode ?? null,
      chargeCodeMatchConfidence: li.chargeCodeMatchConfidence,
      rawDescription: li.rawDescription,
    })),
  })
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parse = updateInvoiceSchema.safeParse(body)

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
    const { result } = await bus.execute('fms_financials.invoices.update', {
      input: {
        id,
        ...parse.data,
        updatedBy: typeof auth.userId === 'string' ? auth.userId : null,
      },
      ctx,
    })

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update invoice'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
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
    const { result } = await bus.execute('fms_financials.invoices.delete', {
      input: { id },
      ctx,
    })

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete invoice'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

// POST for approve/reject actions
export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const action = body.action as 'approve' | 'reject'

  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action. Use "approve" or "reject"' }, { status: 400 })
  }

  const schema = action === 'approve' ? approveInvoiceSchema : rejectInvoiceSchema
  const parse = schema.safeParse(body)

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
  const commandId = action === 'approve'
    ? 'fms_financials.invoices.approve'
    : 'fms_financials.invoices.reject'

  try {
    const { result } = await bus.execute(commandId, {
      input: {
        id,
        ...parse.data,
        reviewedBy: typeof auth.userId === 'string' ? auth.userId : null,
      },
      ctx,
    })

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : `Failed to ${action} invoice`
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
