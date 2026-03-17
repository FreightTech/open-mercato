import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { createInvoiceSchema } from '../../../data/validators'
import { FmsInvoicingInvoice, FmsInvoicingLineItem } from '../../../data/entities'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['fms_invoicing.invoices.manage'] },
}

const importBatchSchema = z.object({
  invoices: z.array(createInvoiceSchema.omit({ organizationId: true, tenantId: true })).min(1).max(100),
})

export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parse = importBatchSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parse.error },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()

  const tenantId = auth.actorTenantId || auth.tenantId
  const organizationId = auth.actorOrgId || auth.orgId

  if (!tenantId || !organizationId) {
    return NextResponse.json({ error: 'Missing tenant or organization context' }, { status: 400 })
  }

  try {
    const em = container.resolve('em') as EntityManager
    const createdBy = typeof auth.userId === 'string' ? auth.userId : null
    const errors: Array<{ index: number; message: string }> = []
    let imported = 0

    for (let idx = 0; idx < parse.data.invoices.length; idx++) {
      try {
        const invoiceData = parse.data.invoices[idx]
        const { lineItems, ...invoiceFields } = invoiceData

        const invoice = em.create(FmsInvoicingInvoice, {
          ...invoiceFields,
          organizationId: organizationId as string,
          tenantId: tenantId as string,
          sourceType: invoiceFields.sourceType ?? 'external_import',
          createdBy,
        })
        em.persist(invoice)
        await em.flush()

        if (lineItems) {
          for (const lineData of lineItems) {
            const lineItem = em.create(FmsInvoicingLineItem, {
              organizationId: organizationId as string,
              tenantId: tenantId as string,
              invoice,
              ...lineData,
            })
            em.persist(lineItem)
          }
          await em.flush()
        }

        imported++
      } catch (err) {
        errors.push({
          index: idx,
          message: err instanceof Error ? err.message : `Failed to import invoice at index ${idx}`,
        })
      }
    }

    return NextResponse.json({
      imported,
      failed: errors.length,
      total: parse.data.invoices.length,
      errors,
    }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to import invoices'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'FMS Invoicing',
  summary: 'Import invoices',
  methods: {
    POST: {
      summary: 'Batch import invoices',
      description: 'Import multiple invoices from external data',
    },
  },
}
