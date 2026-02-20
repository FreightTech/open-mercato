import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { FrcSugarCrmConfig } from '../../../../data/entities'

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
 * Dummy sync endpoint - simulates a successful sync
 * In the future, this will trigger actual SugarCRM synchronization
 */
export async function POST(req: Request) {
  try {
    const { em, translate, organizationId, tenantId } = await resolveRouteContext(req)

    const config = await em.findOne(FrcSugarCrmConfig, {
      organizationId,
      tenantId,
    })

    if (!config) {
      throw new CrudHttpError(400, {
        error: translate(
          'frc_settings.integrations.sugarcrm.errors.not_configured',
          'SugarCRM integration is not configured'
        ),
      })
    }

    if (!config.isEnabled) {
      throw new CrudHttpError(400, {
        error: translate(
          'frc_settings.integrations.sugarcrm.errors.not_enabled',
          'SugarCRM integration is not enabled'
        ),
      })
    }

    // Simulate a successful sync (dummy implementation)
    // In the future, this would:
    // 1. Connect to SugarCRM API
    // 2. Fetch customers, contacts, offer history
    // 3. Sync data to local database
    // 4. Return sync statistics

    // Update sync status
    config.lastSyncAt = new Date()
    config.lastSyncStatus = 'success'
    config.lastSyncMessage = 'Sync completed successfully (demo mode)'

    await em.flush()

    return NextResponse.json({
      success: true,
      message: translate(
        'frc_settings.integrations.sugarcrm.messages.sync_completed',
        'Sync completed successfully'
      ),
      syncedAt: config.lastSyncAt.toISOString(),
      // Dummy statistics
      statistics: {
        customersImported: 0,
        contactsImported: 0,
        offersExported: 0,
      },
      notice: 'This is a demo mode. Full SugarCRM integration will be available in a future update.',
    })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    const { translate } = await resolveTranslations()
    console.error('frc_settings.sugarcrm.sync failed', err)
    return NextResponse.json(
      { error: translate('frc_settings.integrations.sugarcrm.messages.sync_failed', 'Sync failed') },
      { status: 400 }
    )
  }
}

const syncResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  syncedAt: z.string(),
  statistics: z.object({
    customersImported: z.number(),
    contactsImported: z.number(),
    offersExported: z.number(),
  }),
  notice: z.string().optional(),
})

const errorSchema = z.object({
  error: z.string(),
})

export const openApi: OpenApiRouteDoc = {
  tag: '4R Cargo Settings',
  summary: 'Trigger SugarCRM sync',
  methods: {
    POST: {
      summary: 'Trigger SugarCRM synchronization',
      responses: [
        { status: 200, description: 'Sync completed', schema: syncResponseSchema },
        { status: 400, description: 'Sync failed or not configured', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
      ],
    },
  },
}
