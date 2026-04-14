import { z } from 'zod'
import {
  FMS_OFFER_TYPES,
  FMS_OFFER_STATUSES,
  FMS_RFQ_STATUSES,
  FMS_DIRECTIONS,
  FMS_TRANSPORT_MODES,
  FMS_RFQ_CARGO_TYPES,
  FMS_CHARGE_UNITS,
  FMS_CONTAINER_TYPES,
  FMS_INCOTERMS,
  FMS_COST_SECTION_TYPES,
  FMS_COST_GROUPING_MODES,
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
  originLocationId: uuid().optional().nullable(),
  destinationLocationId: uuid().optional().nullable(),
  placeOfLoading: z.string().trim().max(255).optional().nullable(),
  placeOfLoadingId: uuid().optional().nullable(),
  placeOfDelivery: z.string().trim().max(255).optional().nullable(),
  placeOfDeliveryId: uuid().optional().nullable(),
  containerCount: z.coerce.number().int().min(1).optional().nullable(),
  direction: z.enum(FMS_DIRECTIONS).optional().nullable(),
  transportMode: z.enum(FMS_TRANSPORT_MODES).optional().nullable(),
  cargoType: z.enum(FMS_RFQ_CARGO_TYPES).optional().nullable(),
  companyName: z.string().trim().max(255).optional().nullable(),
  contractorId: uuid().optional().nullable(),
  contactPerson: z.string().trim().max(255).optional().nullable(),
  contactPersonId: uuid().optional().nullable(),
  context: z.string().trim().max(5000).optional().nullable(),
  status: z.enum(FMS_RFQ_STATUSES).optional(),
  assignedToId: uuid().optional().nullable(),
  rawText: z.string().max(100_000).optional().nullable(),
  senderEmail: z.string().trim().max(255).optional().nullable(),
  senderName: z.string().trim().max(255).optional().nullable(),
  extractedData: z.record(z.string(), z.unknown()).optional().nullable(),
  highlights: z
    .array(
      z.object({
        start: z.number().int().min(0),
        end: z.number().int().min(0),
        type: z.string(),
        label: z.string(),
      }),
    )
    .optional()
    .nullable(),
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
  type: z.enum(FMS_OFFER_TYPES).optional(),
  rfqId: uuid().optional().nullable(),
  contractorId: uuid().optional().nullable(),
  /** @deprecated Use carrierIds instead */
  carrierId: uuid().optional().nullable(),
  carrierIds: z.array(uuid()).optional().nullable(),
  providerIds: z.array(uuid()).optional().nullable(),
  contactPersonId: uuid().optional().nullable(),
  billingAddressId: uuid().optional().nullable(),
  offerNumber: z.string().trim().min(1).max(50),
  version: z.coerce.number().int().min(1).optional(),
  status: z.enum(FMS_OFFER_STATUSES).optional(),
  incoterm: z.enum(FMS_INCOTERMS).optional().nullable(),
  direction: z.enum(FMS_DIRECTIONS).optional().nullable(),
  transportMode: z.enum(FMS_TRANSPORT_MODES).optional().nullable(),
  cargoType: z.enum(FMS_RFQ_CARGO_TYPES).optional().nullable(),
  validUntil: z.coerce.date().optional(),
  paymentTerms: z.string().trim().max(255).optional().nullable(),
  specialTerms: z.string().trim().optional().nullable(),
  customerNotes: z.string().trim().max(2000).optional().nullable(),
  notes: z.string().trim().max(2000).optional(),
  supersededById: uuid().optional().nullable(),
  assignedToId: uuid().optional().nullable(),
  operationalGuardianId: uuid().optional().nullable(),
  businessGuardianId: uuid().optional().nullable(),
  documentId: uuid().optional().nullable(),
  baseCurrency: currencyCode.optional().nullable(),
  exchangeRates: z.array(exchangeRateSnapshotSchema).optional().nullable(),
  costGroupingMode: z.enum(FMS_COST_GROUPING_MODES).optional().nullable(),
  offerLabel: z.string().trim().max(100).optional().nullable(),
  groupId: uuid().optional().nullable(),
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
  sectionType: z.enum(FMS_COST_SECTION_TYPES).optional().nullable(),
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
  containerType: z.string().trim().max(10).optional().nullable(),
  currencyCode: currencyCode.optional(),
  rate: decimal({ min: 0 }).optional(),
  buyPrice: decimal({ min: 0 }).optional(),
  sellPrice: decimal({ min: 0 }).optional(),
  quantity: decimal({ min: 0 }).optional(),
  isEnabled: z.boolean().optional(),
  sectionType: z.string().trim().max(50).optional().nullable(),
  clientGroupLabel: z.string().trim().max(255).optional().nullable(),
})

export const fmsOfferLineUpdateSchema = z
  .object({
    id: uuid(),
  })
  .merge(fmsOfferLineCreateSchema.omit({ calculationId: true }).partial())

export type FmsOfferLineCreateInput = z.infer<typeof fmsOfferLineCreateSchema>
export type FmsOfferLineUpdateInput = z.infer<typeof fmsOfferLineUpdateSchema>

// RFQ Item schemas
export const fmsRfqItemCreateSchema = scoped.extend({
  rfqId: uuid(),
  itemNumber: z.coerce.number().int().min(1).optional(),
  containerType: z.string().trim().max(10).optional().nullable(),
  containerCount: z.coerce.number().int().min(1).optional().nullable(),
  origin: z.string().trim().max(500).optional().nullable(),
  destination: z.string().trim().max(500).optional().nullable(),
  originLocationId: uuid().optional().nullable(),
  destinationLocationId: uuid().optional().nullable(),
  cargoDescription: z.string().trim().max(2000).optional().nullable(),
  weightKg: z.coerce.number().min(0).optional().nullable(),
  readinessDate: z.string().trim().max(255).optional().nullable(),
  incoterm: z.string().trim().max(10).optional().nullable(),
  transportMode: z.enum(FMS_TRANSPORT_MODES).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
})

export const fmsRfqItemUpdateSchema = z
  .object({
    id: uuid(),
  })
  .merge(fmsRfqItemCreateSchema.omit({ rfqId: true }).partial())

export type FmsRfqItemCreateInput = z.infer<typeof fmsRfqItemCreateSchema>
export type FmsRfqItemUpdateInput = z.infer<typeof fmsRfqItemUpdateSchema>

// RFQ Extraction schemas (for LLM-powered text extraction)
export const rfqExtractionInputSchema = z.object({
  text: z.string().min(1).max(100_000),
})

export const rfqExtractionItemSchema = z.object({
  containerType: z.string().nullable(),
  containerCount: z.number().nullable(),
  origin: z.string().nullable(),
  destination: z.string().nullable(),
  cargoDescription: z.string().nullable(),
  weightKg: z.number().nullable(),
  readinessDate: z.string().nullable(),
  incoterm: z.string().nullable(),
  transportMode: z.string().nullable(),
  notes: z.string().nullable(),
})

export const rfqExtractionResultSchema = z.object({
  companyName: z.string().nullable(),
  contactPerson: z.string().nullable(),
  senderEmail: z.string().nullable(),
  direction: z.string().nullable(),
  summary: z.string().nullable(),
  confidence: z.number().nullable(),
  items: z.array(rfqExtractionItemSchema),
  extractedLabels: z.array(
    z.object({
      text: z.string(),
      type: z.string(),
    }),
  ),
})

export type RfqExtractionInput = z.infer<typeof rfqExtractionInputSchema>
export type RfqExtractionItem = z.infer<typeof rfqExtractionItemSchema>
export type RfqExtractionResult = z.infer<typeof rfqExtractionResultSchema>

// Charge extraction schemas (for LLM-powered carrier rate parsing)
export const chargeExtractionInputSchema = z.object({
  text: z.string().max(50_000).optional(),
  imageBase64: z.string().max(10_000_000).optional(),
  transportMode: z.string().optional(),
}).refine(data => data.text || data.imageBase64, { message: 'Either text or imageBase64 is required' })

export const chargeExtractionChargeSchema = z.object({
  productName: z.string(),
  chargeCode: z.string().nullable(),
  chargeBasis: z.string().nullable(),
  currencyCode: z.string(),
  rate: z.number(),
  buyPrice: z.number(),
  category: z.enum(['freight', 'origin', 'destination', 'other']),
})

export const chargeExtractionResultSchema = z.object({
  charges: z.array(chargeExtractionChargeSchema),
  sourceTitle: z.string().nullable(),
  sourceSummary: z.string().nullable(),
})

export type ChargeExtractionInput = z.infer<typeof chargeExtractionInputSchema>
export type ChargeExtractionCharge = z.infer<typeof chargeExtractionChargeSchema>
export type ChargeExtractionResult = z.infer<typeof chargeExtractionResultSchema>

// FmsNote schemas (activity comments for RFQ / Offer)
export const fmsNoteCreateSchema = z.object({
  body: z.string().min(1).max(5000),
  relatedEntityType: z.enum(['fms_rfq', 'fms_offer']),
  relatedEntityId: z.string().uuid(),
  mentionedUserIds: z.array(z.string().uuid()).max(20).optional(),
})
export type FmsNoteCreateInput = z.infer<typeof fmsNoteCreateSchema>

export const fmsNoteUpdateSchema = z.object({
  id: z.string().uuid(),
  body: z.string().min(1).max(5000).optional(),
})
export type FmsNoteUpdateInput = z.infer<typeof fmsNoteUpdateSchema>
