import {
  Collection,
  Entity,
  Index,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/core'
import type {
  FmsQuoteStatus,
  FmsOfferStatus,
  FmsDirection,
  FmsTransportMode,
  ExchangeRateSnapshot,
} from './types'
import { Contractor } from '../../contractors/data/entities'
import { FmsLocation } from '../../fms_locations/data/entities'

@Entity({ tableName: 'fms_quotes' })
@Index({ name: 'fms_quotes_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'fms_quotes_status_idx', properties: ['organizationId', 'tenantId', 'status'] })
export class FmsQuote {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'quote_number', type: 'text', nullable: true })
  quoteNumber?: string | null

  @ManyToOne(() => Contractor, { fieldName: 'client_id', nullable: true })
  client?: Contractor | null

  @Property({ name: 'operational_guardian_id', type: 'uuid', nullable: true })
  operationalGuardianId?: string | null

  @Property({ name: 'business_guardian_id', type: 'uuid', nullable: true })
  businessGuardianId?: string | null

  @Property({ name: 'container_count', type: 'integer', nullable: true })
  containerCount?: number | null

  @Property({ name: 'status', type: 'text', default: 'draft' })
  status: FmsQuoteStatus = 'draft'

  @Property({ name: 'direction', type: 'text', nullable: true })
  direction?: FmsDirection | null

  @Property({ name: 'cargo_type', type: 'text', nullable: true })
  cargoType?: string | null

  @Property({ name: 'modes', type: 'json', nullable: true })
  modes?: FmsTransportMode[] | null

  @ManyToMany(() => FmsLocation, undefined, {
    pivotTable: 'fms_quote_origin_ports',
    joinColumn: 'quote_id',
    inverseJoinColumn: 'location_id',
  })
  originPorts = new Collection<FmsLocation>(this)

  @ManyToMany(() => FmsLocation, undefined, {
    pivotTable: 'fms_quote_destination_ports',
    joinColumn: 'quote_id',
    inverseJoinColumn: 'location_id',
  })
  destinationPorts = new Collection<FmsLocation>(this)

  @Property({ name: 'currency_code', type: 'text', default: 'USD' })
  currencyCode: string = 'USD'

  @Property({ name: 'notes', type: 'text', nullable: true })
  notes?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  @OneToMany(() => FmsOffer, (offer) => offer.quote)
  offers = new Collection<FmsOffer>(this)

  @OneToMany(() => FmsQuoteLine, (line) => line.quote)
  lines = new Collection<FmsQuoteLine>(this)
}

@Entity({ tableName: 'fms_offers' })
@Index({ name: 'fms_offers_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'fms_offers_quote_idx', properties: ['quote', 'organizationId', 'tenantId'] })
@Index({ name: 'fms_offers_status_idx', properties: ['organizationId', 'tenantId', 'status'] })
@Unique({ name: 'fms_offers_number_unique', properties: ['organizationId', 'tenantId', 'offerNumber'] })
export class FmsOffer {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => FmsQuote, { fieldName: 'quote_id' })
  quote!: FmsQuote

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'offer_number', type: 'text' })
  offerNumber!: string

  @Property({ name: 'version', type: 'integer', default: 1 })
  version: number = 1

  @Property({ name: 'status', type: 'text', default: 'draft' })
  status: FmsOfferStatus = 'draft'

  @Property({ name: 'valid_until', type: Date, nullable: true })
  validUntil?: Date | null

  @Property({ name: 'payment_terms', type: 'text', nullable: true })
  paymentTerms?: string | null

  @Property({ name: 'special_terms', type: 'text', nullable: true })
  specialTerms?: string | null

  @Property({ name: 'customer_notes', type: 'text', nullable: true })
  customerNotes?: string | null

  @Property({ name: 'notes', type: 'text', nullable: true })
  notes?: string | null

  @Property({ name: 'superseded_by_id', type: 'uuid', nullable: true })
  supersededById?: string | null

  @Property({ name: 'assigned_to_id', type: 'uuid', nullable: true })
  assignedToId?: string | null

  @Property({ name: 'operational_guardian_id', type: 'uuid', nullable: true })
  operationalGuardianId?: string | null

  @Property({ name: 'business_guardian_id', type: 'uuid', nullable: true })
  businessGuardianId?: string | null

  @Property({ name: 'document_id', type: 'uuid', nullable: true })
  documentId?: string | null

  @Property({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt?: Date | null

  @Property({ name: 'sent_to_email', type: 'text', nullable: true })
  sentToEmail?: string | null

  /**
   * Exchange rates used when creating this offer (if lines have multiple currencies)
   * Stored as JSON array of { fromCurrencyCode, toCurrencyCode, rate, date, source }
   */
  @Property({ name: 'exchange_rates', type: 'jsonb', nullable: true })
  exchangeRates?: ExchangeRateSnapshot[] | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  @OneToMany(() => FmsOfferLine, (line) => line.offer)
  lines = new Collection<FmsOfferLine>(this)
}

@Entity({ tableName: 'fms_offer_lines' })
@Index({ name: 'fms_offer_lines_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'fms_offer_lines_offer_idx', properties: ['offer', 'organizationId', 'tenantId'] })
export class FmsOfferLine {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => FmsOffer, { fieldName: 'offer_id' })
  offer!: FmsOffer

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'line_number', type: 'integer', default: 0 })
  lineNumber: number = 0

  // Product references (module-isomorphic UUIDs, no @ManyToOne)
  @Property({ name: 'product_id', type: 'uuid', nullable: true })
  productId?: string | null

  /**
   * Variant ID - references FmsProductVariant which contains pricing info
   */
  @Property({ name: 'variant_id', type: 'uuid', nullable: true })
  variantId?: string | null

  // Source tracking
  @Property({ name: 'source_quote_line_id', type: 'uuid', nullable: true })
  sourceQuoteLineId?: string | null

  // Snapshot fields from quote line / product
  @Property({ name: 'product_name', type: 'text', nullable: true })
  productName?: string | null

  @Property({ name: 'charge_code', type: 'text', nullable: true })
  chargeCode?: string | null

  @Property({ name: 'container_size', type: 'text', nullable: true })
  containerSize?: string | null

  @Property({ name: 'provider_id', type: 'uuid', nullable: true })
  providerId?: string | null

  /**
   * Carrier ID - references FmsCarrier (the shipping line/airline operating the service)
   */
  @Property({ name: 'carrier_id', type: 'uuid', nullable: true })
  carrierId?: string | null

  /**
   * Reference - contract number, "FAK" for spot rates, or other identifier
   */
  @Property({ name: 'reference', type: 'text', nullable: true })
  reference?: string | null

  /**
   * Validity period - when the price was valid
   */
  @Property({ name: 'validity_start', type: 'date', nullable: true })
  validityStart?: Date | null

  @Property({ name: 'validity_end', type: 'date', nullable: true })
  validityEnd?: Date | null

  // Pricing
  @Property({ name: 'currency_code', type: 'text' })
  currencyCode!: string

  /** Buy price - copied from quote line unitCost */
  @Property({ name: 'unit_cost', type: 'numeric', precision: 18, scale: 4, default: '0' })
  unitCost: string = '0'

  @Property({ name: 'unit_price', type: 'numeric', precision: 18, scale: 4, default: '0' })
  unitPrice: string = '0'

  @Property({ name: 'amount', type: 'numeric', precision: 18, scale: 4, default: '0' })
  amount: string = '0'

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

@Entity({ tableName: 'fms_quote_lines' })
@Index({ name: 'fms_quote_lines_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'fms_quote_lines_quote_idx', properties: ['quote', 'organizationId', 'tenantId'] })
export class FmsQuoteLine {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => FmsQuote, { fieldName: 'quote_id' })
  quote!: FmsQuote

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'line_number', type: 'integer', default: 0 })
  lineNumber: number = 0

  // Product references (module-isomorphic UUIDs, no @ManyToOne)
  @Property({ name: 'product_id', type: 'uuid', nullable: true })
  productId?: string | null

  /**
   * Variant ID - references FmsProductVariant which contains pricing info
   * The variant now holds: price, validity dates, provider, price type, container size
   */
  @Property({ name: 'variant_id', type: 'uuid', nullable: true })
  variantId?: string | null

  // Snapshot fields (copied from product/variant at time of adding)
  @Property({ name: 'product_name', type: 'text' })
  productName!: string

  @Property({ name: 'charge_code', type: 'text', nullable: true })
  chargeCode?: string | null

  @Property({ name: 'product_type', type: 'text', nullable: true })
  productType?: string | null

  @Property({ name: 'provider_id', type: 'uuid', nullable: true })
  providerId?: string | null

  @Property({ name: 'container_size', type: 'text', nullable: true })
  containerSize?: string | null

  /**
   * Reference - contract number, "FAK" for spot rates, or other identifier
   * Snapshot from variant.reference at time of adding
   */
  @Property({ name: 'reference', type: 'text', nullable: true })
  reference?: string | null

  /**
   * Origin location ID - references FmsLocation
   */
  @Property({ name: 'origin_location_id', type: 'uuid', nullable: true })
  originLocationId?: string | null

  /**
   * Destination location ID - references FmsLocation
   */
  @Property({ name: 'destination_location_id', type: 'uuid', nullable: true })
  destinationLocationId?: string | null

  /**
   * Validity period - when the price was valid
   * Snapshot from variant validity dates at time of adding
   */
  @Property({ name: 'validity_start', type: 'date', nullable: true })
  validityStart?: Date | null

  @Property({ name: 'validity_end', type: 'date', nullable: true })
  validityEnd?: Date | null

  // Pricing
  @Property({ name: 'currency_code', type: 'text', default: 'USD' })
  currencyCode: string = 'USD'

  @Property({ name: 'unit_cost', type: 'numeric', precision: 18, scale: 4, default: '0' })
  unitCost: string = '0'

  @Property({ name: 'margin_percent', type: 'numeric', precision: 8, scale: 4, default: '0' })
  marginPercent: string = '0'

  @Property({ name: 'unit_sales', type: 'numeric', precision: 18, scale: 4, default: '0' })
  unitSales: string = '0'

  // Timestamps
  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}
