import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { makeCrudRoute } from '@open-mercato/shared/lib/crud/factory'
import { FreighttechTrackingSettings } from '../../../data/entities'
import { freighttechSettingsUpsertSchema as freighttechSettingsSchema, type FreighttechSettingsUpsertInput as FreighttechSettingsInput } from '../../../data/validators'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { NextResponse } from 'next/server'
import { loadFreighttechTrackingSettings } from '../../../commands/freighttech/settings'
import { logInfo, logDebug, logWarn, logError, type TrackingLogContext } from '../../../lib/logger'

// Metadata with proper authentication and feature requirements
const routeMetadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_tracking.settings.view'] },
  PUT: { requireAuth: true, requireFeatures: ['fms_tracking.settings.manage'] },
}

// Create CRUD route using the factory pattern from shared module
const crud = makeCrudRoute<FreighttechSettingsInput, FreighttechSettingsInput, Record<string, unknown>>({
  metadata: routeMetadata,
  orm: {
    entity: FreighttechTrackingSettings,
    idField: 'id',
    orgField: 'organizationId',
    tenantField: 'tenantId',
    softDeleteField: null
  },
  actions: {
    update: {
      commandId: 'fms_tracking.freighttech.settings.save',
      schema: freighttechSettingsSchema,
      mapInput: ({ parsed, ctx }) => {
        // Add organization and tenant context to the input
        return {
          ...parsed,
          organizationId: ctx.selectedOrganizationId,
          tenantId: ctx.auth?.tenantId,
        }
      },
      response: ({ result }) => (result),
    },
  },
})

export async function GET(req: Request) {
  const start = performance.now()
  const baseLogCtx: TrackingLogContext = {}

  try {
    const container = await createRequestContainer()
    const auth = await getAuthFromRequest(req)
    const { translate } = await resolveTranslations()

    if (!auth || !auth.tenantId) {
      logWarn('settings:get:unauthorized', {}, baseLogCtx)
      throw new CrudHttpError(401, {
        error: translate('fms_tracking.settings.errors.unauthorized', 'Unauthorized')
      })
    }

    const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
    const organizationId = scope?.selectedId ?? auth.orgId ?? null
    if (!organizationId) {
      logWarn('settings:get:missing_organization', {}, { ...baseLogCtx, tenantId: auth.tenantId })
      throw new CrudHttpError(400, {
        error: translate('fms_tracking.settings.errors.organization_required', 'Organization context is required'),
      })
    }

    const logCtx: TrackingLogContext = { organizationId, tenantId: auth.tenantId }

    const em = container.resolve('em') as any
    const record = await loadFreighttechTrackingSettings(em, {
      tenantId: auth.tenantId,
      organizationId
    })

    const durationMs = Math.round(performance.now() - start)

    if (!record) {
      logDebug('settings:get:not_found', { durationMs }, logCtx)
      return NextResponse.json({
        apiKey: "",
        apiBaseUrl: "",
      })
    }

    logInfo('settings:get:success', { durationMs, hasApiKey: !!record.apiKey }, logCtx)
    return NextResponse.json({
      apiKey: record.apiKey ?? "",
      apiBaseUrl: record.apiBaseUrl ?? "",
    })
  } catch (err) {
    const durationMs = Math.round(performance.now() - start)

    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    const { translate } = await resolveTranslations()
    logError('settings:get:failed', err, { durationMs }, baseLogCtx)

    return NextResponse.json(
      { error: translate('fms_tracking.settings.errors.load') },
      { status: 400 }
    )
  }
}

// Export CRUD methods
export const PUT = crud.PUT

// OpenAPI documentation for the endpoint
const settingsResponseSchema = z.object({
  apiKey: z.string(),
  apiBaseUrl: z.string(),
})

const settingsErrorSchema = z.object({
  error: z.string(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Freighttech',
  summary: 'Freighttech Container Tracking settings',
  methods: {
    GET: {
      summary: 'Get tracking settings',
      description: 'Retrieve Freighttech tracking API settings for the current organization',
      responses: [
        { status: 200, description: 'Current settings', schema: settingsResponseSchema },
        { status: 401, description: 'Unauthorized', schema: settingsErrorSchema },
        { status: 400, description: 'Missing scope', schema: settingsErrorSchema },
      ],
    },
    PUT: {
      summary: 'Upsert settings',
      description: 'Upsert Freighttech tracking API settings for the current organization',
      requestBody: {
        contentType: 'application/json',
        schema: freighttechSettingsSchema,
      },
      responses: [
        { status: 200, description: 'Updated settings', schema: settingsResponseSchema },
        { status: 401, description: 'Unauthorized', schema: settingsErrorSchema },
        { status: 400, description: 'Invalid payload', schema: settingsErrorSchema },
      ],
    },
  },
}