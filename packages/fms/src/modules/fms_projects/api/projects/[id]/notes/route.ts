/**
 * FMS Projects Module - Project Notes API
 * Manage notes for a project
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import { FmsProjectNote } from '../../../../data/entities'
import { fmsProjectNoteCreateSchema, fmsProjectNoteUpdateSchema } from '../../../../data/validators'

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_projects.view'] },
  POST: { requireAuth: true, requireFeatures: ['fms_projects.edit'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_projects.edit'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_projects.edit'] },
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
 * GET - List notes for a specific project
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

  // Find notes for this specific project
  const notes = await em.find(FmsProjectNote, {
    project: projectId,
    deletedAt: null,
    ...scopeFilters,
  }, { orderBy: { createdAt: 'DESC' } })

  return NextResponse.json({
    items: notes.map(note => ({
      id: note.id,
      projectId: (note.project as any)?.id || projectId,
      body: note.body,
      authorUserId: note.authorUserId,
      authorName: note.authorName,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    })),
    total: notes.length,
  })
}

/**
 * POST - Create a new note
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
  const parseResult = fmsProjectNoteCreateSchema.safeParse(body)
  if (!parseResult.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parseResult.error }, { status: 400 })
  }

  const data = parseResult.data
  const selectedOrgId = scope?.selectedId ?? auth.orgId
  const tenantId = auth.tenantId

  if (!selectedOrgId || !tenantId) {
    return NextResponse.json({ error: 'Organization and tenant context required' }, { status: 400 })
  }

  const now = new Date()
  const note = em.create(FmsProjectNote, {
    organizationId: selectedOrgId,
    tenantId: tenantId,
    project: projectId as any,
    body: data.body,
    authorUserId: auth.userId || null,
    authorName: (typeof auth.name === 'string' ? auth.name : null) || auth.email || null,
    createdAt: now,
    updatedAt: now,
  })

  em.persist(note)
  await em.flush()

  return NextResponse.json({
    id: note.id,
    projectId,
    body: note.body,
    authorUserId: note.authorUserId,
    authorName: note.authorName,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  }, { status: 201 })
}

/**
 * PUT - Update a note
 */
export async function PUT(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const body = await req.json()
  const parseResult = fmsProjectNoteUpdateSchema.safeParse(body)
  if (!parseResult.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parseResult.error }, { status: 400 })
  }

  const data = parseResult.data
  if (!data.id) {
    return NextResponse.json({ error: 'Note ID required' }, { status: 400 })
  }

  const scopeFilters = buildScopeFilters(auth, scope)

  const note = await em.findOne(FmsProjectNote, {
    id: data.id,
    deletedAt: null,
    ...scopeFilters,
  })

  if (!note) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 })
  }

  // Update fields
  if (data.body !== undefined) note.body = data.body
  note.updatedAt = new Date()

  await em.flush()

  return NextResponse.json({
    id: note.id,
    body: note.body,
    authorUserId: note.authorUserId,
    authorName: note.authorName,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  })
}

/**
 * DELETE - Soft delete a note
 */
export async function DELETE(req: Request, ctx: { params?: { id?: string } }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const url = new URL(req.url)
  const noteId = url.searchParams.get('id')
  if (!noteId) {
    return NextResponse.json({ error: 'Note ID required' }, { status: 400 })
  }

  const scopeFilters = buildScopeFilters(auth, scope)

  const note = await em.findOne(FmsProjectNote, {
    id: noteId,
    deletedAt: null,
    ...scopeFilters,
  })

  if (!note) {
    return NextResponse.json({ error: 'Note not found' }, { status: 404 })
  }

  note.deletedAt = new Date()
  await em.flush()

  return NextResponse.json({ success: true })
}
