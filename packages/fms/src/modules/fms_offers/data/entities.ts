import {
  Collection,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/core'
import type {
  FmsOfferStatus,
  FmsRfqStatus,
  FmsDirection,
  FmsTransportMode,
  FmsRfqCargoType,
  ExchangeRateSnapshot,
} from './types'

@Entity({ tableName: 'fms_rfqs' })
@Index({ name: 'fms_rfqs_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
export class FmsRfq {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'title', type: 'text', nullable: true })
  title?: string | null

  @Property({ name: 'description', type: 'text', nullable: true })
  description?: string | null

  @Property({ name: 'origin', type: 'text', nullable: true })
  origin?: string | null

  @Property({ name: 'destination', type: 'text', nullable: true })
  destination?: string | null

  @Property({ name: 'container_count', type: 'integer', nullable: true })
  containerCount?: number | null

  @Property({ name: 'direction', type: 'text', nullable: true })
  direction?: FmsDirection | null

  @Property({ name: 'transport_mode', type: 'text', nullable: true })
  transportMode?: FmsTransportMode | null

  @Property({ name: 'cargo_type', type: 'text', nullable: true })
  cargoType?: FmsRfqCargoType | null

  @Property({ name: 'company_name', type: 'text', nullable: true })
  companyName?: string | null

  @Property({ name: 'contact_person', type: 'text', nullable: true })
  contactPerson?: string | null

  @Property({ name: 'context', type: 'text', nullable: true })
  context?: string | null

  @Property({ name: 'status', type: 'text', default: 'incoming' })
  status: FmsRfqStatus = 'incoming'

  @Property({ name: 'assigned_to_id', type: 'uuid', nullable: true })
  assignedToId?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  @OneToMany(() => FmsOffer, (offer) => offer.rfq)
  offers = new Collection<FmsOffer>(this)
}

@Entity({ tableName: 'fms_offers' })
@Index({ name: 'fms_offers_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'fms_offers_rfq_idx', properties: ['rfq', 'organizationId', 'tenantId'] })
@Index({ name: 'fms_offers_status_idx', properties: ['organizationId', 'tenantId', 'status'] })
@Unique({ name: 'fms_offers_number_unique', properties: ['organizationId', 'tenantId', 'offerNumber'] })
export class FmsOffer {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => FmsRfq, { fieldName: 'rfq_id', nullable: true })
  rfq?: FmsRfq | null

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

  @Property({ name: 'direction', type: 'text', nullable: true })
  direction?: FmsDirection | null

  @Property({ name: 'transport_mode', type: 'text', nullable: true })
  transportMode?: FmsTransportMode | null

  @Property({ name: 'cargo_type', type: 'text', nullable: true })
  cargoType?: FmsRfqCargoType | null

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

  @Property({ name: 'exchange_rates', type: 'jsonb', nullable: true })
  exchangeRates?: ExchangeRateSnapshot[] | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  @OneToMany(() => FmsOfferCalculation, (calc) => calc.offer)
  calculations = new Collection<FmsOfferCalculation>(this)
}

@Entity({ tableName: 'fms_offer_calculations' })
@Index({ name: 'fms_offer_calcs_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'fms_offer_calcs_offer_idx', properties: ['offer', 'organizationId', 'tenantId'] })
export class FmsOfferCalculation {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => FmsOffer, { fieldName: 'offer_id' })
  offer!: FmsOffer

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'calculation_number', type: 'integer', default: 1 })
  calculationNumber: number = 1

  @Property({ name: 'label', type: 'text', nullable: true })
  label?: string | null

  @Property({ name: 'containers', type: 'jsonb', nullable: true })
  containers?: string[] | null

  @Property({ name: 'origin_location_id', type: 'uuid', nullable: true })
  originLocationId?: string | null

  @Property({ name: 'destination_location_id', type: 'uuid', nullable: true })
  destinationLocationId?: string | null

  @Property({ name: 'place_of_loading_id', type: 'uuid', nullable: true })
  placeOfLoadingId?: string | null

  @Property({ name: 'place_of_delivery_id', type: 'uuid', nullable: true })
  placeOfDeliveryId?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  @OneToMany(() => FmsOfferLine, (line) => line.calculation)
  lines = new Collection<FmsOfferLine>(this)
}

@Entity({ tableName: 'fms_offer_lines' })
@Index({ name: 'fms_offer_lines_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'fms_offer_lines_calc_idx', properties: ['calculation', 'organizationId', 'tenantId'] })
export class FmsOfferLine {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => FmsOfferCalculation, { fieldName: 'calculation_id' })
  calculation!: FmsOfferCalculation

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'line_number', type: 'integer', default: 0 })
  lineNumber: number = 0

  @Property({ name: 'product_id', type: 'uuid', nullable: true })
  productId?: string | null

  @Property({ name: 'product_name', type: 'text', nullable: true })
  productName?: string | null

  @Property({ name: 'charge_code', type: 'text', nullable: true })
  chargeCode?: string | null

  @Property({ name: 'charge_basis', type: 'text', nullable: true })
  chargeBasis?: string | null

  @Property({ name: 'currency_code', type: 'text', default: 'USD' })
  currencyCode: string = 'USD'

  @Property({ name: 'rate', type: 'numeric', precision: 18, scale: 4, default: '0' })
  rate: string = '0'

  @Property({ name: 'buy_price', type: 'numeric', precision: 18, scale: 4, default: '0' })
  buyPrice: string = '0'

  @Property({ name: 'sell_price', type: 'numeric', precision: 18, scale: 4, default: '0' })
  sellPrice: string = '0'

  @Property({ name: 'is_enabled', type: 'boolean', default: false })
  isEnabled: boolean = false

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}
