import { NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FmsLocation } from '@open-mercato/fms/modules/fms_locations/data/entities'
import { FrcProject, FrcProjectAirRouting } from '../../../../../data/entities'
import { FrcOffer, FrcAirRouting } from '../../../../../../frc_offers/data/entities'
import { FrcConsole, FrcConsoleCargo } from '../../../../../../frc_console/data/entities'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['frc_projects.manage'] },
}

const paramsSchema = z.object({
  id: z.string().uuid(),
})

/** Safely format a date that could be a Date object or string */
function formatDateSafe(date: Date | string | null | undefined): string | null {
  if (!date) return null
  if (typeof date === 'string') return date.split('T')[0]
  return date.toISOString().split('T')[0]
}

function buildScopeFilters(
  auth: { tenantId?: string | null; orgId?: string | null },
  scope: { tenantId?: string | null; selectedId?: string | null; filterIds?: string[] | null } | null
): { tenantId?: string; organizationId?: { $in: string[] } } {
  const filters: { tenantId?: string; organizationId?: { $in: string[] } } = {}

  if (typeof auth.tenantId === 'string') {
    filters.tenantId = auth.tenantId
  }

  const allowedOrgIds = new Set<string>()
  const filterIds = scope?.filterIds
  if (Array.isArray(filterIds) && filterIds.length > 0) {
    filterIds.forEach((id) => {
      if (typeof id === 'string') allowedOrgIds.add(id)
    })
  } else {
    const fallbackOrgId = scope?.selectedId ?? auth.orgId
    if (typeof fallbackOrgId === 'string') {
      allowedOrgIds.add(fallbackOrgId)
    }
  }

  if (allowedOrgIds.size > 0) {
    filters.organizationId = { $in: [...allowedOrgIds] }
  }

  return filters
}

export async function POST(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  try {
    const auth = await getAuthFromRequest(req)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const params = await ctx.params
    const parse = paramsSchema.safeParse({ id: params?.id })
    if (!parse.success) return NextResponse.json({ error: 'Invalid project id' }, { status: 400 })

    const container = await createRequestContainer()
    const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
    const em = container.resolve('em') as EntityManager

    const scopeFilters = buildScopeFilters(auth, scope)

    // Verify project exists
    const project = await em.findOne(FrcProject, {
      id: parse.data.id,
      deletedAt: null,
      ...scopeFilters,
    })

    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    // Check if project has a linked offer
    if (!project.offerId) {
      return NextResponse.json({ error: 'Project has no linked offer' }, { status: 400 })
    }

    // Fetch the offer with its routing legs
    const offer = await em.findOne(
      FrcOffer,
      { id: project.offerId, deletedAt: null },
      { populate: ['airRouting'] }
    )

    if (!offer) {
      return NextResponse.json({ error: 'Linked offer not found' }, { status: 404 })
    }

    const offerRoutingLegs = offer.airRouting.getItems().filter((leg) => !leg.deletedAt)

    if (offerRoutingLegs.length === 0) {
      return NextResponse.json({ error: 'Offer has no routing legs to sync' }, { status: 400 })
    }

    const now = new Date()

    // Find existing project routing legs
    const existingRoutingLegs = await em.find(FrcProjectAirRouting, {
      projectId: project.id,
      deletedAt: null,
    })

    let deletedConsolesCount = 0

    // Delete existing routing legs and their connected consoles
    for (const existingLeg of existingRoutingLegs) {
      // Find connected consoles
      const connectedConsoles = await em.find(FrcConsole, {
        projectAirRoutingId: existingLeg.id,
        deletedAt: null,
      })

      // Soft-delete consoles and their cargo
      for (const console_ of connectedConsoles) {
        await em.nativeUpdate(
          FrcConsoleCargo,
          { console: console_, deletedAt: null },
          { deletedAt: now, updatedAt: now }
        )
        console_.deletedAt = now
        deletedConsolesCount++
      }

      // Soft-delete the routing leg
      existingLeg.deletedAt = now
    }

    // Create new routing legs from offer using em.create()
    const newRoutingLegs: FrcProjectAirRouting[] = []

    for (const offerLeg of offerRoutingLegs) {
      const routing = em.create(FrcProjectAirRouting, {
        organizationId: project.organizationId,
        tenantId: project.tenantId,
        projectId: project.id,
        sourceAirRoutingId: offerLeg.id,
        name: offerLeg.name,
        type: offerLeg.type,
        flightNumber: offerLeg.flightNumber ?? null,
        originAirportId: offerLeg.originAirportId ?? null,
        destinationAirportId: offerLeg.destinationAirportId ?? null,
        departureDate: offerLeg.departureDate ?? null,
        departureTime: offerLeg.departureTime ?? null,
        arrivalDate: offerLeg.arrivalDate ?? null,
        arrivalTime: offerLeg.arrivalTime ?? null,
        carrierId: offerLeg.carrierId ?? null,
        carrierType: offerLeg.carrierType ?? null,
        connectionRateTotal: offerLeg.connectionRateTotal ?? null,
        currencyCode: offerLeg.currencyCode,
        createdAt: now,
        updatedAt: now,
      })

      em.persist(routing)
      newRoutingLegs.push(routing)
    }

    await em.flush()

    // Collect airport IDs for response
    const airportIds = new Set<string>()
    newRoutingLegs.forEach((leg) => {
      if (leg.originAirportId) airportIds.add(leg.originAirportId)
      if (leg.destinationAirportId) airportIds.add(leg.destinationAirportId)
    })

    // Fetch airports
    const airports =
      airportIds.size > 0
        ? await em.find(FmsLocation, { id: { $in: [...airportIds] }, type: 'airport' })
        : []
    const airportMap = new Map(airports.map((a) => [a.id, a]))

    // Build response
    const items = newRoutingLegs.map((leg) => {
      const originAirport = leg.originAirportId ? airportMap.get(leg.originAirportId) : null
      const destinationAirport = leg.destinationAirportId ? airportMap.get(leg.destinationAirportId) : null

      return {
        id: leg.id,
        name: leg.name,
        type: leg.type,
        flightNumber: leg.flightNumber ?? null,
        originAirport: originAirport ? { id: originAirport.id, code: originAirport.code } : null,
        destinationAirport: destinationAirport ? { id: destinationAirport.id, code: destinationAirport.code } : null,
        departureDate: formatDateSafe(leg.departureDate),
        departureTime: leg.departureTime ?? null,
        arrivalDate: formatDateSafe(leg.arrivalDate),
        arrivalTime: leg.arrivalTime ?? null,
        connectedConsolesCount: 0,
      }
    })

    return NextResponse.json({ items, deletedConsolesCount, syncedCount: items.length })
  } catch (error) {
    console.error('[frc_projects/routing/sync] POST error:', error)
    return NextResponse.json(
      { error: 'Failed to sync routing from offer', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
