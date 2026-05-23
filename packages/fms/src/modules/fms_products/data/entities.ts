import { OptionalProps } from '@mikro-orm/core'
import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'
import type { ChargeUnit, CarrierType, ProductTransportMode } from './types'

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
 * FmsProduct - Product / charge item in the system
 *
 * Products represent charge items. Each product has a name and
 * optional charge code, charge unit, and transport mode fields.
 */
@Entity({ tableName: 'fms_products' })
@Index({
  name: 'fms_products_scope_idx',
  properties: ['organizationId', 'tenantId'],
})
@Index({
  name: 'fms_products_charge_code_idx',
  properties: ['organizationId', 'tenantId', 'chargeCode'],
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

  @Property({ name: 'charge_code', type: 'text', nullable: true })
  chargeCode?: string | null

  @Property({ name: 'charge_unit', type: 'text', nullable: true })
  chargeUnit?: ChargeUnit | null

  @Property({ name: 'transport_mode', type: 'text', nullable: true })
  transportMode?: ProductTransportMode | null

  @Property({ name: 'cost_price', type: 'numeric', precision: 18, scale: 4, nullable: true })
  costPrice?: string | null

  @Property({ name: 'default_section_type', type: 'text', nullable: true })
  defaultSectionType?: string | null

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
