import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { SugarCrmApiClient } from '../../../../lib/sugarcrm-client'
import { getSugarCrmConfig } from '../../../../lib/sugarcrm-env'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['frc_settings.integrations'] },
}

async function resolveRouteContext(req: Request) {
  const container = await createRequestContainer()
  const auth = await getAuthFromRequest(req)
  const { translate } = await resolveTranslations()

  if (!auth || !auth.tenantId) {
    throw new CrudHttpError(401, { error: translate('frc_settings.errors.unauthorized', 'Unauthorized') })
  }

  return { translate }
}

/**
 * Test SugarCRM connection using credentials from environment variables
 */
export async function POST(req: Request) {
  try {
    const { translate } = await resolveRouteContext(req)

    // Get credentials from environment variables
    const envConfig = getSugarCrmConfig()

    if (!envConfig) {
      throw new CrudHttpError(400, {
        error: translate(
          'frc_settings.integrations.sugarcrm.errors.env_not_configured',
          'SugarCRM credentials are not configured. Please set SUGARCRM_INSTANCE_URL, SUGARCRM_USERNAME, and SUGARCRM_PASSWORD environment variables.'
        ),
      })
    }

    // Create client and test connection
    const client = new SugarCrmApiClient({
      instanceUrl: envConfig.instanceUrl,
      username: envConfig.username,
      password: envConfig.password,
      platform: envConfig.platform,
    })

    const result = await client.testConnection()

    // Clean up - logout to invalidate tokens
    await client.logout()

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message,
        userInfo: result.userInfo
          ? {
              id: result.userInfo.id,
              userName: result.userInfo.user_name,
              fullName: result.userInfo.full_name,
              email: result.userInfo.email1,
            }
          : undefined,
      })
    } else {
      return NextResponse.json(
        {
          success: false,
          message: result.message,
        },
        { status: 400 }
      )
    }
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    const { translate } = await resolveTranslations()
    console.error('frc_settings.sugarcrm.test failed', err)
    return NextResponse.json(
      {
        success: false,
        message:
          err instanceof Error
            ? err.message
            : translate('frc_settings.integrations.sugarcrm.errors.test_failed', 'Connection test failed'),
      },
      { status: 400 }
    )
  }
}

const testResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  userInfo: z
    .object({
      id: z.string(),
      userName: z.string().optional(),
      fullName: z.string().optional(),
      email: z.string().optional(),
    })
    .optional(),
})

const errorSchema = z.object({
  success: z.boolean(),
  message: z.string(),
})

export const openApi: OpenApiRouteDoc = {
  tag: '4R Cargo Settings',
  summary: 'Test SugarCRM connection',
  methods: {
    POST: {
      summary: 'Test SugarCRM connection',
      description:
        'Tests the connection to SugarCRM using credentials from environment variables (SUGARCRM_INSTANCE_URL, SUGARCRM_USERNAME, SUGARCRM_PASSWORD).',
      responses: [
        { status: 200, description: 'Connection test result', schema: testResponseSchema },
        { status: 400, description: 'Connection failed or not configured', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
      ],
    },
  },
}
