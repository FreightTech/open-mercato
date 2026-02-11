import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/core'

@Entity({ tableName: 'frc_airports' })
@Index({ name: 'frc_airports_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'frc_airports_code_idx', properties: ['organizationId', 'tenantId', 'code'] })
export class FrcAirport {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  /** IATA airport code (e.g., "TLL", "JFK") */
  @Property({ type: 'text', length: 10 })
  code!: string

  /** Full description (e.g., "TLL - Tallinn, Estonia") */
  @Property({ name: 'long_code', type: 'text', length: 255 })
  longCode!: string

  @Property({ type: 'text', nullable: true, length: 100 })
  city?: string | null

  @Property({ type: 'text', nullable: true, length: 100 })
  country?: string | null

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}
