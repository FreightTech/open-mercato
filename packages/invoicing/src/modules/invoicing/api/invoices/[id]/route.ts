import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { InvoicingInvoice, InvoicingLineItem } from '../../../data/entities'
import { updateInvoiceSchema } from '../../../data/validators'
import '../../../commands/invoices'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['invoicing.invoices.view'] },
  PATCH: { requireAuth: true, requireFeatures: ['invoicing.invoices.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['invoicing.invoices.delete'] },
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
  const em = container.resolve('em') as EntityManager

  const tenantId = auth.actorTenantId || auth.tenantId

  const invoice = await em.findOne(InvoicingInvoice, { id, tenantId, deletedAt: null })

  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  const lineItems = await em.find(
    InvoicingLineItem,
    { invoice },
    { orderBy: { lineNumber: 'asc' } }
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
    sellerCountryCode: invoice.sellerCountryCode,
    sellerBankAccount: invoice.sellerBankAccount,
    buyerName: invoice.buyerName,
    buyerTaxId: invoice.buyerTaxId,
    buyerAddress: invoice.buyerAddress,
    buyerCountryCode: invoice.buyerCountryCode,
    netAmount: invoice.netAmount,
    vatAmount: invoice.vatAmount,
    grossAmount: invoice.grossAmount,
    currencyCode: invoice.currencyCode,
    paymentMethod: invoice.paymentMethod,
    paymentTerms: invoice.paymentTerms,
    direction: invoice.direction,
    sourceType: invoice.sourceType,
    sourceDocumentInvoiceId: invoice.sourceDocumentInvoiceId,
    sourceDocumentId: invoice.sourceDocumentId,
    sourceSalesInvoiceId: invoice.sourceSalesInvoiceId,
    sourceImportReference: invoice.sourceImportReference,
    attachmentId: invoice.attachmentId,
    status: invoice.status,
    ksefStatus: invoice.ksefStatus,
    ksefNumber: invoice.ksefNumber,
    ksefSessionId: invoice.ksefSessionId,
    ksefSubmittedAt: invoice.ksefSubmittedAt,
    ksefAcceptedAt: invoice.ksefAcceptedAt,
    ksefReferenceNumber: invoice.ksefReferenceNumber,
    ksefErrorMessage: invoice.ksefErrorMessage,
    ksefErrorCode: invoice.ksefErrorCode,
    notes: invoice.notes,
    metadata: invoice.metadata,
    reviewedBy: invoice.reviewedBy,
    reviewedAt: invoice.reviewedAt,
    reviewNotes: invoice.reviewNotes,
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
      vatRateCode: li.vatRateCode,
      netAmount: li.netAmount,
      vatAmount: li.vatAmount,
      grossAmount: li.grossAmount,
      productId: li.productId,
      gtuCode: li.gtuCode,
      pkwiuCode: li.pkwiuCode,
      sourceLineItemId: li.sourceLineItemId,
    })),
  })
}

export async function PATCH(request: NextRequest, context: RouteContext) {
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
    const { result } = await bus.execute('invoicing.invoices.update', {
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
    const { result } = await bus.execute('invoicing.invoices.delete', {
      input: { id },
      ctx,
    })

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete invoice'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Invoicing',
  summary: 'Invoice detail',
  methods: {
    GET: {
      summary: 'Get invoice by ID',
      description: 'Retrieve a single invoice with its line items',
    },
    PATCH: {
      summary: 'Update invoice',
      description: 'Update an existing invoice',
    },
    DELETE: {
      summary: 'Delete invoice',
      description: 'Soft-delete an invoice',
    },
  },
}
