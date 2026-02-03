import { NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { z } from 'zod'

// Import to register the command
import '../../../../commands/conversion'

const requestBodySchema = z.object({
  lineIds: z.array(z.string().uuid()).min(1, 'At least one line must be selected'),
  // Map of lineId -> units count (for container creation)
  lineUnits: z.record(z.string().uuid(), z.number().int().min(0)).optional(),
}).optional()

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: offerId } = await params
  if (!offerId) {
    return NextResponse.json({ error: 'Offer ID is required' }, { status: 400 })
  }

  // Parse request body
  let body: z.infer<typeof requestBodySchema> | undefined = undefined
  try {
    const rawBody = await req.json().catch(() => ({}))
    body = requestBodySchema.parse(rawBody)
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request body - lineIds array is required' }, { status: 400 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const commandBus = container.resolve('commandBus') as CommandBus

  const selectedOrgId = scope?.selectedId ?? auth.orgId
  const tenantId = auth.tenantId

  if (!selectedOrgId || !tenantId) {
    return NextResponse.json({ error: 'Organization and tenant context required' }, { status: 400 })
  }

  try {
    const { result } = await commandBus.execute('fms_quotes.offers.convert_to_project', {
      input: {
        offerId,
        lineIds: body?.lineIds ?? [],
        lineUnits: body?.lineUnits ?? {},
      },
      ctx: {
        container,
        auth,
        organizationScope: scope,
        selectedOrganizationId: selectedOrgId,
        organizationIds: scope?.filterIds ?? (selectedOrgId ? [selectedOrgId] : null),
        request: req,
      },
      metadata: {
        tenantId,
        organizationId: selectedOrgId,
        resourceKind: 'fms_quotes.offer',
      },
    })

    return NextResponse.json({
      ok: true,
      projectId: (result as any).projectId,
      projectNumber: (result as any).projectNumber,
      offerId: (result as any).offerId,
      quoteId: (result as any).quoteId,
      containerIds: (result as any).containerIds,
    })
  } catch (error: any) {
    console.error('[offers/convert-to-project] error:', error)
    if (error?.status) {
      return NextResponse.json(error.body || { error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to convert offer to project', message: error.message }, { status: 500 })
  }
}

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['fms_quotes.offers.manage', 'fms_projects.projects.manage'] },
}
