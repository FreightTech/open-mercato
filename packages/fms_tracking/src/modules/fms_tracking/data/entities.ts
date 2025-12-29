import { Entity, OptionalProps, PrimaryKey, Property, ManyToOne, Unique } from '@mikro-orm/core'

// Admin settings
@Entity({ tableName: 'fms_tracking_freighttech_settings' })
@Unique({ name: 'fms_tracking_freighttech_settings_scope_unique', properties: ['organizationId', 'tenantId'] })
export class FreighttechTrackingSettings {
  [OptionalProps]?: 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'api_key', type: 'text', default: '' })
  apiKey: string = ''

  @Property({ name: 'api_base_url', type: 'text', default: '' })
  apiBaseUrl: string = ''

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

// Location entity
@Entity({ tableName: 'fms_tracking_locations' })
@Unique({ 
  name: 'fms_tracking_locations_geolocation_unique', 
  properties: ['unlocode', 'latitude', 'longitude'] 
})
export class Location {
  [OptionalProps]?: 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'name', type: 'text' })
  name!: string

  @Property({ name: 'city', type: 'text' })
  city!: string

  @Property({ name: 'state', type: 'text' })
  state!: string

  @Property({ name: 'country', type: 'text' })
  country!: string

  @Property({ name: 'unlocode', type: 'text' })
  unlocode!: string

  @Property({ name: 'firms_cd', type: 'text', nullable: true })
  firmsCd: string | null = null

  @Property({ name: 'bic_cd', type: 'text', nullable: true })
  bicCd: string | null = null

  @Property({ name: 'smdg_cd', type: 'text', nullable: true })
  smdgCd: string | null = null

  @Property({ name: 'facility', type: 'text', nullable: true })
  facility: string | null = null

  @Property({ name: 'latitude', type: 'float' })
  latitude!: number

  @Property({ name: 'longitude', type: 'float' })
  longitude!: number

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

// Webhook event entity
@Entity({ tableName: 'fms_tracking_webhook_events' })
export class WebhookEvent {
  [OptionalProps]?: 'createdAt' | 'updatedAt'

  // Using reference_id as primary key to avoid duplication
  @PrimaryKey({ name: 'reference_id', type: 'uuid' })
  referenceId!: string

  @Property({ name: 'id', type: 'uuid' })
  id!: string

  @Property({ name: 'parent_reference_id', type: 'uuid', nullable: true })
  parentReferenceId: string | null = null

  @Property({ name: 'status', type: 'text' })
  status!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'container_id', type: 'text' })
  containerId!: string

  @Property({ name: 'carrier_scac', type: 'text' })
  carrierScac!: string

  @Property({ name: 'container_iso', type: 'text' })
  containerIso!: string

  @Property({ name: 'bill_of_lading', type: 'text', nullable: true })
  billOfLading: string | null = null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

// Milestone entity
@Entity({ tableName: 'fms_tracking_milestones' })
@Unique({ 
  name: 'fms_tracking_milestones_external_id_unique', 
  properties: ['externalId', 'webhookEvent'] 
})
export class Milestone {
  [OptionalProps]?: 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'external_id', type: 'text' })
  externalId!: string

  @ManyToOne(() => WebhookEvent)
  webhookEvent!: WebhookEvent

  @Property({ name: 'timestamp', type: 'timestamptz' })
  timestamp!: Date

  @ManyToOne(() => Location)
  location!: Location

  @Property({ name: 'description', type: 'text' })
  description!: string

  @Property({ name: 'raw_description', type: 'text' })
  rawDescription!: string

  @Property({ name: 'journey_type', type: 'text' })
  journeyType!: string

  @Property({ name: 'event_classifier', type: 'text' })
  eventClassifier!: string

  @Property({ name: 'event_type', type: 'text' })
  eventType!: string

  @Property({ name: 'empty_indicator', type: 'text', nullable: true })
  emptyIndicator: string | null = null

  @Property({ name: 'transport_mode', type: 'text', nullable: true })
  transportMode: string | null = null

  @Property({ name: 'facility_type', type: 'text', nullable: true })
  facilityType: string | null = null

  @Property({ name: 'document_type', type: 'text', nullable: true })
  documentType: string | null = null

  @Property({ name: 'type_code', type: 'text', nullable: true })
  typeCode: string | null = null

  @Property({ name: 'vessel', type: 'text', nullable: true })
  vessel: string | null = null

  @Property({ name: 'vessel_imo', type: 'text', nullable: true })
  vesselImo: string | null = null

  @Property({ name: 'vessel_mmsi', type: 'text', nullable: true })
  vesselMmsi: string | null = null

  @Property({ name: 'voyage', type: 'text', nullable: true })
  voyage: string | null = null

  @Property({ name: 'planned', type: 'boolean' })
  planned!: boolean

  @Property({ name: 'mode', type: 'text', nullable: true })
  mode: string | null = null

  @Property({ name: 'source', type: 'text' })
  source!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

