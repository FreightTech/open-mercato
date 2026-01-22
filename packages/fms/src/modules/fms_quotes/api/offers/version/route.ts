import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { CommandBus } from '@open-mercato/shared/lib/commands'

const createVersionSchema = z.object({
  offerId: z.string().uuid(),
})

export async function POST(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const validation = createVersionSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid input', details: validation.error }, { status: 400 })
  }

  const { offerId } = validation.data

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const commandBus = container.resolve('commandBus') as CommandBus

  const selectedOrgId = scope?.selectedId ?? auth.orgId
  const tenantId = auth.tenantId

  try {
    const { result } = await commandBus.execute('fms_quotes.offers.create_version', {
      input: {
        offerId,
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
        resourceKind: 'fms_quotes.offer',
        resourceId: offerId,
      },
    })

    const typedResult = result as { offerId: string; offerNumber: string; version: number }
    return NextResponse.json({
      id: typedResult.offerId,
      offerNumber: typedResult.offerNumber,
      version: typedResult.version,
    })
  } catch (error: any) {
    console.error('[offers/version] error:', error)
    if (error?.status) {
      return NextResponse.json(error.body || { error: error.message }, { status: error.status })
    }
    return NextResponse.json({ error: 'Failed to create offer version', message: error.message }, { status: 500 })
  }
}

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['fms_quotes.offers.manage'] },
}
