import { NextRequest, NextResponse } from 'next/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { FmsLocation } from '@open-mercato/fms/modules/fms_locations/data/entities'
import { FrcConsole } from '../../../data/entities'
import { FrcTruck, FrcTruckPreset } from '../../../../frc_trucks/data/entities'
import { frcConsoleUpdateSchema } from '../../../data/validators'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['frc_console.view'] },
  PUT: { requireAuth: true, requireFeatures: ['frc_console.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['frc_console.manage'] },
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

  const console_ = await em.findOne(
    FrcConsole,
    { id, deletedAt: null },
    { populate: ['truck', 'truckPreset', 'cargo'] }
  )

  if (!console_) {
    return NextResponse.json({ error: 'Console not found' }, { status: 404 })
  }

  // Fetch airports from FmsLocation (type: 'airport')
  const airportIds = [console_.originAirportId, console_.destinationAirportId].filter(
    (id): id is string => Boolean(id)
  )

  const airports =
    airportIds.length > 0
      ? await em.find(FmsLocation, { id: { $in: airportIds }, type: 'airport' })
      : []
  const airportMap = new Map(airports.map((a) => [a.id, a]))

  const originAirport = console_.originAirportId ? airportMap.get(console_.originAirportId) : null
  const destinationAirport = console_.destinationAirportId
    ? airportMap.get(console_.destinationAirportId)
    : null

  return NextResponse.json({
    id: console_.id,
    name: console_.name,
    date: console_.date,
    status: console_.status,
    notes: console_.notes,
    truck: console_.truck
      ? {
          id: console_.truck.id,
          name: console_.truck.name,
        }
      : null,
    truckPreset: console_.truckPreset
      ? {
          id: console_.truckPreset.id,
          name: console_.truckPreset.name,
          width: console_.truckPreset.width,
          length: console_.truckPreset.length,
          height: console_.truckPreset.height,
          maxWeight: console_.truckPreset.maxWeight,
          volume: console_.truckPreset.volume,
        }
      : null,
    truckPresetId: console_.truckPreset?.id ?? null,
    truckPresetName: console_.truckPreset?.name ?? null,
    originAirport: originAirport
      ? {
          id: originAirport.id,
          code: originAirport.code,
          city: originAirport.city,
        }
      : null,
    originAirportCode: originAirport?.code ?? null,
    destinationAirport: destinationAirport
      ? {
          id: destinationAirport.id,
          code: destinationAirport.code,
          city: destinationAirport.city,
        }
      : null,
    destinationAirportCode: destinationAirport?.code ?? null,
    cargoCount: console_.cargo.length,
    organizationId: console_.organizationId,
    tenantId: console_.tenantId,
    createdAt: console_.createdAt,
    updatedAt: console_.updatedAt,
  })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const parse = frcConsoleUpdateSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parse.error },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  const console_ = await em.findOne(
    FrcConsole,
    { id, deletedAt: null },
    { populate: ['truck', 'truckPreset'] }
  )

  if (!console_) {
    return NextResponse.json({ error: 'Console not found' }, { status: 404 })
  }

  // Track whether name needs to be regenerated
  let nameChanged = false
  let newTruck = console_.truck
  let newDate = console_.date
  let newOriginCode: string | null = null
  let newDestCode: string | null = null

  // Fetch current airports to get codes for name generation
  const currentAirportIds = [console_.originAirportId, console_.destinationAirportId].filter(
    (id): id is string => Boolean(id)
  )
  const currentAirports =
    currentAirportIds.length > 0
      ? await em.find(FmsLocation, { id: { $in: currentAirportIds }, type: 'airport' })
      : []
  const currentAirportMap = new Map(currentAirports.map((a) => [a.id, a]))

  newOriginCode = console_.originAirportId
    ? (currentAirportMap.get(console_.originAirportId)?.code ?? null)
    : null
  newDestCode = console_.destinationAirportId
    ? (currentAirportMap.get(console_.destinationAirportId)?.code ?? null)
    : null

  if (parse.data.truckId && parse.data.truckId !== console_.truck?.id) {
    const truck = await em.findOne(FrcTruck, { id: parse.data.truckId, deletedAt: null })
    if (!truck) {
      return NextResponse.json({ error: 'Truck not found' }, { status: 404 })
    }
    console_.truck = truck
    newTruck = truck
    nameChanged = true
  }

  if (parse.data.date) {
    const dateValue = new Date(parse.data.date)
    if (dateValue.getTime() !== console_.date.getTime()) {
      console_.date = dateValue
      newDate = dateValue
      nameChanged = true
    }
  }

  if (parse.data.originAirportId !== undefined) {
    if (parse.data.originAirportId === null) {
      console_.originAirportId = null
      newOriginCode = null
      nameChanged = true
    } else if (parse.data.originAirportId !== console_.originAirportId) {
      const airport = await em.findOne(FmsLocation, {
        id: parse.data.originAirportId,
        type: 'airport',
      })
      console_.originAirportId = parse.data.originAirportId
      newOriginCode = airport?.code ?? null
      nameChanged = true
    }
  }

  if (parse.data.destinationAirportId !== undefined) {
    if (parse.data.destinationAirportId === null) {
      console_.destinationAirportId = null
      newDestCode = null
      nameChanged = true
    } else if (parse.data.destinationAirportId !== console_.destinationAirportId) {
      const airport = await em.findOne(FmsLocation, {
        id: parse.data.destinationAirportId,
        type: 'airport',
      })
      console_.destinationAirportId = parse.data.destinationAirportId
      newDestCode = airport?.code ?? null
      nameChanged = true
    }
  }

  // Regenerate name if needed
  if (nameChanged) {
    const dateStr = newDate.toISOString().substring(0, 10)
    const routePart = [newOriginCode, newDestCode].filter(Boolean).join('-') || 'N/A'
    console_.name = `${newTruck?.name || 'Unknown'}/${dateStr}/${routePart}`
  }

  if (parse.data.status !== undefined) {
    console_.status = parse.data.status
  }

  if (parse.data.truckPresetId !== undefined) {
    if (parse.data.truckPresetId === null) {
      console_.truckPreset = null
    } else if (parse.data.truckPresetId !== console_.truckPreset?.id) {
      const preset = await em.findOne(FrcTruckPreset, { id: parse.data.truckPresetId, deletedAt: null })
      console_.truckPreset = preset
    }
  }

  if (parse.data.notes !== undefined) {
    console_.notes = parse.data.notes
  }

  console_.updatedAt = new Date()

  await em.flush()

  return NextResponse.json({
    id: console_.id,
    name: console_.name,
    status: console_.status,
  })
}

export async function DELETE(
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

  const console_ = await em.findOne(FrcConsole, { id, deletedAt: null })

  if (!console_) {
    return NextResponse.json({ error: 'Console not found' }, { status: 404 })
  }

  console_.deletedAt = new Date()
  await em.flush()

  return NextResponse.json({ success: true })
}
