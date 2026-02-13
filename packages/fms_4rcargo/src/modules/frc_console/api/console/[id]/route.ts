import { NextRequest, NextResponse } from 'next/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { FrcConsole } from '../../../data/entities'
import { FrcTruck } from '../../../../frc_trucks/data/entities'
import { FrcAirport } from '../../../../frc_airports/data/entities'
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
    { populate: ['truck', 'originAirport', 'destinationAirport', 'items'] }
  )

  if (!console_) {
    return NextResponse.json({ error: 'Console not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: console_.id,
    name: console_.name,
    date: console_.date,
    status: console_.status,
    truckPresetId: console_.truckPresetId,
    notes: console_.notes,
    truck: console_.truck
      ? {
          id: console_.truck.id,
          name: console_.truck.name,
        }
      : null,
    originAirport: console_.originAirport
      ? {
          id: console_.originAirport.id,
          code: console_.originAirport.code,
          city: console_.originAirport.city,
        }
      : null,
    destinationAirport: console_.destinationAirport
      ? {
          id: console_.destinationAirport.id,
          code: console_.destinationAirport.code,
          city: console_.destinationAirport.city,
        }
      : null,
    itemCount: console_.items.length,
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
    { populate: ['truck', 'originAirport', 'destinationAirport'] }
  )

  if (!console_) {
    return NextResponse.json({ error: 'Console not found' }, { status: 404 })
  }

  // Track whether name needs to be regenerated
  let nameChanged = false
  let newTruck = console_.truck
  let newDate = console_.date
  let newOrigin = console_.originAirport
  let newDest = console_.destinationAirport

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
      console_.originAirport = null
      newOrigin = null
      nameChanged = true
    } else if (parse.data.originAirportId !== console_.originAirport?.id) {
      const airport = await em.findOne(FrcAirport, {
        id: parse.data.originAirportId,
        deletedAt: null,
      })
      console_.originAirport = airport
      newOrigin = airport
      nameChanged = true
    }
  }

  if (parse.data.destinationAirportId !== undefined) {
    if (parse.data.destinationAirportId === null) {
      console_.destinationAirport = null
      newDest = null
      nameChanged = true
    } else if (parse.data.destinationAirportId !== console_.destinationAirport?.id) {
      const airport = await em.findOne(FrcAirport, {
        id: parse.data.destinationAirportId,
        deletedAt: null,
      })
      console_.destinationAirport = airport
      newDest = airport
      nameChanged = true
    }
  }

  // Regenerate name if needed
  if (nameChanged) {
    const dateStr = newDate.toISOString().substring(0, 10)
    const routePart = [newOrigin?.code, newDest?.code].filter(Boolean).join('-') || 'N/A'
    console_.name = `${newTruck?.name || 'Unknown'}/${dateStr}/${routePart}`
  }

  if (parse.data.status !== undefined) {
    console_.status = parse.data.status
  }

  if (parse.data.truckPresetId !== undefined) {
    console_.truckPresetId = parse.data.truckPresetId
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
