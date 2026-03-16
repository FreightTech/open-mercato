import {
  Entity,
  Index,
  OptionalProps,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/core'

/**
 * @deprecated This entity is deprecated. Use the FMS EmailTemplate entity instead:
 * - Import from '@open-mercato/fms/modules/email_templates/data/entities'
 * - Use templateType='offer' for offer email templates
 * 
 * The table is kept for backward compatibility. Data has been migrated to fms_email_templates.
 * This entity will be removed in a future version.
 */
@Entity({ tableName: 'frc_offer_templates' })
@Index({ name: 'frc_offer_templates_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
export class FrcOfferTemplate {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'isDefault' | 'isActive'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'text', length: 255 })
  name!: string

  @Property({ type: 'text', nullable: true })
  description?: string | null

  @Property({ name: 'subject_template', type: 'text' })
  subjectTemplate!: string

  @Property({ name: 'content_template', type: 'text' })
  contentTemplate!: string

  @Property({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean = false

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

/**
 * Default pricing configuration for freight calculations.
 * Stores volumetric conversion factors for different transport modes.
 *
 * Chargeable weight = MAX(actual weight, volumetric weight)
 * Volumetric weight = volume (m³) × conversion factor
 */
@Entity({ tableName: 'frc_pricing_config' })
@Index({ name: 'frc_pricing_config_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Unique({
  name: 'frc_pricing_config_scope_unique',
  properties: ['organizationId', 'tenantId'],
})
export class FrcPricingConfig {
  [OptionalProps]?: 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  /** Air freight volumetric factor: 1 m³ = X kg (IATA standard: 167) */
  @Property({ name: 'air_volumetric_factor', type: 'decimal', precision: 10, scale: 2, default: '167' })
  airVolumetricFactor: string = '167'

  /** Sea freight volumetric factor: 1 m³ = X kg (standard: 1000, i.e., 1 CBM = 1 ton) */
  @Property({ name: 'sea_volumetric_factor', type: 'decimal', precision: 10, scale: 2, default: '1000' })
  seaVolumetricFactor: string = '1000'

  /** Road freight volumetric factor: 1 m³ = X kg (standard: 333) */
  @Property({ name: 'road_volumetric_factor', type: 'decimal', precision: 10, scale: 2, default: '333' })
  roadVolumetricFactor: string = '333'

  /** Standard truck width in metres for loading metres calculation (default: 2.4m) */
  @Property({ name: 'truck_width_metres', type: 'decimal', precision: 5, scale: 2, default: '2.4' })
  truckWidthMetres: string = '2.4'

  /** Global minimum chargeable weight in kg (optional) */
  @Property({ name: 'min_chargeable_weight_kg', type: 'decimal', precision: 10, scale: 2, nullable: true })
  minChargeableWeightKg?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

/**
 * Per-carrier pricing configuration overrides.
 * Allows specific carriers to have different conversion factors.
 * If set, carrier-specific values take precedence over defaults.
 */
@Entity({ tableName: 'frc_carrier_pricing_config' })
@Index({ name: 'frc_carrier_pricing_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Unique({
  name: 'frc_carrier_pricing_unique',
  properties: ['organizationId', 'tenantId', 'carrierId'],
})
export class FrcCarrierPricingConfig {
  [OptionalProps]?: 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  /** References Contractor entity (carrier) */
  @Property({ name: 'carrier_id', type: 'uuid' })
  carrierId!: string

  /** Carrier name (denormalized for display) */
  @Property({ name: 'carrier_name', type: 'text' })
  carrierName!: string

  /** Transport mode: 'air' | 'sea' | 'road' */
  @Property({ name: 'transport_mode', type: 'text' })
  transportMode!: string

  /** Override volumetric factor - if null, use default for transport mode */
  @Property({ name: 'volumetric_factor', type: 'decimal', precision: 10, scale: 2, nullable: true })
  volumetricFactor?: string | null

  /** Override minimum chargeable weight in kg */
  @Property({ name: 'min_chargeable_weight_kg', type: 'decimal', precision: 10, scale: 2, nullable: true })
  minChargeableWeightKg?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

/**
 * SugarCRM integration configuration (per tenant)
 *
 * Note: Credentials are stored in environment variables, not in the database.
 * See SUGARCRM_INSTANCE_URL, SUGARCRM_USERNAME, SUGARCRM_PASSWORD env vars.
 */
@Entity({ tableName: 'frc_sugarcrm_config' })
@Index({ name: 'frc_sugarcrm_config_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Unique({
  name: 'frc_sugarcrm_config_scope_unique',
  properties: ['organizationId', 'tenantId'],
})
export class FrcSugarCrmConfig {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'isEnabled'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'is_enabled', type: 'boolean', default: false })
  isEnabled: boolean = false

  @Property({ name: 'last_sync_at', type: Date, nullable: true })
  lastSyncAt?: Date | null

  @Property({ name: 'last_sync_status', type: 'text', nullable: true })
  lastSyncStatus?: 'success' | 'error' | null

  @Property({ name: 'last_sync_message', type: 'text', nullable: true })
  lastSyncMessage?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}

/**
 * Maps SugarCRM records to local 4RCargo entities
 *
 * This table is used to track which SugarCRM records have been synced
 * and to which local entities they correspond. This enables:
 * - Updating existing records on subsequent syncs (instead of creating duplicates)
 * - Linking related records (e.g., Contacts to their parent Accounts)
 *
 * This is a temporary integration table that can be dropped when migration is complete.
 */
@Entity({ tableName: 'frc_sugarcrm_mappings' })
@Index({ name: 'frc_sugarcrm_mappings_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'frc_sugarcrm_mappings_sugar_idx', properties: ['sugarCrmModule', 'sugarCrmRecordId'] })
@Index({ name: 'frc_sugarcrm_mappings_local_idx', properties: ['localEntityType', 'localEntityId'] })
@Unique({
  name: 'frc_sugarcrm_mappings_unique',
  properties: ['organizationId', 'tenantId', 'sugarCrmModule', 'sugarCrmRecordId', 'localEntityType'],
})
export class FrcSugarCrmMapping {
  [OptionalProps]?: 'createdAt' | 'updatedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  /** SugarCRM module name (e.g., 'Accounts', 'Contacts', 'Opportunities') */
  @Property({ name: 'sugarcrm_module', type: 'text' })
  sugarCrmModule!: string

  /** SugarCRM record ID */
  @Property({ name: 'sugarcrm_record_id', type: 'text' })
  sugarCrmRecordId!: string

  /** Local entity type (e.g., 'Contractor', 'ContractorContact', 'FrcRfq') */
  @Property({ name: 'local_entity_type', type: 'text' })
  localEntityType!: string

  /** Local entity ID (UUID) */
  @Property({ name: 'local_entity_id', type: 'uuid' })
  localEntityId!: string

  /** Last successful sync timestamp */
  @Property({ name: 'last_sync_at', type: Date })
  lastSyncAt!: Date

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()
}
