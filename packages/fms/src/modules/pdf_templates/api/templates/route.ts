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
import {
  pdfTemplateUpsertSchema,
  pdfTemplateTypes,
  type PdfTemplateUpsertInput,
} from '../../data/validators'
import type { PdfTemplateType } from '../../data/entities'
import { loadPdfTemplate } from '../../commands/pdf-templates'
import { PdfTemplate } from '../../data/entities'
import { getDefaultTemplate } from '../../lib/default-templates'
import { withScopedPayload } from '../utils'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['pdf_templates.view'] },
  PUT: { requireAuth: true, requireFeatures: ['pdf_templates.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['pdf_templates.manage'] },
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
    const { em, organizationId, tenantId } = await resolveTemplatesContext(req)
    const url = new URL(req.url)
    const templateType = url.searchParams.get('type') as PdfTemplateType | null
    const includeDefault = url.searchParams.get('includeDefault') === 'true'

    if (templateType) {
      // Get single template
      const template = await loadPdfTemplate(em, { tenantId, organizationId, templateType })
      const defaultTmpl = getDefaultTemplate(templateType)

      if (!template) {
        // Return default template if requested or empty if not
        if (includeDefault) {
          return NextResponse.json({
            templateType,
            htmlTemplate: defaultTmpl.htmlTemplate,
            cssStyles: defaultTmpl.cssStyles,
            pageSize: 'A4',
            pageOrientation: 'portrait',
            isActive: true,
            isDefault: true,
          })
        }
        return NextResponse.json({
          templateType,
          htmlTemplate: '',
          cssStyles: '',
          pageSize: 'A4',
          pageOrientation: 'portrait',
          isActive: true,
          isDefault: false,
        })
      }

      return NextResponse.json({
        templateType: template.templateType,
        htmlTemplate: template.htmlTemplate,
        cssStyles: template.cssStyles,
        pageSize: template.pageSize,
        pageOrientation: template.pageOrientation,
        isActive: template.isActive,
        isDefault: false,
      })
    } else {
      // Get all templates
      const templates = await em.find(PdfTemplate, {
        tenantId,
        organizationId,
      })

      const templateMap: Record<
        string,
        {
          htmlTemplate: string
          cssStyles?: string | null
          pageSize: string
          pageOrientation: string
          isActive: boolean
          isDefault: boolean
        }
      > = {}

      // First, add defaults for all types
      if (includeDefault) {
        for (const type of pdfTemplateTypes) {
          const defaultTmpl = getDefaultTemplate(type)
          templateMap[type] = {
            htmlTemplate: defaultTmpl.htmlTemplate,
            cssStyles: defaultTmpl.cssStyles,
            pageSize: 'A4',
            pageOrientation: 'portrait',
            isActive: true,
            isDefault: true,
          }
        }
      }

      // Then override with custom templates
      for (const tmpl of templates) {
        templateMap[tmpl.templateType] = {
          htmlTemplate: tmpl.htmlTemplate,
          cssStyles: tmpl.cssStyles,
          pageSize: tmpl.pageSize,
          pageOrientation: tmpl.pageOrientation,
          isActive: tmpl.isActive,
          isDefault: false,
        }
      }

      return NextResponse.json({
        templates: templateMap,
        availableTypes: pdfTemplateTypes,
      })
    }
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    const { translate } = await resolveTranslations()
    console.error('pdf_templates.templates.get failed', err)
    return NextResponse.json(
      { error: translate('pdf_templates.errors.load_failed', 'Failed to load PDF templates') },
      { status: 400 }
    )
  }
}

export async function PUT(req: Request) {
  try {
    const { ctx, translate } = await resolveTemplatesContext(req)
    const payload = await req.json().catch(() => ({}))
    const scoped = withScopedPayload(payload, ctx, translate)
    const input = pdfTemplateUpsertSchema.parse(scoped)

    const commandBus = ctx.container.resolve('commandBus') as CommandBus
    const { result } = await commandBus.execute<
      PdfTemplateUpsertInput,
      {
        id: string
        templateType: string
        htmlTemplate: string
        cssStyles?: string | null
        pageSize: string
        pageOrientation: string
        isActive: boolean
      }
    >('pdf_templates.save', { input, ctx })

    return NextResponse.json({
      templateType: result.templateType,
      htmlTemplate: result.htmlTemplate,
      cssStyles: result.cssStyles,
      pageSize: result.pageSize,
      pageOrientation: result.pageOrientation,
      isActive: result.isActive,
    })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    const { translate } = await resolveTranslations()
    console.error('pdf_templates.templates.put failed', err)
    return NextResponse.json(
      { error: translate('pdf_templates.errors.save_failed', 'Failed to save PDF template') },
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
        error: translate('pdf_templates.errors.type_required', 'Template type is required'),
      })
    }

    const commandBus = ctx.container.resolve('commandBus') as CommandBus
    await commandBus.execute<{ tenantId: string; organizationId: string; templateType: string }, { ok: boolean }>(
      'pdf_templates.delete',
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
    console.error('pdf_templates.templates.delete failed', err)
    return NextResponse.json(
      { error: translate('pdf_templates.errors.delete_failed', 'Failed to delete PDF template') },
      { status: 400 }
    )
  }
}

const templateResponseSchema = z.object({
  templateType: z.string(),
  htmlTemplate: z.string(),
  cssStyles: z.string().nullable(),
  pageSize: z.string(),
  pageOrientation: z.string(),
  isActive: z.boolean(),
})

const errorSchema = z.object({
  error: z.string(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'PDF Templates',
  summary: 'PDF templates',
  methods: {
    GET: {
      summary: 'Get PDF template(s)',
      responses: [
        { status: 200, description: 'PDF template(s)' },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 400, description: 'Missing scope', schema: errorSchema },
      ],
    },
    PUT: {
      summary: 'Update PDF template',
      requestBody: {
        contentType: 'application/json',
        schema: pdfTemplateUpsertSchema,
      },
      responses: [
        { status: 200, description: 'Updated PDF template', schema: templateResponseSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 400, description: 'Invalid payload', schema: errorSchema },
      ],
    },
    DELETE: {
      summary: 'Delete PDF template (reverts to default)',
      responses: [
        { status: 200, description: 'Template deleted', schema: z.object({ ok: z.boolean() }) },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 400, description: 'Invalid request', schema: errorSchema },
      ],
    },
  },
}
