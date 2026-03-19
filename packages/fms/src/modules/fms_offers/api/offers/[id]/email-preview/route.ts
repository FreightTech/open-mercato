import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsOffer } from '../../../../data/entities'
import type { FmsOfferLine } from '../../../../data/entities'
import { convertCurrency } from '../../../../../fms_projects/lib/financials'

export const metadata = {
  GET: {
    requireAuth: true,
    requireFeatures: ['fms_offers.offers.view'],
  },
}

export const openApi = {
  GET: {
    summary: 'Render email preview for an offer',
    tags: ['fms_offers'],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      { name: 'message', in: 'query', required: false, schema: { type: 'string' } },
      { name: 'contactName', in: 'query', required: false, schema: { type: 'string' } },
    ],
    responses: { 200: { description: 'Email preview' } },
  },
}

type Params = { params: Promise<{ id: string }> }

/**
 * GET: Render email preview HTML for an offer (without sending)
 * Query params: ?message=...&contactName=...
 */
export async function GET(request: NextRequest, { params }: Params) {
  const { id: offerId } = await params
  const auth = await getAuthFromRequest(request)

  if (!auth || !auth.orgId || !auth.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const message = url.searchParams.get('message') || ''
  const contactName = url.searchParams.get('contactName') || 'Valued Client'

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const em = container.resolve('em') as EntityManager

  const offer = await em.findOne(
    FmsOffer,
    {
      id: offerId,
      tenantId: auth.tenantId,
      deletedAt: null,
    },
    {
      populate: ['rfq', 'calculations', 'calculations.lines'],
    }
  )

  if (!offer) {
    return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
  }

  // Collect enabled lines with non-deleted calculations
  const enabledLines: FmsOfferLine[] = []
  for (const calc of offer.calculations?.getItems() || []) {
    if (calc.deletedAt) continue
    for (const line of calc.lines?.getItems() || []) {
      if (line.isEnabled && !line.deletedAt) enabledLines.push(line)
    }
  }

  // Use the offer's base currency, or the most common currency across lines, or USD
  const currency = offer.baseCurrency || detectMajorityCurrency(enabledLines) || 'USD'

  // Compute sell total with currency conversion to base currency
  const sellTotal = enabledLines.reduce(
    (sum, line) => sum + convertCurrency(parseFloat(line.sellPrice) || 0, line.currencyCode, currency, offer.exchangeRates),
    0
  )

  const formattedTotal = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(sellTotal)

  const validUntilText = offer.validUntil
    ? new Date(offer.validUntil).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Not specified'

  const origin = offer.rfq?.origin || ''
  const destination = offer.rfq?.destination || ''

  const { renderEmail } = await import('@open-mercato/fms/modules/email_templates/lib/template-renderer')
  const rendered = await renderEmail({
    em,
    tenantId: auth.tenantId,
    organizationId: auth.orgId,
    templateType: 'offer',
    variables: {
      contactName,
      clientName: offer.rfq?.companyName || 'Client',
      offerNumber: offer.offerNumber,
      originPorts: origin || '-',
      destPorts: destination || '-',
      // Clear airport variables so unresolved {{originAirport}} doesn't leak into subject
      originAirport: '',
      destinationAirport: '',
      validUntil: validUntilText,
      totalAmount: formattedTotal,
      message,
    },
  })

  return NextResponse.json({
    subject: rendered.subject,
    html: rendered.html,
    from: rendered.from || null,
  })
}

function detectMajorityCurrency(lines: FmsOfferLine[]): string | null {
  if (lines.length === 0) return null
  const counts = new Map<string, number>()
  for (const line of lines) {
    const code = line.currencyCode || 'USD'
    counts.set(code, (counts.get(code) || 0) + 1)
  }
  let best = ''
  let bestCount = 0
  for (const [code, count] of counts) {
    if (count > bestCount) {
      best = code
      bestCount = count
    }
  }
  return best || null
}
