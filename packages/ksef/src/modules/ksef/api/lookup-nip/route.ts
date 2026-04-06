import { NextRequest, NextResponse } from 'next/server'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { fetchCompanyFromWhiteList } from '../verify-nip/route'

const lookupNipSchema = z.object({
  nip: z.string().regex(/^\d{10}$/, 'NIP must be exactly 10 digits'),
})

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['ksef.view'] },
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

  const parsed = lookupNipSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid NIP', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const profile = await fetchCompanyFromWhiteList(parsed.data.nip)
    if (!profile) {
      return NextResponse.json({ error: 'Company not found for this NIP' }, { status: 404 })
    }
    return NextResponse.json(profile)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to lookup NIP'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'KSeF',
  summary: 'Lookup NIP',
  methods: {
    POST: {
      summary: 'Lookup company by NIP via White List API',
      description: 'Returns company data from the Ministry of Finance White List API without saving it. Use for buyer NIP verification on invoice forms.',
    },
  },
}
