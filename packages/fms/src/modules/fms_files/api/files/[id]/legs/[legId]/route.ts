/**
 * FMS File Leg - Single Entity
 * GET    /api/fms_files/files/:id/legs/:legId
 * PUT    /api/fms_files/files/:id/legs/:legId
 * DELETE /api/fms_files/files/:id/legs/:legId
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { FmsFileLeg, FmsFileUnitLeg } from '../../../../../data/entities'
import { updateLegSchema } from '../../../../../data/validators'
import { triggerTrackingIfApplicable } from '../../../../../lib/tracking-integration'
import { createFmsLogger } from '../../../../../../../lib/logger'

const logger = createFmsLogger('fms_files.legs.api')

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_files.files.view'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_files.legs.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_files.legs.manage'] },
}

const paramsSchema = z.object({ id: z.string().uuid(), legId: z.string().uuid() })

export async function GET(req: Request, ctx: { params?: { id?: string; legId?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = paramsSchema.safeParse(ctx.params)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid params' }, { status: 400 })

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  const leg = await em.findOne(FmsFileLeg, {
    id: parsed.data.legId,
    file: parsed.data.id,
    deletedAt: null,
  })

  if (!leg) return NextResponse.json({ error: 'Leg not found' }, { status: 404 })
  return NextResponse.json(leg)
}

export async function PUT(req: Request, ctx: { params?: { id?: string; legId?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = paramsSchema.safeParse(ctx.params)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid params' }, { status: 400 })

  const body = await req.json()
  const updateParsed = updateLegSchema.omit({ id: true }).safeParse(body)
  if (!updateParsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: updateParsed.error.flatten() }, { status: 400 })
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  const leg = await em.findOne(FmsFileLeg, {
    id: parsed.data.legId,
    file: parsed.data.id,
    deletedAt: null,
  })

  if (!leg) return NextResponse.json({ error: 'Leg not found' }, { status: 404 })

  const data = updateParsed.data
  if (data.legSequence !== undefined) leg.legSequence = data.legSequence
  if (data.type !== undefined) leg.type = data.type
  if (data.originLocationId !== undefined) leg.originLocationId = data.originLocationId
  if (data.destinationLocationId !== undefined) leg.destinationLocationId = data.destinationLocationId
  if (data.bookingNumber !== undefined) leg.bookingNumber = data.bookingNumber
  if (data.carrierId !== undefined) leg.carrierId = data.carrierId
  if (data.blNumber !== undefined) leg.blNumber = data.blNumber
  if (data.vesselName !== undefined) leg.vesselName = data.vesselName
  if (data.vesselImo !== undefined) leg.vesselImo = data.vesselImo
  if (data.voyageNumber !== undefined) leg.voyageNumber = data.voyageNumber
  if (data.flightNumber !== undefined) leg.flightNumber = data.flightNumber
  if (data.aircraftType !== undefined) leg.aircraftType = data.aircraftType
  if (data.gateInCutoff !== undefined) leg.gateInCutoff = data.gateInCutoff ? new Date(data.gateInCutoff) : null
  if (data.documentationCutoff !== undefined) leg.documentationCutoff = data.documentationCutoff ? new Date(data.documentationCutoff) : null
  if (data.vgmCutoff !== undefined) leg.vgmCutoff = data.vgmCutoff ? new Date(data.vgmCutoff) : null
  if (data.dangerousGoodsCutoff !== undefined) leg.dangerousGoodsCutoff = data.dangerousGoodsCutoff ? new Date(data.dangerousGoodsCutoff) : null
  if (data.demFreeTime !== undefined) leg.demFreeTime = data.demFreeTime
  if (data.detFreeTime !== undefined) leg.detFreeTime = data.detFreeTime
  if (data.notes !== undefined) leg.notes = data.notes
  leg.updatedBy = auth.sub ?? null

  await em.flush()

  triggerTrackingIfApplicable(em, leg, container).catch((err) =>
    logger.warn('tracking_trigger_failed', { legId: leg.id, error: err instanceof Error ? err.message : String(err) })
  )

  return NextResponse.json(leg)
}

export async function DELETE(req: Request, ctx: { params?: { id?: string; legId?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = paramsSchema.safeParse(ctx.params)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid params' }, { status: 400 })

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  const leg = await em.findOne(FmsFileLeg, {
    id: parsed.data.legId,
    file: parsed.data.id,
    deletedAt: null,
  })

  if (!leg) return NextResponse.json({ error: 'Leg not found' }, { status: 404 })

  const now = new Date()
  leg.deletedAt = now

  // Cascade soft-delete all unit-leg assignments for this leg
  const unitLegs = await em.find(FmsFileUnitLeg, { leg: parsed.data.legId, deletedAt: null })
  for (const ul of unitLegs) ul.deletedAt = now

  await em.flush()
  return NextResponse.json({ id: leg.id, deleted: true })
}

export const openApi = {
  get: { operationId: 'getFmsFileLeg', summary: 'Get a file leg', tags: ['FMS Files'], responses: { 200: { description: 'Leg details' } } },
  put: { operationId: 'updateFmsFileLeg', summary: 'Update a file leg', tags: ['FMS Files'], responses: { 200: { description: 'Updated leg' } } },
  delete: { operationId: 'deleteFmsFileLeg', summary: 'Soft delete a file leg', tags: ['FMS Files'], responses: { 200: { description: 'Deleted' } } },
}
