/**
 * FMS Files - Matched Documents API
 * GET /api/fms_files/files/:id/matched-documents
 *
 * Returns documents that match this file's legs/units by identifier:
 * booking number, BL number, container numbers, or direct link.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { FmsFile, FmsFileLeg, FmsFileUnit } from '../../../../data/entities'
import { FmsDocument } from '../../../../../fms_documents/data/entities'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_files.files.view'] },
}

export const openApi = {
  GET: {
    summary: 'Get documents matching a file by identifiers',
    tags: ['fms_files'],
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    ],
    responses: { 200: { description: 'Matched documents' }, 401: { description: 'Unauthorized' } },
  },
}

interface RouteContext {
  params: Promise<{ id: string }>
}

const paramsSchema = z.object({ id: z.string().uuid() })

function normalize(value: string | null | undefined): string {
  if (!value) return ''
  return value.trim().toUpperCase().replace(/\s+/g, '')
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')
    const auth = await getAuthFromRequest(request)

    if (!auth || !auth.orgId || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rawParams = await context.params
    const parse = paramsSchema.safeParse({ id: rawParams.id })
    if (!parse.success) {
      return NextResponse.json({ error: 'Invalid file id' }, { status: 400 })
    }

    const fileId = parse.data.id

    const file = await em.findOne(FmsFile, {
      id: fileId,
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
      deletedAt: null,
    })

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    // Collect identifiers from legs
    const legs = await em.find(FmsFileLeg, {
      file: fileId,
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
      deletedAt: null,
    })

    // Collect container numbers from units
    const units = await em.find(FmsFileUnit, {
      file: fileId,
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
      deletedAt: null,
    })

    const blNumbers = new Set<string>()
    const bookingNumbers = new Set<string>()
    const containerNumbers = new Set<string>()

    for (const leg of legs) {
      const bl = normalize(leg.blNumber)
      const booking = normalize(leg.bookingNumber)
      if (bl) blNumbers.add(bl)
      if (booking) bookingNumbers.add(booking)
    }

    for (const unit of units) {
      const cn = normalize(unit.containerNumber)
      if (cn) containerNumbers.add(cn)
    }

    const hasIdentifiers =
      blNumbers.size > 0 || bookingNumbers.size > 0 || containerNumbers.size > 0

    if (!hasIdentifiers) {
      return NextResponse.json({ matches: [] })
    }

    // Build raw SQL query covering all matching conditions
    const connection = em.getConnection()
    const conditions: string[] = []
    const queryParams: unknown[] = [auth.orgId, auth.tenantId]

    // BL number matches
    for (const bl of Array.from(blNumbers)) {
      conditions.push(`UPPER(TRIM(bl_number)) = ?`)
      queryParams.push(bl)
      conditions.push(`UPPER(TRIM(mbl_number)) = ?`)
      queryParams.push(bl)
    }

    // Booking number matches
    for (const booking of Array.from(bookingNumbers)) {
      conditions.push(`UPPER(TRIM(booking_number)) = ?`)
      queryParams.push(booking)
    }

    // Container number overlap via jsonb
    if (containerNumbers.size > 0) {
      const containerArray = Array.from(containerNumbers)
      const placeholders = containerArray.map(() => '?').join(',')
      conditions.push(
        `EXISTS (SELECT 1 FROM jsonb_array_elements_text(container_numbers) AS elem WHERE UPPER(TRIM(elem)) IN (${placeholders}))`
      )
      queryParams.push(...containerArray)
    }

    // Direct link fallback
    conditions.push(`related_entity_id = ?`)
    queryParams.push(fileId)

    const sql = `
      SELECT id FROM fms_documents
      WHERE organization_id = ?
        AND tenant_id = ?
        AND deleted_at IS NULL
        AND (${conditions.join(' OR ')})
    `

    const rows = (await connection.execute(sql, queryParams)) as Array<{ id: string }>
    const docIds = rows.map((r) => r.id)

    if (docIds.length === 0) {
      return NextResponse.json({ matches: [] })
    }

    const documents = await em.find(FmsDocument, {
      id: { $in: docIds },
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
      deletedAt: null,
    })

    const matches = documents.map((doc) => {
      const matchedBy: string[] = []
      const docBl = normalize(doc.blNumber)
      const docMbl = normalize(doc.mblNumber)
      const docBooking = normalize(doc.bookingNumber)

      if (docBl && blNumbers.has(docBl)) matchedBy.push('blNumber')
      if (docMbl && blNumbers.has(docMbl)) matchedBy.push('mblNumber')
      if (docBooking && bookingNumbers.has(docBooking)) matchedBy.push('bookingNumber')
      if (doc.relatedEntityId === fileId) matchedBy.push('directLink')

      const docContainers = (doc.containerNumbers || []).map(normalize).filter(Boolean)
      for (const cn of docContainers) {
        if (containerNumbers.has(cn)) {
          const original = (doc.containerNumbers || []).find((c) => normalize(c) === cn)
          matchedBy.push(`containerNumber:${original || cn}`)
        }
      }

      const lineItems = extractLineItems(doc.documentData)

      return {
        documentId: doc.id,
        documentName: doc.name,
        documentType: doc.documentType ?? null,
        category: doc.category,
        currency: doc.currency ?? null,
        sellerName: doc.sellerName ?? null,
        totalGrossAmount: doc.totalGrossAmount ?? null,
        matchedBy,
        lineItems,
      }
    })

    return NextResponse.json({ matches })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[fms-files:matched-documents] error:', error)
    return NextResponse.json(
      { error: 'Failed to find matching documents', message },
      { status: 500 }
    )
  }
}

interface LineItem {
  description: string | null
  quantity: string | number | null
  unit: string | null
  unitPriceNet: string | number | null
  netAmount: string | number | null
  vatAmount: string | number | null
  grossAmount: string | number | null
  currency: string | null
}

function extractLineItems(documentData: Record<string, unknown> | null | undefined): LineItem[] {
  if (!documentData) return []

  const rawItems = documentData.line_items ?? documentData.lineItems
  if (!Array.isArray(rawItems)) return []

  return rawItems.map((item: Record<string, unknown>) => ({
    description: (item.description ?? item.charge ?? item.service ?? item.charge_name ?? null) as string | null,
    quantity: (item.quantity ?? item.qty ?? null) as string | number | null,
    unit: (item.unit ?? null) as string | null,
    unitPriceNet: (item.unit_price_net ?? item.rate ?? item.unit_price ?? item.price ?? null) as string | number | null,
    netAmount: (item.net_amount ?? item.total ?? item.amount ?? item.total_amount ?? null) as string | number | null,
    vatAmount: (item.vat_amount ?? item.vat ?? null) as string | number | null,
    grossAmount: (item.gross_amount ?? item.net_amount ?? null) as string | number | null,
    currency: (item.currency ?? null) as string | null,
  }))
}
