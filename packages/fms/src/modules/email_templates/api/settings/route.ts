import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@/lib/di/container'
import { getAuthFromRequest } from '@/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { EntityManager } from '@mikro-orm/postgresql'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { emailSettingsUpsertSchema, type EmailSettingsUpsertInput } from '../../data/validators'
import { loadEmailSettings } from '../../commands/email-settings'
import { withScopedPayload } from '../utils'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['email_templates.settings.view'] },
  PUT: { requireAuth: true, requireFeatures: ['email_templates.settings.manage'] },
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
    throw new CrudHttpError(401, { error: translate('email_templates.errors.unauthorized', 'Unauthorized') })
  }

  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const organizationId = scope?.selectedId ?? auth.orgId ?? null
  
  if (!organizationId) {
    throw new CrudHttpError(400, {
      error: translate('email_templates.errors.organization_required', 'Organization context is required'),
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
    const record = await loadEmailSettings(em, { tenantId, organizationId })
    
    return NextResponse.json({
      companyName: record?.companyName ?? null,
      companyLogoUrl: record?.companyLogoUrl ?? null,
      primaryColor: record?.primaryColor ?? '#1a365d',
      accentColor: record?.accentColor ?? '#f7fafc',
      contactEmail: record?.contactEmail ?? null,
      contactPhone: record?.contactPhone ?? null,
      websiteUrl: record?.websiteUrl ?? null,
      footerText: record?.footerText ?? null,
      footerDisclaimer: record?.footerDisclaimer ?? null,
      fromName: record?.fromName ?? null,
      fromEmail: record?.fromEmail ?? null,
      replyToEmail: record?.replyToEmail ?? null,
    })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    const { translate } = await resolveTranslations()
    console.error('email_templates.settings.get failed', err)
    return NextResponse.json(
      { error: translate('email_templates.errors.load_failed', 'Failed to load email settings') },
      { status: 400 }
    )
  }
}

export async function PUT(req: Request) {
  try {
    const { ctx, translate } = await resolveSettingsContext(req)
    const payload = await req.json().catch(() => ({}))
    const scoped = withScopedPayload(payload, ctx, translate)
    const input = emailSettingsUpsertSchema.parse(scoped)

    const commandBus = ctx.container.resolve('commandBus') as CommandBus
    const { result } = await commandBus.execute<EmailSettingsUpsertInput, {
      id: string
      companyName?: string | null
      companyLogoUrl?: string | null
      primaryColor: string
      accentColor: string
      contactEmail?: string | null
      contactPhone?: string | null
      websiteUrl?: string | null
      footerText?: string | null
      footerDisclaimer?: string | null
      fromName?: string | null
      fromEmail?: string | null
      replyToEmail?: string | null
    }>('email_settings.save', { input, ctx })

    return NextResponse.json({
      companyName: result?.companyName ?? input.companyName ?? null,
      companyLogoUrl: result?.companyLogoUrl ?? input.companyLogoUrl ?? null,
      primaryColor: result?.primaryColor ?? input.primaryColor ?? '#1a365d',
      accentColor: result?.accentColor ?? input.accentColor ?? '#f7fafc',
      contactEmail: result?.contactEmail ?? input.contactEmail ?? null,
      contactPhone: result?.contactPhone ?? input.contactPhone ?? null,
      websiteUrl: result?.websiteUrl ?? input.websiteUrl ?? null,
      footerText: result?.footerText ?? input.footerText ?? null,
      footerDisclaimer: result?.footerDisclaimer ?? input.footerDisclaimer ?? null,
      fromName: result?.fromName ?? input.fromName ?? null,
      fromEmail: result?.fromEmail ?? input.fromEmail ?? null,
      replyToEmail: result?.replyToEmail ?? input.replyToEmail ?? null,
    })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    const { translate } = await resolveTranslations()
    console.error('email_templates.settings.put failed', err)
    return NextResponse.json(
      { error: translate('email_templates.errors.save_failed', 'Failed to save email settings') },
      { status: 400 }
    )
  }
}

const settingsResponseSchema = z.object({
  companyName: z.string().nullable(),
  companyLogoUrl: z.string().nullable(),
  primaryColor: z.string(),
  accentColor: z.string(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  footerText: z.string().nullable(),
  footerDisclaimer: z.string().nullable(),
  fromName: z.string().nullable(),
  fromEmail: z.string().nullable(),
  replyToEmail: z.string().nullable(),
})

const errorSchema = z.object({
  error: z.string(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Email Templates',
  summary: 'Email settings',
  methods: {
    GET: {
      summary: 'Get email settings',
      responses: [
        { status: 200, description: 'Current email settings', schema: settingsResponseSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 400, description: 'Missing scope', schema: errorSchema },
      ],
    },
    PUT: {
      summary: 'Update email settings',
      requestBody: {
        contentType: 'application/json',
        schema: emailSettingsUpsertSchema,
      },
      responses: [
        { status: 200, description: 'Updated email settings', schema: settingsResponseSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 400, description: 'Invalid payload', schema: errorSchema },
      ],
    },
  },
}
