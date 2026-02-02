/**
 * FMS Projects Module - Individual Project Line API
 * Handle GET, PUT, DELETE for a specific project line
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsProjectLine } from '../../../../../data/entities'
import { fmsProjectLineUpdateSchema } from '../../../../../data/validators'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_projects.lines.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_projects.lines.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_projects.lines.manage'] },
}

export const metadata = routeMetadata

const paramsSchema = z.object({
  id: z.string().uuid(),
  lineId: z.string().uuid(),
})

// Helper to build scope-aware filters
function buildScopeFilters(
  auth: { tenantId?: string | null; orgId?: string | null },
  scope: { tenantId?: string | null; selectedId?: string | null; filterIds?: string[] | null; allowedIds?: string[] | null } | null
): { tenantId?: string; organizationId?: { $in: string[] } } {
  const filters: { tenantId?: string; organizationId?: { $in: string[] } } = {}

  if (typeof auth.tenantId === 'string') {
    filters.tenantId = auth.tenantId
  }

  const orgIdsSet = new Set<string>()
  const filterIds = scope?.filterIds
  const allowedIds = scope?.allowedIds
  const fallbackOrgId = scope?.selectedId ?? auth.orgId ?? null

  if (Array.isArray(filterIds) && filterIds.length > 0) {
    filterIds.forEach((id) => {
      if (typeof id === 'string') orgIdsSet.add(id)
    })
  } else if (Array.isArray(allowedIds) && allowedIds.length > 0) {
    allowedIds.forEach((id) => {
      if (typeof id === 'string') orgIdsSet.add(id)
    })
  } else if (fallbackOrgId) {
    orgIdsSet.add(fallbackOrgId)
  }

  if (orgIdsSet.size > 0) {
    filters.organizationId = { $in: [...orgIdsSet] }
  }

  return filters
}

/**
 * GET - Get a specific project line
 */
export async function GET(req: Request, ctx: { params?: { id?: string; lineId?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const paramsResult = paramsSchema.safeParse({ id: ctx.params?.id, lineId: ctx.params?.lineId })
  if (!paramsResult.success) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
  }

  const { id: projectId, lineId } = paramsResult.data

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)

  const line = await em.findOne(FmsProjectLine, {
    id: lineId,
    project: projectId,
    deletedAt: null,
    ...scopeFilters,
  })

  if (!line) {
    return NextResponse.json({ error: 'Line not found' }, { status: 404 })
  }

  return NextResponse.json(line)
}

/**
 * PUT - Update a specific project line
 */
export async function PUT(req: Request, ctx: { params?: { id?: string; lineId?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const paramsResult = paramsSchema.safeParse({ id: ctx.params?.id, lineId: ctx.params?.lineId })
  if (!paramsResult.success) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
  }

  const { id: projectId, lineId } = paramsResult.data

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const body = await req.json()

  const scopeFilters = buildScopeFilters(auth, scope)

  const line = await em.findOne(FmsProjectLine, {
    id: lineId,
    project: projectId,
    deletedAt: null,
    ...scopeFilters,
  })

  if (!line) {
    return NextResponse.json({ error: 'Line not found' }, { status: 404 })
  }

  // Update fields if provided
  if (body.productName !== undefined) line.productName = body.productName
  if (body.chargeCode !== undefined) line.chargeCode = body.chargeCode
  if (body.containerSize !== undefined) line.containerSize = body.containerSize
  if (body.quantity !== undefined) line.quantity = body.quantity
  if (body.currencyCode !== undefined) line.currencyCode = body.currencyCode
  if (body.soldUnitPrice !== undefined) line.soldUnitPrice = body.soldUnitPrice
  if (body.actualUnitCost !== undefined) line.actualUnitCost = body.actualUnitCost
  if (body.actualCost !== undefined) line.actualCost = body.actualCost
  if (body.notes !== undefined) line.notes = body.notes

  // Recalculate sold amount if quantity or soldUnitPrice changed
  if (body.quantity !== undefined || body.soldUnitPrice !== undefined) {
    const qty = parseFloat(line.quantity) || 1
    const soldUnitPrice = parseFloat(line.soldUnitPrice) || 0
    line.soldAmount = (soldUnitPrice * qty).toString()
  }

  // Recalculate actual cost if quantity or actualUnitCost changed
  if ((body.quantity !== undefined || body.actualUnitCost !== undefined) && line.actualUnitCost) {
    const qty = parseFloat(line.quantity) || 1
    const actualUnitCost = parseFloat(line.actualUnitCost) || 0
    line.actualCost = (actualUnitCost * qty).toString()
  }

  line.updatedAt = new Date()
  await em.flush()

  return NextResponse.json(line)
}

/**
 * DELETE - Soft delete a specific project line
 */
export async function DELETE(req: Request, ctx: { params?: { id?: string; lineId?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const paramsResult = paramsSchema.safeParse({ id: ctx.params?.id, lineId: ctx.params?.lineId })
  if (!paramsResult.success) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
  }

  const { id: projectId, lineId } = paramsResult.data

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)

  const line = await em.findOne(FmsProjectLine, {
    id: lineId,
    project: projectId,
    deletedAt: null,
    ...scopeFilters,
  })

  if (!line) {
    return NextResponse.json({ error: 'Line not found' }, { status: 404 })
  }

  // Only allow deleting manual lines
  if (line.sourceType === 'offer') {
    return NextResponse.json({ error: 'Cannot delete lines sourced from offers' }, { status: 400 })
  }

  line.deletedAt = new Date()
  await em.flush()

  return NextResponse.json({ success: true })
}
