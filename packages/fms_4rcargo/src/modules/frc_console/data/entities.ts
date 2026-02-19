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
import { FrcTruck, FrcTruckPreset } from '../../frc_trucks/data/entities'

@Entity({ tableName: 'frc_consoles' })
@Index({ name: 'frc_consoles_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'frc_consoles_truck_date_idx', properties: ['truck', 'date', 'organizationId', 'tenantId'] })
@Index({ name: 'frc_consoles_status_idx', properties: ['organizationId', 'tenantId', 'status'] })
@Index({ name: 'frc_consoles_project_idx', properties: ['projectId', 'organizationId', 'tenantId'] })
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

  /** Reference to FmsLocation (type: airport) - cross-module, no ORM relation */
  @Property({ name: 'origin_airport_id', type: 'uuid', nullable: true })
  originAirportId?: string | null

  /** Reference to FmsLocation (type: airport) - cross-module, no ORM relation */
  @Property({ name: 'destination_airport_id', type: 'uuid', nullable: true })
  destinationAirportId?: string | null

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

  // Fields from TruckBooking (merged into Console)

  /** Reference to FrcAirRouting (cross-module, no ORM relation) */
  @Property({ name: 'air_routing_id', type: 'uuid', nullable: true })
  airRoutingId?: string | null

  @Property({ name: 'profit_loss', type: 'numeric', precision: 18, scale: 4, nullable: true })
  profitLoss?: string | null

  @Property({ name: 'chargeable_weight', type: 'numeric', precision: 18, scale: 4, nullable: true })
  chargeableWeight?: string | null

  @Property({ name: 'connection_rate', type: 'numeric', precision: 18, scale: 4, nullable: true })
  connectionRate?: string | null

  @Property({ name: 'total_truck_cost', type: 'numeric', precision: 18, scale: 4, nullable: true })
  totalTruckCost?: string | null

  @Property({ name: 'currency_code', type: 'text', length: 3, default: 'EUR' })
  currencyCode: string = 'EUR'

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  // Relations
  @OneToMany(() => FrcConsoleCargo, (cargo) => cargo.console)
  cargo = new Collection<FrcConsoleCargo>(this)
}

@Entity({ tableName: 'frc_console_cargo' })
@Index({ name: 'frc_console_cargo_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'frc_console_cargo_console_idx', properties: ['console', 'organizationId', 'tenantId'] })
@Index({ name: 'frc_console_cargo_cargo_idx', properties: ['airCargoId', 'organizationId', 'tenantId'] })
export class FrcConsoleCargo {
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
