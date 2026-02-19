import { NextRequest, NextResponse } from 'next/server'
import { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { FrcAirCargo, FrcRfq } from '../../../../frc_rfqs/data/entities'
import { updateAirCargoSchema } from '../../../data/validators'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['air_cargo.view'] },
  PUT: { requireAuth: true, requireFeatures: ['air_cargo.edit'] },
  DELETE: { requireAuth: true, requireFeatures: ['air_cargo.delete'] },
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

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const em = container.resolve('em') as EntityManager

  const scopeFilters = buildScopeFilters(auth, scope)

  const airCargo = await em.findOne(
    FrcAirCargo,
    { id, deletedAt: null, ...scopeFilters },
    { populate: ['rfq'] }
  )

  if (!airCargo) {
    return NextResponse.json({ error: 'Air cargo not found' }, { status: 404 })
  }

  // Fetch RFQ name if linked
  let rfqName: string | null = null
  if (airCargo.rfq?.id) {
    const rfq = await em.findOne(FrcRfq, { id: airCargo.rfq.id }, { fields: ['id', 'name'] })
    rfqName = rfq?.name ?? null
  }

  return NextResponse.json({
    id: airCargo.id,
    name: airCargo.name,
    rfqId: airCargo.rfq?.id ?? null,
    rfqName,
    numberOfPieces: airCargo.numberOfPieces,
    stackableType: airCargo.stackableType,
    lengthCm: airCargo.lengthCm,
    widthCm: airCargo.widthCm,
    heightCm: airCargo.heightCm,
    volumeM3: airCargo.volumeM3,
    actualWeightKg: airCargo.actualWeightKg,
    chargeableWeightKg: airCargo.chargeableWeightKg,
    loadingMetres: airCargo.loadingMetres,
    organizationId: airCargo.organizationId,
    tenantId: airCargo.tenantId,
    createdAt: airCargo.createdAt,
    updatedAt: airCargo.updatedAt,
  })
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params

  const body = await request.json()
  const parse = updateAirCargoSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parse.error },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const commandBus = container.resolve('commandBus') as CommandBus

  const selectedOrgId = scope?.selectedId ?? auth.orgId
  const tenantId = auth.tenantId

  try {
    const { result } = await commandBus.execute('air_cargo.update', {
      input: { id, ...parse.data },
      ctx: {
        container,
        auth,
        organizationScope: scope,
        selectedOrganizationId: selectedOrgId ?? null,
        organizationIds: scope?.filterIds ?? (selectedOrgId ? [selectedOrgId] : null),
        request,
      },
      metadata: {
        tenantId: tenantId ?? null,
        organizationId: selectedOrgId ?? null,
        resourceKind: 'air_cargo',
        resourceId: id,
      },
    })

    return NextResponse.json({ id: (result as { airCargoId: string }).airCargoId })
  } catch (error: any) {
    console.error('[air-cargo/update] error:', error)
    if (error?.status) {
      return NextResponse.json(error.body || { error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : 'Failed to update air cargo'
    const status = message.includes('not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const commandBus = container.resolve('commandBus') as CommandBus

  const selectedOrgId = scope?.selectedId ?? auth.orgId
  const tenantId = auth.tenantId

  try {
    const { result } = await commandBus.execute('air_cargo.delete', {
      input: { id },
      ctx: {
        container,
        auth,
        organizationScope: scope,
        selectedOrganizationId: selectedOrgId ?? null,
        organizationIds: scope?.filterIds ?? (selectedOrgId ? [selectedOrgId] : null),
        request,
      },
      metadata: {
        tenantId: tenantId ?? null,
        organizationId: selectedOrgId ?? null,
        resourceKind: 'air_cargo',
        resourceId: id,
      },
    })

    return NextResponse.json({ id: (result as { airCargoId: string }).airCargoId })
  } catch (error: any) {
    console.error('[air-cargo/delete] error:', error)
    if (error?.status) {
      return NextResponse.json(error.body || { error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : 'Failed to delete air cargo'
    const status = message.includes('not found') ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
