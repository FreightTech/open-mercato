import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FmsInvoice } from '../../../../data/entities'
import { findMatchingProjects } from '../../../../services/project-matcher.service'
import { FmsProjectLine } from '../../../../../fms_projects/data/entities'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_documents.invoices.view'] },
}

export const openApi = {
  GET: {
    operationId: 'getInvoiceProjectLines',
    summary: 'Get matched projects and their lines for cost allocation',
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

  // Find matching projects using transportation metadata
  const identifiers = {
    blNumber: invoice.blNumber || invoice.transportationMetadata?.blNumber || null,
    mblNumber: invoice.transportationMetadata?.mblNumber || null,
    bookingNumber: invoice.transportationMetadata?.bookingNumber || null,
  }

  const matchedProjects = await findMatchingProjects(em, identifiers, {
    tenantId: invoice.tenantId,
    organizationId: invoice.organizationId,
  })

  // For each matched project, fetch project lines
  const projectsWithLines = await Promise.all(
    matchedProjects.map(async (mp) => {
      const lines = await em.find(
        FmsProjectLine,
        {
          project: mp.projectId,
          deletedAt: null,
        },
        { orderBy: { lineNumber: 'asc' } }
      )

      return {
        projectId: mp.projectId,
        projectNumber: mp.projectNumber,
        clientName: mp.clientName,
        currentStep: mp.currentStep,
        matchedBy: mp.matchedBy,
        lines: lines.map((l) => ({
          id: l.id,
          lineNumber: l.lineNumber,
          productName: l.productName,
          chargeCode: l.chargeCode,
          chargeCategory: l.chargeCategory,
          containerSize: l.containerSize,
          quantity: l.quantity,
          currencyCode: l.currencyCode,
          soldUnitPrice: l.soldUnitPrice,
          soldAmount: l.soldAmount,
          estimatedCost: l.estimatedCost,
          actualCost: l.actualCost,
          invoicedCost: l.invoicedCost,
        })),
      }
    })
  )

  return NextResponse.json({ projects: projectsWithLines })
}
