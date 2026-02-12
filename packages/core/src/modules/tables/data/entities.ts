import {
  Entity,
  PrimaryKey,
  Property,
  Index,
  OptionalProps,
} from '@mikro-orm/core'

@Entity({ tableName: 'table_definitions' })
@Index({ name: 'table_definitions_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
export class TableDefinition {
  [OptionalProps]?: 'isActive' | 'hasHeaderRow' | 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'text' })
  name!: string

  @Property({ name: 'site_id', type: 'text' })
  siteId!: string

  @Property({ name: 'drive_id', type: 'text' })
  driveId!: string

  @Property({ name: 'item_id', type: 'text' })
  itemId!: string

  @Property({ name: 'file_path', type: 'text', nullable: true })
  filePath?: string | null

  @Property({ name: 'worksheet_name', type: 'text' })
  worksheetName!: string

  @Property({ name: 'data_range', type: 'text', nullable: true })
  dataRange?: string | null

  @Property({ name: 'column_config', type: 'jsonb', nullable: true })
  columnConfig?: Record<string, unknown> | null

  @Property({ name: 'has_header_row', type: 'boolean', default: true })
  hasHeaderRow: boolean = true

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'created_at', type: 'timestamptz', defaultRaw: 'now()' })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: 'timestamptz', defaultRaw: 'now()', onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date | null
}
