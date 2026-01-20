/**
 * FMS Projects Module - Link Offer API
 * Links an existing offer to a project and imports offer lines as project lines
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@/lib/di/container'
import { getAuthFromRequest } from '@/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsProject, FmsProjectLine } from '../../../../data/entities'
import { FmsOffer, FmsOfferLine } from '../../../../../fms_quotes/data/entities'

const paramsSchema = z.object({
  id: z.string().uuid(),
})

const bodySchema = z.object({
  offerId: z.string().uuid(),
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

export async function POST(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const paramsResult = paramsSchema.safeParse({ id: ctx.params?.id })
  if (!paramsResult.success) {
    return NextResponse.json({ error: 'Invalid project id' }, { status: 400 })
  }

  const body = await req.json()
  const bodyResult = bodySchema.safeParse(body)
  if (!bodyResult.success) {
    return NextResponse.json({ error: 'Invalid request body', details: bodyResult.error }, { status: 400 })
  }

  const projectId = paramsResult.data.id
  const offerId = bodyResult.data.offerId

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)

  // Find the project
  const project = await em.findOne(FmsProject, {
    id: projectId,
    deletedAt: null,
    ...scopeFilters,
  })

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Check if project already has an offer linked
  if (project.offer) {
    return NextResponse.json({ error: 'Project already has a linked offer' }, { status: 400 })
  }

  // Find the offer
  const offer = await em.findOne(FmsOffer, {
    id: offerId,
    deletedAt: null,
    ...scopeFilters,
  }, {
    populate: ['quote', 'quote.client'],
  })

  if (!offer) {
    return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
  }

  // Validate offer status
  if (offer.status !== 'sent' && offer.status !== 'accepted') {
    return NextResponse.json({
      error: `Cannot link offer with status '${offer.status}'. Offer must be 'sent' or 'accepted'.`,
    }, { status: 400 })
  }

  // Check if offer is already linked to another project
  const existingProject = await em.findOne(FmsProject, {
    offer: offerId,
    deletedAt: null,
  })

  if (existingProject) {
    return NextResponse.json({
      error: 'This offer is already linked to another project',
      projectId: existingProject.id,
      projectNumber: existingProject.projectNumber,
    }, { status: 400 })
  }

  const now = new Date()

  // Link the offer to the project
  project.offer = offer
  if (offer.quote) {
    project.quote = offer.quote
    if (offer.quote.client) {
      project.client = offer.quote.client
    }
  }
  project.updatedAt = now

  // Get existing lines count for line numbering
  const existingLinesCount = await em.count(FmsProjectLine, {
    project: projectId,
    deletedAt: null,
  })

  // Copy offer lines to project lines
  const offerLines = await em.find(FmsOfferLine, {
    offer: offerId,
    deletedAt: null,
  }, { orderBy: { lineNumber: 'ASC' } })

  for (let i = 0; i < offerLines.length; i++) {
    const line = offerLines[i]
    const projectLine = em.create(FmsProjectLine, {
      organizationId: project.organizationId,
      tenantId: project.tenantId,
      project,
      lineNumber: existingLinesCount + i + 1,
      sourceOfferLineId: line.id,
      sourceType: 'offer',
      productName: line.productName || line.chargeName || 'Unknown',
      chargeCode: line.chargeCode,
      containerSize: line.containerSize,
      quantity: line.quantity,
      currencyCode: line.currencyCode,
      soldUnitPrice: line.unitPrice,
      soldAmount: line.amount,
      createdAt: now,
      updatedAt: now,
    })
    em.persist(projectLine)
  }

  await em.flush()

  return NextResponse.json({
    success: true,
    projectId: project.id,
    offerId: offer.id,
    linesImported: offerLines.length,
  })
}

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['fms_projects.projects.manage'] },
}
