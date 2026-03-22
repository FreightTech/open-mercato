import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { InvoicingSettings } from '../../data/entities'
import { updateSettingsSchema } from '../../data/validators'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['invoicing.settings.view'] },
  PATCH: { requireAuth: true, requireFeatures: ['invoicing.settings.manage'] },
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
  const organizationId = scope?.selectedId ?? auth.actorOrgId ?? auth.orgId

  if (!tenantId || !organizationId) {
    return NextResponse.json({ error: 'Missing tenant or organization context' }, { status: 400 })
  }

  const settings = await em.findOne(InvoicingSettings, {
    tenantId,
    organizationId,
  })

  if (!settings) {
    return NextResponse.json({
      ksefEnvironment: 'test',
      ksefAutoSubmit: false,
      ksefSessionMode: 'batch',
      defaultSellerNip: null,
      defaultPaymentMethod: null,
      autoImportFromDocuments: true,
      autoImportFromSales: false,
      offlineMode: 'online',
    })
  }

  return NextResponse.json({
    ksefEnvironment: settings.ksefEnvironment,
    ksefAutoSubmit: settings.ksefAutoSubmit,
    ksefSessionMode: settings.ksefSessionMode,
    defaultSellerNip: settings.defaultSellerNip,
    defaultPaymentMethod: settings.defaultPaymentMethod,
    autoImportFromDocuments: settings.autoImportFromDocuments,
    autoImportFromSales: settings.autoImportFromSales,
    offlineMode: settings.offlineMode,
  })
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parse = updateSettingsSchema.safeParse(body)

  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parse.error },
      { status: 400 }
    )
  }

  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  const em = container.resolve('em') as EntityManager

  const tenantId = auth.actorTenantId || auth.tenantId
  const organizationId = scope?.selectedId ?? auth.actorOrgId ?? auth.orgId

  if (!tenantId || !organizationId) {
    return NextResponse.json({ error: 'Missing tenant or organization context' }, { status: 400 })
  }

  try {
    let settings = await em.findOne(InvoicingSettings, {
      tenantId,
      organizationId,
    })

    if (!settings) {
      settings = em.create(InvoicingSettings, {
        organizationId: organizationId as string,
        tenantId: tenantId as string,
      })
      em.persist(settings)
    }

    const data = parse.data
    if (data.ksefEnvironment !== undefined) settings.ksefEnvironment = data.ksefEnvironment
    if (data.ksefAutoSubmit !== undefined) settings.ksefAutoSubmit = data.ksefAutoSubmit
    if (data.ksefSessionMode !== undefined) settings.ksefSessionMode = data.ksefSessionMode
    if (data.defaultSellerNip !== undefined) settings.defaultSellerNip = data.defaultSellerNip
    if (data.defaultPaymentMethod !== undefined) settings.defaultPaymentMethod = data.defaultPaymentMethod
    if (data.autoImportFromDocuments !== undefined) settings.autoImportFromDocuments = data.autoImportFromDocuments
    if (data.autoImportFromSales !== undefined) settings.autoImportFromSales = data.autoImportFromSales
    if (data.offlineMode !== undefined) settings.offlineMode = data.offlineMode

    settings.updatedAt = new Date()

    await em.flush()

    return NextResponse.json({
      ksefEnvironment: settings.ksefEnvironment,
      ksefAutoSubmit: settings.ksefAutoSubmit,
      ksefSessionMode: settings.ksefSessionMode,
      defaultSellerNip: settings.defaultSellerNip,
      defaultPaymentMethod: settings.defaultPaymentMethod,
      autoImportFromDocuments: settings.autoImportFromDocuments,
      autoImportFromSales: settings.autoImportFromSales,
      offlineMode: settings.offlineMode,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update settings'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Invoicing',
  summary: 'Invoicing settings',
  methods: {
    GET: {
      summary: 'Get invoicing settings',
      description: 'Retrieve the invoicing module settings for the current tenant/organization',
    },
    PATCH: {
      summary: 'Update invoicing settings',
      description: 'Update invoicing module settings including KSeF environment, auto-submit, and import preferences',
    },
  },
}
