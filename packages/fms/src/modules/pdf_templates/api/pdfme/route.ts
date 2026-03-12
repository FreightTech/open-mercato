import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { EntityManager } from '@mikro-orm/postgresql'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  pdfmeTemplateUpsertSchema,
  pdfmeTemplateListSchema,
  pdfTemplateTypes,
} from '../../data/validators'
import { PdfmeTemplate, type PdfTemplateType } from '../../data/entities'
import { getDefaultPdfmeTemplate, OFFER_TEMPLATE_VARIABLES } from '../../lib/default-pdfme-templates'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['pdf_templates.view'] },
  POST: { requireAuth: true, requireFeatures: ['pdf_templates.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['pdf_templates.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['pdf_templates.manage'] },
}

type PdfmeRouteContext = {
  ctx: CommandRuntimeContext
  em: EntityManager
  translate: (key: string, fallback?: string) => string
  organizationId: string
  tenantId: string
}

async function resolvePdfmeContext(req: Request): Promise<PdfmeRouteContext> {
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

/**
 * GET /api/pdf_templates/pdfme
 * 
 * Query params:
 * - type: template type (e.g., 'offer')
 * - includeDefault: if true and no custom template exists, return default template
 * - includeVariables: if true, include available template variables
 */
export async function GET(req: Request) {
  try {
    const { em, organizationId, tenantId } = await resolvePdfmeContext(req)
    const url = new URL(req.url)
    const templateType = url.searchParams.get('type') as PdfTemplateType | null
    const includeDefault = url.searchParams.get('includeDefault') === 'true'
    const includeVariables = url.searchParams.get('includeVariables') === 'true'

    if (templateType) {
      // Get single template
      const template = await em.findOne(PdfmeTemplate, {
        tenantId,
        organizationId,
        templateType,
        isActive: true,
        deletedAt: null,
      })

      if (!template) {
        // Return default template if requested
        if (includeDefault) {
          const defaultTemplate = getDefaultPdfmeTemplate(templateType)
          return NextResponse.json({
            templateType,
            name: `Default ${templateType} template`,
            description: null,
            templateJson: defaultTemplate,
            isActive: true,
            isDefault: true,
            variables: includeVariables && templateType === 'offer' ? OFFER_TEMPLATE_VARIABLES : undefined,
          })
        }
        return NextResponse.json({
          templateType,
          name: null,
          templateJson: null,
          isActive: false,
          isDefault: false,
          variables: includeVariables && templateType === 'offer' ? OFFER_TEMPLATE_VARIABLES : undefined,
        })
      }

      return NextResponse.json({
        id: template.id,
        templateType: template.templateType,
        name: template.name,
        description: template.description,
        templateJson: template.templateJson,
        previewImageUrl: template.previewImageUrl,
        isActive: template.isActive,
        isDefault: false,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
        variables: includeVariables && templateType === 'offer' ? OFFER_TEMPLATE_VARIABLES : undefined,
      })
    } else {
      // Get all templates
      const templates = await em.find(PdfmeTemplate, {
        tenantId,
        organizationId,
        deletedAt: null,
      })

      const items = templates.map(t => ({
        id: t.id,
        templateType: t.templateType,
        name: t.name,
        description: t.description,
        previewImageUrl: t.previewImageUrl,
        isActive: t.isActive,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }))

      return NextResponse.json({
        items,
        availableTypes: pdfTemplateTypes,
      })
    }
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    const { translate } = await resolveTranslations()
    console.error('pdfme.templates.get failed', err)
    return NextResponse.json(
      { error: translate('pdf_templates.errors.load_failed', 'Failed to load pdfme templates') },
      { status: 400 }
    )
  }
}

/**
 * POST /api/pdf_templates/pdfme
 * 
 * Create a new pdfme template
 */
export async function POST(req: Request) {
  try {
    const { em, organizationId, tenantId, translate } = await resolvePdfmeContext(req)
    const payload = await req.json().catch(() => ({}))

    const input = pdfmeTemplateUpsertSchema.parse({
      ...payload,
      organizationId,
      tenantId,
    })

    // Check if template already exists for this type
    const existing = await em.findOne(PdfmeTemplate, {
      tenantId,
      organizationId,
      templateType: input.templateType,
      deletedAt: null,
    })

    if (existing) {
      throw new CrudHttpError(409, {
        error: translate(
          'pdf_templates.errors.already_exists',
          'A template for this type already exists. Use PUT to update.'
        ),
      })
    }

    const template = em.create(PdfmeTemplate, {
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      templateType: input.templateType,
      name: input.name,
      description: input.description,
      templateJson: input.templateJson,
      previewImageUrl: input.previewImageUrl,
      isActive: input.isActive,
    })

    await em.persistAndFlush(template)

    return NextResponse.json({
      id: template.id,
      templateType: template.templateType,
      name: template.name,
      description: template.description,
      templateJson: template.templateJson,
      previewImageUrl: template.previewImageUrl,
      isActive: template.isActive,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.issues }, { status: 400 })
    }
    const { translate } = await resolveTranslations()
    console.error('pdfme.templates.post failed', err)
    return NextResponse.json(
      { error: translate('pdf_templates.errors.create_failed', 'Failed to create pdfme template') },
      { status: 400 }
    )
  }
}

/**
 * PUT /api/pdf_templates/pdfme
 * 
 * Update an existing pdfme template (upsert behavior)
 */
export async function PUT(req: Request) {
  try {
    const { em, organizationId, tenantId, translate } = await resolvePdfmeContext(req)
    const payload = await req.json().catch(() => ({}))

    const input = pdfmeTemplateUpsertSchema.parse({
      ...payload,
      organizationId,
      tenantId,
    })

    // Find existing template
    let template = await em.findOne(PdfmeTemplate, {
      tenantId,
      organizationId,
      templateType: input.templateType,
      deletedAt: null,
    })

    if (template) {
      // Update existing
      template.name = input.name
      template.description = input.description ?? null
      template.templateJson = input.templateJson
      template.previewImageUrl = input.previewImageUrl ?? null
      template.isActive = input.isActive
    } else {
      // Create new (upsert)
      template = em.create(PdfmeTemplate, {
        organizationId: input.organizationId,
        tenantId: input.tenantId,
        templateType: input.templateType,
        name: input.name,
        description: input.description,
        templateJson: input.templateJson,
        previewImageUrl: input.previewImageUrl,
        isActive: input.isActive,
      })
      em.persist(template)
    }

    await em.flush()

    return NextResponse.json({
      id: template.id,
      templateType: template.templateType,
      name: template.name,
      description: template.description,
      templateJson: template.templateJson,
      previewImageUrl: template.previewImageUrl,
      isActive: template.isActive,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.issues }, { status: 400 })
    }
    const { translate } = await resolveTranslations()
    console.error('pdfme.templates.put failed', err)
    return NextResponse.json(
      { error: translate('pdf_templates.errors.save_failed', 'Failed to save pdfme template') },
      { status: 400 }
    )
  }
}

/**
 * DELETE /api/pdf_templates/pdfme?type=offer
 * 
 * Soft delete a pdfme template
 */
export async function DELETE(req: Request) {
  try {
    const { em, organizationId, tenantId, translate } = await resolvePdfmeContext(req)
    const url = new URL(req.url)
    const templateType = url.searchParams.get('type')

    if (!templateType) {
      throw new CrudHttpError(400, {
        error: translate('pdf_templates.errors.type_required', 'Template type is required'),
      })
    }

    const template = await em.findOne(PdfmeTemplate, {
      tenantId,
      organizationId,
      templateType: templateType as PdfTemplateType,
      deletedAt: null,
    })

    if (!template) {
      throw new CrudHttpError(404, {
        error: translate('pdf_templates.errors.not_found', 'Template not found'),
      })
    }

    // Soft delete
    template.deletedAt = new Date()
    await em.flush()

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    const { translate } = await resolveTranslations()
    console.error('pdfme.templates.delete failed', err)
    return NextResponse.json(
      { error: translate('pdf_templates.errors.delete_failed', 'Failed to delete pdfme template') },
      { status: 400 }
    )
  }
}

// OpenAPI documentation
const templateResponseSchema = z.object({
  id: z.string().uuid().optional(),
  templateType: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  templateJson: z.any(),
  previewImageUrl: z.string().nullable().optional(),
  isActive: z.boolean(),
  isDefault: z.boolean().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
})

const errorSchema = z.object({
  error: z.string(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'PDF Templates (pdfme)',
  summary: 'Visual PDF templates using pdfme',
  methods: {
    GET: {
      summary: 'Get pdfme template(s)',
      responses: [
        { status: 200, description: 'pdfme template(s)' },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 400, description: 'Missing scope', schema: errorSchema },
      ],
    },
    POST: {
      summary: 'Create pdfme template',
      requestBody: {
        contentType: 'application/json',
        schema: pdfmeTemplateUpsertSchema,
      },
      responses: [
        { status: 200, description: 'Created pdfme template', schema: templateResponseSchema },
        { status: 409, description: 'Template already exists', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 400, description: 'Invalid payload', schema: errorSchema },
      ],
    },
    PUT: {
      summary: 'Update pdfme template (upsert)',
      requestBody: {
        contentType: 'application/json',
        schema: pdfmeTemplateUpsertSchema,
      },
      responses: [
        { status: 200, description: 'Updated pdfme template', schema: templateResponseSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 400, description: 'Invalid payload', schema: errorSchema },
      ],
    },
    DELETE: {
      summary: 'Delete pdfme template',
      responses: [
        { status: 200, description: 'Template deleted', schema: z.object({ ok: z.boolean() }) },
        { status: 404, description: 'Template not found', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 400, description: 'Invalid request', schema: errorSchema },
      ],
    },
  },
}
