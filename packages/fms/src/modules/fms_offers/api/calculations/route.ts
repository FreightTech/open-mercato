import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'

const createSchema = z.object({
  offerId: z.string().uuid(),
  label: z.string().trim().max(255).optional().nullable(),
  originLocationId: z.string().uuid().optional().nullable(),
  destinationLocationId: z.string().uuid().optional().nullable(),
  placeOfLoadingId: z.string().uuid().optional().nullable(),
  placeOfDeliveryId: z.string().uuid().optional().nullable(),
})

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['fms_offers.offers.manage'] },
}

export async function POST(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth || !auth.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const validation = createSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid input', details: validation.error }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const commandBus = container.resolve('commandBus') as CommandBus

  const selectedOrgId = scope?.selectedId ?? auth.orgId
  const tenantId = auth.tenantId

  try {
    const { result } = await commandBus.execute('fms_offers.calculations.create', {
      input: {
        ...validation.data,
        organizationId: selectedOrgId,
        tenantId,
      },
      ctx: {
        container,
        auth,
        organizationScope: scope,
        selectedOrganizationId: selectedOrgId ?? null,
        organizationIds: scope?.filterIds ?? (selectedOrgId ? [selectedOrgId] : null),
        request: req,
      },
      metadata: {
        tenantId: tenantId ?? null,
        organizationId: selectedOrgId ?? null,
        resourceKind: 'fms_offers.calculation',
        resourceId: null,
      },
    })

    const typedResult = result as { calculationId: string }
    return NextResponse.json({ id: typedResult.calculationId })
  } catch (error: any) {
    console.error('[calculations/create] error:', error)
    if (error?.status) {
      return NextResponse.json(error.body || { error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to create calculation', message: error.message }, { status: 500 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'FMS Offers',
  summary: 'Offer calculations',
  methods: {
    POST: {
      summary: 'Create a calculation for an offer',
      requestBody: {
        contentType: 'application/json',
        schema: createSchema,
      },
      responses: [
        { status: 200, description: 'Created calculation', schema: z.object({ id: z.string().uuid() }) },
        { status: 401, description: 'Unauthorized' },
        { status: 400, description: 'Invalid input' },
      ],
    },
  },
}
