import { NextRequest, NextResponse } from 'next/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { escapeLikePattern } from '@open-mercato/shared/lib/db/escapeLikePattern'
import { FrcTruckPreset } from '../../data/entities'
import {
  createTruckPresetSchema,
  truckPresetFilterSchema,
  calculateVolumeM3,
} from '../../data/validators'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['frc_trucks.view'] },
  POST: { requireAuth: true, requireFeatures: ['frc_trucks.manage'] },
}

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
    isActive: url.searchParams.get('isActive') || undefined,
    limit: url.searchParams.get('limit') || '50',
    offset: url.searchParams.get('offset') || '0',
    sortField: url.searchParams.get('sortField') || 'name',
    sortDir: url.searchParams.get('sortDir') || 'asc',
  }

  const parse = truckPresetFilterSchema.safeParse(query)
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

  if (parse.data.isActive !== undefined) {
    filters.isActive = parse.data.isActive
  }

  const sortFieldMap: Record<string, string> = {
    id: 'id',
    name: 'name',
    width: 'width',
    length: 'length',
    height: 'height',
    maxWeight: 'maxWeight',
    volume: 'volume',
    isActive: 'isActive',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  }

  const sortField = sortFieldMap[parse.data.sortField] || 'name'
  const sortDir = parse.data.sortDir

  const [items, total] = await em.findAndCount(FrcTruckPreset, filters, {
    orderBy: { [sortField]: sortDir },
    limit: parse.data.limit,
    offset: parse.data.offset,
  })

  return NextResponse.json({
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      width: item.width,
      length: item.length,
      height: item.height,
      maxWeight: item.maxWeight,
      volume: item.volume,
      isActive: item.isActive,
      organizationId: item.organizationId,
      tenantId: item.tenantId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
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
  const parse = createTruckPresetSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parse.error },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const em = container.resolve('em') as EntityManager

  const tenantId = auth.actorTenantId || auth.tenantId
  const organizationId = scope?.selectedId || auth.actorOrgId || auth.orgId

  if (!tenantId || !organizationId) {
    return NextResponse.json({ error: 'Missing tenant or organization context' }, { status: 400 })
  }

  // Auto-calculate volume from dimensions
  const volume = calculateVolumeM3(parse.data.width, parse.data.length, parse.data.height)

  const now = new Date()
  const preset = em.create(FrcTruckPreset, {
    organizationId: organizationId as string,
    tenantId: tenantId as string,
    name: parse.data.name,
    width: parse.data.width,
    length: parse.data.length,
    height: parse.data.height,
    maxWeight: parse.data.maxWeight,
    volume,
    isActive: parse.data.isActive,
    createdAt: now,
    updatedAt: now,
  })

  await em.persistAndFlush(preset)

  return NextResponse.json(
    {
      id: preset.id,
      name: preset.name,
      width: preset.width,
      length: preset.length,
      height: preset.height,
      maxWeight: preset.maxWeight,
      volume: preset.volume,
      isActive: preset.isActive,
    },
    { status: 201 }
  )
}
