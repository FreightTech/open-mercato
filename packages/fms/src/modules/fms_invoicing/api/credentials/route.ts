import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { FmsInvoicingKsefCredential } from '../../data/entities'
import { createCredentialSchema } from '../../data/validators'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_invoicing.settings.view'] },
  POST: { requireAuth: true, requireFeatures: ['fms_invoicing.settings.manage'] },
}

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const em = container.resolve('em') as EntityManager

  const tenantId = auth.actorTenantId || auth.tenantId
  const allowedOrgIds = scope?.filterIds ?? []

  const credentials = await em.find(
    FmsInvoicingKsefCredential,
    {
      tenantId,
      organizationId: { $in: allowedOrgIds },
    },
    { orderBy: { createdAt: 'desc' } }
  )

  return NextResponse.json({
    items: credentials.map((cred) => ({
      id: cred.id,
      nip: cred.nip,
      authType: cred.authType,
      environment: cred.environment,
      isActive: cred.isActive,
      label: cred.label,
      lastUsedAt: cred.lastUsedAt,
      createdAt: cred.createdAt,
      updatedAt: cred.updatedAt,
      // Sensitive fields are never returned
      hasToken: !!cred.ksefToken,
      hasCertificate: !!cred.certificatePem,
    })),
  })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })

  const tenantId = auth.actorTenantId || auth.tenantId
  const organizationId = scope?.selectedId ?? auth.actorOrgId ?? auth.orgId

  if (!tenantId || !organizationId) {
    return NextResponse.json({ error: 'Missing tenant or organization context' }, { status: 400 })
  }

  const parse = createCredentialSchema.safeParse({
    ...body,
    organizationId,
    tenantId,
  })

  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parse.error },
      { status: 400 }
    )
  }

  const em = container.resolve('em') as EntityManager

  try {
    // Check for existing credential with same NIP + environment
    const existing = await em.findOne(FmsInvoicingKsefCredential, {
      organizationId: organizationId as string,
      tenantId: tenantId as string,
      nip: parse.data.nip,
      environment: parse.data.environment,
    })

    if (existing) {
      return NextResponse.json(
        { error: `A credential for NIP ${parse.data.nip} in ${parse.data.environment} environment already exists` },
        { status: 409 }
      )
    }

    const credential = em.create(FmsInvoicingKsefCredential, {
      organizationId: organizationId as string,
      tenantId: tenantId as string,
      nip: parse.data.nip,
      authType: parse.data.authType,
      ksefToken: parse.data.ksefToken ?? null,
      certificatePem: parse.data.certificatePem ?? null,
      privateKeyPem: parse.data.privateKeyPem ?? null,
      environment: parse.data.environment,
      label: parse.data.label ?? null,
    })

    em.persist(credential)
    await em.flush()

    return NextResponse.json({
      id: credential.id,
      nip: credential.nip,
      authType: credential.authType,
      environment: credential.environment,
      isActive: credential.isActive,
      label: credential.label,
    }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create credential'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'FMS Invoicing',
  summary: 'KSeF credentials',
  methods: {
    GET: {
      summary: 'List KSeF credentials',
      description: 'List all KSeF credentials for the current organization. Sensitive fields (tokens, certificates) are masked.',
    },
    POST: {
      summary: 'Create KSeF credential',
      description: 'Store a new KSeF credential (token or certificate) for a given NIP and environment',
    },
  },
}
