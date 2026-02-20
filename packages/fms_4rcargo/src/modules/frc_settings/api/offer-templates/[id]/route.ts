import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { FrcOfferTemplate } from '../../../data/entities'
import { offerTemplateUpdateSchema } from '../../../data/validators'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['frc_settings.view'] },
  PUT: { requireAuth: true, requireFeatures: ['frc_settings.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['frc_settings.manage'] },
}

type RouteContext = {
  em: EntityManager
  translate: (key: string, fallback?: string) => string
  organizationId: string
  tenantId: string
}

type RouteParams = {
  params: Promise<{ id: string }>
}

async function resolveRouteContext(req: Request): Promise<RouteContext> {
  const container = await createRequestContainer()
  const auth = await getAuthFromRequest(req)
  const { translate } = await resolveTranslations()

  if (!auth || !auth.tenantId) {
    throw new CrudHttpError(401, { error: translate('frc_settings.errors.unauthorized', 'Unauthorized') })
  }

  // Use direct auth properties to avoid EntityManager identity map issues
  // Pattern from frc_trucks, frc_rfqs, frc_contractors
  const tenantId = (auth as { actorTenantId?: string }).actorTenantId || auth.tenantId
  const organizationId = (auth as { actorOrgId?: string }).actorOrgId || auth.orgId

  if (!tenantId || !organizationId) {
    throw new CrudHttpError(400, {
      error: translate('frc_settings.errors.organization_required', 'Organization context is required'),
    })
  }

  const em = container.resolve('em') as EntityManager

  return { em, translate, tenantId, organizationId }
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const { id } = await params
    const { em, translate, organizationId, tenantId } = await resolveRouteContext(req)

    const template = await em.findOne(FrcOfferTemplate, {
      id,
      organizationId,
      tenantId,
      deletedAt: null,
    })

    if (!template) {
      throw new CrudHttpError(404, {
        error: translate('frc_settings.offer_templates.errors.not_found', 'Template not found'),
      })
    }

    return NextResponse.json({
      id: template.id,
      name: template.name,
      description: template.description,
      subjectTemplate: template.subjectTemplate,
      contentTemplate: template.contentTemplate,
      isDefault: template.isDefault,
      isActive: template.isActive,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    const { translate } = await resolveTranslations()
    console.error('frc_settings.offer_templates.get failed', err)
    return NextResponse.json(
      { error: translate('frc_settings.offer_templates.errors.load', 'Failed to load template') },
      { status: 400 }
    )
  }
}

export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const { id } = await params
    const { em, translate, organizationId, tenantId } = await resolveRouteContext(req)
    const payload = await req.json().catch(() => ({}))

    const input = offerTemplateUpdateSchema.parse(payload)

    const template = await em.findOne(FrcOfferTemplate, {
      id,
      organizationId,
      tenantId,
      deletedAt: null,
    })

    if (!template) {
      throw new CrudHttpError(404, {
        error: translate('frc_settings.offer_templates.errors.not_found', 'Template not found'),
      })
    }

    // If setting as default, unset other defaults
    if (input.isDefault === true) {
      await em.nativeUpdate(
        FrcOfferTemplate,
        { organizationId, tenantId, deletedAt: null, id: { $ne: id } },
        { isDefault: false }
      )
    }

    // Update fields
    if (input.name !== undefined) template.name = input.name
    if (input.description !== undefined) template.description = input.description
    if (input.subjectTemplate !== undefined) template.subjectTemplate = input.subjectTemplate
    if (input.contentTemplate !== undefined) template.contentTemplate = input.contentTemplate
    if (input.isDefault !== undefined) template.isDefault = input.isDefault
    if (input.isActive !== undefined) template.isActive = input.isActive

    await em.flush()

    return NextResponse.json({
      id: template.id,
      name: template.name,
      description: template.description,
      subjectTemplate: template.subjectTemplate,
      contentTemplate: template.contentTemplate,
      isDefault: template.isDefault,
      isActive: template.isActive,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: err.issues },
        { status: 400 }
      )
    }
    const { translate } = await resolveTranslations()
    console.error('frc_settings.offer_templates.update failed', err)
    return NextResponse.json(
      { error: translate('frc_settings.offer_templates.errors.save', 'Failed to save template') },
      { status: 400 }
    )
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const { id } = await params
    const { em, translate, organizationId, tenantId } = await resolveRouteContext(req)

    const template = await em.findOne(FrcOfferTemplate, {
      id,
      organizationId,
      tenantId,
      deletedAt: null,
    })

    if (!template) {
      throw new CrudHttpError(404, {
        error: translate('frc_settings.offer_templates.errors.not_found', 'Template not found'),
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
    console.error('frc_settings.offer_templates.delete failed', err)
    return NextResponse.json(
      { error: translate('frc_settings.offer_templates.errors.delete', 'Failed to delete template') },
      { status: 400 }
    )
  }
}

const templateSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  subjectTemplate: z.string(),
  contentTemplate: z.string(),
  isDefault: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const errorSchema = z.object({
  error: z.string(),
})

export const openApi: OpenApiRouteDoc = {
  tag: '4R Cargo Settings',
  summary: 'Offer template by ID',
  methods: {
    GET: {
      summary: 'Get offer template',
      responses: [
        { status: 200, description: 'Offer template', schema: templateSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
      ],
    },
    PUT: {
      summary: 'Update offer template',
      requestBody: {
        contentType: 'application/json',
        schema: offerTemplateUpdateSchema,
      },
      responses: [
        { status: 200, description: 'Updated offer template', schema: templateSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 400, description: 'Invalid payload', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
      ],
    },
    DELETE: {
      summary: 'Delete offer template',
      responses: [
        { status: 200, description: 'Template deleted', schema: z.object({ ok: z.boolean() }) },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
      ],
    },
  },
}
