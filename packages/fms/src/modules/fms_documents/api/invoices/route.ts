import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { FmsInvoice } from '../../data/entities'
import { createInvoiceSchema } from '../../data/invoice-validators'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
// Import to register commands
import '../../commands'

const listSchema = z
  .object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    q: z.string().optional(),
    status: z.enum(['pending_review', 'approved', 'rejected', 'matched']).optional(),
    sellerName: z.string().optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
    sortField: z.string().optional(),
    sortDir: z.enum(['asc', 'desc']).optional(),
  })
  .loose()

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_documents.invoices.view'] },
  POST: { requireAuth: true, requireFeatures: ['fms_documents.invoices.manage'] },
}

export const metadata = routeMetadata

// Field mapping from frontend camelCase to database field names
const FIELD_MAP: Record<string, string> = {
  id: 'id',
  organizationId: 'organization_id',
  tenantId: 'tenant_id',
  invoiceNumber: 'invoice_number',
  invoiceDate: 'invoice_date',
  dueDate: 'due_date',
  serviceDate: 'service_date',
  sellerName: 'seller_name',
  sellerTaxId: 'seller_tax_id',
  sellerAddress: 'seller_address',
  buyerName: 'buyer_name',
  buyerTaxId: 'buyer_tax_id',
  buyerAddress: 'buyer_address',
  netAmount: 'net_amount',
  vatAmount: 'vat_amount',
  grossAmount: 'gross_amount',
  currencyCode: 'currency_code',
  status: 'status',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
}

function buildSearchFilters(query: z.infer<typeof listSchema>): Record<string, unknown> {
  const filters: Record<string, unknown> = {}

  if (query.q && query.q.trim().length > 0) {
    const term = `%${escapeLikePattern(query.q.trim())}%`
    filters.invoice_number = { $ilike: term }
  }

  if (query.status) {
    filters.status = query.status
  }

  if (query.sellerName) {
    filters.seller_name = { $ilike: `%${escapeLikePattern(query.sellerName)}%` }
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
    entity: FmsInvoice,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  indexer: { entityType: 'fms_documents:fms_invoice' },
  list: {
    schema: listSchema,
    entityId: 'fms_documents:fms_invoice',
    fields: [
      'id',
      'invoice_number',
      'invoice_date',
      'due_date',
      'service_date',
      'seller_name',
      'seller_tax_id',
      'buyer_name',
      'buyer_tax_id',
      'net_amount',
      'vat_amount',
      'gross_amount',
      'currency_code',
      'status',
      'extraction_confidence',
      'original_filename',
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
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    buildFilters: async (query) => buildSearchFilters(query),
    transformItem: (item: any) => ({
      id: item.id,
      invoiceNumber: item.invoice_number ?? null,
      invoiceDate: item.invoice_date ?? null,
      dueDate: item.due_date ?? null,
      serviceDate: item.service_date ?? null,
      sellerName: item.seller_name ?? null,
      sellerTaxId: item.seller_tax_id ?? null,
      buyerName: item.buyer_name ?? null,
      buyerTaxId: item.buyer_tax_id ?? null,
      netAmount: item.net_amount ?? '0',
      vatAmount: item.vat_amount ?? '0',
      grossAmount: item.gross_amount ?? '0',
      currencyCode: item.currency_code ?? 'PLN',
      status: item.status ?? 'pending_review',
      extractionConfidence: item.extraction_confidence ?? null,
      originalFilename: item.original_filename ?? null,
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
  const parse = createInvoiceSchema.safeParse(body)

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
    const { result } = await bus.execute('fms_documents.invoices.create', {
      input: {
        ...parse.data,
        organizationId: organizationId as string,
        tenantId: tenantId as string,
        createdBy: typeof auth.userId === 'string' ? auth.userId : null,
      },
      ctx,
    })

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create invoice'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
