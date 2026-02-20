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
import { getSugarCrmConfigStatus } from '../../../lib/sugarcrm-env'

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

/**
 * Get SugarCRM integration status and configuration
 *
 * Credentials are read from environment variables (SUGARCRM_INSTANCE_URL, etc.)
 * Per-tenant configuration (isEnabled, sync status) is stored in DB
 */
export async function GET(req: Request) {
  try {
    const { em, organizationId, tenantId } = await resolveRouteContext(req)

    // Get credential status from environment variables
    const envStatus = getSugarCrmConfigStatus()

    // Get per-tenant config from database
    const config = await em.findOne(FrcSugarCrmConfig, {
      organizationId,
      tenantId,
    })

    return NextResponse.json({
      // Environment-based credentials status
      credentials: {
        configured: envStatus.configured,
        instanceUrl: envStatus.instanceUrl,
        missingVars: envStatus.missingVars,
      },
      // Per-tenant settings
      isEnabled: config?.isEnabled ?? false,
      lastSyncAt: config?.lastSyncAt?.toISOString() ?? null,
      lastSyncStatus: config?.lastSyncStatus ?? null,
      lastSyncMessage: config?.lastSyncMessage ?? null,
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

/**
 * Update SugarCRM integration settings
 *
 * Only per-tenant settings can be updated (isEnabled).
 * Credentials must be configured via environment variables.
 */
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
        isEnabled: input.isEnabled ?? false,
      })
      em.persist(config)
    } else {
      if (input.isEnabled !== undefined) config.isEnabled = input.isEnabled
    }

    await em.flush()

    // Get credential status from environment variables
    const envStatus = getSugarCrmConfigStatus()

    return NextResponse.json({
      credentials: {
        configured: envStatus.configured,
        instanceUrl: envStatus.instanceUrl,
        missingVars: envStatus.missingVars,
      },
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
  credentials: z.object({
    configured: z.boolean(),
    instanceUrl: z.string().nullable(),
    missingVars: z.array(z.string()),
  }),
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
      description: 'Returns credential status (from env vars) and per-tenant integration settings.',
      responses: [
        { status: 200, description: 'SugarCRM settings', schema: configSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
      ],
    },
    PUT: {
      summary: 'Update SugarCRM settings',
      description: 'Updates per-tenant settings (isEnabled). Credentials must be set via environment variables.',
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
