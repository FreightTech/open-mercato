import { z } from 'zod'

const uuid = () => z.string().uuid()

const scopedSchema = z.object({
  organizationId: uuid(),
  tenantId: uuid(),
})

// ─── Shipment ────────────────────────────────────────────────

export const shipmentCreateSchema = scopedSchema.extend({
  carrierCode: z.string().trim().max(20).optional(),
  containerNumber: z.string().trim().max(50).optional(),
  bookingNumber: z.string().trim().max(100).optional(),
  bolNumber: z.string().trim().max(100).optional(),
  etd: z.coerce.date().optional(),
  etdOffset: z.string().trim().max(10).optional(),
  eta: z.coerce.date().optional(),
  etaOffset: z.string().trim().max(10).optional(),
  originName: z.string().trim().max(200).optional(),
  originUnlocode: z.string().trim().max(10).optional(),
  originCountry: z.string().trim().max(5).optional(),
  destinationName: z.string().trim().max(200).optional(),
  destinationUnlocode: z.string().trim().max(10).optional(),
  destinationCountry: z.string().trim().max(5).optional(),
  vesselName: z.string().trim().max(200).optional(),
  vesselImo: z.string().trim().max(20).optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
}).refine(
  (data) => data.containerNumber || data.bookingNumber || data.bolNumber,
  { message: 'At least one of containerNumber, bookingNumber, or bolNumber is required' },
)

export const shipmentUpdateSchema = z.object({
  id: uuid(),
}).merge(
  scopedSchema.extend({
    carrierCode: z.string().trim().max(20).optional().nullable(),
    containerNumber: z.string().trim().max(50).optional().nullable(),
    bookingNumber: z.string().trim().max(100).optional().nullable(),
    bolNumber: z.string().trim().max(100).optional().nullable(),
    status: z.enum(['ORDERED', 'BOOKED', 'DEPARTED', 'PRE_ARRIVAL', 'IN_PORT', 'DELIVERED']).optional(),
    etd: z.coerce.date().optional().nullable(),
    etdOffset: z.string().trim().max(10).optional().nullable(),
    eta: z.coerce.date().optional().nullable(),
    etaOffset: z.string().trim().max(10).optional().nullable(),
    atd: z.coerce.date().optional().nullable(),
    atdOffset: z.string().trim().max(10).optional().nullable(),
    ata: z.coerce.date().optional().nullable(),
    ataOffset: z.string().trim().max(10).optional().nullable(),
    originName: z.string().trim().max(200).optional().nullable(),
    originUnlocode: z.string().trim().max(10).optional().nullable(),
    originCountry: z.string().trim().max(5).optional().nullable(),
    destinationName: z.string().trim().max(200).optional().nullable(),
    destinationUnlocode: z.string().trim().max(10).optional().nullable(),
    destinationCountry: z.string().trim().max(5).optional().nullable(),
    vesselName: z.string().trim().max(200).optional().nullable(),
    vesselImo: z.string().trim().max(20).optional().nullable(),
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
  shipmentId: uuid(),
  carrierName: z.string().trim().min(1).max(50),
  referenceType: z.enum(['container', 'booking', 'bol']),
  referenceValue: z.string().trim().min(1).max(100),
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
  shipmentId: uuid().optional(),
  status: z.string().optional(),
  carrierName: z.string().optional(),
  sortField: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
}).passthrough()

export type TrackingJobCreateInput = z.infer<typeof trackingJobCreateSchema>
export type TrackingJobUpdateInput = z.infer<typeof trackingJobUpdateSchema>

// ─── CargoEvent ──────────────────────────────────────────────

export const cargoEventListSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
  shipmentId: uuid().optional(),
  eventType: z.string().optional(),
  eventCode: z.string().optional(),
  sortField: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
}).passthrough()

// ─── CarrierConfig ───────────────────────────────────────────

export const carrierConfigCreateSchema = scopedSchema.extend({
  carrierName: z.string().trim().min(1).max(50),
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
  carrierName: z.string().optional(),
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
