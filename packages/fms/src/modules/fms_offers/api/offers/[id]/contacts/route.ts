import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { FmsOffer } from '../../../../data/entities'
import { Contractor, ContractorContact } from '../../../../../contractors/data/entities'

export const metadata = {
  GET: {
    requireAuth: true,
    requireFeatures: ['fms_offers.offers.view'],
  },
}

type Params = { params: Promise<{ id: string }> }

/**
 * GET: Fetch contacts for the client associated with this offer's RFQ
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

    // Find offer with RFQ
    const offer = await em.findOne(
      FmsOffer,
      {
        id: offerId,
        tenantId: auth.tenantId,
        deletedAt: null,
      },
      {
        populate: ['rfq'],
      }
    )

    if (!offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
    }

    if (!offer.rfq) {
      return NextResponse.json({ error: 'RFQ not found' }, { status: 404 })
    }

    const companyName = offer.rfq.companyName
    if (!companyName) {
      return NextResponse.json({
        contacts: [],
        clientId: null,
        clientName: null,
      })
    }

    // Look up contractor by company name
    const contractor = await em.findOne(Contractor, {
      name: companyName,
      tenantId: auth.tenantId,
      deletedAt: null,
    })

    if (!contractor) {
      return NextResponse.json({
        contacts: [],
        clientId: null,
        clientName: companyName,
      })
    }

    // Fetch contacts for this contractor
    const contacts = await em.find(
      ContractorContact,
      {
        contractor: contractor.id,
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
      clientId: contractor.id,
      clientName: contractor.name,
    })
  } catch (error: any) {
    console.error('[offers/contacts] error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch contacts', message: error.message },
      { status: 500 }
    )
  }
}
