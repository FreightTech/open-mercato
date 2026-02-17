import { NextRequest, NextResponse } from 'next/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { FrcTruckPreset } from '../../../data/entities'
import { updateTruckPresetSchema, calculateVolumeM3 } from '../../../data/validators'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['frc_trucks.view'] },
  PUT: { requireAuth: true, requireFeatures: ['frc_trucks.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['frc_trucks.manage'] },
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

  const preset = await em.findOne(FrcTruckPreset, { id, deletedAt: null })

  if (!preset) {
    return NextResponse.json({ error: 'Preset not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: preset.id,
    name: preset.name,
    width: preset.width,
    length: preset.length,
    height: preset.height,
    maxWeight: preset.maxWeight,
    volume: preset.volume,
    isActive: preset.isActive,
    organizationId: preset.organizationId,
    tenantId: preset.tenantId,
    createdAt: preset.createdAt,
    updatedAt: preset.updatedAt,
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
  const parse = updateTruckPresetSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parse.error },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  const preset = await em.findOne(FrcTruckPreset, { id, deletedAt: null })

  if (!preset) {
    return NextResponse.json({ error: 'Preset not found' }, { status: 404 })
  }

  // Track if dimensions changed for volume recalculation
  let dimensionsChanged = false
  let newWidth = preset.width
  let newLength = preset.length
  let newHeight = preset.height

  if (parse.data.name !== undefined) {
    preset.name = parse.data.name
  }

  if (parse.data.width !== undefined) {
    preset.width = parse.data.width
    newWidth = parse.data.width
    dimensionsChanged = true
  }

  if (parse.data.length !== undefined) {
    preset.length = parse.data.length
    newLength = parse.data.length
    dimensionsChanged = true
  }

  if (parse.data.height !== undefined) {
    preset.height = parse.data.height
    newHeight = parse.data.height
    dimensionsChanged = true
  }

  if (parse.data.maxWeight !== undefined) {
    preset.maxWeight = parse.data.maxWeight
  }

  if (parse.data.isActive !== undefined) {
    preset.isActive = parse.data.isActive
  }

  // Recalculate volume if any dimension changed
  if (dimensionsChanged) {
    preset.volume = calculateVolumeM3(newWidth, newLength, newHeight)
  }

  preset.updatedAt = new Date()

  await em.flush()

  return NextResponse.json({
    id: preset.id,
    name: preset.name,
    width: preset.width,
    length: preset.length,
    height: preset.height,
    maxWeight: preset.maxWeight,
    volume: preset.volume,
    isActive: preset.isActive,
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

  // Use nativeUpdate to bypass identity map issues
  const result = await em.nativeUpdate(
    FrcTruckPreset,
    { id, deletedAt: null },
    { deletedAt: new Date() }
  )

  if (result === 0) {
    return NextResponse.json({ error: 'Preset not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
