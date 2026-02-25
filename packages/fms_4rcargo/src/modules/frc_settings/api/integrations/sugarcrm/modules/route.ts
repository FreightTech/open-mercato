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
  GET: { requireAuth: true, requireFeatures: ['frc_settings.integrations'] },
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

/** Modules that we know how to map to 4RCargo entities */
const MAPPABLE_MODULES: Record<string, { targetEntity: string; description: string; label?: string }> = {
  // Built-in SugarCRM modules
  Accounts: { targetEntity: 'Contractor', description: 'Client/Customer companies' },
  Contacts: { targetEntity: 'ContractorContact', description: 'People at client companies' },
  Opportunities: { targetEntity: 'FrcRfq', description: 'Sales opportunities / RFQs' },

  // Custom SugarCRM modules (ev_*) - with friendly labels
  ev_Trucks: { targetEntity: 'FrcTruck', description: 'Trucks', label: 'Trucks' },
  ev_ShipmentDetails: { targetEntity: 'FrcAirCargo', description: 'Shipment cargo details', label: 'Shipment Details' },
  ev_Quotes: { targetEntity: 'FrcOffer', description: 'Quotes/Offers (creates Project if Booked)', label: 'Quotes' },
  ev_RoutingDetails: { targetEntity: 'FrcAirRouting', description: 'Flight routing legs', label: 'Routing Details' },
}

/**
 * Get available SugarCRM modules that can be synced
 */
export async function GET(req: Request) {
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

    const client = new SugarCrmApiClient({
      instanceUrl: envConfig.instanceUrl,
      username: envConfig.username,
      password: envConfig.password,
      platform: envConfig.platform,
    })

    try {
      const sugarModules = await client.getModules()

      // Map to response format, indicating which modules we can map
      const modules = sugarModules.map((m) => {
        const mappable = MAPPABLE_MODULES[m.name]
        // Use our friendly label if SugarCRM doesn't provide one or it matches the API name
        const label = (m.label && m.label !== m.name) ? m.label : (mappable?.label || m.name)
        return {
          name: m.name,
          label,
          labelPlural: m.label_plural || label,
          isMappable: !!mappable,
          targetEntity: mappable?.targetEntity ?? null,
          description: mappable?.description ?? null,
        }
      })

      // Sort: mappable modules first, then alphabetically
      modules.sort((a, b) => {
        if (a.isMappable !== b.isMappable) return a.isMappable ? -1 : 1
        return (a.label || '').localeCompare(b.label || '')
      })

      await client.logout()

      return NextResponse.json({
        modules,
        totalCount: modules.length,
        mappableCount: modules.filter((m) => m.isMappable).length,
      })
    } catch (apiError) {
      await client.logout().catch(() => {})
      throw apiError
    }
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    const { translate } = await resolveTranslations()
    console.error('frc_settings.sugarcrm.modules failed', err)
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : translate('frc_settings.integrations.sugarcrm.errors.modules_failed', 'Failed to fetch modules'),
      },
      { status: 400 }
    )
  }
}

const moduleSchema = z.object({
  name: z.string(),
  label: z.string(),
  labelPlural: z.string(),
  isMappable: z.boolean(),
  targetEntity: z.string().nullable(),
  description: z.string().nullable(),
})

const modulesResponseSchema = z.object({
  modules: z.array(moduleSchema),
  totalCount: z.number(),
  mappableCount: z.number(),
})

const errorSchema = z.object({
  error: z.string(),
})

export const openApi: OpenApiRouteDoc = {
  tag: '4R Cargo Settings',
  summary: 'List SugarCRM modules',
  methods: {
    GET: {
      summary: 'Get available SugarCRM modules',
      description: 'Fetches the list of modules from the connected SugarCRM instance, indicating which ones can be mapped to 4RCargo entities.',
      responses: [
        { status: 200, description: 'List of SugarCRM modules', schema: modulesResponseSchema },
        { status: 400, description: 'Failed to fetch modules', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
      ],
    },
  },
}
