import { z } from 'zod'
import {
  FMS_OFFER_STATUSES,
  FMS_RFQ_STATUSES,
  FMS_DIRECTIONS,
  FMS_TRANSPORT_MODES,
  FMS_RFQ_CARGO_TYPES,
  FMS_CHARGE_UNITS,
} from './types'

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

// RFQ schemas
export const fmsRfqCreateSchema = scoped.extend({
  title: z.string().trim().max(255).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  origin: z.string().trim().max(255).optional().nullable(),
  destination: z.string().trim().max(255).optional().nullable(),
  containerCount: z.coerce.number().int().min(1).optional().nullable(),
  direction: z.enum(FMS_DIRECTIONS).optional().nullable(),
  transportMode: z.enum(FMS_TRANSPORT_MODES).optional().nullable(),
  cargoType: z.enum(FMS_RFQ_CARGO_TYPES).optional().nullable(),
  companyName: z.string().trim().max(255).optional().nullable(),
  contactPerson: z.string().trim().max(255).optional().nullable(),
  context: z.string().trim().max(5000).optional().nullable(),
  status: z.enum(FMS_RFQ_STATUSES).optional(),
  assignedToId: uuid().optional().nullable(),
})

export const fmsRfqUpdateSchema = z
  .object({
    id: uuid(),
  })
  .merge(fmsRfqCreateSchema.partial())

export type FmsRfqCreateInput = z.infer<typeof fmsRfqCreateSchema>
export type FmsRfqUpdateInput = z.infer<typeof fmsRfqUpdateSchema>

// Exchange rate snapshot schema
const exchangeRateSnapshotSchema = z.object({
  fromCurrencyCode: z.string().trim().regex(/^[A-Z]{3}$/),
  toCurrencyCode: z.string().trim().regex(/^[A-Z]{3}$/),
  rate: z.string().trim(),
  date: z.string().trim(),
  source: z.string().trim(),
})

// Offer schemas
export const fmsOfferCreateSchema = scoped.extend({
  rfqId: uuid().optional().nullable(),
  offerNumber: z.string().trim().min(1).max(50),
  version: z.coerce.number().int().min(1).optional(),
  status: z.enum(FMS_OFFER_STATUSES).optional(),
  direction: z.enum(FMS_DIRECTIONS).optional().nullable(),
  transportMode: z.enum(FMS_TRANSPORT_MODES).optional().nullable(),
  cargoType: z.enum(FMS_RFQ_CARGO_TYPES).optional().nullable(),
  validUntil: z.coerce.date().optional(),
  paymentTerms: z.string().trim().max(255).optional().nullable(),
  specialTerms: z.string().trim().max(2000).optional().nullable(),
  customerNotes: z.string().trim().max(2000).optional().nullable(),
  notes: z.string().trim().max(2000).optional(),
  supersededById: uuid().optional().nullable(),
  assignedToId: uuid().optional().nullable(),
  operationalGuardianId: uuid().optional().nullable(),
  businessGuardianId: uuid().optional().nullable(),
  documentId: uuid().optional().nullable(),
  exchangeRates: z.array(exchangeRateSnapshotSchema).optional().nullable(),
})

export const fmsOfferUpdateSchema = z
  .object({
    id: uuid(),
  })
  .merge(fmsOfferCreateSchema.omit({ offerNumber: true }).partial())

export type FmsOfferCreateInput = z.infer<typeof fmsOfferCreateSchema>
export type FmsOfferUpdateInput = z.infer<typeof fmsOfferUpdateSchema>

// Offer Calculation schemas
export const fmsOfferCalculationCreateSchema = scoped.extend({
  offerId: uuid(),
  calculationNumber: z.coerce.number().int().min(1).optional(),
  label: z.string().trim().max(255).optional().nullable(),
  containers: z.array(z.string().trim().max(10)).optional().nullable(),
  originLocationId: uuid().optional().nullable(),
  destinationLocationId: uuid().optional().nullable(),
  placeOfLoadingId: uuid().optional().nullable(),
  placeOfDeliveryId: uuid().optional().nullable(),
})

export const fmsOfferCalculationUpdateSchema = z
  .object({
    id: uuid(),
  })
  .merge(fmsOfferCalculationCreateSchema.omit({ offerId: true }).partial())

export type FmsOfferCalculationCreateInput = z.infer<typeof fmsOfferCalculationCreateSchema>
export type FmsOfferCalculationUpdateInput = z.infer<typeof fmsOfferCalculationUpdateSchema>

// Offer Line schemas
export const fmsOfferLineCreateSchema = scoped.extend({
  calculationId: uuid(),
  lineNumber: z.coerce.number().int().min(0).optional(),
  productId: uuid().optional().nullable(),
  productName: z.string().trim().max(255).optional().nullable(),
  chargeCode: z.string().trim().max(20).optional().nullable(),
  chargeBasis: z.enum(FMS_CHARGE_UNITS).optional().nullable(),
  currencyCode: currencyCode.optional(),
  rate: decimal({ min: 0 }).optional(),
  buyPrice: decimal({ min: 0 }).optional(),
  sellPrice: decimal({ min: 0 }).optional(),
  isEnabled: z.boolean().optional(),
})

export const fmsOfferLineUpdateSchema = z
  .object({
    id: uuid(),
  })
  .merge(fmsOfferLineCreateSchema.omit({ calculationId: true }).partial())

export type FmsOfferLineCreateInput = z.infer<typeof fmsOfferLineCreateSchema>
export type FmsOfferLineUpdateInput = z.infer<typeof fmsOfferLineUpdateSchema>
