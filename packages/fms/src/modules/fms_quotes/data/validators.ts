import { z } from 'zod'
import {
  FMS_QUOTE_STATUSES,
  FMS_OFFER_STATUSES,
  FMS_DIRECTIONS,
  FMS_TRANSPORT_MODES,
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

// Quote schemas - all fields optional for flexible inline editing
export const fmsQuoteCreateSchema = scoped.extend({
  quoteNumber: z.string().trim().max(50).optional(),
  clientId: uuid().optional().nullable(),
  operationalGuardianId: uuid().optional().nullable(),
  businessGuardianId: uuid().optional().nullable(),
  containerCount: z.coerce.number().int().min(1).optional().nullable(),
  status: z.enum(FMS_QUOTE_STATUSES).optional(),
  direction: z.enum(FMS_DIRECTIONS).optional(),
  cargoType: z.string().trim().max(100).optional().nullable(),
  modes: z.array(z.enum(FMS_TRANSPORT_MODES)).optional().nullable(),
  originPortIds: z.array(uuid()).optional().nullable(),
  destinationPortIds: z.array(uuid()).optional().nullable(),
  currencyCode: currencyCode.optional(),
  notes: z.string().trim().max(2000).optional(),
})

export const fmsQuoteUpdateSchema = z
  .object({
    id: uuid(),
  })
  .merge(fmsQuoteCreateSchema.partial())

export type FmsQuoteCreateInput = z.infer<typeof fmsQuoteCreateSchema>
export type FmsQuoteUpdateInput = z.infer<typeof fmsQuoteUpdateSchema>

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
  quoteId: uuid(),
  offerNumber: z.string().trim().min(1).max(50),
  version: z.coerce.number().int().min(1).optional(),
  status: z.enum(FMS_OFFER_STATUSES).optional(),
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

// Offer Line schemas
export const fmsOfferLineCreateSchema = scoped.extend({
  offerId: uuid(),
  lineNumber: z.coerce.number().int().min(0).optional(),
  // Product references (for traceability)
  productId: uuid().optional().nullable(),
  variantId: uuid().optional().nullable(),
  sourceQuoteLineId: uuid().optional().nullable(),
  // Snapshot fields from quote line / product
  productName: z.string().trim().max(255).optional().nullable(),
  chargeCode: z.string().trim().max(20).optional().nullable(),
  containerSize: z.string().trim().max(20).optional().nullable(),
  providerId: uuid().optional().nullable(),
  carrierId: uuid().optional().nullable(),
  // Reference (contract number or "FAK" for spot)
  reference: z.string().trim().max(255).optional().nullable(),
  // Validity period
  validityStart: z.coerce.date().optional().nullable(),
  validityEnd: z.coerce.date().optional().nullable(),
  // Pricing
  currencyCode: currencyCode,
  unitCost: decimal({ min: 0 }).optional(),
  unitPrice: decimal({ min: 0 }).optional(),
  amount: decimal({ min: 0 }).optional(),
})

export const fmsOfferLineUpdateSchema = z
  .object({
    id: uuid(),
  })
  .merge(fmsOfferLineCreateSchema.omit({ offerId: true }).partial())

export type FmsOfferLineCreateInput = z.infer<typeof fmsOfferLineCreateSchema>
export type FmsOfferLineUpdateInput = z.infer<typeof fmsOfferLineUpdateSchema>

// Quote Line schemas (for quote wizard - linked to products module)
export const fmsQuoteLineCreateSchema = scoped.extend({
  quoteId: uuid(),
  lineNumber: z.coerce.number().int().min(0).optional(),
  // Product references (from products module)
  productId: uuid().optional().nullable(),
  variantId: uuid().optional().nullable(),
  providerId: uuid().optional().nullable(),
  // Snapshot fields
  productName: z.string().trim().min(1).max(255),
  chargeCode: z.string().trim().max(20).optional().nullable(),
  productType: z.string().trim().max(20).optional().nullable(),
  containerSize: z.string().trim().max(20).optional().nullable(),
  // Reference (contract number or "FAK" for spot)
  reference: z.string().trim().max(255).optional().nullable(),
  // Origin/Destination location IDs
  originLocationId: uuid().optional().nullable(),
  destinationLocationId: uuid().optional().nullable(),
  // Validity period
  validityStart: z.coerce.date().optional().nullable(),
  validityEnd: z.coerce.date().optional().nullable(),
  // Pricing
  currencyCode: currencyCode.optional(),
  unitCost: decimal({ min: 0 }).optional(),
  marginPercent: decimal().optional(),
  unitSales: decimal({ min: 0 }).optional(),
})

export const fmsQuoteLineUpdateSchema = z
  .object({
    id: uuid(),
  })
  .merge(fmsQuoteLineCreateSchema.omit({ quoteId: true }).partial())

export type FmsQuoteLineCreateInput = z.infer<typeof fmsQuoteLineCreateSchema>
export type FmsQuoteLineUpdateInput = z.infer<typeof fmsQuoteLineUpdateSchema>
