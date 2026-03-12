import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { FrcOfferTemplate } from '../../data/entities'
import { offerTemplateCreateSchema } from '../../data/validators'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['frc_settings.view'] },
  POST: { requireAuth: true, requireFeatures: ['frc_settings.manage'] },
}

type RouteContext = {
  em: EntityManager
  translate: (key: string, fallback?: string) => string
  organizationId: string
  tenantId: string
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

export async function GET(req: Request) {
  try {
    const { em, organizationId, tenantId } = await resolveRouteContext(req)

    const templates = await findWithDecryption(
      em,
      FrcOfferTemplate,
      {
        tenantId,
        organizationId,
      },
      undefined,
      { tenantId, organizationId }
    )

    return NextResponse.json({
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        subjectTemplate: t.subjectTemplate,
        contentTemplate: t.contentTemplate,
        isDefault: t.isDefault,
        isActive: t.isActive,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
    })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    const { translate } = await resolveTranslations()
    console.error('frc_settings.offer_templates.list failed', err)
    return NextResponse.json(
      { error: translate('frc_settings.offer_templates.errors.load', 'Failed to load templates') },
      { status: 400 }
    )
  }
}

export async function POST(req: Request) {
  try {
    const { em, translate, organizationId, tenantId } = await resolveRouteContext(req)
    const payload = await req.json().catch(() => ({}))

    const input = offerTemplateCreateSchema.parse({
      ...payload,
      organizationId,
      tenantId,
    })

    // If setting as default, unset other defaults
    if (input.isDefault) {
      await em.nativeUpdate(
        FrcOfferTemplate,
        { organizationId, tenantId },
        { isDefault: false }
      )
    }

    const template = em.create(FrcOfferTemplate, {
      organizationId,
      tenantId,
      name: input.name,
      description: input.description ?? null,
      subjectTemplate: input.subjectTemplate,
      contentTemplate: input.contentTemplate,
      isDefault: input.isDefault ?? false,
      isActive: input.isActive ?? true,
    })

    await em.persistAndFlush(template)

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
    console.error('frc_settings.offer_templates.create failed', err)
    return NextResponse.json(
      { error: translate('frc_settings.offer_templates.errors.save', 'Failed to save template') },
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

const templatesListSchema = z.object({
  templates: z.array(templateSchema),
})

const errorSchema = z.object({
  error: z.string(),
})

export const openApi: OpenApiRouteDoc = {
  tag: '4R Cargo Settings',
  summary: 'Offer templates',
  methods: {
    GET: {
      summary: 'List offer templates',
      responses: [
        { status: 200, description: 'List of offer templates', schema: templatesListSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
      ],
    },
    POST: {
      summary: 'Create offer template',
      requestBody: {
        contentType: 'application/json',
        schema: offerTemplateCreateSchema.omit({ organizationId: true, tenantId: true }),
      },
      responses: [
        { status: 200, description: 'Created offer template', schema: templateSchema },
        { status: 400, description: 'Invalid payload', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
      ],
    },
  },
}
