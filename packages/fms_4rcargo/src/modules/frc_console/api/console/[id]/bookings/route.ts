import { NextRequest, NextResponse } from 'next/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { FrcConsole, FrcConsoleItem } from '../../../../data/entities'
import { FrcTruckBooking } from '../../../../../frc_trucks/data/entities'
import { FrcAirRouting, FrcOffer } from '../../../../../frc_offers/data/entities'
import { FrcRfq, FrcAirCargo } from '../../../../../frc_rfqs/data/entities'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['frc_console.view'] },
}

interface CargoWithAllocation {
  id: string
  name: string
  numberOfPieces: number
  allocatedPieces: number
  availablePieces: number
  lengthCm: string | null
  widthCm: string | null
  heightCm: string | null
  actualWeightKg: string
  stackableType: string
}

interface BookingSuggestion {
  id: string
  name: string
  date: Date | null | undefined
  status: string
  isMatching: boolean // true if matches console's truck/date/route
  airCargo: CargoWithAllocation[]
  rfqName: string | null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  // Get console with relations
  const console_ = await em.findOne(
    FrcConsole,
    { id, deletedAt: null },
    { populate: ['truck', 'originAirport', 'destinationAirport'] }
  )
  if (!console_) {
    return NextResponse.json({ error: 'Console not found' }, { status: 404 })
  }

  // Build filter for suggested bookings (matching truck, date, route)
  const suggestedFilter: Record<string, unknown> = {
    deletedAt: null,
    organizationId: console_.organizationId,
    tenantId: console_.tenantId,
  }

  // Try to find bookings matching console criteria
  if (console_.truck) {
    suggestedFilter.truck = console_.truck.id
  }
  if (console_.date) {
    suggestedFilter.date = console_.date
  }

  // Get all matching bookings
  const matchingBookings = await em.find(
    FrcTruckBooking,
    suggestedFilter,
    {
      populate: ['truck', 'originAirport', 'destinationAirport'],
      orderBy: { date: 'desc', name: 'asc' },
      limit: 50,
    }
  )

  // Also get other recent bookings (not matching) for manual selection
  const otherBookings = await em.find(
    FrcTruckBooking,
    {
      deletedAt: null,
      organizationId: console_.organizationId,
      tenantId: console_.tenantId,
      id: { $nin: matchingBookings.map((b) => b.id) },
    },
    {
      populate: ['truck', 'originAirport', 'destinationAirport'],
      orderBy: { date: 'desc' },
      limit: 20,
    }
  )

  const allBookings = [...matchingBookings, ...otherBookings]

  if (allBookings.length === 0) {
    return NextResponse.json({ suggestions: [] })
  }

  // Get air routing IDs from bookings
  const airRoutingIds = allBookings.map((b) => b.airRoutingId).filter(Boolean)
  
  // Fetch air routings to get offer IDs
  const airRoutings = await em.find(
    FrcAirRouting,
    { id: { $in: airRoutingIds }, deletedAt: null },
    { populate: ['offer'] }
  )
  const routingMap = new Map(airRoutings.map((r) => [r.id, r]))

  // Get offer IDs and fetch RFQ IDs
  const offerIds = [...new Set(airRoutings.map((r) => r.offer?.id).filter(Boolean))] as string[]
  const offers = await em.find(FrcOffer, { id: { $in: offerIds }, deletedAt: null })
  const offerMap = new Map(offers.map((o) => [o.id, o]))

  // Get RFQ IDs
  const rfqIds = [...new Set(offers.map((o) => o.rfqId).filter(Boolean))]
  const rfqs = await em.find(FrcRfq, { id: { $in: rfqIds }, deletedAt: null })
  const rfqMap = new Map(rfqs.map((r) => [r.id, r]))

  // Get all air cargo items for these RFQs
  const allAirCargo = await em.find(
    FrcAirCargo,
    { rfq: { $in: rfqIds }, deletedAt: null },
    { orderBy: { name: 'asc' } }
  )

  // Get existing allocations to calculate available pieces
  const cargoIds = allAirCargo.map((c) => c.id)
  const existingAllocations = await em.find(FrcConsoleItem, {
    airCargoId: { $in: cargoIds },
    deletedAt: null,
  })
  
  // Sum allocations per cargo
  const allocationMap = new Map<string, number>()
  for (const allocation of existingAllocations) {
    const current = allocationMap.get(allocation.airCargoId) || 0
    allocationMap.set(allocation.airCargoId, current + allocation.quantity)
  }

  // Group cargo by RFQ
  const cargoByRfq = new Map<string, FrcAirCargo[]>()
  for (const cargo of allAirCargo) {
    const rfqId = cargo.rfq?.id
    if (rfqId) {
      const list = cargoByRfq.get(rfqId) || []
      list.push(cargo)
      cargoByRfq.set(rfqId, list)
    }
  }

  // Build suggestions
  const suggestions: BookingSuggestion[] = allBookings.map((booking) => {
    const routing = routingMap.get(booking.airRoutingId)
    const offer = routing?.offer ? offerMap.get(routing.offer.id) : null
    const rfq = offer?.rfqId ? rfqMap.get(offer.rfqId) : null
    const cargos = rfq ? cargoByRfq.get(rfq.id) || [] : []

    // Check if this booking matches the console criteria
    const isMatching =
      booking.truck?.id === console_.truck?.id &&
      booking.date?.getTime() === console_.date?.getTime() &&
      (booking.originAirport?.id === console_.originAirport?.id || !console_.originAirport) &&
      (booking.destinationAirport?.id === console_.destinationAirport?.id || !console_.destinationAirport)

    const airCargo: CargoWithAllocation[] = cargos.map((cargo) => {
      const allocated = allocationMap.get(cargo.id) || 0
      return {
        id: cargo.id,
        name: cargo.name,
        numberOfPieces: cargo.numberOfPieces,
        allocatedPieces: allocated,
        availablePieces: Math.max(0, cargo.numberOfPieces - allocated),
        lengthCm: cargo.lengthCm ?? null,
        widthCm: cargo.widthCm ?? null,
        heightCm: cargo.heightCm ?? null,
        actualWeightKg: cargo.actualWeightKg,
        stackableType: cargo.stackableType,
      }
    })

    return {
      id: booking.id,
      name: booking.name,
      date: booking.date,
      status: booking.status,
      isMatching,
      airCargo,
      rfqName: rfq?.name ?? null,
    }
  })

  // Sort: matching first, then by date
  suggestions.sort((a, b) => {
    if (a.isMatching !== b.isMatching) return a.isMatching ? -1 : 1
    const dateA = a.date?.getTime() ?? 0
    const dateB = b.date?.getTime() ?? 0
    return dateB - dateA
  })

  return NextResponse.json({ suggestions })
}
