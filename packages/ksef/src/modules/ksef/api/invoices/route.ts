import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { KsefInvoice, KsefInvoiceLineItem, KsefSubmission } from '../../data/entities'
import { ksefInvoiceCreateSchema, ksefInvoiceListQuerySchema } from '../../data/validators'
import { emitKsefEvent } from '../../events'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['ksef.view'] },
  POST: { requireAuth: true, requireFeatures: ['ksef.submit'] },
}

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  const tenantId = (auth.actorTenantId as string | undefined) || auth.tenantId
  if (!tenantId) {
    return NextResponse.json({ error: 'Missing tenant context' }, { status: 400 })
  }

  const organizationId = (auth.actorOrgId || auth.orgId) as string

  const url = new URL(request.url)
  const query = ksefInvoiceListQuerySchema.parse({
    page: url.searchParams.get('page') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
    search: url.searchParams.get('search') ?? undefined,
    direction: url.searchParams.get('direction') ?? undefined,
    dateFrom: url.searchParams.get('dateFrom') ?? undefined,
    dateTo: url.searchParams.get('dateTo') ?? undefined,
  })

  const filters: Record<string, unknown> = {
    organizationId,
    tenantId,
    deletedAt: null,
  }

  if (query.direction) {
    filters.direction = query.direction
  }

  if (query.search) {
    filters.$or = [
      { invoiceNumber: { $like: `%${query.search}%` } },
      { sellerName: { $like: `%${query.search}%` } },
      { buyerName: { $like: `%${query.search}%` } },
      { sellerTaxId: { $like: `%${query.search}%` } },
      { buyerTaxId: { $like: `%${query.search}%` } },
    ]
  }

  if (query.dateFrom) {
    filters.invoiceDate = { ...((filters.invoiceDate as Record<string, unknown>) ?? {}), $gte: query.dateFrom }
  }

  if (query.dateTo) {
    filters.invoiceDate = { ...((filters.invoiceDate as Record<string, unknown>) ?? {}), $lte: query.dateTo }
  }

  const offset = (query.page - 1) * query.limit

  const [items, total] = await em.findAndCount(
    KsefInvoice,
    filters as any,
    {
      orderBy: { createdAt: 'desc' },
      limit: query.limit,
      offset,
    }
  )

  // Enrich with KSeF submission status
  const invoiceIds = items.map((inv) => inv.id)
  const submissions = invoiceIds.length > 0
    ? await em.find(KsefSubmission, {
        ksefInvoiceId: { $in: invoiceIds },
        tenantId,
        organizationId,
      })
    : []

  const submissionByInvoiceId = new Map(
    submissions.map((sub) => [sub.ksefInvoiceId, sub])
  )

  const enrichedItems = items.map((inv) => {
    const sub = submissionByInvoiceId.get(inv.id)
    return {
      ...inv,
      ksefStatus: sub?.status ?? null,
      ksefNumber: sub?.ksefNumber ?? null,
    }
  })

  return NextResponse.json({
    items: enrichedItems,
    total,
    page: query.page,
    limit: query.limit,
  })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  const tenantId = (auth.actorTenantId as string | undefined) || auth.tenantId
  if (!tenantId) {
    return NextResponse.json({ error: 'Missing tenant context' }, { status: 400 })
  }

  const organizationId = (auth.actorOrgId || auth.orgId) as string

  const body = await request.json()
  const parsed = ksefInvoiceCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const { lineItems: lineItemsData, ...invoiceData } = parsed.data

  const invoice = em.create(KsefInvoice, {
    organizationId,
    tenantId,
    invoiceNumber: invoiceData.invoiceNumber,
    invoiceDate: invoiceData.invoiceDate ? new Date(invoiceData.invoiceDate) : undefined,
    dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate) : undefined,
    serviceDate: invoiceData.serviceDate ? new Date(invoiceData.serviceDate) : undefined,
    sellerName: invoiceData.sellerName,
    sellerTaxId: invoiceData.sellerTaxId,
    sellerAddress: invoiceData.sellerAddress,
    sellerCountryCode: invoiceData.sellerCountryCode,
    sellerBankAccount: invoiceData.sellerBankAccount,
    buyerName: invoiceData.buyerName,
    buyerTaxId: invoiceData.buyerTaxId,
    buyerAddress: invoiceData.buyerAddress,
    buyerCountryCode: invoiceData.buyerCountryCode,
    netAmount: String(invoiceData.netAmount ?? '0'),
    vatAmount: String(invoiceData.vatAmount ?? '0'),
    grossAmount: String(invoiceData.grossAmount),
    currencyCode: invoiceData.currencyCode,
    paymentMethod: invoiceData.paymentMethod,
    invoiceType: invoiceData.invoiceType,
    correctedInvoiceId: invoiceData.correctedInvoiceId,
    correctionReason: invoiceData.correctionReason,
    direction: invoiceData.direction,
    externalInvoiceId: invoiceData.externalInvoiceId,
  })
  em.persist(invoice)

  for (const li of lineItemsData) {
    const lineItem = em.create(KsefInvoiceLineItem, {
      invoice,
      lineNumber: li.lineNumber,
      description: li.description,
      quantity: String(li.quantity),
      unit: li.unit,
      unitPriceNet: String(li.unitPriceNet),
      netAmount: String(li.netAmount),
      vatAmount: String(li.vatAmount),
      vatRate: li.vatRate,
      vatRateCode: li.vatRateCode,
      gtuCode: li.gtuCode,
    })
    em.persist(lineItem)
  }

  await em.flush()

  await emitKsefEvent('ksef.invoice.created', {
    id: invoice.id,
    invoiceId: invoice.id,
    tenantId,
    organizationId,
    direction: invoice.direction,
  })

  return NextResponse.json({ id: invoice.id, invoiceNumber: invoice.invoiceNumber }, { status: 201 })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'KSeF',
  summary: 'Invoices',
  methods: {
    GET: {
      summary: 'List KSeF invoices',
      description: 'Returns paginated list of KSeF invoices with filtering by direction, date, and search',
    },
    POST: {
      summary: 'Create KSeF invoice',
      description: 'Create a new invoice for KSeF submission',
    },
  },
}
