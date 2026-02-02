/**
 * FMS Projects Module - Project Lines API
 * Manage financial tracking lines for a project
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsProjectLine } from '../../../../data/entities'
import { fmsProjectLineCreateSchema, fmsProjectLineUpdateSchema } from '../../../../data/validators'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_projects.lines.manage'] },
  POST: { requireAuth: true, requireFeatures: ['fms_projects.lines.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_projects.lines.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_projects.lines.manage'] },
}

export const metadata = routeMetadata

const paramsSchema = z.object({
  id: z.string().uuid(),
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
 * GET - List project lines for a specific project
 */
export async function GET(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const paramsResult = paramsSchema.safeParse({ id: ctx.params?.id })
  if (!paramsResult.success) {
    return NextResponse.json({ error: 'Invalid project id' }, { status: 400 })
  }

  const projectId = paramsResult.data.id

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)

  // Find lines for this specific project
  const lines = await em.find(FmsProjectLine, {
    project: projectId,
    deletedAt: null,
    ...scopeFilters,
  }, { orderBy: { lineNumber: 'ASC' } })

  return NextResponse.json({
    items: lines,
    total: lines.length,
  })
}

/**
 * POST - Create a new project line
 */
export async function POST(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const paramsResult = paramsSchema.safeParse({ id: ctx.params?.id })
  if (!paramsResult.success) {
    return NextResponse.json({ error: 'Invalid project id' }, { status: 400 })
  }

  const projectId = paramsResult.data.id

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const body = await req.json()
  const parseResult = fmsProjectLineCreateSchema.safeParse(body)
  if (!parseResult.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parseResult.error }, { status: 400 })
  }

  const data = parseResult.data as any
  const selectedOrgId = scope?.selectedId ?? auth.orgId
  const tenantId = auth.tenantId

  if (!selectedOrgId || !tenantId) {
    return NextResponse.json({ error: 'Organization and tenant context required' }, { status: 400 })
  }

  // Auto-increment line number if not provided
  let lineNumber = data.lineNumber
  if (!lineNumber) {
    const existingLines = await em.find(FmsProjectLine, {
      project: projectId,
      deletedAt: null,
    })
    lineNumber = existingLines.length + 1
  }

  // Calculate sold amount from unit price and quantity
  let soldAmount = data.soldAmount
  if (data.soldUnitPrice && data.quantity) {
    const unitPrice = parseFloat(data.soldUnitPrice) || 0
    const qty = parseFloat(data.quantity) || 1
    soldAmount = (unitPrice * qty).toString()
  }

  // Calculate actual cost from actual unit cost and quantity
  let actualCost = data.actualCost
  if (data.actualUnitCost && data.quantity) {
    const unitCost = parseFloat(data.actualUnitCost) || 0
    const qty = parseFloat(data.quantity) || 1
    actualCost = (unitCost * qty).toString()
  }

  const now = new Date()
  const line = em.create(FmsProjectLine, {
    organizationId: selectedOrgId,
    tenantId: tenantId,
    project: projectId as any,
    lineNumber,
    sourceType: 'manual',
    productName: data.productName || 'Unknown Product',
    chargeCode: data.chargeCode || null,
    containerSize: data.containerSize || null,
    quantity: data.quantity || '1',
    currencyCode: data.currencyCode || 'USD',
    soldUnitPrice: data.soldUnitPrice || '0',
    soldAmount: soldAmount || '0',
    actualUnitCost: data.actualUnitCost || null,
    actualCost: actualCost || null,
    notes: data.notes || null,
    createdAt: now,
    updatedAt: now,
  })

  em.persist(line)
  await em.flush()

  return NextResponse.json(line, { status: 201 })
}

/**
 * PUT - Update a project line
 */
export async function PUT(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const body = await req.json()
  const parseResult = fmsProjectLineUpdateSchema.safeParse(body)
  if (!parseResult.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parseResult.error }, { status: 400 })
  }

  const data = parseResult.data as any
  if (!data.id) {
    return NextResponse.json({ error: 'Line ID required' }, { status: 400 })
  }

  const scopeFilters = buildScopeFilters(auth, scope)

  const line = await em.findOne(FmsProjectLine, {
    id: data.id,
    deletedAt: null,
    ...scopeFilters,
  })

  if (!line) {
    return NextResponse.json({ error: 'Line not found' }, { status: 404 })
  }

  // Update fields
  if (data.productName !== undefined) line.productName = data.productName
  if (data.chargeCode !== undefined) line.chargeCode = data.chargeCode
  if (data.containerSize !== undefined) line.containerSize = data.containerSize
  if (data.quantity !== undefined) line.quantity = data.quantity
  if (data.currencyCode !== undefined) line.currencyCode = data.currencyCode
  if (data.soldUnitPrice !== undefined) line.soldUnitPrice = data.soldUnitPrice
  if (data.actualUnitCost !== undefined) line.actualUnitCost = data.actualUnitCost
  if (data.notes !== undefined) line.notes = data.notes

  // Recalculate sold amount
  const qty = parseFloat(line.quantity) || 1
  const soldUnitPrice = parseFloat(line.soldUnitPrice) || 0
  line.soldAmount = (soldUnitPrice * qty).toString()

  // Recalculate actual cost if actualUnitCost exists
  if (line.actualUnitCost) {
    const actualUnitCost = parseFloat(line.actualUnitCost) || 0
    line.actualCost = (actualUnitCost * qty).toString()
  }

  line.updatedAt = new Date()
  await em.flush()

  return NextResponse.json(line)
}

/**
 * DELETE - Soft delete a project line
 */
export async function DELETE(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const url = new URL(req.url)
  const lineId = url.searchParams.get('id')
  if (!lineId) {
    return NextResponse.json({ error: 'Line ID required' }, { status: 400 })
  }

  const scopeFilters = buildScopeFilters(auth, scope)

  const line = await em.findOne(FmsProjectLine, {
    id: lineId,
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
