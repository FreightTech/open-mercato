import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { FmsOffer } from '../../../../data/entities'
import { ContractorContact } from '../../../../../contractors/data/entities'

export const metadata = {
  GET: {
    requireAuth: true,
    requireFeatures: ['fms_quotes.offers.view'],
  },
}

type Params = { params: Promise<{ id: string }> }

/**
 * GET: Fetch contacts for the client associated with this offer's quote
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id: offerId } = await params
    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')
    const auth = await getAuthFromRequest(request)

    if (!auth || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Find offer with quote and client
    const offer = await em.findOne(
      FmsOffer,
      {
        id: offerId,
        tenantId: auth.tenantId,
        deletedAt: null,
      },
      {
        populate: ['quote', 'quote.client'],
      }
    )

    if (!offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
    }

    if (!offer.quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    const client = offer.quote.client
    if (!client) {
      return NextResponse.json({
        contacts: [],
        clientId: null,
        clientName: null,
      })
    }

    // Fetch contacts for this client
    const contacts = await em.find(
      ContractorContact,
      {
        contractor: client.id,
        tenantId: auth.tenantId,
      },
      {
        orderBy: [{ isPrimary: 'DESC' }, { firstName: 'ASC' }, { lastName: 'ASC' }],
      }
    )

    // Filter to only contacts with valid email and format response
    const formattedContacts = contacts
      .filter((contact) => contact.email)
      .map((contact) => ({
        id: contact.id,
        firstName: contact.firstName || '',
        lastName: contact.lastName || '',
        email: contact.email!,
        phone: contact.phone || null,
        isPrimary: contact.isPrimary,
        fullName: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.email!,
      }))

    return NextResponse.json({
      contacts: formattedContacts,
      clientId: client.id,
      clientName: client.name,
    })
  } catch (error: any) {
    console.error('[offers/contacts] error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch contacts', message: error.message },
      { status: 500 }
    )
  }
}
