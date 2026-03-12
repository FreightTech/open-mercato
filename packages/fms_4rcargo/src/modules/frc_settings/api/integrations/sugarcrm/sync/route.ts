import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { runSugarCrmSync } from '../../../../lib/sugarcrm-sync'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['frc_settings.integrations'] },
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

/**
 * Trigger SugarCRM synchronization
 *
 * Syncs data from SugarCRM to 4RCargo:
 * - Accounts → Contractors
 * - Contacts → ContractorContacts
 * - Opportunities → FrcRfqs
 * - Custom Shipments → FrcProjects (if configured)
 * - Custom Quotes → FrcOffers (if configured)
 */
export async function POST(req: Request) {
  try {
    const { em, translate, organizationId, tenantId } = await resolveRouteContext(req)
    const payload = await req.json().catch(() => ({}))

    // Parse optional sync options from request body
    const options: { since?: Date; modules?: string[]; maxRecordsPerModule?: number } = {}

    if (payload.since) {
      options.since = new Date(payload.since)
    }
    if (payload.modules && Array.isArray(payload.modules)) {
      options.modules = payload.modules
    }
    if (payload.maxRecordsPerModule && typeof payload.maxRecordsPerModule === 'number') {
      options.maxRecordsPerModule = payload.maxRecordsPerModule
    }

    // Run the sync
    const result = await runSugarCrmSync(em, organizationId, tenantId, options)

    // Format response
    return NextResponse.json({
      success: result.success,
      message: result.message,
      syncedAt: result.completedAt.toISOString(),
      durationMs: result.durationMs,
      statistics: {
        totalRecords: result.totalRecords,
        created: result.totalCreated,
        updated: result.totalUpdated,
        skipped: result.totalSkipped,
        errors: result.totalErrors,
      },
      modules: result.modules.map((m) => ({
        moduleName: m.moduleName,
        targetEntity: m.targetEntity,
        totalRecords: m.totalRecords,
        created: m.created,
        updated: m.updated,
        skipped: m.skipped,
        errors: m.errors,
        errorMessages: m.errorMessages.length > 0 ? m.errorMessages.slice(0, 10) : undefined,
      })),
    })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    const { translate } = await resolveTranslations()
    console.error('frc_settings.sugarcrm.sync failed', err)
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error
          ? err.message
          : translate('frc_settings.integrations.sugarcrm.messages.sync_failed', 'Sync failed'),
      },
      { status: 400 }
    )
  }
}

const moduleSyncStatsSchema = z.object({
  moduleName: z.string(),
  targetEntity: z.string(),
  totalRecords: z.number(),
  created: z.number(),
  updated: z.number(),
  skipped: z.number(),
  errors: z.number(),
  errorMessages: z.array(z.string()).optional(),
})

const syncResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  syncedAt: z.string(),
  durationMs: z.number(),
  statistics: z.object({
    totalRecords: z.number(),
    created: z.number(),
    updated: z.number(),
    skipped: z.number(),
    errors: z.number(),
  }),
  modules: z.array(moduleSyncStatsSchema),
})

const errorSchema = z.object({
  error: z.string(),
})

const syncRequestSchema = z.object({
  since: z.string().datetime().optional(),
  modules: z.array(z.string()).optional(),
  maxRecordsPerModule: z.number().optional(),
})

export const openApi: OpenApiRouteDoc = {
  tag: '4R Cargo Settings',
  summary: 'Trigger SugarCRM sync',
  methods: {
    POST: {
      summary: 'Trigger SugarCRM synchronization',
      description: 'Syncs data from SugarCRM to 4RCargo. Imports Accounts, Contacts, Opportunities, and configured custom modules.',
      requestBody: {
        contentType: 'application/json',
        schema: syncRequestSchema,
      },
      responses: [
        { status: 200, description: 'Sync completed', schema: syncResponseSchema },
        { status: 400, description: 'Sync failed or not configured', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
      ],
    },
  },
}
