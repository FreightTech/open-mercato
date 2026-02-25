import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { FrcCarrierPricingConfig } from '../../../../data/entities'
import { carrierPricingConfigUpdateSchema, transportModeSchema } from '../../../../data/validators'
import { serializeCarrierPricingConfig } from '../../../../lib/pricing-settings'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['frc_settings.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['frc_settings.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['frc_settings.manage'] },
}

type RouteContext = {
  em: EntityManager
  translate: (key: string, fallback?: string) => string
  organizationId: string
  tenantId: string
  carrierId: string
}

async function resolveRouteContext(
  req: Request,
  params: { carrierId: string }
): Promise<RouteContext> {
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

  return { em, translate, tenantId, organizationId, carrierId: params.carrierId }
}

/**
 * Get a specific carrier pricing override.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ carrierId: string }> }
) {
  try {
    const resolvedParams = await params
    const { em, translate, organizationId, tenantId, carrierId } = await resolveRouteContext(req, resolvedParams)

    const config = await em.findOne(FrcCarrierPricingConfig, {
      organizationId,
      tenantId,
      carrierId,
    })

    if (!config) {
      return NextResponse.json(
        { error: translate('frc_settings.pricing.carriers.errors.not_found', 'Carrier pricing override not found') },
        { status: 404 }
      )
    }

    return NextResponse.json(serializeCarrierPricingConfig(config))
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    const { translate } = await resolveTranslations()
    console.error('frc_settings.pricing.carriers.get failed', err)
    return NextResponse.json(
      { error: translate('frc_settings.pricing.carriers.errors.load', 'Failed to load carrier pricing override') },
      { status: 400 }
    )
  }
}

/**
 * Update a carrier pricing override.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ carrierId: string }> }
) {
  try {
    const resolvedParams = await params
    const { em, translate, organizationId, tenantId, carrierId } = await resolveRouteContext(req, resolvedParams)
    const payload = await req.json().catch(() => ({}))

    const input = carrierPricingConfigUpdateSchema.parse(payload)

    const config = await em.findOne(FrcCarrierPricingConfig, {
      organizationId,
      tenantId,
      carrierId,
    })

    if (!config) {
      return NextResponse.json(
        { error: translate('frc_settings.pricing.carriers.errors.not_found', 'Carrier pricing override not found') },
        { status: 404 }
      )
    }

    // Update provided fields
    if (input.transportMode !== undefined) config.transportMode = input.transportMode
    if (input.volumetricFactor !== undefined) config.volumetricFactor = input.volumetricFactor ?? null
    if (input.minChargeableWeightKg !== undefined) config.minChargeableWeightKg = input.minChargeableWeightKg ?? null
    config.updatedAt = new Date()

    await em.flush()

    return NextResponse.json(serializeCarrierPricingConfig(config))
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
    console.error('frc_settings.pricing.carriers.update failed', err)
    return NextResponse.json(
      { error: translate('frc_settings.pricing.carriers.errors.update', 'Failed to update carrier pricing override') },
      { status: 400 }
    )
  }
}

/**
 * Delete a carrier pricing override.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ carrierId: string }> }
) {
  try {
    const resolvedParams = await params
    const { em, translate, organizationId, tenantId, carrierId } = await resolveRouteContext(req, resolvedParams)

    const config = await em.findOne(FrcCarrierPricingConfig, {
      organizationId,
      tenantId,
      carrierId,
    })

    if (!config) {
      return NextResponse.json(
        { error: translate('frc_settings.pricing.carriers.errors.not_found', 'Carrier pricing override not found') },
        { status: 404 }
      )
    }

    await em.removeAndFlush(config)

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    const { translate } = await resolveTranslations()
    console.error('frc_settings.pricing.carriers.delete failed', err)
    return NextResponse.json(
      { error: translate('frc_settings.pricing.carriers.errors.delete', 'Failed to delete carrier pricing override') },
      { status: 400 }
    )
  }
}

// OpenAPI schemas
const carrierPricingConfigSchema = z.object({
  id: z.string().uuid(),
  carrierId: z.string().uuid(),
  carrierName: z.string(),
  transportMode: transportModeSchema,
  volumetricFactor: z.string().nullable(),
  minChargeableWeightKg: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const errorSchema = z.object({
  error: z.string(),
})

const successSchema = z.object({
  success: z.boolean(),
})

export const openApi: OpenApiRouteDoc = {
  tag: '4R Cargo Settings',
  summary: 'Carrier pricing override by carrier ID',
  methods: {
    GET: {
      summary: 'Get carrier pricing override',
      description: 'Returns pricing override for a specific carrier.',
      responses: [
        { status: 200, description: 'Carrier pricing override', schema: carrierPricingConfigSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
    PUT: {
      summary: 'Update carrier pricing override',
      description: 'Updates pricing override for a specific carrier.',
      requestBody: {
        contentType: 'application/json',
        schema: carrierPricingConfigUpdateSchema,
      },
      responses: [
        { status: 200, description: 'Updated carrier pricing override', schema: carrierPricingConfigSchema },
        { status: 400, description: 'Invalid payload', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
    DELETE: {
      summary: 'Delete carrier pricing override',
      description: 'Removes pricing override for a specific carrier.',
      responses: [
        { status: 200, description: 'Successfully deleted', schema: successSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
  },
}
