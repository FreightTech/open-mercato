import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'

const CONFIG_MODULE_ID = 'ksef'
const CONFIG_NAME = 'company_profile'

const WHITE_LIST_BASE_URL = 'https://wl-api.mf.gov.pl/api/search/nip'

const verifyNipSchema = z.object({
  nip: z.string().regex(/^\d{10}$/, 'NIP must be exactly 10 digits'),
})

export interface KsefCompanyProfile {
  nip: string
  name: string
  regon: string | null
  krs: string | null
  residenceAddress: string | null
  workingAddress: string | null
  statusVat: string | null
  accountNumbers: string[]
  verifiedAt: string
}

interface WhiteListResponse {
  result: {
    subject: {
      name: string
      nip: string
      regon: string | null
      krs: string | null
      residenceAddress: string | null
      workingAddress: string | null
      statusVat: string | null
      accountNumbers: string[] | null
    } | null
    requestId: string
  }
}

export async function fetchCompanyFromWhiteList(nip: string): Promise<KsefCompanyProfile | null> {
  const today = new Date().toISOString().slice(0, 10)
  const url = `${WHITE_LIST_BASE_URL}/${nip}?date=${today}`

  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`White List API returned ${response.status}: ${errorText}`)
  }

  const data = (await response.json()) as WhiteListResponse
  const subject = data.result?.subject

  if (!subject) {
    return null
  }

  return {
    nip: subject.nip ?? nip,
    name: subject.name,
    regon: subject.regon ?? null,
    krs: subject.krs ?? null,
    residenceAddress: subject.residenceAddress ?? null,
    workingAddress: subject.workingAddress ?? null,
    statusVat: subject.statusVat ?? null,
    accountNumbers: subject.accountNumbers ?? [],
    verifiedAt: new Date().toISOString(),
  }
}

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

    // Store as company profile (seller identity)
    const container = await createRequestContainer()
    type ConfigService = { setValue(moduleId: string, name: string, value: unknown): Promise<unknown> }
    const configService = container.resolve('moduleConfigService') as ConfigService
    await configService.setValue(CONFIG_MODULE_ID, CONFIG_NAME, profile)

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
