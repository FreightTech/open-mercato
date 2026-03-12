import { NextRequest, NextResponse } from 'next/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { FrcConsole, FrcConsoleCargo } from '../../../../data/entities'
import { FrcAirCargo } from '../../../../../frc_rfqs/data/entities'
import { frcConsoleCargoCreateSchema } from '../../../../data/validators'

// Type for raw air cargo query results (used in POST to avoid identity map issues)
// Note: Raw SQL may return numbers as strings or BigInt, so we use unknown and parse
interface AirCargoRow {
  id: string
  name: string
  number_of_pieces: number | string | bigint
}

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

  // Get all console cargo entries
  const consoleCargo = await em.find(
    FrcConsoleCargo,
    { console: console_, deletedAt: null },
    { orderBy: { createdAt: 'asc' } }
  )

  if (consoleCargo.length === 0) {
    return NextResponse.json({
      items: [],
      cargoForVisualization: [],
    })
  }

  // Fetch all air cargo records
  const airCargoIds = consoleCargo.map((item) => item.airCargoId)
  const airCargos = await em.find(FrcAirCargo, { id: { $in: airCargoIds }, deletedAt: null })
  const cargoMap = new Map(airCargos.map((c) => [c.id, c]))

  // Build detailed items list
  const items = consoleCargo.map((item, index) => {
    const cargo = cargoMap.get(item.airCargoId)
    return {
      id: item.id,
      airCargoId: item.airCargoId,
      quantity: item.quantity,
      cargoName: cargo?.name ?? 'Unknown',
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
  const items: Array<{ airCargoId: string; quantity: number }> = body.items
    ? body.items.map((i: { airCargoId: string; quantity?: number }) => ({
        airCargoId: i.airCargoId,
        quantity: i.quantity ?? 1,
      }))
    : [{ airCargoId: body.airCargoId, quantity: body.quantity ?? 1 }]

  // Validate all items
  const errors: string[] = []
  for (const item of items) {
    const parse = frcConsoleCargoCreateSchema.safeParse({ ...item, consoleId: id })
    if (!parse.success) {
      errors.push(`Invalid item: ${JSON.stringify(parse.error.flatten().fieldErrors)}`)
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 400 })
  }

  // Get all air cargo IDs for validation
  const airCargoIds = [...new Set(items.map((i) => i.airCargoId))]

  // Use raw query to avoid MikroORM identity map issues
  // (managed entities would get re-inserted on flush)
  const airCargoPlaceholders = airCargoIds.map(() => '?').join(', ')
  const airCargoRows = await em.getConnection().execute<AirCargoRow[]>(
    `SELECT id, name, number_of_pieces FROM frc_air_cargo 
     WHERE id IN (${airCargoPlaceholders}) AND deleted_at IS NULL`,
    airCargoIds
  )
  const cargoMap = new Map(airCargoRows.map((c) => [c.id, {
    id: c.id,
    name: c.name,
    // Ensure numberOfPieces is a number (raw SQL may return string or BigInt)
    numberOfPieces: typeof c.number_of_pieces === 'string' 
      ? parseInt(c.number_of_pieces, 10) 
      : Number(c.number_of_pieces),
  }]))

  // Validate all items exist
  for (const item of items) {
    if (!cargoMap.has(item.airCargoId)) {
      return NextResponse.json({ error: `Air cargo ${item.airCargoId} not found` }, { status: 404 })
    }
  }

  // Get existing allocations for quantity validation
  const existingAllocations = await em.find(FrcConsoleCargo, {
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

  // Create all console cargo entries
  const now = new Date()
  const createdItems: Array<{ id: string; airCargoId: string; quantity: number }> = []

  for (const item of items) {
    const consoleCargo = em.create(FrcConsoleCargo, {
      organizationId: console_.organizationId,
      tenantId: console_.tenantId,
      console: console_,
      airCargoId: item.airCargoId,
      quantity: item.quantity,
      createdAt: now,
      updatedAt: now,
    })
    em.persist(consoleCargo)
    createdItems.push({
      id: consoleCargo.id,
      airCargoId: consoleCargo.airCargoId,
      quantity: consoleCargo.quantity,
    })
  }

  await em.flush()

  return NextResponse.json({ items: createdItems, count: createdItems.length }, { status: 201 })
}
