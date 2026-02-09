import {
  Collection,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  OptionalProps,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/core'
import type { ChargeUnit, ChargeCodeUsage, CarrierType } from './types'

/**
 * FmsCarrier - Shipping lines, airlines, and transport operators
 *
 * Carriers are the companies that operate the actual transport services.
 * Examples: MSC, Maersk, Hapag-Lloyd (sea), Lufthansa Cargo, Emirates SkyCargo (air)
 */
@Entity({ tableName: 'fms_carriers' })
@Index({
  name: 'fms_carriers_scope_idx',
  properties: ['organizationId', 'tenantId'],
})
@Unique({
  name: 'fms_carriers_code_unique',
  properties: ['organizationId', 'tenantId', 'code'],
})
export class FmsCarrier {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'text' })
  code!: string

  @Property({ type: 'text' })
  name!: string

  @Property({ name: 'carrier_type', type: 'text' })
  carrierType!: CarrierType

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy?: string | null

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}


/**
 * FmsChargeCode - Dictionary of freight charge types (system-defined and custom)
 */
@Entity({ tableName: 'fms_charge_codes' })
@Index({
  name: 'fms_charge_codes_scope_idx',
  properties: ['organizationId', 'tenantId'],
})
@Unique({
  name: 'fms_charge_codes_code_unique',
  properties: ['organizationId', 'tenantId', 'code'],
})
export class FmsChargeCode {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'text' })
  code!: string

  @Property({ type: 'text', nullable: true })
  name?: string | null

  @Property({ type: 'text', nullable: true })
  description?: string | null

  @Property({ name: 'charge_unit', type: 'text' })
  chargeUnit!: ChargeUnit

  @Property({ type: 'text', nullable: true })
  keywords?: string | null

  @Property({ type: 'text', nullable: true })
  usage?: ChargeCodeUsage | null

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy?: string | null

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  @OneToMany(() => FmsProduct, (product) => product.chargeCode)
  products = new Collection<FmsProduct>(this)
}

/**
 * FmsProduct - Simplified product entity
 *
 * Products represent charge items in the system. Each product has a name and
 * an optional charge code that determines its billing type.
 */
@Entity({ tableName: 'fms_products' })
@Index({
  name: 'fms_products_scope_idx',
  properties: ['organizationId', 'tenantId'],
})
@Index({
  name: 'fms_products_charge_code_idx',
  properties: ['chargeCode'],
})
@Index({
  name: 'fms_products_active_idx',
  properties: ['organizationId', 'tenantId', 'isActive'],
})
export class FmsProduct {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ type: 'text' })
  name!: string

  @ManyToOne(() => FmsChargeCode, {
    fieldName: 'charge_code_id',
    deleteRule: 'set null',
    nullable: true,
  })
  chargeCode?: FmsChargeCode | null

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy?: string | null

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}
