import { NextResponse } from 'next/server'
import { z } from 'zod'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { FmsLocation } from '@open-mercato/fms/modules/fms_locations/data/entities'
import { FrcProject, FrcProjectAirRouting } from '../../../../data/entities'
import { FrcConsole } from '../../../../../frc_console/data/entities'
import { createProjectAirRoutingSchema } from '../../../../data/validators'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['frc_projects.view'] },
  POST: { requireAuth: true, requireFeatures: ['frc_projects.manage'] },
}

const paramsSchema = z.object({
  id: z.string().uuid(),
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

function generateRoutingName(
  originCode: string | null,
  destinationCode: string | null,
  departureDate: Date | string | null
): string {
  const origin = originCode || '???'
  const destination = destinationCode || '???'
  const dateStr = departureDate ? new Date(departureDate).toISOString().split('T')[0] : 'TBD'
  return `${origin}/${destination}/${dateStr}`
}

export async function GET(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid project id' }, { status: 400 })

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)

  // Verify project exists
  const project = await em.findOne(FrcProject, {
    id: parse.data.id,
    deletedAt: null,
    ...scopeFilters,
  })

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Fetch routing legs for this project
  const routingLegs = await em.find(
    FrcProjectAirRouting,
    {
      projectId: project.id,
      deletedAt: null,
    },
    { orderBy: { createdAt: 'asc' } }
  )

  // Collect airport IDs for batch fetching
  const airportIds = new Set<string>()
  routingLegs.forEach((leg) => {
    if (leg.originAirportId) airportIds.add(leg.originAirportId)
    if (leg.destinationAirportId) airportIds.add(leg.destinationAirportId)
  })

  // Fetch airports
  const airports =
    airportIds.size > 0
      ? await em.find(FmsLocation, { id: { $in: [...airportIds] }, type: 'airport' })
      : []
  const airportMap = new Map(airports.map((a) => [a.id, a]))

  // Count connected consoles per routing leg
  const consoleCountMap = new Map<string, number>()
  if (routingLegs.length > 0) {
    const routingIds = routingLegs.map((leg) => leg.id)
    const consoleCounts = await em
      .createQueryBuilder(FrcConsole, 'c')
      .select(['c.project_air_routing_id', 'count(*) as count'])
      .where({
        projectAirRoutingId: { $in: routingIds },
        deletedAt: null,
      })
      .groupBy('c.project_air_routing_id')
      .execute<Array<{ project_air_routing_id: string; count: string }>>()

    consoleCounts.forEach((row) => {
      consoleCountMap.set(row.project_air_routing_id, parseInt(row.count, 10))
    })
  }

  // Build response
  const items = routingLegs.map((leg) => {
    const originAirport = leg.originAirportId ? airportMap.get(leg.originAirportId) : null
    const destinationAirport = leg.destinationAirportId ? airportMap.get(leg.destinationAirportId) : null

    return {
      id: leg.id,
      name: leg.name,
      type: leg.type,
      flightNumber: leg.flightNumber ?? null,
      originAirport: originAirport ? { id: originAirport.id, code: originAirport.code } : null,
      destinationAirport: destinationAirport ? { id: destinationAirport.id, code: destinationAirport.code } : null,
      departureDate: leg.departureDate?.toISOString().split('T')[0] ?? null,
      departureTime: leg.departureTime ?? null,
      arrivalDate: leg.arrivalDate?.toISOString().split('T')[0] ?? null,
      arrivalTime: leg.arrivalTime ?? null,
      connectedConsolesCount: consoleCountMap.get(leg.id) ?? 0,
    }
  })

  return NextResponse.json({ items })
}

export async function POST(req: Request, ctx: { params?: Promise<{ id?: string }> }) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await ctx.params
  const parse = paramsSchema.safeParse({ id: params?.id })
  if (!parse.success) return NextResponse.json({ error: 'Invalid project id' }, { status: 400 })

  const body = await req.json()
  const validation = createProjectAirRoutingSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid input', details: validation.error }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)

  // Verify project exists
  const project = await em.findOne(FrcProject, {
    id: parse.data.id,
    deletedAt: null,
    ...scopeFilters,
  })

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Fetch airport codes for name generation
  const airportIds = [validation.data.originAirportId, validation.data.destinationAirportId].filter(
    (id): id is string => Boolean(id)
  )

  let originCode: string | null = null
  let destinationCode: string | null = null

  if (airportIds.length > 0) {
    const airports = await em.find(FmsLocation, { id: { $in: airportIds }, type: 'airport' })
    const airportMap = new Map(airports.map((a) => [a.id, a]))
    originCode = validation.data.originAirportId
      ? airportMap.get(validation.data.originAirportId)?.code ?? null
      : null
    destinationCode = validation.data.destinationAirportId
      ? airportMap.get(validation.data.destinationAirportId)?.code ?? null
      : null
  }

  // Generate routing name
  const routingName = generateRoutingName(originCode, destinationCode, validation.data.departureDate ?? null)

  // Create the routing leg
  const now = new Date()
  const routing = new FrcProjectAirRouting()
  routing.organizationId = project.organizationId
  routing.tenantId = project.tenantId
  routing.projectId = project.id
  routing.sourceAirRoutingId = null
  routing.name = routingName
  routing.type = validation.data.type
  routing.flightNumber = validation.data.flightNumber ?? null
  routing.originAirportId = validation.data.originAirportId ?? null
  routing.destinationAirportId = validation.data.destinationAirportId ?? null
  routing.departureDate = validation.data.departureDate ?? null
  routing.departureTime = validation.data.departureTime ?? null
  routing.arrivalDate = validation.data.arrivalDate ?? null
  routing.arrivalTime = validation.data.arrivalTime ?? null
  routing.carrierId = validation.data.carrierId ?? null
  routing.carrierType = validation.data.carrierType ?? null
  routing.connectionRateTotal = validation.data.connectionRateTotal ?? null
  routing.currencyCode = validation.data.currencyCode
  routing.createdAt = now
  routing.updatedAt = now

  em.persist(routing)
  await em.flush()

  return NextResponse.json(
    {
      id: routing.id,
      name: routing.name,
      type: routing.type,
      flightNumber: routing.flightNumber,
      originAirport: originCode ? { id: validation.data.originAirportId, code: originCode } : null,
      destinationAirport: destinationCode
        ? { id: validation.data.destinationAirportId, code: destinationCode }
        : null,
      departureDate: routing.departureDate?.toISOString().split('T')[0] ?? null,
      departureTime: routing.departureTime,
      arrivalDate: routing.arrivalDate?.toISOString().split('T')[0] ?? null,
      arrivalTime: routing.arrivalTime,
      connectedConsolesCount: 0,
    },
    { status: 201 }
  )
}
