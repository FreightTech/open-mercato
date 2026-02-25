import { registerCommand } from '@open-mercato/shared/lib/commands'
import type { CommandHandler, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { ensureOrganizationScope } from '@open-mercato/shared/lib/commands/scope'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { emitCrudSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { FrcAirCargo } from '../../frc_rfqs/data/entities'
import {
  createAirCargoSchema,
  updateAirCargoSchema,
  type CreateAirCargoInput,
  type UpdateAirCargoInput,
} from '../data/validators'
import type { PricingParams } from '../../frc_settings/lib/pricing-settings'

// Default values (used when no pricing params are provided)
const DEFAULT_VOLUMETRIC_FACTOR = 167
const DEFAULT_TRUCK_WIDTH = 2.4

/**
 * Input for cargo dimensions and weight.
 */
export interface CargoInput {
  numberOfPieces?: number
  lengthCm?: string | null
  widthCm?: string | null
  heightCm?: string | null
  actualWeightKg?: string
}

/**
 * Computed output fields.
 */
export interface ComputedCargoFields {
  volumeM3: string
  chargeableWeightKg: string
  loadingMetres: string
}

/**
 * Calculate computed fields for cargo:
 * - volume_m3 = (length * width * height * pieces) / 1,000,000 (cm³ to m³)
 * - chargeable_weight_kg = max(actual_weight_kg, volumetric_weight)
 * - loading_metres = (length * width * pieces) / 10000 / truck_width
 *
 * Uses pricing params from settings if provided, otherwise uses defaults.
 * Volumetric weight = volume (m³) × volumetric factor
 *
 * @param input - Cargo dimensions and weight
 * @param pricing - Optional pricing params from settings (conversion factors)
 */
export function calculateComputedFields(
  input: CargoInput,
  pricing?: PricingParams
): ComputedCargoFields {
  const pieces = input.numberOfPieces ?? 1
  const length = parseFloat(input.lengthCm ?? '0') || 0
  const width = parseFloat(input.widthCm ?? '0') || 0
  const height = parseFloat(input.heightCm ?? '0') || 0
  const actualWeight = parseFloat(input.actualWeightKg ?? '0') || 0

  // Use pricing params or defaults
  const volumetricFactor = pricing?.volumetricFactor ?? DEFAULT_VOLUMETRIC_FACTOR
  const truckWidth = pricing?.truckWidthMetres ?? DEFAULT_TRUCK_WIDTH
  const minChargeableWeight = pricing?.minChargeableWeightKg ?? null

  // Volume in cubic meters (per piece * pieces)
  const volumeM3 = (length * width * height * pieces) / 1_000_000

  // Volumetric weight using configurable factor
  const volumetricWeight = volumeM3 * volumetricFactor

  // Chargeable weight is the greater of actual or volumetric
  let chargeableWeight = Math.max(actualWeight * pieces, volumetricWeight)

  // Apply minimum chargeable weight if configured
  if (minChargeableWeight !== null && chargeableWeight < minChargeableWeight) {
    chargeableWeight = minChargeableWeight
  }

  // Loading metres calculation using configurable truck width
  const loadingMetres = (length * width * pieces) / 10_000 / truckWidth

  return {
    volumeM3: volumeM3.toFixed(4),
    chargeableWeightKg: chargeableWeight.toFixed(4),
    loadingMetres: loadingMetres.toFixed(4),
  }
}

type ScopedCreateInput = CreateAirCargoInput & {
  organizationId: string
  tenantId: string
}

type ScopedUpdateInput = UpdateAirCargoInput & {
  id: string
  organizationId?: string
  tenantId?: string
}

function ensureTenantScope(ctx: CommandRuntimeContext, tenantId: string): void {
  const auth = ctx.auth
  if (!auth || !auth.tenantId || auth.tenantId !== tenantId) {
    throw new CrudHttpError(403, { error: 'Tenant scope mismatch' })
  }
}

const createAirCargoCommand: CommandHandler<ScopedCreateInput, { airCargoId: string }> = {
  id: 'air_cargo.create',
  async execute(rawInput, ctx) {
    const parsed = createAirCargoSchema.parse(rawInput)
    const organizationId = rawInput.organizationId
    const tenantId = rawInput.tenantId

    if (!organizationId || !tenantId) {
      throw new CrudHttpError(400, { error: 'organizationId and tenantId are required' })
    }

    ensureTenantScope(ctx, tenantId)
    ensureOrganizationScope(ctx, organizationId)

    const em = (ctx.container.resolve('em') as EntityManager).fork()

    // Calculate computed fields
    const computed = calculateComputedFields({
      numberOfPieces: parsed.numberOfPieces,
      lengthCm: parsed.lengthCm,
      widthCm: parsed.widthCm,
      heightCm: parsed.heightCm,
      actualWeightKg: parsed.actualWeightKg,
    })

    const now = new Date()
    const airCargo = em.create(FrcAirCargo, {
      organizationId,
      tenantId,
      rfq: parsed.rfqId ?? null,
      name: parsed.name,
      numberOfPieces: parsed.numberOfPieces ?? 1,
      stackableType: parsed.stackableType ?? 'fully_stackable',
      lengthCm: parsed.lengthCm ?? null,
      widthCm: parsed.widthCm ?? null,
      heightCm: parsed.heightCm ?? null,
      actualWeightKg: parsed.actualWeightKg ?? '0',
      volumeM3: computed.volumeM3,
      chargeableWeightKg: computed.chargeableWeightKg,
      loadingMetres: computed.loadingMetres,
      createdAt: now,
      updatedAt: now,
    })

    em.persist(airCargo)
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'created',
      entity: airCargo,
      identifiers: { id: airCargo.id, tenantId, organizationId },
      indexer: { entityType: 'air_cargo:frc_air_cargo' },
    })

    return { airCargoId: airCargo.id }
  },
}

const updateAirCargoCommand: CommandHandler<ScopedUpdateInput, { airCargoId: string }> = {
  id: 'air_cargo.update',
  async execute(rawInput, ctx) {
    const parsed = updateAirCargoSchema.parse(rawInput)
    const id = rawInput.id

    if (!id) {
      throw new CrudHttpError(400, { error: 'Air cargo id is required' })
    }

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const airCargo = await em.findOne(FrcAirCargo, { id, deletedAt: null })

    if (!airCargo) {
      throw new CrudHttpError(404, { error: 'Air cargo not found' })
    }

    ensureTenantScope(ctx, airCargo.tenantId)
    ensureOrganizationScope(ctx, airCargo.organizationId)

    // Update editable fields
    if (parsed.name !== undefined) airCargo.name = parsed.name
    if (parsed.rfqId !== undefined) {
      // Update RFQ reference - need to handle the relation properly
      if (parsed.rfqId === null) {
        airCargo.rfq = null
      } else {
        // We only set the rfq_id field via raw, ORM handles the rest
        (airCargo as any).rfq = parsed.rfqId
      }
    }
    if (parsed.numberOfPieces !== undefined) airCargo.numberOfPieces = parsed.numberOfPieces
    if (parsed.stackableType !== undefined) airCargo.stackableType = parsed.stackableType
    if (parsed.lengthCm !== undefined) airCargo.lengthCm = parsed.lengthCm ?? null
    if (parsed.widthCm !== undefined) airCargo.widthCm = parsed.widthCm ?? null
    if (parsed.heightCm !== undefined) airCargo.heightCm = parsed.heightCm ?? null
    if (parsed.actualWeightKg !== undefined) airCargo.actualWeightKg = parsed.actualWeightKg ?? '0'

    // Recalculate computed fields
    const computed = calculateComputedFields({
      numberOfPieces: airCargo.numberOfPieces,
      lengthCm: airCargo.lengthCm,
      widthCm: airCargo.widthCm,
      heightCm: airCargo.heightCm,
      actualWeightKg: airCargo.actualWeightKg,
    })

    airCargo.volumeM3 = computed.volumeM3
    airCargo.chargeableWeightKg = computed.chargeableWeightKg
    airCargo.loadingMetres = computed.loadingMetres

    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'updated',
      entity: airCargo,
      identifiers: { id: airCargo.id, tenantId: airCargo.tenantId, organizationId: airCargo.organizationId },
      indexer: { entityType: 'air_cargo:frc_air_cargo' },
    })

    return { airCargoId: airCargo.id }
  },
}

const deleteAirCargoCommand: CommandHandler<{ id: string }, { airCargoId: string }> = {
  id: 'air_cargo.delete',
  async execute(rawInput, ctx) {
    const id = rawInput.id

    if (!id) {
      throw new CrudHttpError(400, { error: 'Air cargo id is required' })
    }

    const em = (ctx.container.resolve('em') as EntityManager).fork()
    const airCargo = await em.findOne(FrcAirCargo, { id, deletedAt: null })

    if (!airCargo) {
      throw new CrudHttpError(404, { error: 'Air cargo not found' })
    }

    ensureTenantScope(ctx, airCargo.tenantId)
    ensureOrganizationScope(ctx, airCargo.organizationId)

    airCargo.deletedAt = new Date()
    await em.flush()

    const de = ctx.container.resolve('dataEngine') as DataEngine
    await emitCrudSideEffects({
      dataEngine: de,
      action: 'deleted',
      entity: airCargo,
      identifiers: { id: airCargo.id, tenantId: airCargo.tenantId, organizationId: airCargo.organizationId },
      indexer: { entityType: 'air_cargo:frc_air_cargo' },
    })

    return { airCargoId: airCargo.id }
  },
}

registerCommand(createAirCargoCommand)
registerCommand(updateAirCargoCommand)
registerCommand(deleteAirCargoCommand)
