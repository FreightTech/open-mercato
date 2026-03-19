import { NextRequest, NextResponse } from 'next/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { z } from 'zod'
import { Resend } from 'resend'
import { FrcOffer, FrcAirRouting, FrcOfferLine } from '../../../../data/entities'
import { FrcRfq } from '../../../../../frc_rfqs/data/entities'
import { FmsLocation } from '@open-mercato/fms/modules/fms_locations/data/entities'
import { Contractor, ContractorContact } from '@open-mercato/fms/modules/contractors/data/entities'
import { renderEmail } from '@open-mercato/fms/modules/email_templates/lib/template-renderer'
import { mapOfferToTemplateVariables, type OfferDetailResponse, type ContractorData } from '../../../../lib/offer-template-mapper'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['frc_offers.manage'] },
}

const sendOfferSchema = z.object({
  contactId: z.string().uuid().optional(),
  customEmail: z.string().email().optional(),
  message: z.string().max(2000).optional(),
}).refine(
  (data) => data.contactId || data.customEmail,
  { message: 'Either contactId or customEmail must be provided' }
)

type Params = { params: Promise<{ id: string }> }

/**
 * Format an airport (FmsLocation with type='airport') for display (code + city)
 */
function formatAirport(airport: FmsLocation | null): { id: string; code: string; city: string | null } | null {
  if (!airport) return null
  return {
    id: airport.id,
    code: airport.code,
    city: airport.city ?? null,
  }
}

/**
 * Build the OfferDetailResponse structure from database entities
 */
async function buildOfferDetailResponse(
  offer: FrcOffer,
  rfq: FrcRfq | null,
  em: EntityManager
): Promise<OfferDetailResponse> {
  // Load routing and lines
  const routing = await em.find(FrcAirRouting, { offer: { id: offer.id }, deletedAt: null }, { orderBy: { createdAt: 'asc' } })
  const lines = await em.find(FrcOfferLine, { offer: { id: offer.id }, deletedAt: null }, { orderBy: { createdAt: 'asc' } })

  // Collect all airport IDs
  const airportIds = new Set<string>()
  if (rfq?.originAirportId) airportIds.add(rfq.originAirportId)
  if (rfq?.destinationAirportId) airportIds.add(rfq.destinationAirportId)
  for (const r of routing) {
    if (r.originAirportId) airportIds.add(r.originAirportId)
    if (r.destinationAirportId) airportIds.add(r.destinationAirportId)
  }

  // Load airports (FmsLocation with type='airport')
  const airports: FmsLocation[] = airportIds.size > 0
    ? await em.find(FmsLocation, { id: { $in: [...airportIds] }, type: 'airport' })
    : []
  const airportMap = new Map(airports.map(a => [a.id, a]))

  // Build response
  return {
    id: offer.id,
    name: offer.name,
    rfqId: offer.rfqId ?? null,
    rfqName: rfq?.name ?? null,
    originAirport: formatAirport(airportMap.get(rfq?.originAirportId ?? '') ?? null),
    destinationAirport: formatAirport(airportMap.get(rfq?.destinationAirportId ?? '') ?? null),
    carrierId: offer.carrierId ?? null,
    status: offer.status,
    awbNumber: offer.awbNumber ?? null,
    connectionMethod: offer.connectionMethod ?? null,
    departureDate: offer.departureDate?.toISOString() ?? null,
    connectionRatePerKg: offer.connectionRatePerKg ?? null,
    connectionRateTotal: offer.connectionRateTotal ?? null,
    airfreightRatePerKg: offer.airfreightRatePerKg ?? null,
    airfreightRateTotal: offer.airfreightRateTotal ?? null,
    totalRatePerKg: offer.totalRatePerKg ?? null,
    totalRate: offer.totalRate ?? null,
    currencyCode: offer.currencyCode,
    assignedToId: offer.assignedToId ?? null,
    organizationId: offer.organizationId,
    tenantId: offer.tenantId,
    createdAt: offer.createdAt.toISOString(),
    updatedAt: offer.updatedAt.toISOString(),
    airRouting: routing.map(r => ({
      id: r.id,
      name: r.name,
      type: r.type,
      flightNumber: r.flightNumber ?? null,
      originAirport: formatAirport(airportMap.get(r.originAirportId ?? '') ?? null),
      destinationAirport: formatAirport(airportMap.get(r.destinationAirportId ?? '') ?? null),
      departureDate: r.departureDate?.toISOString() ?? null,
      departureTime: r.departureTime ?? null,
      arrivalDate: r.arrivalDate?.toISOString() ?? null,
      arrivalTime: r.arrivalTime ?? null,
    })),
    offerLines: lines.map(l => ({
      id: l.id,
      name: l.name,
      numberOfPieces: l.numberOfPieces,
      stackableType: l.stackableType,
      lengthCm: l.lengthCm ?? null,
      widthCm: l.widthCm ?? null,
      heightCm: l.heightCm ?? null,
      volumeM3: l.volumeM3,
      actualWeightKg: l.actualWeightKg,
      chargeableWeightKg: l.chargeableWeightKg,
      loadingMetres: l.loadingMetres,
    })),
  }
}

/**
 * Build contractor data for template variables
 */
async function buildContractorData(
  accountId: string,
  tenantId: string,
  em: EntityManager
): Promise<ContractorData | null> {
  const contractor = await em.findOne(Contractor, { id: accountId, tenantId, deletedAt: null })
  if (!contractor) return null

  const contacts = await em.find(ContractorContact, { contractor: { id: accountId }, isActive: true })

  return {
    id: contractor.id,
    name: contractor.name,
    contacts: contacts.map(c => ({
      id: c.id,
      firstName: c.firstName ?? null,
      lastName: c.lastName ?? null,
      email: c.email ?? null,
      phone: c.phone ?? null,
      isPrimary: c.isPrimary ?? false,
    })),
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: offerId } = await params
  if (!offerId) {
    return NextResponse.json({ error: 'Offer ID is required' }, { status: 400 })
  }

  // Parse request body
  let body: z.infer<typeof sendOfferSchema>
  try {
    const rawBody = await request.json()
    const parsed = sendOfferSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    body = parsed.data
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const em = container.resolve('em') as EntityManager

  const tenantId = auth.actorTenantId || auth.tenantId
  const organizationId = scope?.selectedId || auth.actorOrgId || auth.orgId

  if (!tenantId || !organizationId || typeof tenantId !== 'string' || typeof organizationId !== 'string') {
    return NextResponse.json({ error: 'Missing tenant or organization context' }, { status: 400 })
  }

  // Check Resend API key
  const resendApiKey = process.env.RESEND_API_KEY
  if (!resendApiKey) {
    return NextResponse.json({ error: 'Email service not configured' }, { status: 500 })
  }

  try {
    // Find the offer
    const offer = await em.findOne(FrcOffer, {
      id: offerId,
      tenantId,
      deletedAt: null,
    })

    if (!offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
    }

    // Load RFQ for client info
    const rfq = offer.rfqId
      ? await em.findOne(FrcRfq, { id: offer.rfqId, deletedAt: null })
      : null

    // Resolve recipient
    let recipientEmail: string
    let recipientName: string

    if (body.customEmail) {
      recipientEmail = body.customEmail
      recipientName = body.customEmail
    } else if (body.contactId) {
      const contact = await em.findOne(ContractorContact, {
        id: body.contactId,
        tenantId,
        isActive: true,
      })

      if (!contact || !contact.email) {
        return NextResponse.json({ error: 'Contact not found or has no email' }, { status: 404 })
      }

      recipientEmail = contact.email
      recipientName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.email
    } else {
      return NextResponse.json({ error: 'Either contactId or customEmail must be provided' }, { status: 400 })
    }

    // Build offer detail response for template
    const offerDetail = await buildOfferDetailResponse(offer, rfq, em)

    // Load contractor data if RFQ has an account
    let contractorData: ContractorData | null = null
    if (rfq?.accountId) {
      contractorData = await buildContractorData(rfq.accountId, tenantId, em)
    }

    // Map to template variables
    const templateVariables = mapOfferToTemplateVariables(offerDetail, contractorData, {
      message: body.message,
    })

    // Override contact name with actual recipient
    const finalVariables = {
      ...templateVariables,
      contactName: recipientName,
    }

    // Render email using FMS template system
    const renderedEmail = await renderEmail({
      em,
      tenantId,
      organizationId,
      templateType: 'offer',
      variables: finalVariables,
    })

    // Send email via Resend
    const resend = new Resend(resendApiKey)
    const fromAddr = renderedEmail.from || process.env.EMAIL_FROM || 'no-reply@openmercato.com'

    const emailOptions: Parameters<typeof resend.emails.send>[0] = {
      from: fromAddr,
      to: recipientEmail,
      subject: renderedEmail.subject,
      html: renderedEmail.html,
    }

    if (renderedEmail.replyTo) {
      emailOptions.replyTo = renderedEmail.replyTo
    }

    // Note: PDF attachment could be added here in the future
    // For now, we're just sending the email without attachment

    await resend.emails.send(emailOptions)

    // Update offer status if it was draft
    if (offer.status === 'draft') {
      offer.status = 'sent'
    }
    offer.updatedAt = new Date()

    await em.flush()

    return NextResponse.json({
      ok: true,
      sentTo: {
        email: recipientEmail,
        name: recipientName,
      },
      offerStatus: offer.status,
    })
  } catch (error) {
    console.error('[frc_offers/send] error:', error)
    return NextResponse.json(
      { error: 'Failed to send email', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
