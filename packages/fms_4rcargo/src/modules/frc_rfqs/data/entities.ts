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
  FrcSalesStage,
  FrcDeliveryStatus,
  FrcOriginType,
  FrcLooseOrUnitised,
  FrcStackableType,
} from '../../../lib/types'
import { FrcAirport } from '../../frc_airports/data/entities'

@Entity({ tableName: 'frc_rfqs' })
@Index({ name: 'frc_rfqs_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'frc_rfqs_status_idx', properties: ['organizationId', 'tenantId', 'salesStage'] })
@Index({ name: 'frc_rfqs_account_idx', properties: ['organizationId', 'tenantId', 'accountId'] })
export class FrcRfq {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  /** Auto-generated: {Company}/{Origin}/{Dest}/{Date} */
  @Property({ type: 'text', length: 255 })
  name!: string

  /** Contractor ID (customer/account) */
  @Property({ name: 'account_id', type: 'uuid', nullable: true })
  accountId?: string | null

  /** Contact person ID */
  @Property({ name: 'contact_id', type: 'uuid', nullable: true })
  contactId?: string | null

  @Property({ name: 'sales_stage', type: 'text', default: 'received' })
  salesStage: FrcSalesStage = 'received'

  @Property({ type: 'integer', default: 0 })
  probability: number = 0

  @Property({ type: 'numeric', precision: 18, scale: 4, nullable: true })
  amount?: string | null

  @Property({ name: 'currency_code', type: 'text', length: 3, default: 'EUR' })
  currencyCode: string = 'EUR'

  @Property({ name: 'delivery_status', type: 'text', default: 'awaiting' })
  deliveryStatus: FrcDeliveryStatus = 'awaiting'

  @Property({ name: 'is_delayed', type: 'boolean', default: false })
  isDelayed: boolean = false

  @Property({ name: 'origin_type', type: 'text', default: 'airport' })
  originType: FrcOriginType = 'airport'

  @ManyToOne(() => FrcAirport, { fieldName: 'origin_airport_id', nullable: true })
  originAirport?: FrcAirport | null

  @ManyToOne(() => FrcAirport, { fieldName: 'destination_airport_id', nullable: true })
  destinationAirport?: FrcAirport | null

  @Property({ name: 'shipment_ready_date', type: 'date', nullable: true })
  shipmentReadyDate?: Date | null

  @Property({ name: 'required_at_destination_date', type: 'date', nullable: true })
  requiredAtDestinationDate?: Date | null

  @Property({ name: 'loose_or_unitised', type: 'text', nullable: true })
  looseOrUnitised?: FrcLooseOrUnitised | null

  @Property({ name: 'target_rate', type: 'numeric', precision: 18, scale: 4, nullable: true })
  targetRate?: string | null

  /** Product type: General Cargo, Dangerous Goods, etc. */
  @Property({ type: 'text', nullable: true, length: 100 })
  product?: string | null

  @Property({ type: 'text', nullable: true })
  commodity?: string | null

  // Totals (computed from air cargo lines)
  @Property({ name: 'total_pieces', type: 'integer', default: 0 })
  totalPieces: number = 0

  @Property({ name: 'total_volume', type: 'numeric', precision: 18, scale: 4, default: '0' })
  totalVolume: string = '0'

  @Property({ name: 'total_actual_weight', type: 'numeric', precision: 18, scale: 4, default: '0' })
  totalActualWeight: string = '0'

  @Property({ name: 'total_chargeable_weight', type: 'numeric', precision: 18, scale: 4, default: '0' })
  totalChargeableWeight: string = '0'

  @Property({ name: 'total_loading_metres', type: 'numeric', precision: 18, scale: 4, default: '0' })
  totalLoadingMetres: string = '0'

  @Property({ type: 'text', nullable: true })
  description?: string | null

  @Property({ name: 'assigned_to_id', type: 'uuid', nullable: true })
  assignedToId?: string | null

  @Property({ name: 'request_date', type: 'timestamptz', onCreate: () => new Date() })
  requestDate: Date = new Date()

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  // Relations
  @OneToMany(() => FrcAirCargo, (cargo) => cargo.rfq)
  airCargo = new Collection<FrcAirCargo>(this)

  // Note: FrcQuote relation is managed from the FrcQuote entity side via @ManyToOne
}

@Entity({ tableName: 'frc_air_cargo' })
@Index({ name: 'frc_air_cargo_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'frc_air_cargo_rfq_idx', properties: ['rfq', 'organizationId', 'tenantId'] })
export class FrcAirCargo {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @ManyToOne(() => FrcRfq, { fieldName: 'rfq_id' })
  rfq!: FrcRfq

  /** Auto-generated from RFQ name */
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
