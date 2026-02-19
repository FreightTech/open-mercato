import { NextRequest, NextResponse } from 'next/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { FrcConsole, FrcConsoleCargo } from '../../../../data/entities'
import { FrcAirRouting, FrcOffer } from '../../../../../frc_offers/data/entities'
import { FrcRfq, FrcAirCargo } from '../../../../../frc_rfqs/data/entities'
import { FrcProject } from '../../../../../frc_projects/data/entities'

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

interface ConsoleSuggestion {
  id: string
  name: string
  date: Date | null | undefined
  status: string
  airCargo: CargoWithAllocation[]
  rfqName: string | null
}

/**
 * GET /api/console/[id]/bookings
 * 
 * Returns available cargo for loading onto this console.
 * Since FrcTruckBooking was merged into FrcConsole, this endpoint now:
 * - Finds other consoles that share the same air routing
 * - Returns their associated cargo for potential cross-loading
 * - Shows allocation status so user can see available pieces
 */
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
    { populate: ['truck', 'truckPreset'] }
  )
  if (!console_) {
    return NextResponse.json({ error: 'Console not found' }, { status: 404 })
  }

  // Find cargo for this console through multiple discovery paths
  const suggestions: ConsoleSuggestion[] = []
  let rfqIdForCargo: string | null = null
  let rfqName: string | null = null

  // Path 1: If console has an air routing, find offers linked to that routing
  if (console_.airRoutingId) {
    const routing = await em.findOne(
      FrcAirRouting,
      { id: console_.airRoutingId, deletedAt: null },
      { populate: ['offer'] }
    )

    if (routing?.offer) {
      const offer = await em.findOne(FrcOffer, { id: routing.offer.id, deletedAt: null })
      if (offer?.rfqId) {
        rfqIdForCargo = offer.rfqId
        const rfq = await em.findOne(FrcRfq, { id: offer.rfqId, deletedAt: null })
        rfqName = rfq?.name ?? null
      }
    }
  }

  // Path 2: If no cargo found via airRoutingId, try via projectId
  if (!rfqIdForCargo && console_.projectId) {
    const project = await em.findOne(FrcProject, { id: console_.projectId, deletedAt: null })
    if (project?.rfqId) {
      rfqIdForCargo = project.rfqId
      const rfq = await em.findOne(FrcRfq, { id: project.rfqId, deletedAt: null })
      rfqName = rfq?.name ?? null
    }
  }

  // Get cargo from discovered RFQ
  if (rfqIdForCargo) {
    const allAirCargo = await em.find(
      FrcAirCargo,
      { rfq: { id: rfqIdForCargo }, deletedAt: null },
      { orderBy: { name: 'asc' } }
    )

    if (allAirCargo.length > 0) {
      // Get existing allocations to calculate available pieces
      const cargoIds = allAirCargo.map((c) => c.id)
      const existingAllocations = await em.find(FrcConsoleCargo, {
        airCargoId: { $in: cargoIds },
        deletedAt: null,
      })
      
      // Sum allocations per cargo
      const allocationMap = new Map<string, number>()
      for (const allocation of existingAllocations) {
        const current = allocationMap.get(allocation.airCargoId) || 0
        allocationMap.set(allocation.airCargoId, current + allocation.quantity)
      }

      const airCargo: CargoWithAllocation[] = allAirCargo.map((cargo) => {
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

      suggestions.push({
        id: console_.id,
        name: console_.name,
        date: console_.date,
        status: console_.status,
        airCargo,
        rfqName,
      })
    }
  }

  // Also find other consoles in the same organization with cargo
  // that might be available for cross-loading
  const otherConsoles = await em.find(
    FrcConsole,
    {
      id: { $ne: id },
      organizationId: console_.organizationId,
      tenantId: console_.tenantId,
      deletedAt: null,
      airRoutingId: { $ne: null },
    },
    { limit: 10, orderBy: { date: 'desc' } }
  )

  for (const otherConsole of otherConsoles) {
    if (!otherConsole.airRoutingId) continue

    const routing = await em.findOne(
      FrcAirRouting,
      { id: otherConsole.airRoutingId, deletedAt: null },
      { populate: ['offer'] }
    )

    if (routing?.offer) {
      const offer = await em.findOne(FrcOffer, { id: routing.offer.id, deletedAt: null })
      if (offer?.rfqId) {
        const rfq = await em.findOne(FrcRfq, { id: offer.rfqId, deletedAt: null })
        
        const allAirCargo = await em.find(
          FrcAirCargo,
          { rfq: { id: offer.rfqId }, deletedAt: null },
          { orderBy: { name: 'asc' } }
        )

        if (allAirCargo.length > 0) {
          const cargoIds = allAirCargo.map((c) => c.id)
          const existingAllocations = await em.find(FrcConsoleCargo, {
            airCargoId: { $in: cargoIds },
            deletedAt: null,
          })
          
          const allocationMap = new Map<string, number>()
          for (const allocation of existingAllocations) {
            const current = allocationMap.get(allocation.airCargoId) || 0
            allocationMap.set(allocation.airCargoId, current + allocation.quantity)
          }

          const airCargo: CargoWithAllocation[] = allAirCargo
            .map((cargo) => {
              const allocated = allocationMap.get(cargo.id) || 0
              const available = Math.max(0, cargo.numberOfPieces - allocated)
              return {
                id: cargo.id,
                name: cargo.name,
                numberOfPieces: cargo.numberOfPieces,
                allocatedPieces: allocated,
                availablePieces: available,
                lengthCm: cargo.lengthCm ?? null,
                widthCm: cargo.widthCm ?? null,
                heightCm: cargo.heightCm ?? null,
                actualWeightKg: cargo.actualWeightKg,
                stackableType: cargo.stackableType,
              }
            })
            .filter((c) => c.availablePieces > 0) // Only include cargo with available pieces

          if (airCargo.length > 0) {
            suggestions.push({
              id: otherConsole.id,
              name: otherConsole.name,
              date: otherConsole.date,
              status: otherConsole.status,
              airCargo,
              rfqName: rfq?.name ?? null,
            })
          }
        }
      }
    }
  }

  return NextResponse.json({ suggestions })
}
