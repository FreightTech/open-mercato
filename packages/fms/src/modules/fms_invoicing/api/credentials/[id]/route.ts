import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { FmsInvoicingKsefCredential } from '../../../data/entities'
import { updateCredentialSchema } from '../../../data/validators'

export const metadata = {
  PATCH: { requireAuth: true, requireFeatures: ['fms_invoicing.settings.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['fms_invoicing.settings.manage'] },
}

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parse = updateCredentialSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parse.error },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  const tenantId = auth.actorTenantId || auth.tenantId

  const credential = await em.findOne(FmsInvoicingKsefCredential, {
    id,
    tenantId,
  })

  if (!credential) {
    return NextResponse.json({ error: 'Credential not found' }, { status: 404 })
  }

  try {
    const data = parse.data
    if (data.ksefToken !== undefined) credential.ksefToken = data.ksefToken
    if (data.certificatePem !== undefined) credential.certificatePem = data.certificatePem
    if (data.privateKeyPem !== undefined) credential.privateKeyPem = data.privateKeyPem
    if (data.environment !== undefined) credential.environment = data.environment
    if (data.isActive !== undefined) credential.isActive = data.isActive
    if (data.label !== undefined) credential.label = data.label

    credential.updatedAt = new Date()

    await em.flush()

    return NextResponse.json({
      id: credential.id,
      nip: credential.nip,
      authType: credential.authType,
      environment: credential.environment,
      isActive: credential.isActive,
      label: credential.label,
      hasToken: !!credential.ksefToken,
      hasCertificate: !!credential.certificatePem,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update credential'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  const tenantId = auth.actorTenantId || auth.tenantId

  const credential = await em.findOne(FmsInvoicingKsefCredential, {
    id,
    tenantId,
  })

  if (!credential) {
    return NextResponse.json({ error: 'Credential not found' }, { status: 404 })
  }

  try {
    em.remove(credential)
    await em.flush()

    return NextResponse.json({ ok: true, id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete credential'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'FMS Invoicing',
  summary: 'KSeF credential detail',
  methods: {
    PATCH: {
      summary: 'Update KSeF credential',
      description: 'Update a KSeF credential token, certificate, environment, or active status',
    },
    DELETE: {
      summary: 'Delete KSeF credential',
      description: 'Permanently delete a KSeF credential',
    },
  },
}
