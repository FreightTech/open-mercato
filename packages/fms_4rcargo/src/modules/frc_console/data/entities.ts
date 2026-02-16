import {
  Collection,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryKey,
  Property,
} from '@mikro-orm/core'
import type { FrcConsoleStatus } from '../../../lib/types'
import { FrcAirport } from '../../frc_airports/data/entities'
import { FrcTruck, FrcTruckPreset } from '../../frc_trucks/data/entities'

@Entity({ tableName: 'frc_consoles' })
@Index({ name: 'frc_consoles_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'frc_consoles_truck_date_idx', properties: ['truck', 'date', 'organizationId', 'tenantId'] })
@Index({ name: 'frc_consoles_status_idx', properties: ['organizationId', 'tenantId', 'status'] })
export class FrcConsole {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  /** Auto-generated: {Truck}/{Date}/{Route} */
  @Property({ type: 'text', length: 255 })
  name!: string

  @Property({ type: 'date' })
  date!: Date

  @ManyToOne(() => FrcTruck, { fieldName: 'truck_id' })
  truck!: FrcTruck

  @ManyToOne(() => FrcAirport, { fieldName: 'origin_airport_id', nullable: true })
  originAirport?: FrcAirport | null

  @ManyToOne(() => FrcAirport, { fieldName: 'destination_airport_id', nullable: true })
  destinationAirport?: FrcAirport | null

  @Property({ type: 'text', default: 'planning' })
  status: FrcConsoleStatus = 'planning'

  /** Truck preset for visualization (defines truck dimensions/volume) */
  @ManyToOne(() => FrcTruckPreset, { fieldName: 'truck_preset_id', nullable: true })
  truckPreset?: FrcTruckPreset | null

  @Property({ type: 'text', nullable: true })
  notes?: string | null

  /** Link to FrcProject (UUID reference, no ORM relation for cross-module pattern) */
  @Property({ name: 'project_id', type: 'uuid', nullable: true })
  projectId?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  // Relations
  @OneToMany(() => FrcConsoleItem, (item) => item.console)
  items = new Collection<FrcConsoleItem>(this)
}

@Entity({ tableName: 'frc_console_items' })
@Index({ name: 'frc_console_items_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'frc_console_items_console_idx', properties: ['console', 'organizationId', 'tenantId'] })
@Index({ name: 'frc_console_items_cargo_idx', properties: ['airCargoId', 'organizationId', 'tenantId'] })
@Index({ name: 'frc_console_items_booking_idx', properties: ['truckBookingId', 'organizationId', 'tenantId'] })
export class FrcConsoleItem {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @ManyToOne(() => FrcConsole, { fieldName: 'console_id' })
  console!: FrcConsole

  /** Reference to FrcAirCargo (the cargo specification with dimensions) */
  @Property({ name: 'air_cargo_id', type: 'uuid' })
  airCargoId!: string

  /** Reference to FrcTruckBooking (which booking this cargo came from) */
  @Property({ name: 'truck_booking_id', type: 'uuid' })
  truckBookingId!: string

  /** Number of pieces loaded on THIS truck (can be partial) */
  @Property({ type: 'integer', default: 1 })
  quantity: number = 1

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}
