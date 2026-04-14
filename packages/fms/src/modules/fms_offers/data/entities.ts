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
import type {
  FmsOfferType,
  FmsOfferStatus,
  FmsRfqStatus,
  FmsDirection,
  FmsTransportMode,
  FmsRfqCargoType,
  FmsIncoterm,
  FmsCostSectionType,
  FmsCostGroupingMode,
  ExchangeRateSnapshot,
  RfqHighlight,
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

  @Property({ name: 'origin_location_id', type: 'uuid', nullable: true })
  originLocationId?: string | null

  @Property({ name: 'destination_location_id', type: 'uuid', nullable: true })
  destinationLocationId?: string | null

  @Property({ name: 'place_of_loading', type: 'text', nullable: true })
  placeOfLoading?: string | null

  @Property({ name: 'place_of_loading_id', type: 'uuid', nullable: true })
  placeOfLoadingId?: string | null

  @Property({ name: 'place_of_delivery', type: 'text', nullable: true })
  placeOfDelivery?: string | null

  @Property({ name: 'place_of_delivery_id', type: 'uuid', nullable: true })
  placeOfDeliveryId?: string | null

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

  @Property({ name: 'contractor_id', type: 'uuid', nullable: true })
  contractorId?: string | null

  @Property({ name: 'contact_person', type: 'text', nullable: true })
  contactPerson?: string | null

  @Property({ name: 'contact_person_id', type: 'uuid', nullable: true })
  contactPersonId?: string | null

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

  @Property({ name: 'raw_text', type: 'text', nullable: true })
  rawText?: string | null

  @Property({ name: 'sender_email', type: 'text', nullable: true })
  senderEmail?: string | null

  @Property({ name: 'sender_name', type: 'text', nullable: true })
  senderName?: string | null

  @Property({ name: 'extracted_data', type: 'jsonb', nullable: true })
  extractedData?: Record<string, unknown> | null

  @Property({ name: 'highlights', type: 'jsonb', nullable: true })
  highlights?: RfqHighlight[] | null

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  @OneToMany(() => FmsOffer, (offer) => offer.rfq)
  offers = new Collection<FmsOffer>(this)

  @OneToMany(() => FmsRfqItem, (item) => item.rfq)
  items = new Collection<FmsRfqItem>(this)
}

@Entity({ tableName: 'fms_rfq_items' })
@Index({ name: 'fms_rfq_items_rfq_idx', properties: ['rfq', 'organizationId', 'tenantId'] })
export class FmsRfqItem {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt' | 'itemNumber'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @ManyToOne(() => FmsRfq, { fieldName: 'rfq_id' })
  rfq!: FmsRfq

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'item_number', type: 'integer', default: 1 })
  itemNumber: number = 1

  @Property({ name: 'container_type', type: 'text', nullable: true })
  containerType?: string | null

  @Property({ name: 'container_count', type: 'integer', nullable: true })
  containerCount?: number | null

  @Property({ name: 'origin', type: 'text', nullable: true })
  origin?: string | null

  @Property({ name: 'destination', type: 'text', nullable: true })
  destination?: string | null

  @Property({ name: 'origin_location_id', type: 'uuid', nullable: true })
  originLocationId?: string | null

  @Property({ name: 'destination_location_id', type: 'uuid', nullable: true })
  destinationLocationId?: string | null

  @Property({ name: 'cargo_description', type: 'text', nullable: true })
  cargoDescription?: string | null

  @Property({ name: 'weight_kg', type: 'numeric', precision: 18, scale: 4, nullable: true })
  weightKg?: string | null

  @Property({ name: 'readiness_date', type: 'text', nullable: true })
  readinessDate?: string | null

  @Property({ name: 'incoterm', type: 'text', nullable: true })
  incoterm?: string | null

  @Property({ name: 'transport_mode', type: 'text', nullable: true })
  transportMode?: string | null

  @Property({ name: 'notes', type: 'text', nullable: true })
  notes?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
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

  @Property({ name: 'type', type: 'text', default: 'sell' })
  type: FmsOfferType = 'sell'

  @Property({ name: 'status', type: 'text', default: 'draft' })
  status: FmsOfferStatus = 'draft'

  /** @deprecated Use carrierIds instead */
  @Property({ name: 'carrier_id', type: 'uuid', nullable: true })
  carrierId?: string | null

  @Property({ name: 'carrier_ids', type: 'jsonb', nullable: true })
  carrierIds?: string[] | null

  @Property({ name: 'provider_ids', type: 'jsonb', nullable: true })
  providerIds?: string[] | null

  @Property({ name: 'incoterm', type: 'text', nullable: true })
  incoterm?: FmsIncoterm | null

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

  @Property({ name: 'contractor_id', type: 'uuid', nullable: true })
  contractorId?: string | null

  @Property({ name: 'contact_person_id', type: 'uuid', nullable: true })
  contactPersonId?: string | null

  @Property({ name: 'billing_address_id', type: 'uuid', nullable: true })
  billingAddressId?: string | null

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

  @Property({ name: 'base_currency', type: 'text', nullable: true })
  baseCurrency?: string | null

  @Property({ name: 'exchange_rates', type: 'jsonb', nullable: true })
  exchangeRates?: ExchangeRateSnapshot[] | null

  @Property({ name: 'offer_label', type: 'text', nullable: true })
  offerLabel?: string | null

  @Property({ name: 'cost_grouping_mode', type: 'text', nullable: true })
  costGroupingMode?: FmsCostGroupingMode | null

  @Index({ name: 'fms_offers_group_idx' })
  @Property({ name: 'group_id', type: 'uuid', nullable: true })
  groupId?: string | null

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

  @Property({ name: 'section_type', type: 'text', nullable: true })
  sectionType?: FmsCostSectionType | null

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

  @Property({ name: 'quantity', type: 'numeric', precision: 18, scale: 4, default: '1' })
  quantity: string = '1'

  @Property({ name: 'container_type', type: 'text', nullable: true })
  containerType?: string | null

  @Property({ name: 'is_enabled', type: 'boolean', default: false })
  isEnabled: boolean = false

  @Property({ name: 'section_type', type: 'text', nullable: true })
  sectionType?: string | null

  @Property({ name: 'client_group_label', type: 'text', nullable: true })
  clientGroupLabel?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

@Entity({ tableName: 'fms_notes' })
@Index({ name: 'fms_notes_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'fms_notes_related_idx', properties: ['relatedEntityId', 'relatedEntityType'] })
export class FmsNote {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'related_entity_type', type: 'text' })
  relatedEntityType!: string

  @Property({ name: 'related_entity_id', type: 'uuid' })
  relatedEntityId!: string

  @Property({ name: 'body', type: 'text' })
  body!: string

  @Property({ name: 'author_user_id', type: 'uuid', nullable: true })
  authorUserId?: string | null

  @Property({ name: 'author_name', type: 'text', nullable: true })
  authorName?: string | null

  @Property({ name: 'attachment_id', type: 'uuid', nullable: true })
  attachmentId?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}
