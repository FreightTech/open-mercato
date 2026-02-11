import { Entity, Index, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core'
import type { FrcBookingStatus } from '../../../lib/types'
import { FrcAirport } from '../../frc_airports/data/entities'

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

@Entity({ tableName: 'frc_truck_bookings' })
@Index({ name: 'frc_truck_bookings_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'frc_truck_bookings_routing_idx', properties: ['airRoutingId', 'organizationId', 'tenantId'] })
@Index({ name: 'frc_truck_bookings_truck_idx', properties: ['truck', 'organizationId', 'tenantId'] })
export class FrcTruckBooking {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  /** Auto-generated: {Date}/{Truck} */
  @Property({ type: 'text', length: 255 })
  name!: string

  /** Reference to FrcAirRouting (cross-module, no ORM relation) */
  @Property({ name: 'air_routing_id', type: 'uuid' })
  airRoutingId!: string

  @ManyToOne(() => FrcTruck, { fieldName: 'truck_id' })
  truck!: FrcTruck

  @ManyToOne(() => FrcAirport, { fieldName: 'origin_airport_id', nullable: true })
  originAirport?: FrcAirport | null

  @ManyToOne(() => FrcAirport, { fieldName: 'destination_airport_id', nullable: true })
  destinationAirport?: FrcAirport | null

  @Property({ type: 'date', nullable: true })
  date?: Date | null

  @Property({ name: 'profit_loss', type: 'numeric', precision: 18, scale: 4, nullable: true })
  profitLoss?: string | null

  @Property({ name: 'chargeable_weight', type: 'numeric', precision: 18, scale: 4, nullable: true })
  chargeableWeight?: string | null

  @Property({ name: 'connection_rate', type: 'numeric', precision: 18, scale: 4, nullable: true })
  connectionRate?: string | null

  @Property({ name: 'total_truck_cost', type: 'numeric', precision: 18, scale: 4, nullable: true })
  totalTruckCost?: string | null

  @Property({ type: 'text', default: 'draft' })
  status: FrcBookingStatus = 'draft'

  @Property({ name: 'currency_code', type: 'text', length: 3, default: 'EUR' })
  currencyCode: string = 'EUR'

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}
