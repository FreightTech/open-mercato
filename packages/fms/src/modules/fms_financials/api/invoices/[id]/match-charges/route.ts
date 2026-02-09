import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FmsInvoice, FmsInvoiceLineItem } from '../../../../data/entities'
import { ChargeCodeMatcherService } from '../../../../services/charge-code-matcher.service'
// Import to register commands
import '../../../../commands'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_financials.invoices.view'] },
  POST: { requireAuth: true, requireFeatures: ['fms_financials.invoices.manage'] },
}

export const metadata = routeMetadata

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET: Get suggested charge code matches for all line items
 */
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
  const organizationId = auth.actorOrgId || auth.orgId
  const allowedOrgIds = scope?.filterIds ?? []

  // Find the invoice
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
    { orderBy: { lineNumber: 'asc' } }
  )

  if (lineItems.length === 0) {
    return NextResponse.json({ matches: [], message: 'No line items to match' })
  }

  // Get suggested matches for each line item
  const matcher = new ChargeCodeMatcherService(em)
  const results = await matcher.matchLineItems(
    lineItems.map((li) => ({ id: li.id, description: li.description })),
    organizationId as string,
    tenantId as string
  )

  return NextResponse.json({
    invoiceId: id,
    matches: results.map((r) => ({
      lineItemId: r.lineItemId,
      lineItem: lineItems.find((li) => li.id === r.lineItemId)
        ? {
            lineNumber: lineItems.find((li) => li.id === r.lineItemId)!.lineNumber,
            description: lineItems.find((li) => li.id === r.lineItemId)!.description,
          }
        : null,
      suggestions: r.matches,
      bestMatch: r.bestMatch,
    })),
  })
}

const applyMatchesSchema = z.object({
  matches: z.array(
    z.object({
      lineItemId: z.string().uuid(),
      productId: z.string().uuid(),
      confidence: z.number().int().min(0).max(100).optional(),
    })
  ),
  applyBestMatches: z.boolean().optional().default(false),
  minConfidence: z.number().int().min(0).max(100).optional().default(50),
})

/**
 * POST: Apply charge code matches to line items
 * Can either apply specific matches or auto-apply best matches above a confidence threshold
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parse = applyMatchesSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parse.error },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const em = container.resolve('em') as EntityManager

  const tenantId = auth.actorTenantId || auth.tenantId
  const organizationId = auth.actorOrgId || auth.orgId
  const allowedOrgIds = scope?.filterIds ?? []

  // Find the invoice
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

  const ctx: CommandRuntimeContext = {
    container,
    auth,
    organizationScope: scope,
    selectedOrganizationId: organizationId as string,
    organizationIds: scope?.filterIds ?? null,
    request,
  }

  const bus = new CommandBus()
  const results: Array<{ lineItemId: string; success: boolean; error?: string }> = []

  // If applyBestMatches is true, first get suggestions for all line items
  let matchesToApply = parse.data.matches

  if (parse.data.applyBestMatches) {
    const lineItems = await em.find(
      FmsInvoiceLineItem,
      { invoice, product: null }, // Only unmatched items
      { orderBy: { lineNumber: 'asc' } }
    )

    if (lineItems.length > 0) {
      const matcher = new ChargeCodeMatcherService(em)
      const suggestions = await matcher.matchLineItems(
        lineItems.map((li) => ({ id: li.id, description: li.description })),
        organizationId as string,
        tenantId as string
      )

      // Add best matches above threshold
      for (const suggestion of suggestions) {
        if (
          suggestion.bestMatch &&
          suggestion.bestMatch.confidence >= parse.data.minConfidence
        ) {
          matchesToApply.push({
            lineItemId: suggestion.lineItemId,
            productId: suggestion.bestMatch.productId,
            confidence: suggestion.bestMatch.confidence,
          })
        }
      }
    }
  }

  // Apply matches
  for (const match of matchesToApply) {
    try {
      await bus.execute('fms_financials.line_items.match_charge_code', {
        input: {
          lineItemId: match.lineItemId,
          productId: match.productId,
          confidence: match.confidence ?? 100,
        },
        ctx,
      })

      results.push({ lineItemId: match.lineItemId, success: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Match failed'
      results.push({ lineItemId: match.lineItemId, success: false, error: message })
    }
  }

  // Check if all line items are now matched
  const unmatchedCount = await em.count(FmsInvoiceLineItem, {
    invoice,
    product: null,
  })

  // Update invoice status if all matched
  if (unmatchedCount === 0 && invoice.status === 'approved') {
    invoice.status = 'matched'
    await em.flush()
  }

  return NextResponse.json({
    invoiceId: id,
    results,
    totalApplied: results.filter((r) => r.success).length,
    totalFailed: results.filter((r) => !r.success).length,
    unmatchedLineItemsRemaining: unmatchedCount,
    invoiceStatus: invoice.status,
  })
}
