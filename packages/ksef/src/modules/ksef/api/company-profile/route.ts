import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import {
  getCompanyProfile,
  saveCompanyProfile,
  type KsefCompanyProfile,
} from '../../lib/company-profile'

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

  const tenantId = (auth.actorTenantId as string | undefined) || auth.tenantId
  if (!tenantId) {
    return NextResponse.json({ error: 'Missing tenant context' }, { status: 400 })
  }
  const organizationId = ((auth.actorOrgId || auth.orgId) as string | undefined) ?? null
  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager
  const profile = await getCompanyProfile(em, { tenantId, organizationId })

  return NextResponse.json({ profile })
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

  const tenantId = (auth.actorTenantId as string | undefined) || auth.tenantId
  if (!tenantId) {
    return NextResponse.json({ error: 'Missing tenant context' }, { status: 400 })
  }
  const organizationId = ((auth.actorOrgId || auth.orgId) as string | undefined) ?? null
  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager
  await saveCompanyProfile(em, profile, { tenantId, organizationId })

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
