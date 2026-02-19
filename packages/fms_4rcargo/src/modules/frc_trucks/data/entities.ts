import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/core'

@Entity({ tableName: 'frc_trucks' })
@Index({ name: 'frc_trucks_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
export class FrcTruck {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  /** Truck identifier (e.g., "4R6000-TLL-FRA") */
  @Property({ type: 'text', length: 100 })
  name!: string

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

// FrcTruckBooking has been merged into FrcConsole
// See frc_console/data/entities.ts

@Entity({ tableName: 'frc_truck_presets' })
@Index({ name: 'frc_truck_presets_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
export class FrcTruckPreset {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  /** Display name (e.g., "Standard Semi-Trailer", "Mega Trailer") */
  @Property({ type: 'text', length: 100 })
  name!: string

  /** Internal dimensions in centimeters */
  @Property({ type: 'integer' })
  width!: number

  @Property({ type: 'integer' })
  length!: number

  @Property({ type: 'integer' })
  height!: number

  /** Maximum payload weight in kilograms */
  @Property({ name: 'max_weight', type: 'integer' })
  maxWeight!: number

  /** Calculated volume in cubic meters (auto-calculated from dimensions) */
  @Property({ type: 'numeric', precision: 10, scale: 2 })
  volume!: number

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}
