import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { FmsProject, FmsSeaContainer } from '../../../../data/entities'
import { FmsDocument } from '../../../../../fms_documents/data/entities'

const paramsSchema = z.object({
  id: z.string().uuid(),
})

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_projects.projects.view'] },
}

function normalize(value: string | null | undefined): string {
  if (!value) return ''
  return value.trim().toUpperCase().replace(/\s+/g, '')
}

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const container = await createRequestContainer()
    const em = container.resolve<EntityManager>('em')
    const auth = await getAuthFromRequest(request)

    if (!auth || !auth.orgId || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const params = await context.params
    const parse = paramsSchema.safeParse({ id: params.id })
    if (!parse.success) {
      return NextResponse.json({ error: 'Invalid project id' }, { status: 400 })
    }

    const projectId = parse.data.id

    // Verify project exists and user has access
    const project = await em.findOne(FmsProject, {
      id: projectId,
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
      deletedAt: null,
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Collect identifiers from project
    const identifiers = {
      blNumbers: new Set<string>(),
      bookingNumbers: new Set<string>(),
      containerNumbers: new Set<string>(),
    }

    const projBl = normalize(project.blNumber)
    const projBooking = normalize(project.bookingNumber)
    if (projBl) identifiers.blNumbers.add(projBl)
    if (projBooking) identifiers.bookingNumbers.add(projBooking)

    // Also collect from sea containers
    const seaContainers = await em.find(FmsSeaContainer, {
      project: projectId,
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
    })

    for (const sc of seaContainers) {
      const bl = normalize(sc.bolNumber)
      const booking = normalize(sc.bookingNumber)
      const containerNum = normalize(sc.containerNumber)
      if (bl) identifiers.blNumbers.add(bl)
      if (booking) identifiers.bookingNumbers.add(booking)
      if (containerNum) identifiers.containerNumbers.add(containerNum)
    }

    const hasIdentifiers =
      identifiers.blNumbers.size > 0 ||
      identifiers.bookingNumbers.size > 0 ||
      identifiers.containerNumbers.size > 0

    if (!hasIdentifiers) {
      return NextResponse.json({ matches: [] })
    }

    // Build a single raw SQL query that handles all matching conditions including JSONB
    // MikroORM's connection.execute uses ? placeholders
    const connection = em.getConnection()
    const conditions: string[] = []
    const queryParams: unknown[] = [auth.orgId, auth.tenantId]

    // BL number matches (case-insensitive)
    const blArray = Array.from(identifiers.blNumbers)
    for (const bl of blArray) {
      conditions.push(`UPPER(TRIM(bl_number)) = ?`)
      queryParams.push(bl)
      conditions.push(`UPPER(TRIM(mbl_number)) = ?`)
      queryParams.push(bl)
    }

    // Booking number matches (case-insensitive)
    const bookingArray = Array.from(identifiers.bookingNumbers)
    for (const booking of bookingArray) {
      conditions.push(`UPPER(TRIM(booking_number)) = ?`)
      queryParams.push(booking)
    }

    // Container number overlap (case-insensitive via jsonb_array_elements_text)
    const containerArray = Array.from(identifiers.containerNumbers)
    if (containerArray.length > 0) {
      const containerPlaceholders = containerArray.map(() => '?').join(',')
      conditions.push(
        `EXISTS (SELECT 1 FROM jsonb_array_elements_text(container_numbers) AS elem WHERE UPPER(TRIM(elem)) IN (${containerPlaceholders}))`
      )
      queryParams.push(...containerArray)
    }

    // Direct link fallback
    conditions.push(`related_entity_id = ?`)
    queryParams.push(projectId)

    const sql = `
      SELECT id FROM fms_documents
      WHERE organization_id = ?
        AND tenant_id = ?
        AND deleted_at IS NULL
        AND (${conditions.join(' OR ')})
    `

    const rows = await connection.execute(sql, queryParams) as Array<{ id: string }>
    const docIds = rows.map(r => r.id)

    if (docIds.length === 0) {
      return NextResponse.json({ matches: [] })
    }

    // Load full document entities
    const documents = await em.find(FmsDocument, {
      id: { $in: docIds },
      organizationId: auth.orgId,
      tenantId: auth.tenantId,
      deletedAt: null,
    })

    // Build response with matchedBy indicators and line items
    const matches = documents.map((doc) => {
      const matchedBy: string[] = []
      const docBl = normalize(doc.blNumber)
      const docMbl = normalize(doc.mblNumber)
      const docBooking = normalize(doc.bookingNumber)

      if (docBl && identifiers.blNumbers.has(docBl)) matchedBy.push('blNumber')
      if (docMbl && identifiers.blNumbers.has(docMbl)) matchedBy.push('mblNumber')
      if (docBooking && identifiers.bookingNumbers.has(docBooking)) matchedBy.push('bookingNumber')
      if (doc.relatedEntityId === projectId) matchedBy.push('directLink')

      // Check container overlap
      const docContainers = (doc.containerNumbers || []).map(normalize).filter(Boolean)
      for (const cn of docContainers) {
        if (identifiers.containerNumbers.has(cn)) {
          const original = (doc.containerNumbers || []).find(c => normalize(c) === cn)
          matchedBy.push(`containerNumber:${original || cn}`)
        }
      }

      // Extract line items from documentData
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
  } catch (error: any) {
    console.error('[fms-projects:matched-documents] error:', error)
    return NextResponse.json(
      { error: 'Failed to find matching documents', message: error.message },
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

  return rawItems.map((item: any) => ({
    description: item.description ?? item.name ?? null,
    quantity: item.quantity ?? null,
    unit: item.unit ?? item.unit_of_measure ?? null,
    unitPriceNet: item.unit_price_net ?? item.unitPriceNet ?? item.unit_price ?? null,
    netAmount: item.net_amount ?? item.netAmount ?? item.net_value ?? null,
    vatAmount: item.vat_amount ?? item.vatAmount ?? item.tax_amount ?? null,
    grossAmount: item.gross_amount ?? item.grossAmount ?? item.total ?? null,
    currency: item.currency ?? null,
  }))
}
