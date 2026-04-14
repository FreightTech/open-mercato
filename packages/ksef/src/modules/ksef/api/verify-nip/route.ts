import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { fetchCompanyFromWhiteList, saveCompanyProfile } from '../../lib/company-profile'

export type { KsefCompanyProfile } from '../../lib/company-profile'
export { fetchCompanyFromWhiteList } from '../../lib/company-profile'

const verifyNipSchema = z.object({
  nip: z.string().regex(/^\d{10}$/, 'NIP must be exactly 10 digits'),
})

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['ksef.settings.manage'] },
}

export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = verifyNipSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid NIP', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const profile = await fetchCompanyFromWhiteList(parsed.data.nip)

    if (!profile) {
      return NextResponse.json({ error: 'Company not found for this NIP' }, { status: 404 })
    }

    const tenantId = (auth.actorTenantId as string | undefined) || auth.tenantId
    if (!tenantId) {
      return NextResponse.json({ error: 'Missing tenant context' }, { status: 400 })
    }
    const organizationId = ((auth.actorOrgId || auth.orgId) as string | undefined) ?? null
    const container = await createRequestContainer()
    const em = container.resolve('em') as EntityManager
    await saveCompanyProfile(em, profile, { tenantId, organizationId })

    return NextResponse.json(profile)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to verify NIP'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'KSeF',
  summary: 'Verify NIP via White List',
  methods: {
    POST: {
      summary: 'Verify NIP against Polish White List API',
      description: 'Fetches company data from the Ministry of Finance White List API (Biała Lista) and stores the company profile',
    },
  },
}
