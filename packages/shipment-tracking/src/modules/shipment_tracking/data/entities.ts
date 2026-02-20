import { Entity, PrimaryKey, Property, Index, Unique, ManyToOne, OneToMany, Collection, OptionalProps } from '@mikro-orm/core'
import type { ShipmentTimestampEntry } from '../lib/timestamp-utils'
import type { RouteStopEntry, CargoEventEntry } from '../lib/route-extraction'
import type { FacilityLocation } from '../lib/location-types'

// Re-export timestamp types for convenience
export type { ShipmentTimestampEntry, TimestampSource, TimestampType } from '../lib/timestamp-utils'
// Re-export route extraction types for convenience
export type { RouteStopEntry, CargoEventEntry } from '../lib/route-extraction'
// Re-export location types for convenience
export type { FacilityLocation } from '../lib/location-types'

// ─── Enums ───────────────────────────────────────────────────

export type ShipmentStatusEnum =
  | 'PENDING'
  | 'BOOKED'
  | 'DEPARTED'
  | 'IN_TRANSIT'
  | 'PRE_ARRIVAL'
  | 'ARRIVED'
  | 'DELIVERED'

export type TrackingJobStatusEnum = 'active' | 'paused' | 'deactivated' | 'failed'

export type TrackingEventType = 'EQUIPMENT' | 'TRANSPORT' | 'SHIPMENT'

export type TrackingEventClassifierCode = 'ACT' | 'PLN' | 'EST'

export type TrackingEventSource = 'dcsa' | 'ais' | 'port' | 'edi' | 'manual'

export type WebhookDeliveryStatus = 'pending' | 'success' | 'failed'

export type TrackingReferenceType = 'container' | 'booking' | 'bol'



// Types for JSONB fields
export type DocumentReference = {
  type: string // BKG, TRD, SHI, CBR, ARN, VGM, etc.
  value: string
}

export type SealInfo = {
  number: string
  source?: string | null
  type?: string | null
}

export type ModeOfTransport = 'VESSEL' | 'RAIL' | 'TRUCK' | 'BARGE'
export type EmptyIndicatorCode = 'EMPTY' | 'LADEN'
export type FacilityCodeListProvider = 'SMDG' | 'BIC'

// ─── TrackingJob ─────────────────────────────────────────────
// Declared first as it's referenced by Shipment and TrackingEvent

@Entity({ tableName: 'shipment_tracking_jobs' })
@Index({ name: 'st_jobs_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'st_jobs_status_idx', properties: ['status'] })
@Index({ name: 'st_jobs_next_poll_idx', properties: ['nextPollAt'] })
export class TrackingJob {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt' | 'status' | 'retryCount' | 'originUnlocode' | 'destinationUnlocode'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'carrier_code', type: 'text' })
  carrierCode!: string

  @Property({ name: 'reference_type', type: 'text' })
  referenceType!: TrackingReferenceType

  @Property({ name: 'reference_value', type: 'text' })
  referenceValue!: string

  // Origin/destination are optional - will be auto-inferred from tracking events if not provided
  @Property({ name: 'origin_unlocode', type: 'text', length: 5, nullable: true })
  originUnlocode?: string | null

  @Property({ name: 'destination_unlocode', type: 'text', length: 5, nullable: true })
  destinationUnlocode?: string | null

  @Property({ type: 'text', default: 'active' })
  status: TrackingJobStatusEnum = 'active'

  // JSON array of scheduled poll dates
  @Property({ type: 'jsonb', nullable: true })
  schedule?: string[] | null

  @Property({ name: 'next_poll_at', type: Date, nullable: true })
  nextPollAt?: Date | null

  @Property({ name: 'last_poll_at', type: Date, nullable: true })
  lastPollAt?: Date | null

  @Property({ name: 'retry_count', type: 'integer', default: 0 })
  retryCount: number = 0

  @Property({ name: 'error_history', type: 'jsonb', nullable: true })
  errorHistory?: Array<{ date: string; message: string }> | null

  @Property({ name: 'created_at', type: Date, defaultRaw: 'now()' })
  createdAt!: Date

  @Property({ name: 'updated_at', type: Date, defaultRaw: 'now()', onUpdate: () => new Date() })
  updatedAt!: Date

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  // One TrackingJob can track multiple shipments (containers)
  @OneToMany('Shipment', 'trackingJob')
  shipments = new Collection<Shipment>(this)

  // One TrackingJob has many TrackingEvents
  @OneToMany('TrackingEvent', 'trackingJob')
  events = new Collection<TrackingEvent>(this)
}

// ─── Shipment ────────────────────────────────────────────────

@Entity({ tableName: 'shipment_tracking_shipments' })
@Index({ name: 'st_shipments_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'st_shipments_status_idx', properties: ['status'] })
@Index({ name: 'st_shipments_carrier_idx', properties: ['carrierCode'] })
@Index({ name: 'st_shipments_tracking_job_idx', properties: ['trackingJob'] })
export class Shipment {
  [OptionalProps]?: 'isActive' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'status' | 'eventCount' | 'trackingJob' | 'routeStops' | 'cargoEvents' | 'originLocation' | 'destinationLocation'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'text', default: 'PENDING' })
  status: ShipmentStatusEnum = 'PENDING'

  @Property({ name: 'carrier_code', type: 'text', nullable: true })
  carrierCode?: string | null

  @Property({ name: 'container_number', type: 'text', nullable: true })
  containerNumber?: string | null

  @Property({ name: 'booking_number', type: 'text', nullable: true })
  bookingNumber?: string | null

  @Property({ name: 'bol_number', type: 'text', nullable: true })
  bolNumber?: string | null

  // ─── Multi-source Timestamps (JSONB arrays) ────────────────────
  // Each array tracks timestamps from multiple sources with full history (SCD pattern).
  // Primary value is computed using "latest update wins" strategy.
  // Use helpers from lib/timestamp-utils.ts: getLatestTimestamp(), getPrimaryTimestampValue()
  @Property({ name: 'etd_timestamps', type: 'jsonb', nullable: true })
  etdTimestamps?: ShipmentTimestampEntry[] | null

  @Property({ name: 'eta_timestamps', type: 'jsonb', nullable: true })
  etaTimestamps?: ShipmentTimestampEntry[] | null

  @Property({ name: 'atd_timestamps', type: 'jsonb', nullable: true })
  atdTimestamps?: ShipmentTimestampEntry[] | null

  @Property({ name: 'ata_timestamps', type: 'jsonb', nullable: true })
  ataTimestamps?: ShipmentTimestampEntry[] | null

  // ─── Location Data (JSONB) ────────────────────────────────────
  // Full origin/destination details including facility, address, coordinates.
  // Populated from DCSA events, enriched with BIC API if needed.

  @Property({ name: 'origin_location', type: 'jsonb', nullable: true })
  originLocation?: FacilityLocation | null

  @Property({ name: 'destination_location', type: 'jsonb', nullable: true })
  destinationLocation?: FacilityLocation | null

  // Vessel
  @Property({ name: 'vessel_name', type: 'text', nullable: true })
  vesselName?: string | null

  @Property({ name: 'vessel_imo', type: 'text', nullable: true })
  vesselImo?: string | null

  @Property({ name: 'voyage_number', type: 'text', nullable: true })
  voyageNumber?: string | null

  @Property({ name: 'event_count', type: 'integer', default: 0 })
  eventCount: number = 0

  @Property({ name: 'last_event_at', type: Date, nullable: true })
  lastEventAt?: Date | null

  @Property({ type: 'jsonb', nullable: true })
  extra?: Record<string, unknown> | null

  // ─── Denormalized Route & Events (JSONB) ───────────────────────
  // Pre-computed route stops and filtered cargo events for this specific container.
  // Populated by TrackingService when processing events, eliminating extra API calls.

  @Property({ name: 'route_stops', type: 'jsonb', nullable: true })
  routeStops?: RouteStopEntry[] | null

  @Property({ name: 'cargo_events', type: 'jsonb', nullable: true })
  cargoEvents?: CargoEventEntry[] | null

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'created_at', type: Date, defaultRaw: 'now()' })
  createdAt!: Date

  @Property({ name: 'updated_at', type: Date, defaultRaw: 'now()', onUpdate: () => new Date() })
  updatedAt!: Date

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  @Property({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId?: string | null

  // Shipment belongs to a TrackingJob (nullable - shipment can exist without active tracking)
  @ManyToOne(() => TrackingJob, { fieldName: 'tracking_job_id', nullable: true })
  trackingJob?: TrackingJob | null
}

// ─── TrackingEvent ───────────────────────────────────────────

@Entity({ tableName: 'shipment_tracking_events' })
@Index({ name: 'st_events_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'st_events_tracking_job_idx', properties: ['trackingJob'] })
@Index({ name: 'st_events_equipment_ref_idx', properties: ['equipmentReference'] })
@Index({ name: 'st_events_event_date_time_idx', properties: ['eventDateTime'] })
@Unique({ name: 'st_events_source_event_uniq', properties: ['trackingJob', 'source', 'sourceEventId'] })
export class TrackingEvent {
  [OptionalProps]?: 'createdAt' | 'source'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  // Event belongs to a TrackingJob (not Shipment)
  @ManyToOne(() => TrackingJob, { fieldName: 'tracking_job_id' })
  trackingJob!: TrackingJob

  // ─── Event Source ──────────────────────────────────────────────

  @Property({ type: 'text', default: 'dcsa' })
  source: TrackingEventSource = 'dcsa'

  @Property({ name: 'source_event_id', type: 'text', nullable: true })
  sourceEventId?: string | null // Original ID from the source system (e.g., DCSA eventId)

  // ─── Core Event Fields ─────────────────────────────────────────

  @Property({ name: 'event_type', type: 'text' })
  eventType!: TrackingEventType

  @Property({ name: 'event_code', type: 'text' })
  eventCode!: string

  @Property({ name: 'event_classifier_code', type: 'text', nullable: true })
  eventClassifierCode?: TrackingEventClassifierCode | null

  @Property({ name: 'event_date_time', type: Date })
  eventDateTime!: Date

  @Property({ name: 'event_date_time_offset', type: 'text', nullable: true })
  eventDateTimeOffset?: string | null

  @Property({ type: 'text', nullable: true })
  description?: string | null

  @Property({ name: 'raw_data', type: 'jsonb', nullable: true })
  rawData?: Record<string, unknown> | null

  // ─── Equipment Fields (DCSA EQUIPMENT events) ──────────────────

  @Property({ name: 'equipment_reference', type: 'text', nullable: true })
  equipmentReference?: string | null // Container number (BIC ISO)

  @Property({ name: 'iso_equipment_code', type: 'text', nullable: true })
  isoEquipmentCode?: string | null // Container type (22G1, 45R1, etc.)

  @Property({ name: 'empty_indicator_code', type: 'text', nullable: true })
  emptyIndicatorCode?: EmptyIndicatorCode | null

  @Property({ name: 'is_transshipment_move', type: 'boolean', nullable: true })
  isTransshipmentMove?: boolean | null

  // ─── Location Fields ───────────────────────────────────────────

  @Property({ name: 'location_name', type: 'text', nullable: true })
  locationName?: string | null

  @Property({ name: 'location_unlocode', type: 'text', nullable: true })
  locationUnlocode?: string | null

  @Property({ name: 'location_country', type: 'text', nullable: true })
  locationCountry?: string | null

  @Property({ name: 'facility_code', type: 'text', nullable: true })
  facilityCode?: string | null // Terminal/depot code (SMDG/BIC)

  @Property({ name: 'facility_code_list_provider', type: 'text', nullable: true })
  facilityCodeListProvider?: FacilityCodeListProvider | null

  @Property({ name: 'facility_type_code', type: 'text', nullable: true })
  facilityTypeCode?: string | null // POTE, DEPO, CLOC, COFS, INTE, etc.

  @Property({ name: 'facility_address', type: 'text', nullable: true })
  facilityAddress?: string | null // Full address string from carrier (DCSA otherFacility)

  @Property({ type: 'float', nullable: true })
  latitude?: number | null

  @Property({ type: 'float', nullable: true })
  longitude?: number | null

  // ─── Transport Call Fields ─────────────────────────────────────

  @Property({ name: 'transport_call_reference', type: 'text', nullable: true })
  transportCallReference?: string | null

  @Property({ name: 'mode_of_transport', type: 'text', nullable: true })
  modeOfTransport?: ModeOfTransport | null

  @Property({ name: 'vessel_name', type: 'text', nullable: true })
  vesselName?: string | null

  @Property({ name: 'vessel_imo', type: 'text', nullable: true })
  vesselImo?: string | null

  @Property({ name: 'voyage_number', type: 'text', nullable: true })
  voyageNumber?: string | null

  @Property({ name: 'carrier_service_code', type: 'text', nullable: true })
  carrierServiceCode?: string | null

  @Property({ name: 'carrier_export_voyage_number', type: 'text', nullable: true })
  carrierExportVoyageNumber?: string | null

  @Property({ name: 'carrier_import_voyage_number', type: 'text', nullable: true })
  carrierImportVoyageNumber?: string | null

  @Property({ name: 'universal_service_reference', type: 'text', nullable: true })
  universalServiceReference?: string | null

  @Property({ name: 'universal_export_voyage_reference', type: 'text', nullable: true })
  universalExportVoyageReference?: string | null

  @Property({ name: 'universal_import_voyage_reference', type: 'text', nullable: true })
  universalImportVoyageReference?: string | null

  @Property({ name: 'port_visit_reference', type: 'text', nullable: true })
  portVisitReference?: string | null

  // ─── Document References ───────────────────────────────────────

  @Property({ name: 'related_document_references', type: 'jsonb', nullable: true })
  relatedDocumentReferences?: DocumentReference[] | null

  // ─── Metadata Fields ───────────────────────────────────────────

  @Property({ name: 'event_created_date_time', type: Date, nullable: true })
  eventCreatedDateTime?: Date | null

  @Property({ name: 'retracted_event_id', type: 'text', nullable: true })
  retractedEventId?: string | null

  @Property({ name: 'publisher_name', type: 'text', nullable: true })
  publisherName?: string | null

  @Property({ name: 'publisher_role', type: 'text', nullable: true })
  publisherRole?: string | null // CA, AG, VSL, TR, etc.

  // ─── Additional Event Fields ───────────────────────────────────

  @Property({ name: 'delay_reason_code', type: 'text', nullable: true })
  delayReasonCode?: string | null // SMDG delay reason code

  @Property({ name: 'change_remark', type: 'text', nullable: true })
  changeRemark?: string | null

  @Property({ type: 'jsonb', nullable: true })
  seals?: SealInfo[] | null

  // ─── Timestamps ────────────────────────────────────────────────

  @Property({ name: 'created_at', type: Date, defaultRaw: 'now()' })
  createdAt!: Date
}



// ─── CarrierConfig ───────────────────────────────────────────

@Entity({ tableName: 'shipment_tracking_carrier_configs' })
@Index({ name: 'st_carrier_configs_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Unique({ name: 'st_carrier_configs_code_uniq', properties: ['organizationId', 'tenantId', 'carrierCode'] })
export class CarrierConfig {
  [OptionalProps]?: 'isActive' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'rateLimitRequests' | 'rateLimitWindowSeconds'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'carrier_code', type: 'text' })
  carrierCode!: string

  @Property({ name: 'api_endpoint', type: 'text', nullable: true })
  apiEndpoint?: string | null

  @Property({ name: 'auth_config', type: 'jsonb', nullable: true })
  authConfig?: Record<string, unknown> | null

  @Property({ name: 'rate_limit_requests', type: 'integer', default: 60 })
  rateLimitRequests: number = 60

  @Property({ name: 'rate_limit_window_seconds', type: 'integer', default: 60 })
  rateLimitWindowSeconds: number = 60

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'created_at', type: Date, defaultRaw: 'now()' })
  createdAt!: Date

  @Property({ name: 'updated_at', type: Date, defaultRaw: 'now()', onUpdate: () => new Date() })
  updatedAt!: Date

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

// ─── BicConfig ───────────────────────────────────────────────
// Per-tenant configuration for BIC Facility API enrichment

@Entity({ tableName: 'shipment_tracking_bic_configs' })
@Index({ name: 'st_bic_configs_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Unique({ name: 'st_bic_configs_scope_unique', properties: ['organizationId', 'tenantId'] })
export class BicConfig {
  [OptionalProps]?: 'isEnabled' | 'createdAt' | 'updatedAt' | 'baseUrl'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'is_enabled', type: 'boolean', default: false })
  isEnabled: boolean = false

  @Property({ type: 'text' })
  username!: string

  @Property({ type: 'text' })
  password!: string  // Encrypted via tenant data encryption

  @Property({ name: 'base_url', type: 'text', default: 'https://api.bic-code.org' })
  baseUrl: string = 'https://api.bic-code.org'

  @Property({ name: 'created_at', type: Date, defaultRaw: 'now()' })
  createdAt!: Date

  @Property({ name: 'updated_at', type: Date, defaultRaw: 'now()', onUpdate: () => new Date() })
  updatedAt!: Date
}

// ─── Webhook ─────────────────────────────────────────────────

@Entity({ tableName: 'shipment_tracking_webhooks' })
@Index({ name: 'st_webhooks_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
export class Webhook {
  [OptionalProps]?: 'isActive' | 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'text' })
  url!: string

  @Property({ name: 'events_subscribed', type: 'jsonb' })
  eventsSubscribed!: string[]

  @Property({ name: 'hmac_secret', type: 'text', nullable: true })
  hmacSecret?: string | null

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'created_at', type: Date, defaultRaw: 'now()' })
  createdAt!: Date

  @Property({ name: 'updated_at', type: Date, defaultRaw: 'now()', onUpdate: () => new Date() })
  updatedAt!: Date

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  @OneToMany(() => WebhookDelivery, (delivery) => delivery.webhook)
  deliveries = new Collection<WebhookDelivery>(this)
}

// ─── LocationOverride ────────────────────────────────────────
// Per-tenant location data corrections for BIC/SMDG facilities

@Entity({ tableName: 'shipment_tracking_location_overrides' })
@Unique({
  name: 'st_location_overrides_match_uniq',
  properties: ['organizationId', 'tenantId', 'carrierCode', 'unlocode', 'facilityCode', 'facilityCodeListProvider'],
})
@Index({ name: 'st_location_overrides_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'st_location_overrides_lookup_idx', properties: ['unlocode', 'facilityCode', 'facilityCodeListProvider'] })
export class LocationOverride {
  [OptionalProps]?: 'isActive' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'carrierCode' | 'description'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  // Match criteria
  @Property({ name: 'carrier_code', type: 'text', nullable: true })
  carrierCode?: string | null  // null = applies to all carriers

  @Property({ name: 'unlocode', type: 'text', length: 5 })
  unlocode!: string  // e.g., "PLGDN"

  @Property({ name: 'facility_code', type: 'text' })
  facilityCode!: string  // e.g., "PLGDA"

  @Property({ name: 'facility_code_list_provider', type: 'text' })
  facilityCodeListProvider!: FacilityCodeListProvider  // BIC or SMDG

  // Override data (partial FacilityLocation fields)
  @Property({ name: 'override_data', type: 'jsonb' })
  overrideData!: Partial<FacilityLocation>

  // Metadata
  @Property({ type: 'text', nullable: true })
  description?: string | null  // Optional note about why override exists

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'created_at', type: Date, defaultRaw: 'now()' })
  createdAt!: Date

  @Property({ name: 'updated_at', type: Date, defaultRaw: 'now()', onUpdate: () => new Date() })
  updatedAt!: Date

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  @Property({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId?: string | null

  @Property({ name: 'updated_by_user_id', type: 'uuid', nullable: true })
  updatedByUserId?: string | null
}

// ─── WebhookDelivery ─────────────────────────────────────────

@Entity({ tableName: 'shipment_tracking_webhook_deliveries' })
@Index({ name: 'st_webhook_deliveries_webhook_idx', properties: ['webhook'] })
@Index({ name: 'st_webhook_deliveries_status_idx', properties: ['status'] })
@Index({ name: 'st_webhook_deliveries_next_retry_idx', properties: ['nextRetryAt'] })
export class WebhookDelivery {
  [OptionalProps]?: 'createdAt' | 'status' | 'retryCount'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => Webhook, { fieldName: 'webhook_id' })
  webhook!: Webhook

  @Property({ name: 'event_type', type: 'text' })
  eventType!: string

  @Property({ type: 'text', default: 'pending' })
  status: WebhookDeliveryStatus = 'pending'

  @Property({ name: 'retry_count', type: 'integer', default: 0 })
  retryCount: number = 0

  @Property({ name: 'next_retry_at', type: Date, nullable: true })
  nextRetryAt?: Date | null

  @Property({ type: 'jsonb' })
  payload!: Record<string, unknown>

  @Property({ name: 'response_status', type: 'integer', nullable: true })
  responseStatus?: number | null

  @Property({ name: 'response_body', type: 'text', nullable: true })
  responseBody?: string | null

  @Property({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string | null

  @Property({ name: 'created_at', type: Date, defaultRaw: 'now()' })
  createdAt!: Date
}
