import { NextRequest, NextResponse } from 'next/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { FmsLocation } from '@open-mercato/fms/modules/fms_locations/data/entities'
import { FrcConsole, FrcConsoleCargo } from '../../data/entities'
import { FrcTruck, FrcTruckPreset } from '../../../frc_trucks/data/entities'
import { FrcProject, FrcProjectAirCargo } from '../../../frc_projects/data/entities'
import { frcConsoleCreateSchema } from '../../data/validators'
import { z } from 'zod'

// Types for raw query results (used in POST to avoid identity map issues)
interface ProjectRow {
  id: string
  organization_id: string
  tenant_id: string
}

interface AirportCodeRow {
  code: string
}

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['frc_console.view'] },
  POST: { requireAuth: true, requireFeatures: ['frc_console.manage'] },
}

// Field mapping for DynamicTable filters (table column name -> ORM field name)
const FIELD_MAP: Record<string, string> = {
  id: 'id',
  name: 'name',
  customName: 'customName',
  date: 'date',
  status: 'status',
  truckId: 'truck',
  truckPresetId: 'truckPreset',
  projectId: 'projectId',
  originAirportId: 'originAirportId',
  destinationAirportId: 'destinationAirportId',
  notes: 'notes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
}

// Parse DynamicTable FilterRow into MikroORM filter format
function parseFilterRow(row: { field: string; operator: string; values: unknown[] }): Record<string, unknown> | null {
  const field = FIELD_MAP[row.field]
  if (!field) return null

  const val = row.values[0]
  const hasValue = val !== undefined && val !== null && val !== ''
  const hasValues = Array.isArray(row.values) && row.values.length > 0

  switch (row.operator) {
    case 'is_any_of':
      if (!hasValues) return null
      return { [field]: { $in: row.values } }
    case 'is_not_any_of':
      if (!hasValues) return null
      return { [field]: { $nin: row.values } }
    case 'contains':
      if (!hasValue) return null
      return { [field]: { $ilike: `%${val}%` } }
    case 'is_empty':
      return { [field]: { $eq: null } }
    case 'is_not_empty':
      return { [field]: { $ne: null } }
    case 'equals':
      if (!hasValue) return null
      return { [field]: { $eq: val } }
    case 'not_equals':
      if (!hasValue) return null
      return { [field]: { $ne: val } }
    case 'is_true':
      return { [field]: { $eq: true } }
    case 'is_false':
      return { [field]: { $eq: false } }
    case 'greater_than':
      if (!hasValue) return null
      return { [field]: { $gt: val } }
    case 'less_than':
      if (!hasValue) return null
      return { [field]: { $lt: val } }
    default:
      return null
  }
}

const filterSchema = z.object({
  q: z.string().optional(),
  truckId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  status: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
  offset: z.coerce.number().int().nonnegative().optional().default(0),
  sortField: z.enum(['name', 'date', 'status', 'createdAt', 'updatedAt']).optional().default('date'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
})

function buildScopeFilters(
  auth: { tenantId?: string | null; orgId?: string | null },
  scope: { tenantId?: string | null; selectedId?: string | null; filterIds?: string[] | null } | null
): { tenantId?: string; organizationId?: { $in: string[] } } {
  const filters: { tenantId?: string; organizationId?: { $in: string[] } } = {}

  if (typeof auth.tenantId === 'string') {
    filters.tenantId = auth.tenantId
  }

  const allowedOrgIds = new Set<string>()
  const filterIds = scope?.filterIds
  if (Array.isArray(filterIds) && filterIds.length > 0) {
    filterIds.forEach((id) => {
      if (typeof id === 'string') allowedOrgIds.add(id)
    })
  } else {
    const fallbackOrgId = scope?.selectedId ?? auth.orgId
    if (typeof fallbackOrgId === 'string') {
      allowedOrgIds.add(fallbackOrgId)
    }
  }

  if (allowedOrgIds.size > 0) {
    filters.organizationId = { $in: [...allowedOrgIds] }
  }

  return filters
}

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const query = {
    q: url.searchParams.get('q') || undefined,
    truckId: url.searchParams.get('truckId') || undefined,
    projectId: url.searchParams.get('projectId') || undefined,
    status: url.searchParams.get('status') || undefined,
    dateFrom: url.searchParams.get('dateFrom') || undefined,
    dateTo: url.searchParams.get('dateTo') || undefined,
    limit: url.searchParams.get('limit') || '50',
    offset: url.searchParams.get('offset') || '0',
    sortField: url.searchParams.get('sortField') || 'date',
    sortDir: url.searchParams.get('sortDir') || 'desc',
  }

  const parse = filterSchema.safeParse(query)
  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', details: parse.error },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)

  const filters: Record<string, unknown> = {
    deletedAt: null,
    ...scopeFilters,
  }

  if (parse.data.q && parse.data.q.trim().length > 0) {
    const term = `%${escapeLikePattern(parse.data.q.trim())}%`
    filters.$or = [{ name: { $ilike: term } }]
  }

  if (parse.data.truckId) {
    filters.truck = parse.data.truckId
  }

  if (parse.data.status) {
    filters.status = parse.data.status
  }

  if (parse.data.projectId) {
    filters.projectId = parse.data.projectId
  }

  if (parse.data.dateFrom) {
    filters.date = { ...((filters.date as object) || {}), $gte: new Date(parse.data.dateFrom) }
  }

  if (parse.data.dateTo) {
    filters.date = { ...((filters.date as object) || {}), $lte: new Date(parse.data.dateTo) }
  }

  // Parse DynamicTable filters from query string
  const filtersParam = url.searchParams.get('filters')
  if (filtersParam) {
    try {
      const dynamicFilters: Array<{ field: string; operator: string; values: unknown[] }> = JSON.parse(filtersParam)
      if (dynamicFilters.length > 0) {
        const parsedFilters = dynamicFilters
          .map(parseFilterRow)
          .filter((f): f is Record<string, unknown> => f !== null)

        if (parsedFilters.length > 0) {
          filters.$and = [...(filters.$and as Record<string, unknown>[] || []), ...parsedFilters]
        }
      }
    } catch {
      // Ignore invalid JSON
    }
  }

  const sortFieldMap: Record<string, string> = {
    name: 'name',
    date: 'date',
    status: 'status',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  }

  const sortField = sortFieldMap[parse.data.sortField] || 'date'
  const sortDir = parse.data.sortDir

  const [items, total] = await em.findAndCount(FrcConsole, filters, {
    populate: ['truck', 'truckPreset'],
    orderBy: { [sortField]: sortDir },
    limit: parse.data.limit,
    offset: parse.data.offset,
  })

  // Fetch project info for consoles that have projectId
  const projectIds = [...new Set(items.map((item) => item.projectId).filter(Boolean))] as string[]
  const projectMap = new Map<string, { id: string; projectNumber: string }>()

  if (projectIds.length > 0) {
    const projects = await em.find(FrcProject, { id: { $in: projectIds } }, { fields: ['id', 'projectNumber'] })
    projects.forEach((project) => projectMap.set(project.id, { id: project.id, projectNumber: project.projectNumber }))
  }

  // Fetch airports from FmsLocation (type: 'airport')
  const airportIds = items
    .flatMap((i) => [i.originAirportId, i.destinationAirportId])
    .filter((id): id is string => Boolean(id))

  const airports = airportIds.length > 0
    ? await em.find(FmsLocation, { id: { $in: [...new Set(airportIds)] }, type: 'airport' })
    : []
  const airportMap = new Map(airports.map((a) => [a.id, a]))

  return NextResponse.json({
    items: items.map((item) => {
      const originAirport = item.originAirportId ? airportMap.get(item.originAirportId) : null
      const destinationAirport = item.destinationAirportId ? airportMap.get(item.destinationAirportId) : null

      return {
        id: item.id,
        name: item.name,
        customName: item.customName ?? null,
        date: item.date,
        status: item.status,
        notes: item.notes,
        projectId: item.projectId ?? null,
        projectNumber: item.projectId ? projectMap.get(item.projectId)?.projectNumber ?? null : null,
        truckId: item.truck?.id ?? null,
        truckName: item.truck?.name ?? null,
        truckPresetId: item.truckPreset?.id ?? null,
        truckPresetName: item.truckPreset?.name ?? null,
        originAirportId: originAirport?.id ?? null,
        originAirportCode: originAirport?.code ?? null,
        destinationAirportId: destinationAirport?.id ?? null,
        destinationAirportCode: destinationAirport?.code ?? null,
        projectAirRoutingId: item.projectAirRoutingId ?? null,
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
  const parse = frcConsoleCreateSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parse.error },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)

  // Determine organizationId/tenantId by inheriting from parent entity
  // Priority: projectId > fallback to user's selected org
  let organizationId: string | null = null
  let tenantId: string | null = null

  if (parse.data.projectId) {
    // Use raw query to avoid MikroORM identity map issues
    // (managed entities would get re-inserted on flush)
    const scopeParams: string[] = [parse.data.projectId]
    let scopeConditions = ''
    
    if (scopeFilters.tenantId) {
      scopeConditions += ` AND tenant_id = ?`
      scopeParams.push(scopeFilters.tenantId)
    }
    if (scopeFilters.organizationId) {
      const orgIds = scopeFilters.organizationId.$in
      const orgPlaceholders = orgIds.map(() => '?').join(', ')
      scopeConditions += ` AND organization_id IN (${orgPlaceholders})`
      scopeParams.push(...orgIds)
    }
    
    const projectRows = await em.getConnection().execute<ProjectRow[]>(
      `SELECT id, organization_id, tenant_id FROM frc_projects 
       WHERE id = ? AND deleted_at IS NULL${scopeConditions}
       LIMIT 1`,
      scopeParams
    )
    if (projectRows.length === 0) {
      return NextResponse.json({ error: 'Project not found or not accessible' }, { status: 400 })
    }
    organizationId = projectRows[0].organization_id
    tenantId = projectRows[0].tenant_id
  } else {
    // Fallback to user's org from JWT (no parent entity)
    // Use direct auth properties - matching the FMS pattern
    // This avoids issues with stale/invalid cookie values
    const fallbackTenantId = auth.actorTenantId || auth.tenantId
    const fallbackOrgId = auth.actorOrgId || auth.orgId
    tenantId = typeof fallbackTenantId === 'string' ? fallbackTenantId : null
    organizationId = typeof fallbackOrgId === 'string' ? fallbackOrgId : null
  }

  if (!tenantId || !organizationId) {
    return NextResponse.json({ error: 'Missing tenant or organization context' }, { status: 400 })
  }

  // Fetch truck
  const truck = await em.findOne(FrcTruck, { id: parse.data.truckId, deletedAt: null })
  if (!truck) {
    return NextResponse.json({ error: 'Truck not found' }, { status: 404 })
  }

  // Use raw queries for airports to avoid MikroORM identity map issues
  // (managed entities would get re-inserted on flush)
  let originAirportCode: string | null = null
  let destinationAirportCode: string | null = null

  if (parse.data.originAirportId) {
    const rows = await em.getConnection().execute<AirportCodeRow[]>(
      `SELECT code FROM fms_locations WHERE id = ? AND product_type = 'airport' LIMIT 1`,
      [parse.data.originAirportId]
    )
    originAirportCode = rows[0]?.code ?? null
  }
  if (parse.data.destinationAirportId) {
    const rows = await em.getConnection().execute<AirportCodeRow[]>(
      `SELECT code FROM fms_locations WHERE id = ? AND product_type = 'airport' LIMIT 1`,
      [parse.data.destinationAirportId]
    )
    destinationAirportCode = rows[0]?.code ?? null
  }

  // Fetch truck preset if provided
  let truckPreset: FrcTruckPreset | null = null
  if (parse.data.truckPresetId) {
    truckPreset = await em.findOne(FrcTruckPreset, { id: parse.data.truckPresetId, deletedAt: null })
  }

  // Build name: {Truck}/{Date}/{Route}
  const dateStr =
    typeof parse.data.date === 'string'
      ? parse.data.date.substring(0, 10)
      : parse.data.date.toISOString().substring(0, 10)
  const routePart = [originAirportCode, destinationAirportCode].filter(Boolean).join('-') || 'N/A'
  const name = `${truck.name}/${dateStr}/${routePart}`

  const now = new Date()
  const console_ = em.create(FrcConsole, {
    organizationId,
    tenantId,
    name,
    date: new Date(parse.data.date),
    truck,
    originAirportId: parse.data.originAirportId ?? null,
    destinationAirportId: parse.data.destinationAirportId ?? null,
    status: parse.data.status || 'planning',
    truckPreset,
    notes: parse.data.notes,
    projectId: parse.data.projectId ?? null,
    currencyCode: 'EUR',
    createdAt: now,
    updatedAt: now,
  })

  await em.persistAndFlush(console_)

  // Auto-assign cargo from project if projectId is provided
  if (parse.data.projectId) {
    const projectCargoAssignments = await em.find(FrcProjectAirCargo, {
      projectId: parse.data.projectId,
      organizationId,
      tenantId,
    })

    if (projectCargoAssignments.length > 0) {
      for (const assignment of projectCargoAssignments) {
        const consoleCargo = em.create(FrcConsoleCargo, {
          organizationId,
          tenantId,
          console: console_,
          airCargoId: assignment.airCargoId,
          quantity: assignment.quantity,
          createdAt: now,
          updatedAt: now,
        })
        em.persist(consoleCargo)
      }
      await em.flush()
    }
  }

  return NextResponse.json(
    {
      id: console_.id,
      name: console_.name,
    },
    { status: 201 }
  )
}
