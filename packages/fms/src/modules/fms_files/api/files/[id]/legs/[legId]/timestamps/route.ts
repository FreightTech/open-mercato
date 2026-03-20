/**
 * FMS File Leg Timestamps
 * POST /api/fms_files/files/:id/legs/:legId/timestamps
 *
 * Appends a new manual timestamp entry to the leg's SCD timestamp array.
 * Each call pushes one entry — history is preserved; `.at(-1)` is the current value.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { FmsFileLeg } from '../../../../../../data/entities'
import type { LegTimestampEntry } from '../../../../../../data/types'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['fms_files.legs.manage'] },
}

const paramsSchema = z.object({ id: z.string().uuid(), legId: z.string().uuid() })

const bodySchema = z.object({
  timestampType: z.enum(['ptd', 'etd', 'atd', 'pta', 'eta', 'ata']),
  value: z.string().min(1),
})

const TIMESTAMP_FIELD_MAP = {
  ptd: 'ptdTimestamps',
  etd: 'etdTimestamps',
  atd: 'atdTimestamps',
  pta: 'ptaTimestamps',
  eta: 'etaTimestamps',
  ata: 'ataTimestamps',
} as const

export async function POST(req: Request, ctx: { params?: { id?: string; legId?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = paramsSchema.safeParse(ctx.params)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid params' }, { status: 400 })

  const body = await req.json()
  const bodyParsed = bodySchema.safeParse(body)
  if (!bodyParsed.success) return NextResponse.json({ error: 'Validation failed', details: bodyParsed.error.flatten() }, { status: 400 })

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  const leg = await em.findOne(FmsFileLeg, { id: parsed.data.legId, file: parsed.data.id, deletedAt: null })
  if (!leg) return NextResponse.json({ error: 'Leg not found' }, { status: 404 })

  const { timestampType, value } = bodyParsed.data
  const field = TIMESTAMP_FIELD_MAP[timestampType]

  const entry: LegTimestampEntry = {
    value,
    offset: null,
    source: 'manual',
    updatedAt: new Date().toISOString(),
  }

  const existing = (leg[field] ?? []) as LegTimestampEntry[]
  ;(leg as any)[field] = [...existing, entry]
  leg.updatedBy = auth.sub ?? null

  await em.flush()

  return NextResponse.json({ legId: leg.id, timestampType, entry, total: ((leg as any)[field] as LegTimestampEntry[]).length })
}

export const openApi = {
  post: {
    operationId: 'addFmsFileLegTimestamp',
    summary: 'Append a manual timestamp entry to a leg',
    tags: ['FMS Files'],
    responses: { 200: { description: 'Timestamp appended' } },
  },
}
