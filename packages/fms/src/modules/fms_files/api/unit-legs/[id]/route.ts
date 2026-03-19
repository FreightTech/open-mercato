/**
 * FMS File Unit-Leg - Single Entity
 * GET    /api/fms_files/unit-legs/:id
 * PUT    /api/fms_files/unit-legs/:id
 * DELETE /api/fms_files/unit-legs/:id
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { FmsFileUnitLeg } from '../../../data/entities'
import { updateUnitLegSchema } from '../../../data/validators'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_files.files.view'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_files.files.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_files.files.manage'] },
}

const paramsSchema = z.object({ id: z.string().uuid() })

export async function GET(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = paramsSchema.safeParse(ctx.params)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  const unitLeg = await em.findOne(FmsFileUnitLeg, { id: parsed.data.id, deletedAt: null })
  if (!unitLeg) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(unitLeg)
}

export async function PUT(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = paramsSchema.safeParse(ctx.params)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

  const body = await req.json()
  const updateParsed = updateUnitLegSchema.omit({ id: true }).safeParse(body)
  if (!updateParsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: updateParsed.error.flatten() }, { status: 400 })
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  const unitLeg = await em.findOne(FmsFileUnitLeg, { id: parsed.data.id, deletedAt: null })
  if (!unitLeg) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data = updateParsed.data
  if (data.truckPlate !== undefined) unitLeg.truckPlate = data.truckPlate
  if (data.trailerPlate !== undefined) unitLeg.trailerPlate = data.trailerPlate
  if (data.driverFullName !== undefined) unitLeg.driverFullName = data.driverFullName
  if (data.driverIdNumber !== undefined) unitLeg.driverIdNumber = data.driverIdNumber
  if (data.driverPhone !== undefined) unitLeg.driverPhone = data.driverPhone
  if (data.sealNumber !== undefined) unitLeg.sealNumber = data.sealNumber
  if (data.blNumber !== undefined) unitLeg.blNumber = data.blNumber
  if (data.consolidationContainerNumber !== undefined) unitLeg.consolidationContainerNumber = data.consolidationContainerNumber
  if (data.notes !== undefined) unitLeg.notes = data.notes
  if (data.ptd !== undefined) unitLeg.ptd = data.ptd
  if (data.etd !== undefined) unitLeg.etd = data.etd
  if (data.atd !== undefined) unitLeg.atd = data.atd
  if (data.pta !== undefined) unitLeg.pta = data.pta
  if (data.eta !== undefined) unitLeg.eta = data.eta
  if (data.ata !== undefined) unitLeg.ata = data.ata

  await em.flush()
  return NextResponse.json(unitLeg)
}

export async function DELETE(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = paramsSchema.safeParse(ctx.params)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  const unitLeg = await em.findOne(FmsFileUnitLeg, { id: parsed.data.id, deletedAt: null })
  if (!unitLeg) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  unitLeg.deletedAt = new Date()
  await em.flush()
  return NextResponse.json({ id: unitLeg.id, deleted: true })
}

export const openApi = {
  get: { operationId: 'getFmsFileUnitLeg', summary: 'Get a unit-leg assignment', tags: ['FMS Files'], responses: { 200: { description: 'Details' } } },
  put: { operationId: 'updateFmsFileUnitLeg', summary: 'Update a unit-leg assignment', tags: ['FMS Files'], responses: { 200: { description: 'Updated' } } },
  delete: { operationId: 'deleteFmsFileUnitLeg', summary: 'Delete a unit-leg assignment', tags: ['FMS Files'], responses: { 200: { description: 'Deleted' } } },
}
