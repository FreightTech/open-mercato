import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { EntityManager } from '@mikro-orm/postgresql'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { FrcCarrierPricingConfig } from '../../../data/entities'
import { carrierPricingConfigCreateSchema, transportModeSchema } from '../../../data/validators'
import { serializeCarrierPricingConfig } from '../../../lib/pricing-settings'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['frc_settings.manage'] },
  POST: { requireAuth: true, requireFeatures: ['frc_settings.manage'] },
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
 * List all carrier pricing overrides.
 */
export async function GET(req: Request) {
  try {
    const { em, organizationId, tenantId } = await resolveRouteContext(req)

    const configs = await em.find(
      FrcCarrierPricingConfig,
      { organizationId, tenantId },
      { orderBy: { carrierName: 'ASC' } }
    )

    return NextResponse.json({
      items: configs.map(serializeCarrierPricingConfig),
      total: configs.length,
    })
  } catch (err) {
    if (err instanceof CrudHttpError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    const { translate } = await resolveTranslations()
    console.error('frc_settings.pricing.carriers.list failed', err)
    return NextResponse.json(
      { error: translate('frc_settings.pricing.carriers.errors.load', 'Failed to load carrier pricing overrides') },
      { status: 400 }
    )
  }
}

/**
 * Create a new carrier pricing override.
 */
export async function POST(req: Request) {
  try {
    const { em, translate, organizationId, tenantId } = await resolveRouteContext(req)
    const payload = await req.json().catch(() => ({}))

    const input = carrierPricingConfigCreateSchema.parse({
      ...payload,
      organizationId,
      tenantId,
    })

    // Check if override already exists for this carrier
    const existing = await em.findOne(FrcCarrierPricingConfig, {
      organizationId,
      tenantId,
      carrierId: input.carrierId,
    })

    if (existing) {
      return NextResponse.json(
        {
          error: translate(
            'frc_settings.pricing.carriers.errors.already_exists',
            'Pricing override already exists for this carrier'
          ),
        },
        { status: 409 }
      )
    }

    const config = em.create(FrcCarrierPricingConfig, {
      organizationId,
      tenantId,
      carrierId: input.carrierId,
      carrierName: input.carrierName,
      transportMode: input.transportMode,
      volumetricFactor: input.volumetricFactor ?? null,
      minChargeableWeightKg: input.minChargeableWeightKg ?? null,
    })
    em.persist(config)

    await em.flush()

    return NextResponse.json(serializeCarrierPricingConfig(config), { status: 201 })
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
    console.error('frc_settings.pricing.carriers.create failed', err)
    return NextResponse.json(
      { error: translate('frc_settings.pricing.carriers.errors.create', 'Failed to create carrier pricing override') },
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

const carrierPricingListSchema = z.object({
  items: z.array(carrierPricingConfigSchema),
  total: z.number(),
})

const errorSchema = z.object({
  error: z.string(),
})

export const openApi: OpenApiRouteDoc = {
  tag: '4R Cargo Settings',
  summary: 'Carrier pricing overrides',
  methods: {
    GET: {
      summary: 'List carrier pricing overrides',
      description: 'Returns all carrier-specific pricing overrides.',
      responses: [
        { status: 200, description: 'List of carrier pricing overrides', schema: carrierPricingListSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
      ],
    },
    POST: {
      summary: 'Create carrier pricing override',
      description: 'Creates a new pricing override for a specific carrier.',
      requestBody: {
        contentType: 'application/json',
        schema: carrierPricingConfigCreateSchema.omit({ organizationId: true, tenantId: true }),
      },
      responses: [
        { status: 201, description: 'Created carrier pricing override', schema: carrierPricingConfigSchema },
        { status: 400, description: 'Invalid payload', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 409, description: 'Override already exists', schema: errorSchema },
      ],
    },
  },
}
