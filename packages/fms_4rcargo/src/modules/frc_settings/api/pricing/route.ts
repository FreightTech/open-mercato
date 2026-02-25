import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { FrcPricingConfig } from '../../data/entities'
import { pricingConfigUpdateSchema } from '../../data/validators'
import {
  loadPricingConfig,
  serializePricingConfig,
  DEFAULT_PRICING_CONFIG,
} from '../../lib/pricing-settings'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['frc_settings.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['frc_settings.manage'] },
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
 * Get pricing configuration.
 * Returns default values if no custom configuration exists.
 */
export async function GET(req: Request) {
  try {
    const { em, organizationId, tenantId } = await resolveRouteContext(req)

    const config = await loadPricingConfig(em, { organizationId, tenantId })

    return NextResponse.json({
      ...serializePricingConfig(config),
      isDefault: config === DEFAULT_PRICING_CONFIG,
    })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    const { translate } = await resolveTranslations()
    console.error('frc_settings.pricing.get failed', err)
    return NextResponse.json(
      { error: translate('frc_settings.pricing.errors.load', 'Failed to load pricing settings') },
      { status: 400 }
    )
  }
}

/**
 * Update pricing configuration.
 * Creates a new config if none exists (upsert pattern).
 */
export async function PUT(req: Request) {
  try {
    const { em, translate, organizationId, tenantId } = await resolveRouteContext(req)
    const payload = await req.json().catch(() => ({}))

    const input = pricingConfigUpdateSchema.parse({
      ...payload,
      organizationId,
      tenantId,
    })

    let config = await em.findOne(FrcPricingConfig, {
      organizationId,
      tenantId,
    })

    if (!config) {
      // Create new config with provided values (or defaults)
      config = em.create(FrcPricingConfig, {
        organizationId,
        tenantId,
        airVolumetricFactor: input.airVolumetricFactor ?? DEFAULT_PRICING_CONFIG.airVolumetricFactor,
        seaVolumetricFactor: input.seaVolumetricFactor ?? DEFAULT_PRICING_CONFIG.seaVolumetricFactor,
        roadVolumetricFactor: input.roadVolumetricFactor ?? DEFAULT_PRICING_CONFIG.roadVolumetricFactor,
        truckWidthMetres: input.truckWidthMetres ?? DEFAULT_PRICING_CONFIG.truckWidthMetres,
        minChargeableWeightKg: input.minChargeableWeightKg ?? null,
      })
      em.persist(config)
    } else {
      // Update existing config with provided values
      if (input.airVolumetricFactor !== undefined) config.airVolumetricFactor = input.airVolumetricFactor
      if (input.seaVolumetricFactor !== undefined) config.seaVolumetricFactor = input.seaVolumetricFactor
      if (input.roadVolumetricFactor !== undefined) config.roadVolumetricFactor = input.roadVolumetricFactor
      if (input.truckWidthMetres !== undefined) config.truckWidthMetres = input.truckWidthMetres
      if (input.minChargeableWeightKg !== undefined) config.minChargeableWeightKg = input.minChargeableWeightKg ?? null
      config.updatedAt = new Date()
    }

    await em.flush()

    return NextResponse.json({
      ...serializePricingConfig(config),
      isDefault: false,
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
    console.error('frc_settings.pricing.put failed', err)
    return NextResponse.json(
      { error: translate('frc_settings.pricing.errors.save', 'Failed to save pricing settings') },
      { status: 400 }
    )
  }
}

// OpenAPI schemas
const pricingConfigResponseSchema = z.object({
  airVolumetricFactor: z.string(),
  seaVolumetricFactor: z.string(),
  roadVolumetricFactor: z.string(),
  truckWidthMetres: z.string(),
  minChargeableWeightKg: z.string().nullable(),
  isDefault: z.boolean(),
})

const errorSchema = z.object({
  error: z.string(),
})

export const openApi: OpenApiRouteDoc = {
  tag: '4R Cargo Settings',
  summary: 'Pricing configuration',
  methods: {
    GET: {
      summary: 'Get pricing settings',
      description: 'Returns volumetric conversion factors and other pricing settings. Returns defaults if no custom configuration exists.',
      responses: [
        { status: 200, description: 'Pricing configuration', schema: pricingConfigResponseSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
      ],
    },
    PUT: {
      summary: 'Update pricing settings',
      description: 'Updates pricing configuration. Creates new config if none exists.',
      requestBody: {
        contentType: 'application/json',
        schema: pricingConfigUpdateSchema.omit({ organizationId: true, tenantId: true }),
      },
      responses: [
        { status: 200, description: 'Updated pricing configuration', schema: pricingConfigResponseSchema },
        { status: 400, description: 'Invalid payload', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
      ],
    },
  },
}
