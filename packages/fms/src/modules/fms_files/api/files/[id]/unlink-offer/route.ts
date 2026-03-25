/**
 * FMS Files Module - Unlink Offer API
 * Removes the offer link from a file and soft-deletes all offer-sourced lines
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsFile, FmsFileLine } from '../../../../data/entities'
import { buildScopeFilters } from '../../../../lib/scope-filters'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['fms_files.lines.manage'] },
}

const paramsSchema = z.object({ id: z.string().uuid() })

export async function POST(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const paramsResult = paramsSchema.safeParse({ id: ctx.params?.id })
  if (!paramsResult.success) {
    return NextResponse.json({ error: 'Invalid file id' }, { status: 400 })
  }

  const fileId = paramsResult.data.id
  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager
  const scopeFilters = buildScopeFilters(auth, scope)

  const file = await em.findOne(FmsFile, { id: fileId, deletedAt: null, ...scopeFilters })
  if (!file) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  const now = new Date()
  file.offerId = null
  file.rfqId = null
  file.updatedAt = now

  // Soft-delete all offer-sourced lines
  const offerLines = await em.find(FmsFileLine, {
    file: fileId,
    sourceType: 'offer',
    deletedAt: null,
    ...scopeFilters,
  })

  for (const line of offerLines) {
    line.deletedAt = now
  }

  await em.flush()

  return NextResponse.json({ ok: true, linesRemoved: offerLines.length })
}

export const openApi = {
  post: { operationId: 'unlinkOfferFromFmsFile', summary: 'Unlink an offer from a file', tags: ['FMS Files'], responses: { 200: { description: 'Unlinked' } } },
}
