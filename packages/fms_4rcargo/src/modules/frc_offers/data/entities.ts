import {
  Collection,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryKey,
  Property,
} from '@mikro-orm/core'
import type { FrcOfferStatus, FrcConnectionMethod, FrcRoutingType, FrcStackableType } from '../../../lib/types'

@Entity({ tableName: 'frc_offers' })
@Index({ name: 'frc_offers_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'frc_offers_rfq_idx', properties: ['rfqId', 'organizationId', 'tenantId'] })
@Index({ name: 'frc_offers_status_idx', properties: ['organizationId', 'tenantId', 'status'] })
@Index({ name: 'frc_offers_project_idx', properties: ['projectId', 'organizationId', 'tenantId'] })
export class FrcOffer {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  /** Reference to FrcRfq (cross-module, no ORM relation) */
  @Property({ name: 'rfq_id', type: 'uuid' })
  rfqId!: string

  /** Auto-generated from RFQ name */
  @Property({ type: 'text', length: 255 })
  name!: string

  /** Carrier contractor ID - references contractors module */
  @Property({ name: 'carrier_id', type: 'uuid', nullable: true })
  carrierId?: string | null

  @Property({ type: 'text', default: 'draft' })
  status: FrcOfferStatus = 'draft'

  /** Air Waybill number (e.g., "160-00000000") */
  @Property({ name: 'awb_number', type: 'text', length: 50, nullable: true })
  awbNumber?: string | null

  @Property({ name: 'connection_method', type: 'text', nullable: true })
  connectionMethod?: FrcConnectionMethod | null

  @Property({ name: 'departure_date', type: 'date', nullable: true })
  departureDate?: Date | null

  @Property({ name: 'connection_rate_per_kg', type: 'numeric', precision: 18, scale: 4, nullable: true })
  connectionRatePerKg?: string | null

  @Property({ name: 'connection_rate_total', type: 'numeric', precision: 18, scale: 4, nullable: true })
  connectionRateTotal?: string | null

  @Property({ name: 'airfreight_rate_per_kg', type: 'numeric', precision: 18, scale: 4, nullable: true })
  airfreightRatePerKg?: string | null

  @Property({ name: 'airfreight_rate_total', type: 'numeric', precision: 18, scale: 4, nullable: true })
  airfreightRateTotal?: string | null

  @Property({ name: 'total_rate_per_kg', type: 'numeric', precision: 18, scale: 4, nullable: true })
  totalRatePerKg?: string | null

  @Property({ name: 'total_rate', type: 'numeric', precision: 18, scale: 4, nullable: true })
  totalRate?: string | null

  @Property({ name: 'currency_code', type: 'text', length: 3, default: 'EUR' })
  currencyCode: string = 'EUR'

  /** Reference to User (auth module) - cross-module, no ORM relation */
  @Property({ name: 'assigned_to_id', type: 'uuid', nullable: true })
  assignedToId?: string | null

  /** Reference to FrcProject - cross-module, no ORM relation */
  @Property({ name: 'project_id', type: 'uuid', nullable: true })
  projectId?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  // Relations
  @OneToMany(() => FrcAirRouting, (routing) => routing.offer)
  airRouting = new Collection<FrcAirRouting>(this)

  @OneToMany(() => FrcOfferLine, (line) => line.offer)
  offerLines = new Collection<FrcOfferLine>(this)
}

@Entity({ tableName: 'frc_offer_lines' })
@Index({ name: 'frc_offer_lines_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'frc_offer_lines_offer_idx', properties: ['offer', 'organizationId', 'tenantId'] })
export class FrcOfferLine {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @ManyToOne(() => FrcOffer, { fieldName: 'offer_id' })
  offer!: FrcOffer

  /** Optional reference to source AirCargo for traceability */
  @Property({ name: 'source_air_cargo_id', type: 'uuid', nullable: true })
  sourceAirCargoId?: string | null

  /** Cargo name (copied from AirCargo at offer creation time) */
  @Property({ type: 'text', length: 255 })
  name!: string

  @Property({ name: 'number_of_pieces', type: 'integer', default: 1 })
  numberOfPieces: number = 1

  @Property({ name: 'stackable_type', type: 'text', default: 'fully_stackable' })
  stackableType: FrcStackableType = 'fully_stackable'

  @Property({ name: 'length_cm', type: 'numeric', precision: 12, scale: 2, nullable: true })
  lengthCm?: string | null

  @Property({ name: 'width_cm', type: 'numeric', precision: 12, scale: 2, nullable: true })
  widthCm?: string | null

  @Property({ name: 'height_cm', type: 'numeric', precision: 12, scale: 2, nullable: true })
  heightCm?: string | null

  @Property({ name: 'volume_m3', type: 'numeric', precision: 18, scale: 4, default: '0' })
  volumeM3: string = '0'

  @Property({ name: 'actual_weight_kg', type: 'numeric', precision: 18, scale: 4, default: '0' })
  actualWeightKg: string = '0'

  @Property({ name: 'chargeable_weight_kg', type: 'numeric', precision: 18, scale: 4, default: '0' })
  chargeableWeightKg: string = '0'

  @Property({ name: 'loading_metres', type: 'numeric', precision: 18, scale: 4, default: '0' })
  loadingMetres: string = '0'

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

@Entity({ tableName: 'frc_air_routing' })
@Index({ name: 'frc_air_routing_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'frc_air_routing_offer_idx', properties: ['offer', 'organizationId', 'tenantId'] })
export class FrcAirRouting {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @ManyToOne(() => FrcOffer, { fieldName: 'offer_id' })
  offer!: FrcOffer

  /** Auto-generated: {Origin}/{Dest}/{Date} */
  @Property({ type: 'text', length: 255 })
  name!: string

  /** Carrier contractor ID for this leg - references contractors module */
  @Property({ name: 'carrier_id', type: 'uuid', nullable: true })
  carrierId?: string | null

  /** 4RCargo, External, etc. */
  @Property({ name: 'carrier_type', type: 'text', length: 50, nullable: true })
  carrierType?: string | null

  @Property({ name: 'flight_number', type: 'text', length: 50, nullable: true })
  flightNumber?: string | null

  @Property({ type: 'text', default: 'direct_flight' })
  type: FrcRoutingType = 'direct_flight'

  /** Reference to FmsLocation (type: airport) - cross-module, no ORM relation */
  @Property({ name: 'origin_airport_id', type: 'uuid', nullable: true })
  originAirportId?: string | null

  /** Reference to FmsLocation (type: airport) - cross-module, no ORM relation */
  @Property({ name: 'destination_airport_id', type: 'uuid', nullable: true })
  destinationAirportId?: string | null

  @Property({ name: 'departure_date', type: 'date', nullable: true })
  departureDate?: Date | null

  /** HH:MM format */
  @Property({ name: 'departure_time', type: 'text', length: 5, nullable: true })
  departureTime?: string | null

  @Property({ name: 'arrival_date', type: 'date', nullable: true })
  arrivalDate?: Date | null

  /** HH:MM format */
  @Property({ name: 'arrival_time', type: 'text', length: 5, nullable: true })
  arrivalTime?: string | null

  @Property({ name: 'connection_rate_total', type: 'numeric', precision: 18, scale: 4, nullable: true })
  connectionRateTotal?: string | null

  @Property({ name: 'currency_code', type: 'text', length: 3, default: 'EUR' })
  currencyCode: string = 'EUR'

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}
