import { NextRequest, NextResponse } from 'next/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { z } from 'zod'
import { FmsLocation } from '@open-mercato/fms/modules/fms_locations/data/entities'
import { FrcOffer, FrcAirRouting } from '../../../../data/entities'
import { FrcRfq } from '../../../../../frc_rfqs/data/entities'
import { FrcProject, FrcProjectAirRouting } from '../../../../../frc_projects/data/entities'
import { FrcConsole } from '../../../../../frc_console/data/entities'
import { FrcTruck, FrcTruckPreset } from '../../../../../frc_trucks/data/entities'

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
  consoles: z.array(consoleConfigSchema), // Console creation is now optional
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

  // Fetch the RFQ for additional info (no longer populate airports - they're UUIDs now)
  const rfq = await em.findOne(FrcRfq, { id: offer.rfqId, deletedAt: null })

  if (!rfq) {
    return NextResponse.json({ error: 'Associated RFQ not found' }, { status: 404 })
  }

  const now = new Date()

  try {
    // 1. Create the project
    const projectNumber = await generateProjectNumber(em, tenantIdStr, organizationIdStr)

    // Build AWB numbers array from offer
    const awbNumbers: string[] = []
    if (offer.awbNumber) {
      awbNumbers.push(offer.awbNumber)
    }

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
      // Transfer route from RFQ
      originAirportId: rfq.originAirportId ?? null,
      destinationAirportId: rfq.destinationAirportId ?? null,
      // Transfer dates from RFQ
      shipmentReadyDate: rfq.shipmentReadyDate ?? null,
      requiredDeliveryDate: rfq.requiredAtDestinationDate ?? null,
      // AWB numbers from offer
      awbNumbers: awbNumbers.length > 0 ? awbNumbers : null,
      createdAt: now,
      updatedAt: now,
    })

    em.persist(project)
    await em.flush() // Flush to get project.id

    // 2. Copy air routing legs from offer to project (independent copy)
    const offerRoutingLegs = await em.find(FrcAirRouting, {
      offer: { id: offer.id },
      deletedAt: null,
    }, { orderBy: { createdAt: 'asc' } })

    const projectRoutingMap = new Map<string, string>() // sourceId -> newProjectRoutingId

    for (const routing of offerRoutingLegs) {
      const projectRouting = em.create(FrcProjectAirRouting, {
        organizationId: organizationIdStr,
        tenantId: tenantIdStr,
        projectId: project.id,
        sourceAirRoutingId: routing.id, // Track source for potential sync
        name: routing.name,
        type: routing.type,
        flightNumber: routing.flightNumber ?? null,
        originAirportId: routing.originAirportId ?? null,
        destinationAirportId: routing.destinationAirportId ?? null,
        departureDate: routing.departureDate ?? null,
        departureTime: routing.departureTime ?? null,
        arrivalDate: routing.arrivalDate ?? null,
        arrivalTime: routing.arrivalTime ?? null,
        carrierId: null, // Not copied from offer - project-specific
        carrierType: null,
        connectionRateTotal: null, // Not copied - project-specific pricing
        currencyCode: routing.currencyCode ?? 'EUR',
        createdAt: now,
        updatedAt: now,
      })
      em.persist(projectRouting)
      projectRoutingMap.set(routing.id, projectRouting.id)
    }

    // Flush to get projectRouting IDs
    await em.flush()

    // Get the first project routing leg for linking to consoles (if any)
    const firstProjectRouting = projectRoutingMap.size > 0 
      ? projectRoutingMap.values().next().value 
      : null

    // 3. Collect all airport IDs needed for console creation
    const allAirportIds = body.consoles
      .flatMap((c) => [c.originAirportId, c.destinationAirportId])
      .filter((id): id is string => Boolean(id))

    const airports =
      allAirportIds.length > 0
        ? await em.find(FmsLocation, { id: { $in: [...new Set(allAirportIds)] }, type: 'airport' })
        : []
    const airportMap = new Map(airports.map((a) => [a.id, a]))

    // 4. Create consoles
    const createdConsoles: FrcConsole[] = []

    for (const consoleConfig of body.consoles) {
      // Fetch truck
      const truck = await em.findOne(FrcTruck, { id: consoleConfig.truckId, deletedAt: null })
      if (!truck) {
        return NextResponse.json({ error: `Truck not found: ${consoleConfig.truckId}` }, { status: 404 })
      }

      // Get airports from the map
      const originAirport = consoleConfig.originAirportId
        ? airportMap.get(consoleConfig.originAirportId)
        : null
      const destinationAirport = consoleConfig.destinationAirportId
        ? airportMap.get(consoleConfig.destinationAirportId)
        : null

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
        originAirportId: consoleConfig.originAirportId ?? null,
        destinationAirportId: consoleConfig.destinationAirportId ?? null,
        status: 'planning',
        truckPreset,
        projectId: project.id,
        // Link to first project routing leg for cargo discovery
        projectAirRoutingId: firstProjectRouting ?? null,
        currencyCode: 'EUR',
        createdAt: now,
        updatedAt: now,
      })

      em.persist(console_)
      createdConsoles.push(console_)
    }

    // 5. Update offer status to 'booked' and link to project
    offer.status = 'booked'
    offer.projectId = project.id
    offer.updatedAt = now

    // 6. Update RFQ sales stage
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
