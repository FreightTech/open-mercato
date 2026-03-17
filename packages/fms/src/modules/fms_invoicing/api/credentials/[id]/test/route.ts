import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { FmsInvoicingKsefCredential } from '../../../../data/entities'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['fms_invoicing.settings.manage'] },
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

  const credential = await em.findOne(FmsInvoicingKsefCredential, {
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
    // TODO: Sprint 4 - Wire up actual KSeF API connectivity test
    // const ksefService = container.resolve('fmsInvoicingService') as InvoicingService
    // const testResult = await ksefService.testCredential(credential)
    // return NextResponse.json(testResult)

    // For now, validate that required fields are present based on auth type
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

    return NextResponse.json({
      success: true,
      message: 'Credential configuration is valid. Full connectivity test will be available in Sprint 4.',
      nip: credential.nip,
      authType: credential.authType,
      environment: credential.environment,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to test credential'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'FMS Invoicing',
  summary: 'Test KSeF credential',
  methods: {
    POST: {
      summary: 'Test a KSeF credential',
      description: 'Validate a KSeF credential by testing connectivity with the KSeF API',
    },
  },
}
