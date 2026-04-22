import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { decodeWebhookToken } from '../../../lib/webhookToken'
import { ScopedWebhookInput, freighttechWebhookSchema } from '../../../data/validators'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { EntityManager } from '@mikro-orm/postgresql'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { withScopedPayload } from '@open-mercato/shared/lib/api/scoped'
import { logInfo, logDebug, logWarn, logError, type TrackingLogContext } from '../../../lib/logger'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['fms_tracking.freighttech.webhook'] },
}

type RouteContext = {
  ctx: CommandRuntimeContext
  em: EntityManager
  translate: (key: string, fallback?: string) => string
  logCtx: TrackingLogContext
}

async function resolveWebhookContext(req: Request): Promise<RouteContext> {
  const container = await createRequestContainer()
  const url = new URL(req.url)
  const token = url.searchParams.get('token')

  const baseLogCtx: TrackingLogContext = {}

  if (!token) {
    logWarn('webhook:missing_token', {}, baseLogCtx)
    throw new CrudHttpError(401, { error: 'Missing token' })
  }

  const decoded = decodeWebhookToken(token)
  if (!decoded) {
    logWarn('webhook:invalid_token', {}, baseLogCtx)
    throw new CrudHttpError(401, { error: 'Invalid token' })
  }

  const { organizationId, tenantId } = decoded
  const logCtx: TrackingLogContext = { organizationId, tenantId }

  const auth = await getAuthFromRequest(req)
  if (!auth || !organizationId || !tenantId) {
    logWarn('webhook:unauthorized', { hasAuth: !!auth }, logCtx)
    throw new CrudHttpError(401, { error: 'Unauthorized' })
  }
  auth.orgId = organizationId
  auth.tenantId = tenantId

  logDebug('webhook:token_valid', {}, logCtx)

  const { translate } = await resolveTranslations()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const ctx: CommandRuntimeContext = {
    container,
    auth,
    organizationScope: scope,
    selectedOrganizationId: organizationId,
    organizationIds: scope?.filterIds ?? (auth.orgId ? [auth.orgId] : null),
    request: req,
  }
  const em = container.resolve('em') as EntityManager

  return {
    ctx,
    em,
    translate,
    logCtx,
  }
}

export async function POST(req: Request) {
  const start = performance.now()
  const baseLogCtx: TrackingLogContext = {}

  logInfo('webhook:received', {}, baseLogCtx)

  try {
    const { ctx, translate, logCtx } = await resolveWebhookContext(req)

    const payload = await req.json().catch(() => ({}))
    const data = freighttechWebhookSchema.parse(payload)
    const input = withScopedPayload({ data }, ctx, translate) as ScopedWebhookInput

    logDebug('webhook:payload_parsed', {
      referenceId: data.reference_id,
      status: data.status,
    }, logCtx)

    const commandBus = ctx.container.resolve('commandBus') as CommandBus
    await commandBus.execute('fms_tracking.freighttech.webhook', { input, ctx })

    const durationMs = Math.round(performance.now() - start)
    logInfo('webhook:processed', { durationMs }, logCtx)

    return NextResponse.json({})
  } catch (err) {
    const durationMs = Math.round(performance.now() - start)

    if (err instanceof CrudHttpError) {
      logWarn('webhook:client_error', { status: err.status, durationMs }, baseLogCtx)
      return NextResponse.json(err.body, { status: err.status })
    }

    logError('webhook:failed', err, { durationMs }, baseLogCtx)
    return NextResponse.json(
      { error: "INTERNAL_SERVER_ERROR" },
      { status: 500 }
    )
  }
}

const successSchema = z.object({})

const errorSchema = z.object({
  error: z.string(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Freighttech',
  summary: 'Freighttech Container Tracking webhook',
  methods: {
    POST: {
      summary: 'Push container data',
      requestBody: {
        contentType: 'application/json',
        schema: freighttechWebhookSchema,
      },
      responses: [
        { status: 200, description: 'Received data', schema: successSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 400, description: 'Invalid payload', schema: errorSchema },
        { status: 500, description: 'Server error', schema: errorSchema },
      ],
    },
  },
}
