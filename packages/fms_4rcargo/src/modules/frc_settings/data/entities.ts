import {
  Entity,
  Index,
  OptionalProps,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/core'

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

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

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

  @Property({ name: 'instance_url', type: 'text', nullable: true })
  instanceUrl?: string | null

  @Property({ name: 'api_key', type: 'text', nullable: true })
  apiKey?: string | null

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
