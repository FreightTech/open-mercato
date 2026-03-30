import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { InvoicingKsefCredential } from '../../../../data/entities'
import { getAuthChallengeUrl } from '../../../../lib/ksef/endpoints'
import type { KsefEnvironment } from '../../../../data/types'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['invoicing.settings.manage'] },
}

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager

  const tenantId = auth.actorTenantId || auth.tenantId

  const credential = await em.findOne(InvoicingKsefCredential, {
    id,
    tenantId,
  })

  if (!credential) {
    return NextResponse.json({ error: 'Credential not found' }, { status: 404 })
  }

  if (!credential.isActive) {
    return NextResponse.json(
      { error: 'Credential is inactive. Activate it before testing.' },
      { status: 400 }
    )
  }

  try {
    const validationErrors: string[] = []

    if (credential.authType === 'token' && !credential.ksefToken) {
      validationErrors.push('KSeF token is not configured')
    }

    if (credential.authType === 'certificate') {
      if (!credential.certificatePem) validationErrors.push('Certificate PEM is not configured')
      if (!credential.privateKeyPem) validationErrors.push('Private key PEM is not configured')
    }

    if (validationErrors.length > 0) {
      return NextResponse.json({
        success: false,
        errors: validationErrors,
        message: 'Credential configuration is incomplete',
      })
    }

    const challengeUrl = getAuthChallengeUrl(credential.environment as KsefEnvironment)
    let reachable = false
    let apiStatus: number | null = null

    try {
      const response = await fetch(challengeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      })
      apiStatus = response.status
      reachable = true
    } catch {
      reachable = false
    }

    return NextResponse.json({
      success: true,
      nip: credential.nip,
      authType: credential.authType,
      environment: credential.environment,
      connectivity: {
        reachable,
        apiStatus,
        endpoint: challengeUrl,
      },
      message: reachable
        ? `KSeF ${credential.environment} API is reachable (status: ${apiStatus})`
        : `KSeF ${credential.environment} API is unreachable`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to test credential'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Invoicing',
  summary: 'Test KSeF credential',
  methods: {
    POST: {
      summary: 'Test a KSeF credential',
      description: 'Validate a KSeF credential by testing connectivity with the KSeF API',
    },
  },
}
