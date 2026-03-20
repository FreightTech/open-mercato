/**
 * FMS Files - Zod Validation Schemas
 */

import { z } from 'zod'
import {
  SHIPMENT_TYPES,
  CARGO_TYPES,
  LEG_TYPES,
  PACKAGE_TYPES,
  WEIGHT_UNITS,
  VOLUME_UNITS,
  DIMENSION_UNITS,
} from './types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const uuid = () => z.string().uuid()
const scoped = z.object({ organizationId: uuid(), tenantId: uuid() })

// ─── SCD Timestamp Entry ──────────────────────────────────────────────────────

export const legTimestampEntrySchema = z.object({
  value: z.string(),
  offset: z.string().nullable(),
  source: z.enum(['carrier_api', 'manual', 'ais', 'port', 'edi']),
  updatedAt: z.string(),
  sourceEventId: z.string().nullable().optional(),
})

// ─── Package Detail (JSONB for LCL units) ─────────────────────────────────────

export const packageDetailSchema = z.object({
  packageType: z.string().optional(),
  packageCount: z.number().int().min(0).optional(),
  commodityDescription: z.string().optional(),
  grossWeight: z.number().min(0).optional(),
  weightUnit: z.string().optional(),
  volume: z.number().min(0).optional(),
  volumeUnit: z.string().optional(),
  isHazardous: z.boolean().optional().default(false),
  hazmatClass: z.string().optional(),
  unNumber: z.string().optional(),
  temperatureMin: z.number().optional(),
  temperatureMax: z.number().optional(),
  length: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  dimensionUnit: z.enum(DIMENSION_UNITS).optional(),
  declaredValue: z.number().optional(),
  declaredValueCurrency: z.string().optional(),
  marksAndNumbers: z.string().optional(),
})

// ─── FmsFile ──────────────────────────────────────────────────────────────────

export const createFileSchema = scoped.extend({
  shipmentType: z.enum(SHIPMENT_TYPES),
  cargoType: z.enum(CARGO_TYPES),
  contractorId: uuid(),
  assigneeId: uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export const createFileInputSchema = createFileSchema.omit({
  organizationId: true,
  tenantId: true,
})

export const updateFileSchema = z.object({
  id: uuid(),
  assigneeId: uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export type CreateFileInput = z.infer<typeof createFileSchema>
export type UpdateFileInput = z.infer<typeof updateFileSchema>

// ─── FmsFileUnit ──────────────────────────────────────────────────────────────

export const createUnitSchema = scoped.extend({
  fileId: uuid(),
  cargoType: z.enum(CARGO_TYPES),
  originLocationId: uuid(),
  destinationLocationId: uuid(),
  commodityDescription: z.string().nullable().optional(),
  grossWeight: z.coerce.number().nullable().optional(),
  weightUnit: z.enum(WEIGHT_UNITS).nullable().optional(),
  volume: z.coerce.number().nullable().optional(),
  volumeUnit: z.enum(VOLUME_UNITS).nullable().optional(),
  isHazardous: z.boolean().default(false),
  containerNumber: z.string().nullable().optional(),
  containerType: z.string().nullable().optional(),
  packageCount: z.number().int().nullable().optional(),
  packagesDetail: z.array(packageDetailSchema).nullable().optional(),
  sortOrder: z.number().int().default(0),
})

export const createUnitInputSchema = createUnitSchema.omit({
  organizationId: true,
  tenantId: true,
})

export const updateUnitSchema = z.object({
  id: uuid(),
  originLocationId: uuid().optional(),
  destinationLocationId: uuid().optional(),
  commodityDescription: z.string().nullable().optional(),
  grossWeight: z.coerce.number().nullable().optional(),
  weightUnit: z.enum(WEIGHT_UNITS).nullable().optional(),
  volume: z.coerce.number().nullable().optional(),
  volumeUnit: z.enum(VOLUME_UNITS).nullable().optional(),
  isHazardous: z.boolean().optional(),
  containerNumber: z.string().nullable().optional(),
  containerType: z.string().nullable().optional(),
  packageCount: z.number().int().nullable().optional(),
  packagesDetail: z.array(packageDetailSchema).nullable().optional(),
  sortOrder: z.number().int().optional(),
})

export type CreateUnitInput = z.infer<typeof createUnitSchema>
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>

// ─── FmsFileLeg ───────────────────────────────────────────────────────────────

export const createLegSchema = scoped.extend({
  fileId: uuid(),
  legSequence: z.number().int().min(1),
  type: z.enum(LEG_TYPES),
  originLocationId: uuid(),
  destinationLocationId: uuid(),
  bookingNumber: z.string().nullable().optional(),
  carrierId: uuid().nullable().optional(),
  blNumber: z.string().nullable().optional(),
  vesselName: z.string().nullable().optional(),
  vesselImo: z.string().nullable().optional(),
  voyageNumber: z.string().nullable().optional(),
  flightNumber: z.string().nullable().optional(),
  aircraftType: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export const createLegInputSchema = createLegSchema.omit({
  organizationId: true,
  tenantId: true,
})

export const updateLegSchema = z.object({
  id: uuid(),
  legSequence: z.number().int().min(1).optional(),
  type: z.enum(LEG_TYPES).optional(),
  originLocationId: uuid().optional(),
  destinationLocationId: uuid().optional(),
  bookingNumber: z.string().nullable().optional(),
  carrierId: uuid().nullable().optional(),
  blNumber: z.string().nullable().optional(),
  vesselName: z.string().nullable().optional(),
  vesselImo: z.string().nullable().optional(),
  voyageNumber: z.string().nullable().optional(),
  flightNumber: z.string().nullable().optional(),
  aircraftType: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export const addTimestampSchema = z.object({
  legId: uuid(),
  timestampType: z.enum(['ptd', 'etd', 'atd', 'pta', 'eta', 'ata']),
  entry: legTimestampEntrySchema,
})

export type CreateLegInput = z.infer<typeof createLegSchema>
export type UpdateLegInput = z.infer<typeof updateLegSchema>
export type AddTimestampInput = z.infer<typeof addTimestampSchema>

// ─── FmsFileUnitLeg ───────────────────────────────────────────────────────────

export const createUnitLegSchema = scoped.extend({
  unitId: uuid(),
  legId: uuid(),
  truckPlate: z.string().nullable().optional(),
  trailerPlate: z.string().nullable().optional(),
  driverFullName: z.string().nullable().optional(),
  driverIdNumber: z.string().nullable().optional(),
  driverPhone: z.string().nullable().optional(),
  sealNumber: z.string().nullable().optional(),
  blNumber: z.string().nullable().optional(),
  consolidationContainerNumber: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  ptd: z.string().nullable().optional(),
  etd: z.string().nullable().optional(),
  atd: z.string().nullable().optional(),
  pta: z.string().nullable().optional(),
  eta: z.string().nullable().optional(),
  ata: z.string().nullable().optional(),
})

export const createUnitLegInputSchema = createUnitLegSchema.omit({
  organizationId: true,
  tenantId: true,
})

export const updateUnitLegSchema = z.object({
  id: uuid(),
  truckPlate: z.string().nullable().optional(),
  trailerPlate: z.string().nullable().optional(),
  driverFullName: z.string().nullable().optional(),
  driverIdNumber: z.string().nullable().optional(),
  driverPhone: z.string().nullable().optional(),
  sealNumber: z.string().nullable().optional(),
  blNumber: z.string().nullable().optional(),
  consolidationContainerNumber: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  ptd: z.string().nullable().optional(),
  etd: z.string().nullable().optional(),
  atd: z.string().nullable().optional(),
  pta: z.string().nullable().optional(),
  eta: z.string().nullable().optional(),
  ata: z.string().nullable().optional(),
})

export type CreateUnitLegInput = z.infer<typeof createUnitLegSchema>
export type UpdateUnitLegInput = z.infer<typeof updateUnitLegSchema>

// ─── FmsFileNote ──────────────────────────────────────────────────────────────

export const fmsFileNoteCreateSchema = z.object({
  body: z.string().trim().min(1).max(5000),
})

export const fmsFileNoteUpdateSchema = z.object({
  id: z.string().uuid(),
  body: z.string().trim().min(1).max(5000).optional(),
})
