/**
 * FMS Files - List & Create API
 * GET  /api/fms_files/files     — list files with pagination, search, filters
 * POST /api/fms_files/files     — create a new file
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { FmsFile } from '../../data/entities'
import { Contractor } from '../../../contractors/data/entities'
import { User } from '@open-mercato/core/modules/auth/data/entities'
import { SHIPMENT_TYPES, CARGO_TYPES } from '../../data/types'

const listSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(500).optional(),
  pageSize: z.coerce.number().min(1).max(500).optional(),
  q: z.string().optional(),
  search: z.string().optional(),
  sortField: z.string().optional().default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
  shipmentType: z.enum(SHIPMENT_TYPES).optional(),
  cargoType: z.enum(CARGO_TYPES).optional(),
  contractorId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
})

const createSchema = z.object({
  shipmentType: z.enum(SHIPMENT_TYPES),
  cargoType: z.enum(CARGO_TYPES),
  contractorId: z.string().uuid(),
  assigneeId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
})

const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_files.files.view'] },
  POST: { requireAuth: true, requireFeatures: ['fms_files.files.manage'] },
}

const SORT_FIELD_MAP: Record<string, string> = {
  createdAt: 'created_at',
  referenceNumber: 'reference_number',
  shipmentType: 'shipment_type',
  cargoType: 'cargo_type',
  contractorId: 'contractor_id',
}

const crud = makeCrudRoute({
  metadata: routeMetadata,
  orm: {
    entity: FmsFile,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: 'deletedAt',
  },
  list: {
    schema: listSchema,
    sortFieldMap: SORT_FIELD_MAP,
    buildFilters: (query) => {
      const filters: Record<string, unknown> = {}
      if (query.shipmentType) filters.shipmentType = query.shipmentType
      if (query.cargoType) filters.cargoType = query.cargoType
      if (query.contractorId) filters.contractorId = query.contractorId
      if (query.assigneeId) filters.assigneeId = query.assigneeId
      return filters
    },
  },
  create: {
    schema: createSchema,
    mapToEntity: (input) => ({
      shipmentType: input.shipmentType,
      cargoType: input.cargoType,
      contractorId: input.contractorId,
      assigneeId: input.assigneeId ?? null,
      notes: input.notes ?? null,
      // Reference number placeholder — will be replaced by proper generation later
      referenceNumber: `${input.shipmentType}/${input.cargoType}/${String(Date.now()).slice(-4)}/${new Date().getFullYear()}/TBD`,
    }),
  },
  del: {
    softDelete: true,
  },
})

// Wrap the crud GET to enrich each row with contractorName and assigneeName
async function GET(req: Request) {
  const auth = await getAuthFromRequest(req)
  const listResponse = await crud.GET(req)
  const body = await listResponse.json() as { items?: unknown[] } & Record<string, unknown>

  if (!body?.items?.length) return NextResponse.json(body, { status: listResponse.status })

  const rows = body.items as Array<Record<string, unknown>>
  const contractorIds = [...new Set(rows.map((r) => r.contractorId).filter((id): id is string => !!id))]

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  const contractorNameById: Record<string, string> = {}
  if (contractorIds.length > 0) {
    const contractors = await em.find(Contractor, { id: { $in: contractorIds } }, { fields: ['id', 'name'] })
    for (const c of contractors) contractorNameById[c.id] = c.name
  }

  const assigneeIds = [...new Set(rows.map((r) => r.assigneeId).filter((id): id is string => !!id))]
  const assigneeNameById: Record<string, string> = {}
  if (assigneeIds.length > 0) {
    const encCtx = { tenantId: auth?.tenantId ?? null, organizationId: auth?.orgId ?? null }
    const assignees = await findWithDecryption(em, User, { id: { $in: assigneeIds } } as any, undefined, encCtx)
    for (const u of assignees) assigneeNameById[String(u.id)] = (u.name || String(u.email)) ?? ''
  }

  return NextResponse.json({
    ...body,
    items: rows.map((r) => ({
      ...r,
      contractorName: contractorNameById[r.contractorId as string] ?? null,
      assigneeName: assigneeNameById[r.assigneeId as string] ?? null,
    })),
  }, { status: listResponse.status })
}

export const metadata = routeMetadata
export { GET }
export const POST = crud.POST
export const DELETE = crud.DELETE

export const openApi = {
  get: {
    operationId: 'listFmsFiles',
    summary: 'List FMS files',
    tags: ['FMS Files'],
    responses: { 200: { description: 'Paginated list of files' } },
  },
  post: {
    operationId: 'createFmsFile',
    summary: 'Create a new FMS file',
    tags: ['FMS Files'],
    responses: { 201: { description: 'Created file' } },
  },
}
