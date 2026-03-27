import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { InvoicingInvoice } from '../../data/entities'
import { createInvoiceSchema, invoiceListQuerySchema } from '../../data/validators'
import '../../commands/invoices'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['invoicing.invoices.view'] },
  POST: { requireAuth: true, requireFeatures: ['invoicing.invoices.manage'] },
}

export const metadata = routeMetadata

const listSchema = invoiceListQuerySchema.extend({}).passthrough()

function buildSearchFilters(query: z.infer<typeof invoiceListQuerySchema>): Record<string, unknown> {
  const filters: Record<string, unknown> = {}

  if (query.q && query.q.trim().length > 0) {
    const term = `%${escapeLikePattern(query.q.trim())}%`
    filters.$or = [
      { invoice_number: { $ilike: term } },
      { seller_name: { $ilike: term } },
      { buyer_name: { $ilike: term } },
      { ksef_number: { $ilike: term } },
    ]
  }

  if (query.status) {
    filters.status = query.status
  }

  if (query.ksefStatus) {
    filters.ksef_status = query.ksefStatus
  }

  if (query.direction) {
    filters.direction = query.direction
  }

  if (query.sourceType) {
    filters.source_type = query.sourceType
  }

  if (query.sellerTaxId) {
    filters.seller_tax_id = { $eq: query.sellerTaxId }
  }

  if (query.buyerTaxId) {
    filters.buyer_tax_id = { $eq: query.buyerTaxId }
  }

  if (query.dateFrom) {
    filters.invoice_date = { $gte: query.dateFrom }
  }

  if (query.dateTo) {
    filters.invoice_date = {
      ...(filters.invoice_date as Record<string, unknown> ?? {}),
      $lte: query.dateTo,
    }
  }

  return filters
}

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: InvoicingInvoice,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  indexer: { entityType: 'invoicing:invoicing_invoice' },
  list: {
    schema: listSchema,
    entityId: 'invoicing:invoicing_invoice',
    fields: [
      'id',
      'invoice_number',
      'invoice_date',
      'due_date',
      'service_date',
      'seller_name',
      'seller_tax_id',
      'seller_address',
      'buyer_name',
      'buyer_tax_id',
      'buyer_address',
      'net_amount',
      'vat_amount',
      'gross_amount',
      'currency_code',
      'direction',
      'source_type',
      'status',
      'ksef_status',
      'ksef_number',
      'organization_id',
      'tenant_id',
      'created_at',
      'updated_at',
    ],
    sortFieldMap: {
      id: 'id',
      invoiceNumber: 'invoice_number',
      invoiceDate: 'invoice_date',
      dueDate: 'due_date',
      sellerName: 'seller_name',
      buyerName: 'buyer_name',
      netAmount: 'net_amount',
      grossAmount: 'gross_amount',
      status: 'status',
      ksefStatus: 'ksef_status',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    buildFilters: async (query) => buildSearchFilters(query),
    transformItem: (item: Record<string, unknown>) => ({
      id: item.id,
      invoiceNumber: item.invoice_number ?? null,
      invoiceDate: item.invoice_date ?? null,
      dueDate: item.due_date ?? null,
      serviceDate: item.service_date ?? null,
      sellerName: item.seller_name ?? null,
      sellerTaxId: item.seller_tax_id ?? null,
      sellerAddress: item.seller_address ?? null,
      buyerName: item.buyer_name ?? null,
      buyerTaxId: item.buyer_tax_id ?? null,
      buyerAddress: item.buyer_address ?? null,
      netAmount: item.net_amount ?? '0',
      vatAmount: item.vat_amount ?? '0',
      grossAmount: item.gross_amount ?? '0',
      currencyCode: item.currency_code ?? 'PLN',
      direction: item.direction ?? 'outgoing',
      sourceType: item.source_type ?? 'manual',
      status: item.status ?? 'draft',
      ksefStatus: item.ksef_status ?? 'none',
      ksefNumber: item.ksef_number ?? null,
      organizationId: item.organization_id ?? null,
      tenantId: item.tenant_id ?? null,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }),
  },
})

export const GET = crud.GET

export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parse = createInvoiceSchema.omit({ organizationId: true, tenantId: true }).safeParse(body)

  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parse.error },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })

  const tenantId = auth.actorTenantId || auth.tenantId
  const organizationId = auth.actorOrgId || auth.orgId

  if (!tenantId || !organizationId) {
    return NextResponse.json({ error: 'Missing tenant or organization context' }, { status: 400 })
  }

  const ctx: CommandRuntimeContext = {
    container,
    auth,
    organizationScope: scope,
    selectedOrganizationId: organizationId as string,
    organizationIds: scope?.filterIds ?? null,
    request,
  }

  const bus = new CommandBus()

  try {
    const { result } = await bus.execute('invoicing.invoices.create', {
      input: {
        ...parse.data,
        organizationId: organizationId as string,
        tenantId: tenantId as string,
        createdBy: typeof auth.userId === 'string' ? auth.userId : null,
      },
      ctx,
    })

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create invoice'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Invoicing',
  summary: 'Invoices',
  methods: {
    GET: {
      summary: 'List invoices',
      description: 'List all invoices with filtering, sorting, and pagination',
    },
    POST: {
      summary: 'Create invoice',
      description: 'Create a new invoice',
    },
  },
}
