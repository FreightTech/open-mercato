import { NextRequest, NextResponse } from 'next/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import type { KsefCompanyProfile } from '../verify-nip/route'
import { z } from 'zod'

const CONFIG_MODULE_ID = 'ksef'
const CONFIG_NAME = 'company_profile'

const companyProfileSchema = z.object({
  nip: z.string().min(1),
  name: z.string().min(1),
  regon: z.string().nullable().optional(),
  krs: z.string().nullable().optional(),
  residenceAddress: z.string().nullable().optional(),
  workingAddress: z.string().nullable().optional(),
  statusVat: z.string().nullable().optional(),
  accountNumbers: z.array(z.string()).optional(),
})

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['ksef.view'] },
  PUT: { requireAuth: true, requireFeatures: ['ksef.settings.manage'] },
}

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const container = await createRequestContainer()
  type ConfigService = { getValue<T>(moduleId: string, name: string, options?: { defaultValue?: T | null }): Promise<T | null> }
  const configService = container.resolve('moduleConfigService') as ConfigService

  const profile = await configService.getValue<KsefCompanyProfile>(CONFIG_MODULE_ID, CONFIG_NAME)

  return NextResponse.json({ profile: profile ?? null })
}

export async function PUT(request: NextRequest) {
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

  const parsed = companyProfileSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid company profile', details: parsed.error.flatten() }, { status: 400 })
  }

  const profile: KsefCompanyProfile = {
    nip: parsed.data.nip,
    name: parsed.data.name,
    regon: parsed.data.regon ?? null,
    krs: parsed.data.krs ?? null,
    residenceAddress: parsed.data.residenceAddress ?? null,
    workingAddress: parsed.data.workingAddress ?? null,
    statusVat: parsed.data.statusVat ?? null,
    accountNumbers: parsed.data.accountNumbers ?? [],
    verifiedAt: new Date().toISOString(),
  }

  const container = await createRequestContainer()
  type ConfigService = { setValue(moduleId: string, name: string, value: unknown): Promise<unknown> }
  const configService = container.resolve('moduleConfigService') as ConfigService
  await configService.setValue(CONFIG_MODULE_ID, CONFIG_NAME, profile)

  return NextResponse.json(profile)
}

export const openApi: OpenApiRouteDoc = {
  tag: 'KSeF',
  summary: 'KSeF company profile',
  methods: {
    GET: {
      summary: 'Get stored company profile',
      description: 'Returns the company profile, or null if not yet set up',
    },
    PUT: {
      summary: 'Save company profile manually',
      description: 'Manually set the company profile for KSeF invoice generation',
    },
  },
}
