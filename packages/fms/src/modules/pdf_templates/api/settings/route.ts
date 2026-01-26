import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { EntityManager } from '@mikro-orm/postgresql'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { pdfSettingsUpsertSchema, type PdfSettingsUpsertInput } from '../../data/validators'
import { loadPdfSettings } from '../../commands/pdf-settings'
import { withScopedPayload } from '../utils'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['pdf_templates.settings.view'] },
  PUT: { requireAuth: true, requireFeatures: ['pdf_templates.settings.manage'] },
}

type SettingsRouteContext = {
  ctx: CommandRuntimeContext
  em: EntityManager
  translate: (key: string, fallback?: string) => string
  organizationId: string
  tenantId: string
}

async function resolveSettingsContext(req: Request): Promise<SettingsRouteContext> {
  const container = await createRequestContainer()
  const auth = await getAuthFromRequest(req)
  const { translate } = await resolveTranslations()

  if (!auth || !auth.tenantId) {
    throw new CrudHttpError(401, { error: translate('pdf_templates.errors.unauthorized', 'Unauthorized') })
  }

  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const organizationId = scope?.selectedId ?? auth.orgId ?? null

  if (!organizationId) {
    throw new CrudHttpError(400, {
      error: translate('pdf_templates.errors.organization_required', 'Organization context is required'),
    })
  }

  const ctx: CommandRuntimeContext = {
    container,
    auth,
    organizationScope: scope,
    selectedOrganizationId: organizationId,
    organizationIds: scope?.filterIds ?? (auth.orgId ? [auth.orgId] : null),
    request: req,
  }

  const em = container.resolve('em') as EntityManager

  return { ctx, em, translate, tenantId: auth.tenantId, organizationId }
}

export async function GET(req: Request) {
  try {
    const { em, organizationId, tenantId } = await resolveSettingsContext(req)
    const record = await loadPdfSettings(em, { tenantId, organizationId })

    return NextResponse.json({
      companyName: record?.companyName ?? null,
      companyLogoUrl: record?.companyLogoUrl ?? null,
      primaryColor: record?.primaryColor ?? '#1a365d',
      accentColor: record?.accentColor ?? '#f7fafc',
      headerHtml: record?.headerHtml ?? null,
      footerHtml: record?.footerHtml ?? null,
      showPageNumbers: record?.showPageNumbers ?? true,
      defaultPageSize: record?.defaultPageSize ?? 'A4',
      defaultPageOrientation: record?.defaultPageOrientation ?? 'portrait',
    })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    const { translate } = await resolveTranslations()
    console.error('pdf_templates.settings.get failed', err)
    return NextResponse.json(
      { error: translate('pdf_templates.errors.load_failed', 'Failed to load PDF settings') },
      { status: 400 }
    )
  }
}

export async function PUT(req: Request) {
  try {
    const { ctx, translate } = await resolveSettingsContext(req)
    const payload = await req.json().catch(() => ({}))
    const scoped = withScopedPayload(payload, ctx, translate)
    const input = pdfSettingsUpsertSchema.parse(scoped)

    const commandBus = ctx.container.resolve('commandBus') as CommandBus
    const { result } = await commandBus.execute<
      PdfSettingsUpsertInput,
      {
        id: string
        companyName?: string | null
        companyLogoUrl?: string | null
        primaryColor: string
        accentColor: string
        headerHtml?: string | null
        footerHtml?: string | null
        showPageNumbers: boolean
        defaultPageSize: string
        defaultPageOrientation: string
      }
    >('pdf_settings.save', { input, ctx })

    return NextResponse.json({
      companyName: result?.companyName ?? input.companyName ?? null,
      companyLogoUrl: result?.companyLogoUrl ?? input.companyLogoUrl ?? null,
      primaryColor: result?.primaryColor ?? input.primaryColor ?? '#1a365d',
      accentColor: result?.accentColor ?? input.accentColor ?? '#f7fafc',
      headerHtml: result?.headerHtml ?? input.headerHtml ?? null,
      footerHtml: result?.footerHtml ?? input.footerHtml ?? null,
      showPageNumbers: result?.showPageNumbers ?? input.showPageNumbers ?? true,
      defaultPageSize: result?.defaultPageSize ?? input.defaultPageSize ?? 'A4',
      defaultPageOrientation: result?.defaultPageOrientation ?? input.defaultPageOrientation ?? 'portrait',
    })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    const { translate } = await resolveTranslations()
    console.error('pdf_templates.settings.put failed', err)
    return NextResponse.json(
      { error: translate('pdf_templates.errors.save_failed', 'Failed to save PDF settings') },
      { status: 400 }
    )
  }
}

const settingsResponseSchema = z.object({
  companyName: z.string().nullable(),
  companyLogoUrl: z.string().nullable(),
  primaryColor: z.string(),
  accentColor: z.string(),
  headerHtml: z.string().nullable(),
  footerHtml: z.string().nullable(),
  showPageNumbers: z.boolean(),
  defaultPageSize: z.string(),
  defaultPageOrientation: z.string(),
})

const errorSchema = z.object({
  error: z.string(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'PDF Templates',
  summary: 'PDF settings',
  methods: {
    GET: {
      summary: 'Get PDF settings',
      responses: [
        { status: 200, description: 'Current PDF settings', schema: settingsResponseSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 400, description: 'Missing scope', schema: errorSchema },
      ],
    },
    PUT: {
      summary: 'Update PDF settings',
      requestBody: {
        contentType: 'application/json',
        schema: pdfSettingsUpsertSchema,
      },
      responses: [
        { status: 200, description: 'Updated PDF settings', schema: settingsResponseSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 400, description: 'Invalid payload', schema: errorSchema },
      ],
    },
  },
}
