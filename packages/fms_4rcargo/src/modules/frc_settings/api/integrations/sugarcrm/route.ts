import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { FrcSugarCrmConfig } from '../../../data/entities'
import { sugarCrmConfigUpsertSchema } from '../../../data/validators'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['frc_settings.integrations'] },
  PUT: { requireAuth: true, requireFeatures: ['frc_settings.integrations'] },
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

    const config = await em.findOne(FrcSugarCrmConfig, {
      organizationId,
      tenantId,
    })

    if (!config) {
      return NextResponse.json({
        instanceUrl: null,
        apiKey: null,
        isEnabled: false,
        lastSyncAt: null,
        lastSyncStatus: null,
        lastSyncMessage: null,
      })
    }

    return NextResponse.json({
      instanceUrl: config.instanceUrl,
      // Don't return the actual API key, just indicate if it's set
      apiKey: config.apiKey ? '********' : null,
      isEnabled: config.isEnabled,
      lastSyncAt: config.lastSyncAt?.toISOString() ?? null,
      lastSyncStatus: config.lastSyncStatus,
      lastSyncMessage: config.lastSyncMessage,
    })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    const { translate } = await resolveTranslations()
    console.error('frc_settings.sugarcrm.get failed', err)
    return NextResponse.json(
      { error: translate('frc_settings.integrations.sugarcrm.errors.load', 'Failed to load settings') },
      { status: 400 }
    )
  }
}

export async function PUT(req: Request) {
  try {
    const { em, translate, organizationId, tenantId } = await resolveRouteContext(req)
    const payload = await req.json().catch(() => ({}))

    const input = sugarCrmConfigUpsertSchema.parse({
      ...payload,
      organizationId,
      tenantId,
    })

    let config = await em.findOne(FrcSugarCrmConfig, {
      organizationId,
      tenantId,
    })

    if (!config) {
      config = em.create(FrcSugarCrmConfig, {
        organizationId,
        tenantId,
        instanceUrl: input.instanceUrl ?? null,
        apiKey: input.apiKey ?? null,
        isEnabled: input.isEnabled ?? false,
      })
      em.persist(config)
    } else {
      if (input.instanceUrl !== undefined) config.instanceUrl = input.instanceUrl
      // Only update apiKey if a new value is provided (not masked)
      if (input.apiKey !== undefined && input.apiKey !== '********') {
        config.apiKey = input.apiKey
      }
      if (input.isEnabled !== undefined) config.isEnabled = input.isEnabled
    }

    await em.flush()

    return NextResponse.json({
      instanceUrl: config.instanceUrl,
      apiKey: config.apiKey ? '********' : null,
      isEnabled: config.isEnabled,
      lastSyncAt: config.lastSyncAt?.toISOString() ?? null,
      lastSyncStatus: config.lastSyncStatus,
      lastSyncMessage: config.lastSyncMessage,
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
    console.error('frc_settings.sugarcrm.put failed', err)
    return NextResponse.json(
      { error: translate('frc_settings.integrations.sugarcrm.errors.save', 'Failed to save settings') },
      { status: 400 }
    )
  }
}

const configSchema = z.object({
  instanceUrl: z.string().nullable(),
  apiKey: z.string().nullable(),
  isEnabled: z.boolean(),
  lastSyncAt: z.string().nullable(),
  lastSyncStatus: z.enum(['success', 'error']).nullable(),
  lastSyncMessage: z.string().nullable(),
})

const errorSchema = z.object({
  error: z.string(),
})

export const openApi: OpenApiRouteDoc = {
  tag: '4R Cargo Settings',
  summary: 'SugarCRM integration settings',
  methods: {
    GET: {
      summary: 'Get SugarCRM settings',
      responses: [
        { status: 200, description: 'SugarCRM settings', schema: configSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
      ],
    },
    PUT: {
      summary: 'Update SugarCRM settings',
      requestBody: {
        contentType: 'application/json',
        schema: sugarCrmConfigUpsertSchema.omit({ organizationId: true, tenantId: true }),
      },
      responses: [
        { status: 200, description: 'Updated SugarCRM settings', schema: configSchema },
        { status: 400, description: 'Invalid payload', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
      ],
    },
  },
}
