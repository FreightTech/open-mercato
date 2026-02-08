import { Entity, PrimaryKey, Property, Index, Unique, ManyToOne, OneToMany, Collection, OptionalProps } from '@mikro-orm/core'

// ─── Enums ───────────────────────────────────────────────────

export type ShipmentStatusEnum =
  | 'ORDERED'
  | 'BOOKED'
  | 'DEPARTED'
  | 'PRE_ARRIVAL'
  | 'IN_PORT'
  | 'DELIVERED'

export type TrackingJobStatusEnum = 'active' | 'paused' | 'deactivated' | 'failed'

export type CargoEventType = 'EQUIPMENT' | 'TRANSPORT' | 'SHIPMENT'

export type CargoEventClassification = 'ACT' | 'PLN' | 'EST'

export type WebhookDeliveryStatus = 'pending' | 'success' | 'failed'

export type TrackingReferenceType = 'container' | 'booking' | 'bol'

// ─── Shipment ────────────────────────────────────────────────

@Entity({ tableName: 'shipment_tracking_shipments' })
@Index({ name: 'st_shipments_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'st_shipments_status_idx', properties: ['status'] })
@Index({ name: 'st_shipments_carrier_idx', properties: ['carrierCode'] })
@Index({ name: 'st_shipments_company_name_idx', properties: ['companyName'] })
export class Shipment {
  [OptionalProps]?: 'isActive' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'status' | 'eventCount'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'text', default: 'ORDERED' })
  status: ShipmentStatusEnum = 'ORDERED'

  @Property({ name: 'company_name', type: 'text', nullable: true })
  companyName?: string | null

  @Property({ name: 'carrier_code', type: 'text', nullable: true })
  carrierCode?: string | null

  @Property({ name: 'container_number', type: 'text', nullable: true })
  containerNumber?: string | null

  @Property({ name: 'booking_number', type: 'text', nullable: true })
  bookingNumber?: string | null

  @Property({ name: 'bol_number', type: 'text', nullable: true })
  bolNumber?: string | null

  // Estimated / Actual departure and arrival
  @Property({ type: Date, nullable: true })
  etd?: Date | null

  @Property({ name: 'etd_offset', type: 'text', nullable: true })
  etdOffset?: string | null

  @Property({ type: Date, nullable: true })
  eta?: Date | null

  @Property({ name: 'eta_offset', type: 'text', nullable: true })
  etaOffset?: string | null

  @Property({ type: Date, nullable: true })
  atd?: Date | null

  @Property({ name: 'atd_offset', type: 'text', nullable: true })
  atdOffset?: string | null

  @Property({ type: Date, nullable: true })
  ata?: Date | null

  @Property({ name: 'ata_offset', type: 'text', nullable: true })
  ataOffset?: string | null

  // Origin
  @Property({ name: 'origin_name', type: 'text', nullable: true })
  originName?: string | null

  @Property({ name: 'origin_unlocode', type: 'text', nullable: true })
  originUnlocode?: string | null

  @Property({ name: 'origin_country', type: 'text', nullable: true })
  originCountry?: string | null

  // Destination
  @Property({ name: 'destination_name', type: 'text', nullable: true })
  destinationName?: string | null

  @Property({ name: 'destination_unlocode', type: 'text', nullable: true })
  destinationUnlocode?: string | null

  @Property({ name: 'destination_country', type: 'text', nullable: true })
  destinationCountry?: string | null

  // Vessel
  @Property({ name: 'vessel_name', type: 'text', nullable: true })
  vesselName?: string | null

  @Property({ name: 'vessel_imo', type: 'text', nullable: true })
  vesselImo?: string | null

  @Property({ name: 'event_count', type: 'integer', default: 0 })
  eventCount: number = 0

  @Property({ type: 'jsonb', nullable: true })
  extra?: Record<string, unknown> | null

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

  @OneToMany(() => TrackingJob, (job) => job.shipment)
  trackingJobs = new Collection<TrackingJob>(this)

  @OneToMany(() => CargoEvent, (event) => event.shipment)
  cargoEvents = new Collection<CargoEvent>(this)
}

// ─── TrackingJob ─────────────────────────────────────────────

@Entity({ tableName: 'shipment_tracking_jobs' })
@Index({ name: 'st_jobs_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'st_jobs_status_idx', properties: ['status'] })
@Index({ name: 'st_jobs_next_poll_idx', properties: ['nextPollAt'] })
export class TrackingJob {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt' | 'status' | 'retryCount'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @ManyToOne(() => Shipment, { fieldName: 'shipment_id' })
  shipment!: Shipment

  @Property({ name: 'carrier_name', type: 'text' })
  carrierName!: string

  @Property({ name: 'reference_type', type: 'text' })
  referenceType!: TrackingReferenceType

  @Property({ name: 'reference_value', type: 'text' })
  referenceValue!: string

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
}

// ─── CargoEvent ──────────────────────────────────────────────

@Entity({ tableName: 'shipment_tracking_cargo_events' })
@Index({ name: 'st_cargo_events_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'st_cargo_events_shipment_idx', properties: ['shipment'] })
@Unique({ name: 'st_cargo_events_event_id_uniq', properties: ['shipment', 'eventId'] })
export class CargoEvent {
  [OptionalProps]?: 'createdAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @ManyToOne(() => Shipment, { fieldName: 'shipment_id' })
  shipment!: Shipment

  @Property({ name: 'event_id', type: 'text' })
  eventId!: string

  @Property({ name: 'event_type', type: 'text' })
  eventType!: CargoEventType

  @Property({ name: 'event_code', type: 'text' })
  eventCode!: string

  @Property({ name: 'event_classification', type: 'text', nullable: true })
  eventClassification?: CargoEventClassification | null

  @Property({ name: 'event_date_time', type: Date })
  eventDateTime!: Date

  @Property({ name: 'event_date_time_offset', type: 'text', nullable: true })
  eventDateTimeOffset?: string | null

  @Property({ type: 'text', nullable: true })
  description?: string | null

  // Location
  @Property({ name: 'location_name', type: 'text', nullable: true })
  locationName?: string | null

  @Property({ name: 'location_unlocode', type: 'text', nullable: true })
  locationUnlocode?: string | null

  @Property({ name: 'location_country', type: 'text', nullable: true })
  locationCountry?: string | null

  // Vessel
  @Property({ name: 'vessel_name', type: 'text', nullable: true })
  vesselName?: string | null

  @Property({ name: 'vessel_imo', type: 'text', nullable: true })
  vesselImo?: string | null

  @Property({ name: 'voyage_number', type: 'text', nullable: true })
  voyageNumber?: string | null

  @Property({ name: 'raw_data', type: 'jsonb', nullable: true })
  rawData?: Record<string, unknown> | null

  @Property({ name: 'created_at', type: Date, defaultRaw: 'now()' })
  createdAt!: Date
}

// ─── CarrierConfig ───────────────────────────────────────────

@Entity({ tableName: 'shipment_tracking_carrier_configs' })
@Index({ name: 'st_carrier_configs_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Unique({ name: 'st_carrier_configs_name_company_uniq', properties: ['organizationId', 'tenantId', 'carrierName', 'companyName'] })
export class CarrierConfig {
  [OptionalProps]?: 'isActive' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'rateLimitRequests' | 'rateLimitWindowSeconds'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'carrier_name', type: 'text' })
  carrierName!: string

  @Property({ name: 'company_name', type: 'text', nullable: true })
  companyName?: string | null

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

// ─── Company ────────────────────────────────────────────────

@Entity({ tableName: 'shipment_tracking_companies' })
@Index({ name: 'st_companies_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Unique({ name: 'st_companies_name_uniq', properties: ['organizationId', 'tenantId', 'name'] })
export class ShipmentTrackingCompany {
  [OptionalProps]?: 'isActive' | 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'text' })
  name!: string

  @Property({ type: 'text', nullable: true })
  description?: string | null

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'created_at', type: Date, defaultRaw: 'now()' })
  createdAt!: Date

  @Property({ name: 'updated_at', type: Date, defaultRaw: 'now()', onUpdate: () => new Date() })
  updatedAt!: Date

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
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
