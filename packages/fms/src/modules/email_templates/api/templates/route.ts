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
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import {
  emailTemplateUpsertSchema,
  emailTemplateTypes,
  type EmailTemplateUpsertInput,
} from '../../data/validators'
import type { EmailTemplateType } from '../../data/entities'
import { loadEmailTemplate } from '../../commands/email-templates'
import { EmailTemplate } from '../../data/entities'
import { withScopedPayload } from '../utils'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['email_templates.view'] },
  PUT: { requireAuth: true, requireFeatures: ['email_templates.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['email_templates.manage'] },
}

type TemplatesRouteContext = {
  ctx: CommandRuntimeContext
  em: EntityManager
  translate: (key: string, fallback?: string) => string
  organizationId: string
  tenantId: string
}

async function resolveTemplatesContext(req: Request): Promise<TemplatesRouteContext> {
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
    const { em, organizationId, tenantId } = await resolveTemplatesContext(req)
    const url = new URL(req.url)
    const templateType = url.searchParams.get('type') as EmailTemplateType | null

    if (templateType) {
      // Get single template
      const template = await loadEmailTemplate(em, { tenantId, organizationId, templateType })
      
      if (!template) {
        return NextResponse.json({
          templateType,
          subjectTemplate: '',
          htmlTemplate: '',
          isActive: true,
        })
      }

      return NextResponse.json({
        templateType: template.templateType,
        subjectTemplate: template.subjectTemplate,
        htmlTemplate: template.htmlTemplate,
        isActive: template.isActive,
      })
    } else {
      // Get all templates
      const templates = await findWithDecryption(
        em,
        EmailTemplate,
        {
          tenantId,
          organizationId,
        },
        undefined,
        { tenantId, organizationId }
      )

      const templateMap: Record<string, { subjectTemplate: string; htmlTemplate: string; isActive: boolean }> = {}
      
      for (const tmpl of templates) {
        templateMap[tmpl.templateType] = {
          subjectTemplate: tmpl.subjectTemplate,
          htmlTemplate: tmpl.htmlTemplate,
          isActive: tmpl.isActive,
        }
      }

      return NextResponse.json({
        templates: templateMap,
        availableTypes: emailTemplateTypes,
      })
    }
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    const { translate } = await resolveTranslations()
    console.error('email_templates.templates.get failed', err)
    return NextResponse.json(
      { error: translate('email_templates.errors.load_failed', 'Failed to load email templates') },
      { status: 400 }
    )
  }
}

export async function PUT(req: Request) {
  try {
    const { ctx, translate } = await resolveTemplatesContext(req)
    const payload = await req.json().catch(() => ({}))
    const scoped = withScopedPayload(payload, ctx, translate)
    const input = emailTemplateUpsertSchema.parse(scoped)

    const commandBus = ctx.container.resolve('commandBus') as CommandBus
    const { result } = await commandBus.execute<EmailTemplateUpsertInput, {
      id: string
      templateType: string
      subjectTemplate: string
      htmlTemplate: string
      isActive: boolean
    }>('email_templates.save', { input, ctx })

    return NextResponse.json({
      templateType: result.templateType,
      subjectTemplate: result.subjectTemplate,
      htmlTemplate: result.htmlTemplate,
      isActive: result.isActive,
    })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    const { translate } = await resolveTranslations()
    console.error('email_templates.templates.put failed', err)
    return NextResponse.json(
      { error: translate('email_templates.errors.save_failed', 'Failed to save email template') },
      { status: 400 }
    )
  }
}

export async function DELETE(req: Request) {
  try {
    const { ctx, translate, tenantId, organizationId } = await resolveTemplatesContext(req)
    const url = new URL(req.url)
    const templateType = url.searchParams.get('type')

    if (!templateType) {
      throw new CrudHttpError(400, {
        error: translate('email_templates.errors.type_required', 'Template type is required'),
      })
    }

    const commandBus = ctx.container.resolve('commandBus') as CommandBus
    await commandBus.execute<{ tenantId: string; organizationId: string; templateType: string }, { ok: boolean }>(
      'email_templates.delete',
      {
        input: { tenantId, organizationId, templateType },
        ctx,
      }
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    const { translate } = await resolveTranslations()
    console.error('email_templates.templates.delete failed', err)
    return NextResponse.json(
      { error: translate('email_templates.errors.delete_failed', 'Failed to delete email template') },
      { status: 400 }
    )
  }
}

const templateResponseSchema = z.object({
  templateType: z.string(),
  subjectTemplate: z.string(),
  htmlTemplate: z.string(),
  isActive: z.boolean(),
})

const templatesListResponseSchema = z.object({
  templates: z.record(
    z.string(),
    z.object({
      subjectTemplate: z.string(),
      htmlTemplate: z.string(),
      isActive: z.boolean(),
    })
  ),
  availableTypes: z.array(z.string()),
})

const errorSchema = z.object({
  error: z.string(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Email Templates',
  summary: 'Email templates',
  methods: {
    GET: {
      summary: 'Get email template(s)',
      responses: [
        { status: 200, description: 'Email template(s)' },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 400, description: 'Missing scope', schema: errorSchema },
      ],
    },
    PUT: {
      summary: 'Update email template',
      requestBody: {
        contentType: 'application/json',
        schema: emailTemplateUpsertSchema,
      },
      responses: [
        { status: 200, description: 'Updated email template', schema: templateResponseSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 400, description: 'Invalid payload', schema: errorSchema },
      ],
    },
    DELETE: {
      summary: 'Delete email template',
      responses: [
        { status: 200, description: 'Template deleted', schema: z.object({ ok: z.boolean() }) },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 400, description: 'Invalid request', schema: errorSchema },
      ],
    },
  },
}
