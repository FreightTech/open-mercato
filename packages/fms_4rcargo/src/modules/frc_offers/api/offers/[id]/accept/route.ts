import { NextRequest, NextResponse } from 'next/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { z } from 'zod'
import { FrcOffer } from '../../../../data/entities'
import { FrcRfq, FrcAirCargo } from '../../../../../frc_rfqs/data/entities'
import { FrcProject } from '../../../../../frc_projects/data/entities'
import { FrcConsole } from '../../../../../frc_console/data/entities'
import { FrcTruck, FrcTruckPreset } from '../../../../../frc_trucks/data/entities'
import { FrcAirport } from '../../../../../frc_airports/data/entities'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['frc_offers.manage', 'frc_projects.manage'] },
}

const consoleConfigSchema = z.object({
  truckId: z.string().uuid(),
  originAirportId: z.string().uuid().nullable().optional(),
  destinationAirportId: z.string().uuid().nullable().optional(),
  truckPresetId: z.string().uuid().nullable().optional(),
  date: z.string(),
})

const acceptOfferSchema = z.object({
  consoles: z.array(consoleConfigSchema).min(1, 'At least one console is required'),
})

type Params = { params: Promise<{ id: string }> }

async function generateProjectNumber(
  em: EntityManager,
  tenantId: string,
  organizationId: string
): Promise<string> {
  // Simple project number generation: PRJ-YYYYMMDD-XXXX
  const now = new Date()
  const datePrefix = now.toISOString().slice(0, 10).replace(/-/g, '')
  
  // Count existing projects for this org today to generate sequence
  const count = await em.count(FrcProject, {
    tenantId,
    organizationId,
    createdAt: { $gte: new Date(now.toISOString().slice(0, 10)) },
  })
  
  const sequence = String(count + 1).padStart(4, '0')
  return `PRJ-${datePrefix}-${sequence}`
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
  let body: z.infer<typeof acceptOfferSchema>
  try {
    const rawBody = await request.json()
    const parsed = acceptOfferSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error },
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

  // Type-safe strings for entity creation
  const tenantIdStr: string = tenantId
  const organizationIdStr: string = organizationId

  // Find the offer
  const offer = await em.findOne(FrcOffer, {
    id: offerId,
    tenantId,
    deletedAt: null,
  })

  if (!offer) {
    return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
  }

  // Check offer status
  if (offer.status !== 'sent' && offer.status !== 'draft') {
    return NextResponse.json(
      { error: `Cannot accept offer with status "${offer.status}". Only "sent" or "draft" offers can be accepted.` },
      { status: 400 }
    )
  }

  // Fetch the RFQ for additional info
  const rfq = await em.findOne(FrcRfq, { id: offer.rfqId, deletedAt: null }, {
    populate: ['originAirport', 'destinationAirport'],
  })

  if (!rfq) {
    return NextResponse.json({ error: 'Associated RFQ not found' }, { status: 404 })
  }

  const now = new Date()

  try {
    // 1. Create the project
    const projectNumber = await generateProjectNumber(em, tenantIdStr, organizationIdStr)

    const project = em.create(FrcProject, {
      organizationId: organizationIdStr,
      tenantId: tenantIdStr,
      projectNumber,
      rfqId: rfq.id,
      offerId: offer.id,
      accountId: rfq.accountId ?? null,
      status: 'active',
      totalValue: offer.totalRate ?? rfq.amount ?? null,
      currencyCode: offer.currencyCode ?? rfq.currencyCode ?? 'EUR',
      createdAt: now,
      updatedAt: now,
    })

    em.persist(project)
    await em.flush() // Flush to get project.id

    // 2. Create consoles
    const createdConsoles: FrcConsole[] = []

    for (const consoleConfig of body.consoles) {
      // Fetch truck
      const truck = await em.findOne(FrcTruck, { id: consoleConfig.truckId, deletedAt: null })
      if (!truck) {
        return NextResponse.json({ error: `Truck not found: ${consoleConfig.truckId}` }, { status: 404 })
      }

      // Fetch airports
      let originAirport: FrcAirport | null = null
      let destinationAirport: FrcAirport | null = null

      if (consoleConfig.originAirportId) {
        originAirport = await em.findOne(FrcAirport, { id: consoleConfig.originAirportId, deletedAt: null })
      }
      if (consoleConfig.destinationAirportId) {
        destinationAirport = await em.findOne(FrcAirport, { id: consoleConfig.destinationAirportId, deletedAt: null })
      }

      // Build console name: {Truck}/{Date}/{Route}
      const dateStr = consoleConfig.date.substring(0, 10)
      const routePart = [originAirport?.code, destinationAirport?.code].filter(Boolean).join('-') || 'N/A'
      const consoleName = `${truck.name}/${dateStr}/${routePart}`

      // Fetch truck preset if provided
      let truckPreset: FrcTruckPreset | null = null
      if (consoleConfig.truckPresetId) {
        truckPreset = await em.findOne(FrcTruckPreset, { id: consoleConfig.truckPresetId, deletedAt: null })
      }

      const console_ = em.create(FrcConsole, {
        organizationId: organizationIdStr,
        tenantId: tenantIdStr,
        name: consoleName,
        date: new Date(consoleConfig.date),
        truck,
        originAirport,
        destinationAirport,
        status: 'planning',
        truckPreset,
        projectId: project.id,
        createdAt: now,
        updatedAt: now,
      })

      em.persist(console_)
      createdConsoles.push(console_)
    }

    // 3. Update offer status to 'booked'
    offer.status = 'booked'
    offer.updatedAt = now

    // 4. Update RFQ sales stage
    rfq.salesStage = 'offer_accepted'
    rfq.updatedAt = now

    await em.flush()

    return NextResponse.json({
      ok: true,
      projectId: project.id,
      projectNumber: project.projectNumber,
      offerId: offer.id,
      rfqId: rfq.id,
      consoleIds: createdConsoles.map((c) => c.id),
    })
  } catch (error) {
    console.error('[offers/accept] error:', error)
    return NextResponse.json(
      { error: 'Failed to accept offer', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
