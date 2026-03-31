import { NextRequest, NextResponse } from 'next/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { FmsInvoicingSettings } from '../../data/entities'
import { updateSettingsSchema } from '../../data/validators'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_invoicing.settings.view'] },
  PATCH: { requireAuth: true, requireFeatures: ['fms_invoicing.settings.manage'] },
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

  const settings = await em.findOne(FmsInvoicingSettings, {
    tenantId,
    organizationId,
  })

  if (!settings) {
    return NextResponse.json({
      defaultSellerName: null,
      defaultSellerNip: null,
      defaultSellerAddress: null,
      defaultSellerCountryCode: null,
      defaultSellerBankAccount: null,
      defaultPaymentMethod: null,
      autoImportFromDocuments: true,
      autoImportFromSales: false,
    })
  }

  return NextResponse.json({
    defaultSellerName: settings.defaultSellerName,
    defaultSellerNip: settings.defaultSellerNip,
    defaultSellerAddress: settings.defaultSellerAddress,
    defaultSellerCountryCode: settings.defaultSellerCountryCode,
    defaultSellerBankAccount: settings.defaultSellerBankAccount,
    defaultPaymentMethod: settings.defaultPaymentMethod,
    autoImportFromDocuments: settings.autoImportFromDocuments,
    autoImportFromSales: settings.autoImportFromSales,
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
    let settings = await em.findOne(FmsInvoicingSettings, {
      tenantId,
      organizationId,
    })

    if (!settings) {
      settings = em.create(FmsInvoicingSettings, {
        organizationId: organizationId as string,
        tenantId: tenantId as string,
      })
      em.persist(settings)
    }

    const data = parse.data
    if (data.defaultSellerName !== undefined) settings.defaultSellerName = data.defaultSellerName
    if (data.defaultSellerNip !== undefined) settings.defaultSellerNip = data.defaultSellerNip
    if (data.defaultSellerAddress !== undefined) settings.defaultSellerAddress = data.defaultSellerAddress
    if (data.defaultSellerCountryCode !== undefined) settings.defaultSellerCountryCode = data.defaultSellerCountryCode
    if (data.defaultSellerBankAccount !== undefined) settings.defaultSellerBankAccount = data.defaultSellerBankAccount
    if (data.defaultPaymentMethod !== undefined) settings.defaultPaymentMethod = data.defaultPaymentMethod
    if (data.autoImportFromDocuments !== undefined) settings.autoImportFromDocuments = data.autoImportFromDocuments
    if (data.autoImportFromSales !== undefined) settings.autoImportFromSales = data.autoImportFromSales

    settings.updatedAt = new Date()

    await em.flush()

    return NextResponse.json({
      defaultSellerName: settings.defaultSellerName,
      defaultSellerNip: settings.defaultSellerNip,
      defaultSellerAddress: settings.defaultSellerAddress,
      defaultSellerCountryCode: settings.defaultSellerCountryCode,
      defaultSellerBankAccount: settings.defaultSellerBankAccount,
      defaultPaymentMethod: settings.defaultPaymentMethod,
      autoImportFromDocuments: settings.autoImportFromDocuments,
      autoImportFromSales: settings.autoImportFromSales,
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
