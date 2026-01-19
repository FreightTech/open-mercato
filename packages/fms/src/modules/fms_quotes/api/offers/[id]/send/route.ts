import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@/lib/di/container'
import { getAuthFromRequest } from '@/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { CommandBus } from '@open-mercato/shared/lib/commands'

export const metadata = {
  POST: {
    requireAuth: true,
    requireFeatures: ['fms_quotes.offers.manage'],
  },
}

const sendSchema = z.object({
  contactId: z.string().uuid(),
  message: z.string().max(2000).optional(),
  subject: z.string().max(200).optional(),
})

type Params = { params: Promise<{ id: string }> }

/**
 * POST: Send offer PDF to a client contact via email
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { id: offerId } = await params
  const auth = await getAuthFromRequest(request)

  if (!auth || !auth.orgId || !auth.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse request body
  const body = await request.json()
  const validation = sendSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: validation.error.flatten() },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const commandBus = container.resolve('commandBus') as CommandBus

  const selectedOrgId = scope?.selectedId ?? auth.orgId
  const tenantId = auth.tenantId

  try {
    const { result } = await commandBus.execute('fms_quotes.offers.send', {
      input: {
        offerId,
        ...validation.data,
      },
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
        resourceKind: 'fms_quotes.offer',
        resourceId: offerId,
      },
    })

    const typedResult = result as { message: string; sentTo: { email: string; name: string }; offerStatus: string }
    return NextResponse.json({
      ok: true,
      message: typedResult.message,
      sentTo: typedResult.sentTo,
      offerStatus: typedResult.offerStatus,
    })
  } catch (error: any) {
    console.error('[offers/send] error:', error)
    if (error?.status) {
      return NextResponse.json(error.body || { error: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { error: 'Failed to send offer', message: error.message },
      { status: 500 }
    )
  }
}
