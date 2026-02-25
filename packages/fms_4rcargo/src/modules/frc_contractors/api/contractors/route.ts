import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { Contractor, ContractorContact } from '@open-mercato/fms/modules/contractors/data/entities'
import type { FilterRow } from '@open-mercato/ui/backend/dynamic-table'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['contractors.view'] },
  POST: { requireAuth: true, requireFeatures: ['contractors.create'] },
}

const contractorFilterSchema = z.object({
  q: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  sortField: z.enum(['name', 'shortName', 'taxId', 'isActive', 'createdAt', 'updatedAt']).default('name'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
  filters: z.string().optional(),
})

// Map UI column names to database fields
const FIELD_MAP: Record<string, string> = {
  name: 'name',
  shortName: 'shortName',
  taxId: 'taxId',
  isActive: 'isActive',
  primaryContactName: 'contacts.firstName', // Note: this needs special handling
  primaryContactEmail: 'contacts.email',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
}

// Parse a single filter row into MikroORM condition
function parseFilterRow(row: FilterRow): Record<string, unknown> | null {
  const dbField = FIELD_MAP[row.field]
  if (!dbField) return null

  // Handle special contact fields - these require a subquery approach
  // For now, we'll skip contact filtering as it requires JOIN
  if (dbField.startsWith('contacts.')) {
    return null
  }

  const val = row.values[0]
  const hasValue = val !== undefined && val !== null && val !== ''

  switch (row.operator) {
    case 'equals':
      if (!hasValue) return null
      return { [dbField]: val }
    case 'not_equals':
      if (!hasValue) return null
      return { [dbField]: { $ne: val } }
    case 'contains':
      if (!hasValue) return null
      return { [dbField]: { $ilike: `%${escapeLikePattern(String(val))}%` } }
    case 'not_contains':
      if (!hasValue) return null
      return { [dbField]: { $not: { $ilike: `%${escapeLikePattern(String(val))}%` } } }
    case 'starts_with':
      if (!hasValue) return null
      return { [dbField]: { $ilike: `${escapeLikePattern(String(val))}%` } }
    case 'ends_with':
      if (!hasValue) return null
      return { [dbField]: { $ilike: `%${escapeLikePattern(String(val))}` } }
    case 'is_empty':
      return { $or: [{ [dbField]: null }, { [dbField]: '' }] }
    case 'is_not_empty':
      return { [dbField]: { $ne: null }, [dbField + '_ne']: { $ne: '' } }
    case 'greater_than':
      if (!hasValue) return null
      return { [dbField]: { $gt: val } }
    case 'less_than':
      if (!hasValue) return null
      return { [dbField]: { $lt: val } }
    case 'greater_than_or_equal':
      if (!hasValue) return null
      return { [dbField]: { $gte: val } }
    case 'less_than_or_equal':
      if (!hasValue) return null
      return { [dbField]: { $lte: val } }
    case 'is_true':
      return { [dbField]: true }
    case 'is_false':
      return { [dbField]: false }
    default:
      return null
  }
}

const createContractorSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  shortName: z.string().max(100).optional().nullable(),
  taxId: z.string().max(50).optional().nullable(),
  isActive: z.boolean().default(true),
  // Primary contact fields for inline creation
  primaryContactName: z.string().max(255).optional().nullable(),
  primaryContactEmail: z.string().email().max(255).optional().nullable().or(z.literal('')),
})

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const query = {
    q: url.searchParams.get('q') || undefined,
    isActive: url.searchParams.get('isActive') || undefined,
    limit: url.searchParams.get('limit') || '50',
    offset: url.searchParams.get('offset') || '0',
    sortField: url.searchParams.get('sortField') || 'name',
    sortDir: url.searchParams.get('sortDir') || 'asc',
    filters: url.searchParams.get('filters') || undefined,
  }

  const parse = contractorFilterSchema.safeParse(query)
  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', details: parse.error },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager
  const knex = em.getKnex()

  // Use tenant-only scoping for contractors (shared across orgs within tenant)
  const filters: Record<string, unknown> = {
    deletedAt: null,
    tenantId: auth.tenantId,
  }

  if (parse.data.q && parse.data.q.trim().length > 0) {
    const term = `%${escapeLikePattern(parse.data.q.trim())}%`
    filters.$or = [
      { name: { $ilike: term } },
      { shortName: { $ilike: term } },
      { taxId: { $ilike: term } },
    ]
  }

  if (parse.data.isActive !== undefined) {
    filters.isActive = parse.data.isActive
  }

  // Apply DynamicTable filters
  if (parse.data.filters) {
    try {
      const filterRows: FilterRow[] = JSON.parse(parse.data.filters)
      for (const row of filterRows) {
        const condition = parseFilterRow(row)
        if (condition) {
          Object.assign(filters, condition)
        }
      }
    } catch {
      // Invalid JSON, ignore filters
    }
  }

  const sortFieldMap: Record<string, string> = {
    id: 'id',
    name: 'name',
    shortName: 'shortName',
    taxId: 'taxId',
    isActive: 'isActive',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  }

  const sortField = sortFieldMap[parse.data.sortField] || 'name'
  const sortDir = parse.data.sortDir

  const [items, total] = await em.findAndCount(Contractor, filters, {
    orderBy: { [sortField]: sortDir },
    limit: parse.data.limit,
    offset: parse.data.offset,
    populate: ['contacts'],
  })

  // Get contractor IDs for counting RFQs and Offers
  const contractorIds = items.map((c) => c.id)

  // Count RFQs where account_id matches contractor
  let rfqCounts: Map<string, number> = new Map()
  let offerCounts: Map<string, number> = new Map()

  if (contractorIds.length > 0) {
    // Count RFQs
    const rfqResults = await knex('frc_rfqs')
      .select('account_id')
      .count('* as count')
      .whereIn('account_id', contractorIds)
      .whereNull('deleted_at')
      .groupBy('account_id')

    for (const row of rfqResults) {
      rfqCounts.set(row.account_id as string, Number(row.count))
    }

    // Count Offers where contractor is carrier
    const offerResults = await knex('frc_offers')
      .select('carrier_id')
      .count('* as count')
      .whereIn('carrier_id', contractorIds)
      .whereNull('deleted_at')
      .groupBy('carrier_id')

    for (const row of offerResults) {
      offerCounts.set(row.carrier_id as string, Number(row.count))
    }
  }

  return NextResponse.json({
    items: items.map((item) => {
      // Find primary contact, or fall back to first contact
      const contacts = item.contacts.getItems()
      const primaryContact = contacts.find((c) => c.isPrimary) || contacts[0] || null
      const primaryContactName = primaryContact
        ? [primaryContact.firstName, primaryContact.lastName].filter(Boolean).join(' ') || null
        : null

      return {
        id: item.id,
        name: item.name,
        shortName: item.shortName ?? null,
        taxId: item.taxId ?? null,
        isActive: item.isActive,
        primaryContactName,
        primaryContactEmail: primaryContact?.email ?? null,
        contactsCount: contacts.length,
        rfqsCount: rfqCounts.get(item.id) ?? 0,
        offersCount: offerCounts.get(item.id) ?? 0,
        organizationId: item.organizationId,
        tenantId: item.tenantId,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }
    }),
    total,
    limit: parse.data.limit,
    offset: parse.data.offset,
  })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parse = createContractorSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parse.error },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  const tenantId = auth.actorTenantId || auth.tenantId
  const organizationId = auth.actorOrgId || auth.orgId

  if (!tenantId || !organizationId) {
    return NextResponse.json({ error: 'Missing tenant or organization context' }, { status: 400 })
  }

  const now = new Date()
  const contractor = em.create(Contractor, {
    organizationId: organizationId as string,
    tenantId: tenantId as string,
    name: parse.data.name,
    shortName: parse.data.shortName ?? null,
    taxId: parse.data.taxId ?? null,
    isActive: parse.data.isActive,
    createdAt: now,
    updatedAt: now,
  })

  em.persist(contractor)

  // Create primary contact if name or email provided
  const contactName = parse.data.primaryContactName?.trim()
  const contactEmail = parse.data.primaryContactEmail?.trim()
  if (contactName || contactEmail) {
    // Parse contact name into first/last name
    const nameParts = (contactName || '').split(/\s+/)
    const firstName = nameParts[0] || null
    const lastName = nameParts.slice(1).join(' ') || null

    const contact = em.create(ContractorContact, {
      organizationId: organizationId as string,
      tenantId: tenantId as string,
      contractor,
      firstName,
      lastName,
      email: contactEmail || null,
      isPrimary: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })

    em.persist(contact)
  }

  await em.flush()

  return NextResponse.json(
    {
      id: contractor.id,
      name: contractor.name,
    },
    { status: 201 }
  )
}
