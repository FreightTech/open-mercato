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
import type { ChargeUnit, ChargeCodeUsage, ContractType, ProductType, CarrierType } from './types'
import { Contractor } from '../../contractors/data/entities'
import { FmsLocation } from '../../fms_locations/data/entities'

/**
 * FmsCarrier - Shipping lines, airlines, and transport operators
 *
 * Carriers are the companies that operate the actual transport services.
 * Examples: MSC, Maersk, Hapag-Lloyd (sea), Lufthansa Cargo, Emirates SkyCargo (air)
 *
 * Key distinction from Provider:
 * - Carrier = Who operates the service (the shipping line)
 * - Provider = Who sells/invoices you (the forwarder/agent)
 *
 * You can buy the same MSC service from 50 different agents.
 * The carrier is always MSC, but the provider varies.
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

  @OneToMany(() => FmsProduct, (product) => product.carrier)
  products = new Collection<FmsProduct>(this)
}

/**
 * FmsPriceType - Bundle/pricing model types
 *
 * Describes what's included in the price (all-in, ocean freight only, etc.)
 * Examples: All Inclusive, Ocean Freight Only, OF + BAF, CIF, DDP
 */
@Entity({ tableName: 'fms_price_types' })
@Index({
  name: 'fms_price_types_scope_idx',
  properties: ['organizationId', 'tenantId'],
})
@Unique({
  name: 'fms_price_types_code_unique',
  properties: ['organizationId', 'tenantId', 'code'],
})
export class FmsPriceType {
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

  @Property({ type: 'text', nullable: true })
  description?: string | null

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

  @OneToMany(() => FmsProductVariant, (variant) => variant.priceType)
  variants = new Collection<FmsProductVariant>(this)
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

  @Property({ type: 'jsonb', nullable: true })
  keywords?: string[] | null

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
 * FmsProduct - Unified product entity for all freight product types
 *
 * Product types: GFRT, GTHC, GBAF, GBAF_PIECE, GBOL, GCUS, CUSTOM
 * Type-specific fields are nullable and used based on productType
 *
 * Key relationships:
 * - carrier: The shipping line/airline operating the service (product level)
 * - provider: Who invoices you for this rate (variant level)
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
  name: 'fms_products_carrier_idx',
  properties: ['carrier'],
})
@Index({
  name: 'fms_products_active_idx',
  properties: ['organizationId', 'tenantId', 'isActive'],
})
@Index({
  name: 'fms_products_product_type_index',
  properties: ['productType'],
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

  @Property({ name: 'product_type', type: 'text' })
  productType!: ProductType

  @ManyToOne(() => FmsChargeCode, {
    fieldName: 'charge_code_id',
    deleteRule: 'set null',
    nullable: true,
  })
  chargeCode?: FmsChargeCode | null

  /**
   * Carrier - The shipping line/airline operating this service
   * Examples: MSC, Maersk, Hapag-Lloyd, Lufthansa Cargo
   */
  @ManyToOne(() => FmsCarrier, {
    fieldName: 'carrier_id',
    deleteRule: 'set null',
    nullable: true,
  })
  carrier?: FmsCarrier | null

  @Property({ name: 'internal_notes', type: 'text', nullable: true })
  internalNotes?: string | null

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  // GFRT fields
  @Property({ type: 'text', nullable: true })
  loop?: string | null

  @ManyToOne(() => FmsLocation, {
    fieldName: 'source_id',
    deleteRule: 'set null',
    nullable: true,
  })
  source?: FmsLocation | null

  @ManyToOne(() => FmsLocation, {
    fieldName: 'destination_id',
    deleteRule: 'set null',
    nullable: true,
  })
  destination?: FmsLocation | null

  @Property({ name: 'transit_time', type: 'int', nullable: true })
  transitTime?: number | null

  // GTHC fields
  @ManyToOne(() => FmsLocation, {
    fieldName: 'location_id',
    deleteRule: 'set null',
    nullable: true,
  })
  location?: FmsLocation | null

  // Common optional fields
  @Property({ type: 'text', nullable: true })
  description?: string | null

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

  @OneToMany(() => FmsProductVariant, (variant) => variant.product)
  variants = new Collection<FmsProductVariant>(this)
}

/**
 * FmsProductVariant - Product variant entity with flattened pricing
 *
 * Each variant represents a specific offering with:
 * - Container size (20DV, 40DV, 40HC)
 * - Provider who invoices you (Contractor)
 * - Price type (All-in, OF only, etc.)
 * - Validity period
 * - Price and currency
 *
 * Different prices = different variant rows (one price per variant)
 */
@Entity({ tableName: 'fms_product_variants' })
@Index({
  name: 'fms_product_variants_scope_idx',
  properties: ['organizationId', 'tenantId'],
})
@Index({
  name: 'fms_product_variants_product_idx',
  properties: ['product'],
})
@Index({
  name: 'fms_product_variants_provider_idx',
  properties: ['provider'],
})
@Index({
  name: 'fms_product_variants_validity_idx',
  properties: ['validityStart', 'validityEnd'],
})
@Index({
  name: 'fms_product_variants_active_validity_idx',
  properties: ['product', 'isActive', 'validityStart', 'validityEnd'],
})
export class FmsProductVariant {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @ManyToOne(() => FmsProduct, { deleteRule: 'cascade' })
  product!: FmsProduct

  /**
   * Provider - Who invoices you for this rate
   * This is the forwarder/agent, not the carrier
   */
  @ManyToOne(() => Contractor, {
    fieldName: 'provider_id',
    deleteRule: 'set null',
    nullable: true,
  })
  provider?: Contractor | null

  /**
   * Price type - What's included in the price (All-in, OF only, etc.)
   */
  @ManyToOne(() => FmsPriceType, {
    fieldName: 'price_type_id',
    deleteRule: 'set null',
    nullable: true,
  })
  priceType?: FmsPriceType | null

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  // Container variant fields
  @Property({ name: 'container_size', type: 'text', nullable: true })
  containerSize?: string | null

  // ========================================
  // Pricing fields (moved from FmsProductPrice)
  // ========================================

  /**
   * Validity start date for this price
   */
  @Property({ name: 'validity_start', type: 'date', nullable: true })
  validityStart?: Date | null

  /**
   * Validity end date (null = no expiration)
   */
  @Property({ name: 'validity_end', type: 'date', nullable: true })
  validityEnd?: Date | null

  /**
   * Price amount
   */
  @Property({ type: 'numeric', precision: 18, scale: 2, nullable: true })
  price?: string | null

  /**
   * Currency code (ISO 4217)
   */
  @Property({ name: 'currency_code', type: 'text', default: 'USD' })
  currencyCode: string = 'USD'

  /**
   * Reference - Contract number, "FAK" for spot rates, or other identifier
   * Replaces contractType + contractNumber from the old FmsProductPrice
   */
  @Property({ type: 'text', nullable: true })
  reference?: string | null

  /**
   * Internal notes - For internal comments/context about this variant
   */
  @Property({ name: 'internal_notes', type: 'text', nullable: true })
  internalNotes?: string | null

  // ========================================
  // Audit fields
  // ========================================

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

// Note: FmsProductPrice has been removed - pricing is now flattened into FmsProductVariant
// Each variant row represents a specific price offering

