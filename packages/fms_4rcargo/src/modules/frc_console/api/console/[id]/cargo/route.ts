import { NextRequest, NextResponse } from 'next/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { FrcConsole, FrcConsoleItem } from '../../../../data/entities'
import { FrcAirCargo } from '../../../../../frc_rfqs/data/entities'
import { FrcTruckBooking } from '../../../../../frc_trucks/data/entities'
import { frcConsoleItemCreateSchema, frcConsoleItemUpdateSchema } from '../../../../data/validators'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['frc_console.view'] },
  POST: { requireAuth: true, requireFeatures: ['frc_console.manage'] },
}

// Color palette for cargo visualization
const CARGO_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f97316', // orange
  '#6366f1', // indigo
]

function getColor(index: number): string {
  return CARGO_COLORS[index % CARGO_COLORS.length]
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

  // Verify console exists
  const console_ = await em.findOne(FrcConsole, { id, deletedAt: null })
  if (!console_) {
    return NextResponse.json({ error: 'Console not found' }, { status: 404 })
  }

  // Get all console items
  const consoleItems = await em.find(
    FrcConsoleItem,
    { console: console_, deletedAt: null },
    { orderBy: { createdAt: 'asc' } }
  )

  if (consoleItems.length === 0) {
    return NextResponse.json({
      items: [],
      cargoForVisualization: [],
    })
  }

  // Fetch all air cargo records
  const airCargoIds = consoleItems.map((item) => item.airCargoId)
  const airCargos = await em.find(FrcAirCargo, { id: { $in: airCargoIds }, deletedAt: null })
  const cargoMap = new Map(airCargos.map((c) => [c.id, c]))

  // Fetch all truck bookings for display
  const bookingIds = [...new Set(consoleItems.map((item) => item.truckBookingId))]
  const bookings = await em.find(FrcTruckBooking, { id: { $in: bookingIds }, deletedAt: null })
  const bookingMap = new Map(bookings.map((b) => [b.id, b]))

  // Build detailed items list
  const items = consoleItems.map((item, index) => {
    const cargo = cargoMap.get(item.airCargoId)
    const booking = bookingMap.get(item.truckBookingId)
    return {
      id: item.id,
      airCargoId: item.airCargoId,
      truckBookingId: item.truckBookingId,
      quantity: item.quantity,
      cargoName: cargo?.name ?? 'Unknown',
      bookingName: booking?.name ?? 'Unknown',
      lengthCm: cargo?.lengthCm ?? null,
      widthCm: cargo?.widthCm ?? null,
      heightCm: cargo?.heightCm ?? null,
      actualWeightKg: cargo?.actualWeightKg ?? null,
      stackableType: cargo?.stackableType ?? 'non_stackable',
      numberOfPieces: cargo?.numberOfPieces ?? 0,
      color: getColor(index),
      createdAt: item.createdAt,
    }
  })

  // Transform to CargoItem format for truck_loading visualization
  // This is the format expected by packCargo() function
  const cargoForVisualization = items.map((item) => ({
    id: item.id,
    name: item.cargoName,
    width: parseFloat(item.widthCm ?? '100'),
    length: parseFloat(item.lengthCm ?? '100'),
    height: parseFloat(item.heightCm ?? '100'),
    weight: parseFloat(item.actualWeightKg ?? '0'),
    quantity: item.quantity,
    stackable: item.stackableType === 'fully_stackable',
    color: item.color,
  }))

  return NextResponse.json({
    items,
    cargoForVisualization,
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  // Verify console exists
  const console_ = await em.findOne(FrcConsole, { id, deletedAt: null })
  if (!console_) {
    return NextResponse.json({ error: 'Console not found' }, { status: 404 })
  }

  // Handle batch items or single item
  const items: Array<{ airCargoId: string; truckBookingId: string; quantity: number }> = body.items
    ? body.items
    : [body]

  // Validate all items
  const errors: string[] = []
  for (const item of items) {
    const parse = frcConsoleItemCreateSchema.safeParse(item)
    if (!parse.success) {
      errors.push(`Invalid item: ${JSON.stringify(parse.error.flatten().fieldErrors)}`)
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 400 })
  }

  // Get all air cargo and booking IDs for validation
  const airCargoIds = [...new Set(items.map((i) => i.airCargoId))]
  const bookingIds = [...new Set(items.map((i) => i.truckBookingId))]

  const [airCargos, bookings] = await Promise.all([
    em.find(FrcAirCargo, { id: { $in: airCargoIds }, deletedAt: null }),
    em.find(FrcTruckBooking, { id: { $in: bookingIds }, deletedAt: null }),
  ])

  const cargoMap = new Map(airCargos.map((c) => [c.id, c]))
  const bookingMap = new Map(bookings.map((b) => [b.id, b]))

  // Validate all items exist
  for (const item of items) {
    if (!cargoMap.has(item.airCargoId)) {
      return NextResponse.json({ error: `Air cargo ${item.airCargoId} not found` }, { status: 404 })
    }
    if (!bookingMap.has(item.truckBookingId)) {
      return NextResponse.json({ error: `Truck booking ${item.truckBookingId} not found` }, { status: 404 })
    }
  }

  // Get existing allocations for quantity validation
  const existingAllocations = await em.find(FrcConsoleItem, {
    airCargoId: { $in: airCargoIds },
    deletedAt: null,
  })

  // Sum allocations per cargo
  const allocationMap = new Map<string, number>()
  for (const allocation of existingAllocations) {
    const current = allocationMap.get(allocation.airCargoId) || 0
    allocationMap.set(allocation.airCargoId, current + allocation.quantity)
  }

  // Validate quantities
  for (const item of items) {
    const cargo = cargoMap.get(item.airCargoId)!
    const totalAllocated = allocationMap.get(item.airCargoId) || 0
    const remaining = cargo.numberOfPieces - totalAllocated

    if (item.quantity > remaining) {
      return NextResponse.json(
        {
          error: `Cannot allocate ${item.quantity} pieces of "${cargo.name}". Only ${remaining} remaining.`,
        },
        { status: 400 }
      )
    }
  }

  // Create all console items
  const now = new Date()
  const createdItems: Array<{ id: string; airCargoId: string; quantity: number }> = []

  for (const item of items) {
    const consoleItem = em.create(FrcConsoleItem, {
      organizationId: console_.organizationId,
      tenantId: console_.tenantId,
      console: console_,
      airCargoId: item.airCargoId,
      truckBookingId: item.truckBookingId,
      quantity: item.quantity,
      createdAt: now,
      updatedAt: now,
    })
    em.persist(consoleItem)
    createdItems.push({
      id: consoleItem.id,
      airCargoId: consoleItem.airCargoId,
      quantity: consoleItem.quantity,
    })
  }

  await em.flush()

  return NextResponse.json({ items: createdItems, count: createdItems.length }, { status: 201 })
}
