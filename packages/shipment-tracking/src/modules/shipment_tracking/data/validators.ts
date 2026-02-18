import { z } from 'zod'

const uuid = () => z.string().uuid()

const scopedSchema = z.object({
  organizationId: uuid(),
  tenantId: uuid(),
})

// ─── Timestamp Schemas ───────────────────────────────────────

export const timestampSourceSchema = z.enum(['carrier_api', 'manual', 'ais', 'port', 'edi'])
export type TimestampSourceInput = z.infer<typeof timestampSourceSchema>

export const shipmentTimestampEntrySchema = z.object({
  value: z.string().datetime({ message: 'Must be ISO 8601 datetime' }),
  offset: z.string().regex(/^[+-]\d{2}:\d{2}$|^Z$/, 'Must be timezone offset like +08:00 or Z').nullable(),
  source: timestampSourceSchema,
  updatedAt: z.string().datetime({ message: 'Must be ISO 8601 datetime' }),
  sourceEventId: z.string().nullable().optional(),
})
export type ShipmentTimestampEntryInput = z.infer<typeof shipmentTimestampEntrySchema>

export const timestampEntryInputSchema = z.object({
  value: z.string().datetime({ message: 'Must be ISO 8601 datetime' }),
  offset: z.string().regex(/^[+-]\d{2}:\d{2}$|^Z$/, 'Must be timezone offset like +08:00 or Z').nullable().optional(),
  source: timestampSourceSchema,
  sourceEventId: z.string().nullable().optional(),
})
export type TimestampEntryInput = z.infer<typeof timestampEntryInputSchema>

// UN/LOCODE format: 2 uppercase letters (country) + 3 alphanumeric characters (location)
// Example: PLGDY (Poland, Gdynia), CRMOB (Costa Rica, Moín), BEANR (Belgium, Antwerp)
export const unLocodeSchema = z.string()
  .trim()
  .toUpperCase()
  .length(5, 'UN/LOCODE must be exactly 5 characters')
  .regex(/^[A-Z]{2}[A-Z0-9]{3}$/, 'Invalid UN/LOCODE format (expected: 2 letters + 3 alphanumeric)')

// Optional UN/LOCODE - will be auto-inferred from tracking events if not provided
export const optionalUnLocodeSchema = unLocodeSchema.optional()

// ─── Enums ───────────────────────────────────────────────────

export const shipmentStatusSchema = z.enum(['PENDING', 'BOOKED', 'DEPARTED', 'IN_TRANSIT', 'PRE_ARRIVAL', 'ARRIVED', 'DELIVERED'])
export type ShipmentStatus = z.infer<typeof shipmentStatusSchema>

export const trackingEventSourceSchema = z.enum(['dcsa', 'ais', 'port', 'edi', 'manual'])
export type TrackingEventSource = z.infer<typeof trackingEventSourceSchema>

export const trackingReferenceTypeSchema = z.enum(['container', 'booking', 'bol'])
export type TrackingReferenceType = z.infer<typeof trackingReferenceTypeSchema>

// ─── Shipment ────────────────────────────────────────────────

export const shipmentCreateSchema = scopedSchema.extend({
  // Optional: link to existing tracking job
  trackingJobId: uuid().optional(),
  carrierCode: z.string().trim().max(20).optional(),
  containerNumber: z.string().trim().max(50).optional(),
  bookingNumber: z.string().trim().max(100).optional(),
  bolNumber: z.string().trim().max(100).optional(),
  // Multi-source timestamps (JSONB arrays)
  etdTimestamps: z.array(shipmentTimestampEntrySchema).optional(),
  etaTimestamps: z.array(shipmentTimestampEntrySchema).optional(),
  atdTimestamps: z.array(shipmentTimestampEntrySchema).optional(),
  ataTimestamps: z.array(shipmentTimestampEntrySchema).optional(),
  // Origin/destination
  originName: z.string().trim().max(200).optional(),
  originUnlocode: z.string().trim().max(10).optional(),
  originCountry: z.string().trim().max(5).optional(),
  destinationName: z.string().trim().max(200).optional(),
  destinationUnlocode: z.string().trim().max(10).optional(),
  destinationCountry: z.string().trim().max(5).optional(),
  vesselName: z.string().trim().max(200).optional(),
  vesselImo: z.string().trim().max(20).optional(),
  voyageNumber: z.string().trim().max(50).optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
})

export const shipmentUpdateSchema = z.object({
  id: uuid(),
}).merge(
  scopedSchema.extend({
    trackingJobId: uuid().optional().nullable(),
    carrierCode: z.string().trim().max(20).optional().nullable(),
    containerNumber: z.string().trim().max(50).optional().nullable(),
    bookingNumber: z.string().trim().max(100).optional().nullable(),
    bolNumber: z.string().trim().max(100).optional().nullable(),
    status: shipmentStatusSchema.optional(),
    // Multi-source timestamps - can replace entire arrays or add entries
    etdTimestamps: z.array(shipmentTimestampEntrySchema).optional().nullable(),
    etaTimestamps: z.array(shipmentTimestampEntrySchema).optional().nullable(),
    atdTimestamps: z.array(shipmentTimestampEntrySchema).optional().nullable(),
    ataTimestamps: z.array(shipmentTimestampEntrySchema).optional().nullable(),
    // Add single timestamp entries (convenience for manual updates)
    addEtdTimestamp: timestampEntryInputSchema.optional(),
    addEtaTimestamp: timestampEntryInputSchema.optional(),
    addAtdTimestamp: timestampEntryInputSchema.optional(),
    addAtaTimestamp: timestampEntryInputSchema.optional(),
    // Origin/destination
    originName: z.string().trim().max(200).optional().nullable(),
    originUnlocode: z.string().trim().max(10).optional().nullable(),
    originCountry: z.string().trim().max(5).optional().nullable(),
    destinationName: z.string().trim().max(200).optional().nullable(),
    destinationUnlocode: z.string().trim().max(10).optional().nullable(),
    destinationCountry: z.string().trim().max(5).optional().nullable(),
    vesselName: z.string().trim().max(200).optional().nullable(),
    vesselImo: z.string().trim().max(20).optional().nullable(),
    voyageNumber: z.string().trim().max(50).optional().nullable(),
    extra: z.record(z.string(), z.unknown()).optional().nullable(),
  }).partial(),
)

export const shipmentListSchema = z.object({
  id: z.string().uuid().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
  search: z.string().optional(),
  status: z.string().optional(),
  carrierCode: z.string().optional(),
  sortField: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
}).passthrough()

export type ShipmentCreateInput = z.infer<typeof shipmentCreateSchema>
export type ShipmentUpdateInput = z.infer<typeof shipmentUpdateSchema>

// ─── TrackingJob ─────────────────────────────────────────────

export const trackingJobCreateSchema = scopedSchema.extend({
  carrierCode: z.string().trim().min(1).max(50),
  referenceType: trackingReferenceTypeSchema,
  referenceValue: z.string().trim().min(1).max(100),
  // Origin/destination are optional - will be auto-inferred from tracking events if not provided
  originUnlocode: optionalUnLocodeSchema,
  destinationUnlocode: optionalUnLocodeSchema,
  schedule: z.array(z.string()).optional(),
})

export const trackingJobUpdateSchema = z.object({
  id: uuid(),
}).merge(
  scopedSchema.extend({
    status: z.enum(['active', 'paused', 'deactivated', 'failed']).optional(),
    schedule: z.array(z.string()).optional().nullable(),
    nextPollAt: z.coerce.date().optional().nullable(),
  }).partial(),
)

export const trackingJobListSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
  status: z.string().optional(),
  carrierCode: z.string().optional(),
  referenceType: z.string().optional(),
  referenceValue: z.string().optional(),
  sortField: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
}).passthrough()

export type TrackingJobCreateInput = z.infer<typeof trackingJobCreateSchema>
export type TrackingJobUpdateInput = z.infer<typeof trackingJobUpdateSchema>

// ─── TrackingEvent ───────────────────────────────────────────

export const trackingEventListSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
  trackingJobId: uuid().optional(),
  equipmentReference: z.string().optional(),
  source: trackingEventSourceSchema.optional(),
  eventType: z.string().optional(),
  eventCode: z.string().optional(),
  sortField: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
}).passthrough()

/** @deprecated Use trackingEventListSchema instead */
export const cargoEventListSchema = trackingEventListSchema

// ─── CarrierConfig ───────────────────────────────────────────

export const carrierConfigCreateSchema = scopedSchema.extend({
  carrierCode: z.string().trim().min(1).max(50),
  apiEndpoint: z.string().trim().url().max(500).optional(),
  authConfig: z.record(z.string(), z.unknown()).optional(),
  rateLimitRequests: z.coerce.number().int().min(1).max(10000).default(60),
  rateLimitWindowSeconds: z.coerce.number().int().min(1).max(86400).default(60),
  isActive: z.boolean().default(true),
})

export const carrierConfigUpdateSchema = z.object({
  id: uuid(),
}).merge(
  scopedSchema.extend({
    apiEndpoint: z.string().trim().url().max(500).optional().nullable(),
    authConfig: z.record(z.string(), z.unknown()).optional().nullable(),
    rateLimitRequests: z.coerce.number().int().min(1).max(10000).optional(),
    rateLimitWindowSeconds: z.coerce.number().int().min(1).max(86400).optional(),
    isActive: z.boolean().optional(),
  }).partial(),
)

export const carrierConfigListSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
  carrierCode: z.string().optional(),
  isActive: z.string().optional(),
  sortField: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
}).passthrough()

export type CarrierConfigCreateInput = z.infer<typeof carrierConfigCreateSchema>
export type CarrierConfigUpdateInput = z.infer<typeof carrierConfigUpdateSchema>

// ─── Webhook ─────────────────────────────────────────────────

export const webhookCreateSchema = scopedSchema.extend({
  url: z.string().trim().url().max(500),
  eventsSubscribed: z.array(z.string().trim().min(1)).min(1),
  hmacSecret: z.string().trim().max(256).optional(),
  isActive: z.boolean().default(true),
})

export const webhookUpdateSchema = z.object({
  id: uuid(),
}).merge(
  scopedSchema.extend({
    url: z.string().trim().url().max(500).optional(),
    eventsSubscribed: z.array(z.string().trim().min(1)).min(1).optional(),
    hmacSecret: z.string().trim().max(256).optional().nullable(),
    isActive: z.boolean().optional(),
  }).partial(),
)

export const webhookListSchema = z.object({
  id: z.string().uuid().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
  isActive: z.string().optional(),
  sortField: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
}).passthrough()

export type WebhookCreateInput = z.infer<typeof webhookCreateSchema>
export type WebhookUpdateInput = z.infer<typeof webhookUpdateSchema>

// ─── WebhookDelivery ─────────────────────────────────────────

export const webhookDeliveryListSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
  webhookId: uuid().optional(),
  status: z.string().optional(),
  eventType: z.string().optional(),
  sortField: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
}).passthrough()
