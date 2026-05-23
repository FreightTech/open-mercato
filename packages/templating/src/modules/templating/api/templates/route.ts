import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import type { EntityManager } from '@mikro-orm/postgresql'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { documentTemplateUpsertSchema } from '../../data/validators'
import { DocumentTemplate } from '../../data/entities'
import { normalizeTemplateForSave } from '../../lib/pdfme-generator'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['templating.view'] },
  POST: { requireAuth: true, requireFeatures: ['templating.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['templating.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['templating.manage'] },
}

async function resolveContext(req: Request) {
  const container = await createRequestContainer()
  const auth = await getAuthFromRequest(req)
  const { translate } = await resolveTranslations()

  if (!auth || !auth.tenantId) {
    throw new CrudHttpError(401, { error: translate('templating.errors.unauthorized', 'Unauthorized') })
  }

  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const organizationId = scope?.selectedId ?? auth.orgId ?? null

  if (!organizationId) {
    throw new CrudHttpError(400, { error: 'Organization context is required' })
  }

  const em = container.resolve('em') as EntityManager
  return { em, translate, tenantId: auth.tenantId, organizationId }
}

export async function GET(req: Request) {
  try {
    const { em, organizationId, tenantId } = await resolveContext(req)
    const url = new URL(req.url)
    const templateType = url.searchParams.get('type')

    if (templateType) {
      const template = await em.findOne(DocumentTemplate, {
        tenantId,
        organizationId,
        templateType,
        isActive: true,
        deletedAt: null,
      })

      if (!template) {
        return NextResponse.json({
          templateType,
          name: null,
          templateJson: null,
          isActive: false,
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
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
      })
    }

    const templates = await em.find(DocumentTemplate, {
      tenantId,
      organizationId,
      deletedAt: null,
    })

    return NextResponse.json({
      items: templates.map(t => ({
        id: t.id,
        templateType: t.templateType,
        name: t.name,
        description: t.description,
        previewImageUrl: t.previewImageUrl,
        isActive: t.isActive,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    console.error('templating.templates.get failed', err)
    return NextResponse.json({ error: 'Failed to load templates' }, { status: 400 })
  }
}

export async function POST(req: Request) {
  try {
    const { em, organizationId, tenantId, translate } = await resolveContext(req)
    const payload = await req.json().catch(() => ({}))

    const input = documentTemplateUpsertSchema.parse({
      ...payload,
      organizationId,
      tenantId,
    })

    const existing = await em.findOne(DocumentTemplate, {
      tenantId,
      organizationId,
      templateType: input.templateType,
      deletedAt: null,
    })

    if (existing) {
      throw new CrudHttpError(409, { error: 'A template for this type already exists. Use PUT to update.' })
    }

    const normalizedTemplateJson = normalizeTemplateForSave(input.templateJson)

    const template = em.create(DocumentTemplate, {
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      templateType: input.templateType,
      name: input.name,
      description: input.description,
      templateJson: normalizedTemplateJson,
      previewImageUrl: input.previewImageUrl,
      isActive: input.isActive,
    })

    await em.persist(template).flush()

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
    console.error('templating.templates.post failed', err)
    return NextResponse.json({ error: 'Failed to create template' }, { status: 400 })
  }
}

export async function PUT(req: Request) {
  try {
    const { em, organizationId, tenantId } = await resolveContext(req)
    const payload = await req.json().catch(() => ({}))

    const input = documentTemplateUpsertSchema.parse({
      ...payload,
      organizationId,
      tenantId,
    })

    const normalizedTemplateJson = normalizeTemplateForSave(input.templateJson)

    let template = await em.findOne(DocumentTemplate, {
      tenantId,
      organizationId,
      templateType: input.templateType,
      deletedAt: null,
    })

    if (template) {
      template.name = input.name
      template.description = input.description ?? null
      template.templateJson = normalizedTemplateJson
      template.previewImageUrl = input.previewImageUrl ?? null
      template.isActive = input.isActive
    } else {
      template = em.create(DocumentTemplate, {
        organizationId: input.organizationId,
        tenantId: input.tenantId,
        templateType: input.templateType,
        name: input.name,
        description: input.description,
        templateJson: normalizedTemplateJson,
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
    console.error('templating.templates.put failed', err)
    return NextResponse.json({ error: 'Failed to save template' }, { status: 400 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { em, organizationId, tenantId, translate } = await resolveContext(req)
    const url = new URL(req.url)
    const templateType = url.searchParams.get('type')

    if (!templateType) {
      throw new CrudHttpError(400, { error: translate('templating.errors.type_required', 'Template type is required') })
    }

    const template = await em.findOne(DocumentTemplate, {
      tenantId,
      organizationId,
      templateType,
      deletedAt: null,
    })

    if (!template) {
      throw new CrudHttpError(404, { error: 'Template not found' })
    }

    template.deletedAt = new Date()
    await em.flush()

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    console.error('templating.templates.delete failed', err)
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 400 })
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Document Templates',
  summary: 'PDF document template management',
  methods: {
    GET: {
      summary: 'Get document template(s)',
      responses: [
        { status: 200, description: 'Template(s)' },
        { status: 401, description: 'Unauthorized' },
      ],
    },
    POST: {
      summary: 'Create document template',
      requestBody: { contentType: 'application/json', schema: documentTemplateUpsertSchema },
      responses: [{ status: 200, description: 'Created template' }],
    },
    PUT: {
      summary: 'Update document template (upsert)',
      requestBody: { contentType: 'application/json', schema: documentTemplateUpsertSchema },
      responses: [{ status: 200, description: 'Updated template' }],
    },
    DELETE: {
      summary: 'Delete document template',
      responses: [{ status: 200, description: 'Deleted' }],
    },
  },
}
