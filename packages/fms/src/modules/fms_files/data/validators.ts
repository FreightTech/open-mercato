/**
 * FMS Files Module - Validation Schemas
 * Zod schemas for file entities (logistics industry term for active shipments)
 */

import { z } from 'zod'
import {
  FMS_FILE_STATUSES,
  TRANSPORT_MODES,
  CARGO_TYPES,
  CONTAINER_TYPES,
  SHIPMENT_TYPES,
  DIRECTIONS,
  INCOTERMS,
  WEIGHT_UNITS,
  VOLUME_UNITS,
  DIMENSION_UNITS,
  CURRENCY_CODES,
  CONTAINER_OWNERSHIP_TYPES,
  PACKAGING_TYPES,
  CARGO_READINESS_STATUSES,
} from './types'

// Helper schemas
const uuid = () => z.string().uuid()

const scoped = z.object({
  organizationId: uuid(),
  tenantId: uuid(),
})

const currencyCode = z
  .string()
  .trim()
  .regex(/^[A-Z]{3}$/, 'currency code must be a three-letter ISO code')

const decimal = (opts?: { min?: number; max?: number }) => {
  let schema = z.coerce.number()
  if (typeof opts?.min === 'number') schema = schema.min(opts.min)
  if (typeof opts?.max === 'number') schema = schema.max(opts.max)
  return schema
}

// ============================================================================
// FmsFile Schemas
// ============================================================================

export const fmsFileCreateSchema = scoped.extend({
  // Relationships
  clientId: uuid().optional().nullable(),
  offerId: uuid().optional().nullable(),
  quoteId: uuid().optional().nullable(),

  // Core file fields
  shipmentType: z.enum(SHIPMENT_TYPES),
  direction: z.enum(DIRECTIONS),
  cargoType: z.enum(CARGO_TYPES),
  incoterm: z.enum(INCOTERMS).optional().nullable(),

  // Locations
  originLocationId: uuid().optional().nullable(),
  destinationLocationId: uuid().optional().nullable(),
  originAddress: z.string().trim().max(500).optional().nullable(),
  destinationAddress: z.string().trim().max(500).optional().nullable(),

  // Dates
  fileDate: z.coerce.date().optional(),
  requestedPickupDate: z.coerce.date().optional().nullable(),
  requestedDeliveryDate: z.coerce.date().optional().nullable(),

  // References
  clientReference: z.string().trim().max(100).optional().nullable(),
  internalReference: z.string().trim().max(100).optional().nullable(),

  // Cargo details
  commodityDescription: z.string().trim().max(500).optional().nullable(),
  hsCode: z.string().trim().max(20).optional().nullable(),
  containerCount: z.coerce.number().int().min(1).optional().nullable(),

  // Total weights/volumes (aggregate from cargo/containers)
  totalGrossWeight: decimal({ min: 0 }).optional().nullable(),
  totalVolume: decimal({ min: 0 }).optional().nullable(),
  weightUnit: z.enum(WEIGHT_UNITS).optional().nullable(),
  volumeUnit: z.enum(VOLUME_UNITS).optional().nullable(),

  // Financial
  currencyCode: z.enum(CURRENCY_CODES).optional().default('USD'),
  estimatedCost: decimal({ min: 0 }).optional().nullable(),

  // Special requirements
  requiresInsurance: z.boolean().optional().default(false),
  requiresCustomsBrokerage: z.boolean().optional().default(false),
  isHazardous: z.boolean().optional().default(false),
  hazmatDetails: z.string().trim().max(1000).optional().nullable(),
  specialInstructions: z.string().trim().max(2000).optional().nullable(),

  // Internal notes
  internalNotes: z.string().trim().max(2000).optional().nullable(),

  // Workflow (optional - set by system)
  workflowInstanceId: uuid().optional().nullable(),
  currentStep: z.string().trim().max(100).optional().nullable(),
  workflowContext: z.record(z.string(), z.any()).optional().nullable(),
})

export const fmsFileUpdateSchema = z
  .object({
    id: uuid(),
  })
  .merge(fmsFileCreateSchema.omit({ organizationId: true, tenantId: true }).partial())

export type FmsFileCreateInput = z.infer<typeof fmsFileCreateSchema>
export type FmsFileUpdateInput = z.infer<typeof fmsFileUpdateSchema>

// ============================================================================
// FmsFileLeg Schemas
// ============================================================================

export const fmsFileLegCreateSchema = scoped.extend({
  fileId: uuid(),
  legSequence: z.coerce.number().int().positive(),
  transportMode: z.enum(TRANSPORT_MODES),

  // Locations
  originLocationId: uuid().optional().nullable(),
  destinationLocationId: uuid().optional().nullable(),
  originAddress: z.string().trim().max(500).optional().nullable(),
  destinationAddress: z.string().trim().max(500).optional().nullable(),

  // Carrier information
  carrierId: uuid().optional().nullable(),
  carrierName: z.string().trim().max(255).optional().nullable(),
  vesselName: z.string().trim().max(255).optional().nullable(),
  voyageNumber: z.string().trim().max(100).optional().nullable(),
  flightNumber: z.string().trim().max(100).optional().nullable(),

  // Dates
  estimatedDeparture: z.coerce.date().optional().nullable(),
  estimatedArrival: z.coerce.date().optional().nullable(),
  actualDeparture: z.coerce.date().optional().nullable(),
  actualArrival: z.coerce.date().optional().nullable(),

  // Financial
  estimatedCost: decimal({ min: 0 }).optional().nullable(),
  actualCost: decimal({ min: 0 }).optional().nullable(),

  // Notes
  notes: z.string().trim().max(1000).optional().nullable(),
})

export const fmsFileLegUpdateSchema = z
  .object({
    id: uuid(),
  })
  .merge(fmsFileLegCreateSchema.omit({ organizationId: true, tenantId: true, fileId: true }).partial())

export type FmsFileLegCreateInput = z.infer<typeof fmsFileLegCreateSchema>
export type FmsFileLegUpdateInput = z.infer<typeof fmsFileLegUpdateSchema>

// ============================================================================
// FmsFileContainer Schemas (FCL)
// ============================================================================

export const fmsFileContainerCreateSchema = scoped.extend({
  fileId: uuid(),
  containerType: z.enum(CONTAINER_TYPES),
  containerNumber: z.string().trim().max(100).optional().nullable(),
  sealNumber: z.string().trim().max(100).optional().nullable(),

  // Ownership
  ownershipType: z.enum(CONTAINER_OWNERSHIP_TYPES).optional().default('coc'),

  // Dimensions (optional override)
  length: decimal({ min: 0 }).optional().nullable(),
  width: decimal({ min: 0 }).optional().nullable(),
  height: decimal({ min: 0 }).optional().nullable(),
  dimensionUnit: z.enum(DIMENSION_UNITS).optional().nullable(),

  // Weight
  tareWeight: decimal({ min: 0 }).optional().nullable(),
  grossWeight: decimal({ min: 0 }).optional().nullable(),
  netWeight: decimal({ min: 0 }).optional().nullable(),
  weightUnit: z.enum(WEIGHT_UNITS).optional().nullable(),

  // Cargo details
  commodityDescription: z.string().trim().max(500).optional().nullable(),
  packageCount: z.coerce.number().int().min(1).optional().nullable(),

  // Special requirements
  isReefer: z.boolean().optional().default(false),
  temperatureMin: decimal().optional().nullable(),
  temperatureMax: decimal().optional().nullable(),
  temperatureUnit: z.enum(['C', 'F']).optional().nullable(),
  isHazardous: z.boolean().optional().default(false),
  hazmatClass: z.string().trim().max(50).optional().nullable(),
  unNumber: z.string().trim().max(50).optional().nullable(),

  // Tracking
  pickupDate: z.coerce.date().optional().nullable(),
  deliveryDate: z.coerce.date().optional().nullable(),
  status: z.enum(CARGO_READINESS_STATUSES).optional().default('not_ready'),

  // Notes
  notes: z.string().trim().max(1000).optional().nullable(),
})

export const fmsFileContainerUpdateSchema = z
  .object({
    id: uuid(),
  })
  .merge(fmsFileContainerCreateSchema.omit({ organizationId: true, tenantId: true, fileId: true }).partial())

export type FmsFileContainerCreateInput = z.infer<typeof fmsFileContainerCreateSchema>
export type FmsFileContainerUpdateInput = z.infer<typeof fmsFileContainerUpdateSchema>

// ============================================================================
// FmsFileCargo Schemas (LCL)
// ============================================================================

export const fmsFileCargoCreateSchema = scoped.extend({
  fileId: uuid(),
  cargoSequence: z.coerce.number().int().positive().optional(),

  // Description
  commodityDescription: z.string().trim().max(500),
  hsCode: z.string().trim().max(20).optional().nullable(),

  // Packaging
  packageType: z.enum(PACKAGING_TYPES),
  packageCount: z.coerce.number().int().min(1),
  marksAndNumbers: z.string().trim().max(255).optional().nullable(),

  // Dimensions per piece
  length: decimal({ min: 0 }).optional().nullable(),
  width: decimal({ min: 0 }).optional().nullable(),
  height: decimal({ min: 0 }).optional().nullable(),
  dimensionUnit: z.enum(DIMENSION_UNITS).optional().nullable(),

  // Weight
  grossWeight: decimal({ min: 0 }),
  netWeight: decimal({ min: 0 }).optional().nullable(),
  weightUnit: z.enum(WEIGHT_UNITS),

  // Volume
  volume: decimal({ min: 0 }).optional().nullable(),
  volumeUnit: z.enum(VOLUME_UNITS).optional().nullable(),

  // Special requirements
  isHazardous: z.boolean().optional().default(false),
  hazmatClass: z.string().trim().max(50).optional().nullable(),
  unNumber: z.string().trim().max(50).optional().nullable(),
  isStackable: z.boolean().optional().default(true),
  requiresRefrigeration: z.boolean().optional().default(false),
  temperatureMin: decimal().optional().nullable(),
  temperatureMax: decimal().optional().nullable(),
  temperatureUnit: z.enum(['C', 'F']).optional().nullable(),

  // Financial
  declaredValue: decimal({ min: 0 }).optional().nullable(),
  declaredValueCurrency: z.enum(CURRENCY_CODES).optional().nullable(),

  // Tracking
  status: z.enum(CARGO_READINESS_STATUSES).optional().default('not_ready'),

  // Notes
  notes: z.string().trim().max(1000).optional().nullable(),
})

export const fmsFileCargoUpdateSchema = z
  .object({
    id: uuid(),
  })
  .merge(fmsFileCargoCreateSchema.omit({ organizationId: true, tenantId: true, fileId: true }).partial())

export type FmsFileCargoCreateInput = z.infer<typeof fmsFileCargoCreateSchema>
export type FmsFileCargoUpdateInput = z.infer<typeof fmsFileCargoUpdateSchema>
