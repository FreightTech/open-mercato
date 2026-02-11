import {
  Collection,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryKey,
  Property,
} from '@mikro-orm/core'
import type {
  FrcQuoteStatus,
  FrcConnectionMethod,
  FrcRoutingType,
} from '../../../lib/types'
import { FrcAirport } from '../../frc_airports/data/entities'

@Entity({ tableName: 'frc_quotes' })
@Index({ name: 'frc_quotes_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'frc_quotes_rfq_idx', properties: ['rfqId', 'organizationId', 'tenantId'] })
@Index({ name: 'frc_quotes_status_idx', properties: ['organizationId', 'tenantId', 'status'] })
export class FrcQuote {
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

  /** Carrier contractor ID */
  @Property({ name: 'carrier_id', type: 'uuid', nullable: true })
  carrierId?: string | null

  @Property({ type: 'text', default: 'draft' })
  status: FrcQuoteStatus = 'draft'

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

  @Property({ name: 'assigned_to_id', type: 'uuid', nullable: true })
  assignedToId?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  // Relations
  @OneToMany(() => FrcAirRouting, (routing) => routing.quote)
  airRouting = new Collection<FrcAirRouting>(this)
}

@Entity({ tableName: 'frc_air_routing' })
@Index({ name: 'frc_air_routing_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'frc_air_routing_quote_idx', properties: ['quote', 'organizationId', 'tenantId'] })
export class FrcAirRouting {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @ManyToOne(() => FrcQuote, { fieldName: 'quote_id' })
  quote!: FrcQuote

  /** Auto-generated: {Origin}/{Dest}/{Date} */
  @Property({ type: 'text', length: 255 })
  name!: string

  /** Carrier contractor ID for this leg */
  @Property({ name: 'carrier_id', type: 'uuid', nullable: true })
  carrierId?: string | null

  /** 4RCargo, External, etc. */
  @Property({ name: 'carrier_type', type: 'text', length: 50, nullable: true })
  carrierType?: string | null

  @Property({ name: 'flight_number', type: 'text', length: 50, nullable: true })
  flightNumber?: string | null

  @Property({ type: 'text', default: 'direct_flight' })
  type: FrcRoutingType = 'direct_flight'

  @ManyToOne(() => FrcAirport, { fieldName: 'origin_airport_id', nullable: true })
  originAirport?: FrcAirport | null

  @ManyToOne(() => FrcAirport, { fieldName: 'destination_airport_id', nullable: true })
  destinationAirport?: FrcAirport | null

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

  // Note: FrcTruckBooking relation is managed from the FrcTruckBooking entity side via @ManyToOne
}
