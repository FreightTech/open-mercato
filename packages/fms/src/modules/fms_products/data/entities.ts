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
import type { ChargeCodeFieldSchema, ChargeUnit, ContractType, ProductType } from './types'
import { Contractor } from '../../contractors/data/entities'
import { FmsLocation } from '../../fms_locations/data/entities'

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
  description?: string | null

  @Property({ name: 'charge_unit', type: 'text' })
  chargeUnit!: ChargeUnit

  @Property({ name: 'field_schema', type: 'jsonb', nullable: true })
  fieldSchema?: ChargeCodeFieldSchema | null

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
  name: 'fms_products_contractor_idx',
  properties: ['serviceProvider'],
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

  @ManyToOne(() => Contractor, {
    fieldName: 'service_provider_id',
    deleteRule: 'set null',
    nullable: true,
  })
  serviceProvider?: Contractor | null

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
 * FmsProductVariant - Product variant entity
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
  name: 'fms_product_variants_variant_type_index',
  properties: ['variantType'],
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

  @ManyToOne(() => Contractor, {
    fieldName: 'provider_id',
    deleteRule: 'set null',
    nullable: true,
  })
  provider?: Contractor | null

  @Property({ name: 'variant_type', type: 'text' })
  variantType!: 'container' | 'simple'

  @Property({ type: 'text', nullable: true })
  name?: string | null

  @Property({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean = false

  @Property({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true

  // Container variant fields
  @Property({ name: 'container_size', type: 'text', nullable: true })
  containerSize?: string | null

  @Property({ name: 'container_type', type: 'text', nullable: true })
  containerType?: string | null

  @Property({ name: 'weight_limit', type: 'numeric', nullable: true })
  weightLimit?: number | null

  @Property({ name: 'weight_unit', type: 'text', nullable: true })
  weightUnit?: string | null

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

  @OneToMany(() => FmsProductPrice, (price) => price.variant)
  prices = new Collection<FmsProductPrice>(this)
}

/**
 * FmsProductPrice - Time-bound, contract-based pricing
 */
@Entity({ tableName: 'fms_product_prices' })
@Index({
  name: 'fms_product_prices_scope_idx',
  properties: ['organizationId', 'tenantId'],
})
@Index({
  name: 'fms_product_prices_variant_idx',
  properties: ['variant'],
})
@Index({
  name: 'fms_product_prices_validity_idx',
  properties: ['variant', 'validityStart', 'validityEnd'],
})
@Index({
  name: 'fms_product_prices_contract_idx',
  properties: ['contractType', 'contractNumber'],
})
@Index({
  name: 'fms_product_prices_active_idx',
  properties: ['variant', 'isActive', 'validityStart', 'validityEnd'],
})
export class FmsProductPrice {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @ManyToOne(() => FmsProductVariant, {
    fieldName: 'variant_id',
    nullable: false,
    deleteRule: 'cascade',
  })
  variant!: FmsProductVariant

  @Property({ name: 'validity_start', type: 'date' })
  validityStart!: Date

  @Property({ name: 'validity_end', type: 'date', nullable: true })
  validityEnd?: Date | null

  @Property({ name: 'contract_type', type: 'text' })
  contractType!: ContractType

  @Property({ name: 'contract_number', type: 'text', nullable: true })
  contractNumber?: string | null

  @Property({ type: 'numeric', precision: 18, scale: 2 })
  price!: string

  @Property({ name: 'currency_code', type: 'text', default: 'USD' })
  currencyCode: string = 'USD'

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

