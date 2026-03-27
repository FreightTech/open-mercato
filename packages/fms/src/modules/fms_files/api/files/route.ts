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
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { FmsFile, FmsFileUnit, FmsFileLeg, FmsFileUnitLeg, FmsFileLine, FmsFileInvoice } from '../../data/entities'
import { FmsDocument } from '../../../fms_documents/data/entities'
import { Contractor } from '../../../contractors/data/entities'
import { User } from '@open-mercato/core/modules/auth/data/entities'
import { SHIPMENT_TYPES, CARGO_TYPES } from '../../data/types'
import { buildScopeFilters } from '../../lib/scope-filters'
import { computeTransportStatus, computeFinancialStatus, computeDocumentationStatus } from '../../lib/derived-status'
import { wrap } from '@mikro-orm/core'

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
  del: {
    softDelete: true,
  },
})

// ─── Reference Number Generation ────────────────────────────────────────────

const MAX_RETRY_ATTEMPTS = 3

async function generateReferenceNumber(
  em: EntityManager,
  organizationId: string,
  shipmentType: string,
  cargoType: string,
  contractorShort: string,
): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `${shipmentType}/${cargoType}/`
  const suffix = `/${year}/${contractorShort}`
  const pattern = `${prefix}%${suffix}`

  const result = await em.getConnection().execute(
    `SELECT reference_number FROM fms_files
     WHERE organization_id = ? AND reference_number LIKE ?
     ORDER BY reference_number DESC LIMIT 1`,
    [organizationId, pattern],
  )

  let nextSeq = 1
  if (result.length > 0) {
    const lastRef = result[0].reference_number as string
    const seqPart = lastRef.slice(prefix.length, lastRef.indexOf('/', prefix.length))
    const parsed = parseInt(seqPart, 10)
    if (!isNaN(parsed)) nextSeq = parsed + 1
  }

  const seqStr = String(nextSeq).padStart(4, '0')
  return `${prefix}${seqStr}${suffix}`
}

async function POST(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  const input = parsed.data
  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const organizationId = scope.selectedId ?? auth.orgId
  if (!organizationId) return NextResponse.json({ error: 'Organization required' }, { status: 400 })

  const contractor = await em.findOne(Contractor, { id: input.contractorId }, { fields: ['id', 'name', 'shortName'] })
  if (!contractor) return NextResponse.json({ error: 'Contractor not found' }, { status: 400 })

  const contractorShort = (contractor.shortName ?? contractor.name.slice(0, 8)).toUpperCase().replace(/[^A-Z0-9]/g, '')

  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      const referenceNumber = await generateReferenceNumber(em, organizationId, input.shipmentType, input.cargoType, contractorShort)

      const file = em.create(FmsFile, {
        organizationId,
        tenantId: auth.tenantId!,
        referenceNumber,
        shipmentType: input.shipmentType,
        cargoType: input.cargoType,
        contractorId: input.contractorId,
        assigneeId: input.assigneeId ?? null,
        notes: input.notes ?? null,
        createdBy: auth.sub ?? null,
      })

      await em.flush()
      return NextResponse.json(file, { status: 201 })
    } catch (err: unknown) {
      const isUniqueViolation = err instanceof Error && err.message.includes('fms_files_number_unique')
      if (!isUniqueViolation || attempt === MAX_RETRY_ATTEMPTS - 1) throw err
      em.clear()
    }
  }

  return NextResponse.json({ error: 'Failed to generate unique reference number' }, { status: 500 })
}

// Wrap the crud GET to enrich each row with contractorName, assigneeName, and status
async function GET(req: Request) {
  const auth = await getAuthFromRequest(req)
  const listResponse = await crud.GET(req)
  const body = await listResponse.json() as { items?: unknown[] } & Record<string, unknown>

  if (!body?.items?.length) return NextResponse.json(body, { status: listResponse.status })

  const rows = body.items as Array<Record<string, unknown>>
  const fileIds = rows.map((r) => r.id).filter((id): id is string => !!id)
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

  // Batch-load related entities for status computation
  const [units, legs, unitLegsRaw, lines, invoices, documents] = await Promise.all([
    em.find(FmsFileUnit, { file: { $in: fileIds }, deletedAt: null }),
    em.find(FmsFileLeg, { file: { $in: fileIds }, deletedAt: null }),
    em.find(FmsFileUnitLeg, { unit: { file: { $in: fileIds } }, deletedAt: null }),
    em.find(FmsFileLine, { file: { $in: fileIds }, deletedAt: null }),
    em.find(FmsFileInvoice, { file: { $in: fileIds }, deletedAt: null }),
    em.find(FmsDocument, { relatedEntityId: { $in: fileIds }, relatedEntityType: 'fms_files:fms_file', deletedAt: null }, { fields: ['id', 'relatedEntityId'] }),
  ])

  // Group by file ID
  const unitsByFile = new Map<string, typeof units>()
  for (const u of units) {
    const fid = (wrap(u).toObject() as Record<string, unknown>).file as string
    if (!unitsByFile.has(fid)) unitsByFile.set(fid, [])
    unitsByFile.get(fid)!.push(u)
  }

  const legsByFile = new Map<string, typeof legs>()
  for (const l of legs) {
    const fid = (wrap(l).toObject() as Record<string, unknown>).file as string
    if (!legsByFile.has(fid)) legsByFile.set(fid, [])
    legsByFile.get(fid)!.push(l)
  }

  const unitLegsMapped = unitLegsRaw.map((ul) => {
    const obj = wrap(ul).toObject() as Record<string, unknown>
    return { unitId: obj.unit as string, legId: obj.leg as string, atd: ul.atd, ata: ul.ata }
  })

  // Build a unit→file lookup to group unitLegs by file
  const unitToFile = new Map<string, string>()
  for (const u of units) {
    const fid = (wrap(u).toObject() as Record<string, unknown>).file as string
    unitToFile.set(u.id, fid)
  }

  const unitLegsByFile = new Map<string, typeof unitLegsMapped>()
  for (const ul of unitLegsMapped) {
    const fid = unitToFile.get(ul.unitId)
    if (!fid) continue
    if (!unitLegsByFile.has(fid)) unitLegsByFile.set(fid, [])
    unitLegsByFile.get(fid)!.push(ul)
  }

  const linesByFile = new Map<string, typeof lines>()
  for (const l of lines) {
    const fid = (wrap(l).toObject() as Record<string, unknown>).file as string
    if (!linesByFile.has(fid)) linesByFile.set(fid, [])
    linesByFile.get(fid)!.push(l)
  }

  const invoicesByFile = new Map<string, typeof invoices>()
  for (const inv of invoices) {
    const fid = (wrap(inv).toObject() as Record<string, unknown>).file as string
    if (!invoicesByFile.has(fid)) invoicesByFile.set(fid, [])
    invoicesByFile.get(fid)!.push(inv)
  }

  const docCountByFile = new Map<string, number>()
  for (const doc of documents) {
    const fid = (doc as Record<string, unknown>).relatedEntityId as string
    docCountByFile.set(fid, (docCountByFile.get(fid) ?? 0) + 1)
  }

  return NextResponse.json({
    ...body,
    items: rows.map((r) => {
      const fid = r.id as string
      const fileUnits = unitsByFile.get(fid) ?? []
      const fileLegs = legsByFile.get(fid) ?? []
      const fileUnitLegs = unitLegsByFile.get(fid) ?? []
      const fileLines = linesByFile.get(fid) ?? []
      const fileInvoices = invoicesByFile.get(fid) ?? []
      const fileDocCount = docCountByFile.get(fid) ?? 0

      return {
        ...r,
        contractorName: contractorNameById[r.contractorId as string] ?? null,
        assigneeName: assigneeNameById[r.assigneeId as string] ?? null,
        status: {
          transport: computeTransportStatus(fileUnits, fileLegs, fileUnitLegs),
          financial: computeFinancialStatus(fileLines, fileInvoices),
          documentation: computeDocumentationStatus(fileDocCount, fileInvoices),
        },
      }
    }),
  }, { status: listResponse.status })
}

export const metadata = routeMetadata
export { GET, POST }
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
