/**
 * FMS Files Module - File Lines API
 * Manage financial tracking lines for a file
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsFileLine } from '../../../../data/entities'
import { fmsFileLineCreateSchema, fmsFileLineUpdateSchema } from '../../../../data/validators'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_files.files.view'] },
  POST: { requireAuth: true, requireFeatures: ['fms_files.lines.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_files.lines.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_files.lines.manage'] },
}

const paramsSchema = z.object({
  id: z.string().uuid(),
})

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
    filterIds.forEach((id) => { if (typeof id === 'string') orgIdsSet.add(id) })
  } else if (Array.isArray(allowedIds) && allowedIds.length > 0) {
    allowedIds.forEach((id) => { if (typeof id === 'string') orgIdsSet.add(id) })
  } else if (fallbackOrgId) {
    orgIdsSet.add(fallbackOrgId)
  }

  if (orgIdsSet.size > 0) {
    filters.organizationId = { $in: [...orgIdsSet] }
  }

  return filters
}

/**
 * GET - List all lines for a file
 */
export async function GET(req: Request, ctx: { params?: { id?: string } }) {
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

  const lines = await em.find(FmsFileLine, {
    file: fileId,
    deletedAt: null,
    ...scopeFilters,
  }, { orderBy: { lineNumber: 'ASC' } })

  return NextResponse.json({ items: lines, total: lines.length })
}

/**
 * POST - Create a new file line
 */
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

  const body = await req.json()
  const parseResult = fmsFileLineCreateSchema.safeParse(body)
  if (!parseResult.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parseResult.error }, { status: 400 })
  }

  const data = parseResult.data
  const selectedOrgId = scope?.selectedId ?? auth.orgId
  const tenantId = auth.tenantId

  if (!selectedOrgId || !tenantId) {
    return NextResponse.json({ error: 'Organization and tenant context required' }, { status: 400 })
  }

  // Auto-increment line number if not provided
  let lineNumber = data.lineNumber
  if (!lineNumber) {
    const existingLines = await em.find(FmsFileLine, { file: fileId, deletedAt: null })
    lineNumber = existingLines.length + 1
  }

  const qty = parseFloat(data.quantity) || 1

  const soldAmount = ((parseFloat(data.soldUnitPrice) || 0) * qty).toString()

  const estimatedCost = data.estimatedUnitCost
    ? ((parseFloat(data.estimatedUnitCost) || 0) * qty).toString()
    : null

  const actualCost = data.actualUnitCost
    ? ((parseFloat(data.actualUnitCost) || 0) * qty).toString()
    : null

  const actualSellAmount = data.actualSellUnitPrice
    ? ((parseFloat(data.actualSellUnitPrice) || 0) * qty).toString()
    : null

  const now = new Date()
  const line = em.create(FmsFileLine, {
    organizationId: selectedOrgId,
    tenantId,
    file: fileId as any,
    lineNumber,
    sourceType: 'manual',
    sourceOfferLineId: data.sourceOfferLineId ?? null,
    productId: data.productId ?? null,
    priceId: data.priceId ?? null,
    productName: data.productName,
    chargeCode: data.chargeCode ?? null,
    chargeCategory: data.chargeCategory ?? null,
    chargeUnit: data.chargeUnit ?? null,
    containerType: data.containerType ?? null,
    containerSize: data.containerSize ?? null,
    quantity: data.quantity,
    currencyCode: data.currencyCode,
    soldUnitPrice: data.soldUnitPrice,
    soldAmount,
    estimatedUnitCost: data.estimatedUnitCost ?? null,
    estimatedCost,
    actualUnitCost: data.actualUnitCost ?? null,
    actualCost,
    actualSellUnitPrice: data.actualSellUnitPrice ?? null,
    actualSellAmount,
    notes: data.notes ?? null,
    createdAt: now,
    updatedAt: now,
  })

  em.persist(line)
  await em.flush()

  return NextResponse.json(line, { status: 201 })
}

/**
 * PUT - Update a file line
 */
export async function PUT(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const body = await req.json()
  const parseResult = fmsFileLineUpdateSchema.safeParse(body)
  if (!parseResult.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parseResult.error }, { status: 400 })
  }

  const data = parseResult.data
  if (!data.id) {
    return NextResponse.json({ error: 'Line ID required' }, { status: 400 })
  }

  const scopeFilters = buildScopeFilters(auth, scope)
  const line = await em.findOne(FmsFileLine, { id: data.id, deletedAt: null, ...scopeFilters })

  if (!line) {
    return NextResponse.json({ error: 'Line not found' }, { status: 404 })
  }

  if (data.productName !== undefined) line.productName = data.productName
  if (data.chargeCode !== undefined) line.chargeCode = data.chargeCode ?? null
  if (data.chargeCategory !== undefined) line.chargeCategory = data.chargeCategory ?? null
  if (data.chargeUnit !== undefined) line.chargeUnit = data.chargeUnit ?? null
  if (data.containerType !== undefined) line.containerType = data.containerType ?? null
  if (data.containerSize !== undefined) line.containerSize = data.containerSize ?? null
  if (data.quantity !== undefined) line.quantity = data.quantity
  if (data.currencyCode !== undefined) line.currencyCode = data.currencyCode
  if (data.soldUnitPrice !== undefined) line.soldUnitPrice = data.soldUnitPrice
  if (data.estimatedUnitCost !== undefined) line.estimatedUnitCost = data.estimatedUnitCost ?? null
  if (data.actualUnitCost !== undefined) line.actualUnitCost = data.actualUnitCost ?? null
  if (data.actualSellUnitPrice !== undefined) line.actualSellUnitPrice = data.actualSellUnitPrice ?? null
  if (data.notes !== undefined) line.notes = data.notes ?? null

  // Recalculate all amounts
  const qty = parseFloat(line.quantity) || 1
  line.soldAmount = ((parseFloat(line.soldUnitPrice) || 0) * qty).toString()

  if (line.estimatedUnitCost) {
    line.estimatedCost = ((parseFloat(line.estimatedUnitCost) || 0) * qty).toString()
  } else {
    line.estimatedCost = null
  }

  if (line.actualUnitCost) {
    line.actualCost = ((parseFloat(line.actualUnitCost) || 0) * qty).toString()
  } else {
    line.actualCost = null
  }

  if (line.actualSellUnitPrice) {
    line.actualSellAmount = ((parseFloat(line.actualSellUnitPrice) || 0) * qty).toString()
  } else {
    line.actualSellAmount = null
  }

  line.updatedAt = new Date()
  await em.flush()

  return NextResponse.json(line)
}

/**
 * DELETE - Soft delete a file line
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
  const line = await em.findOne(FmsFileLine, { id: lineId, deletedAt: null, ...scopeFilters })

  if (!line) {
    return NextResponse.json({ error: 'Line not found' }, { status: 404 })
  }

  if (line.sourceType === 'offer') {
    return NextResponse.json({ error: 'Offer lines must be removed by unlinking the offer' }, { status: 400 })
  }

  line.deletedAt = new Date()
  await em.flush()

  return NextResponse.json({ success: true })
}
