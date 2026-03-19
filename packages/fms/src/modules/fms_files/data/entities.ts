/**
 * FMS Files - MikroORM Entity Definitions
 *
 * 4 entities matching the FMS-rework.md specification:
 * 1. FmsFile — the folder/teczka
 * 2. FmsFileUnit — trackable unit (1 per container for FCL, 1 per file for LCL)
 * 3. FmsFileLeg — transport segment with SCD timestamps
 * 4. FmsFileUnitLeg — assigns unit to leg with per-assignment details
 */

import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  OneToMany,
  Collection,
  Index,
  Unique,
  OptionalProps,
} from '@mikro-orm/core'

import type { LegTimestampEntry, PackageDetail } from './types'

// ─── Entity 1: FmsFile ────────────────────────────────────────────────────────

@Entity({ tableName: 'fms_files' })
@Index({ name: 'fms_files_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Unique({ name: 'fms_files_number_unique', properties: ['organizationId', 'referenceNumber'] })
@Index({ name: 'fms_files_contractor_idx', properties: ['contractorId'] })
export class FmsFile {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt' | 'assigneeId' | 'notes' | 'createdBy' | 'updatedBy'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'reference_number', type: 'text' })
  referenceNumber!: string

  @Property({ name: 'shipment_type', type: 'text' })
  shipmentType!: string // ShipmentType: 'EXP' | 'IMP' | 'LOC'

  @Property({ name: 'cargo_type', type: 'text' })
  cargoType!: string // CargoType: 'FCL' | 'LCL'

  @Property({ name: 'contractor_id', type: 'uuid' })
  contractorId!: string

  @Property({ name: 'assignee_id', type: 'uuid', nullable: true })
  assigneeId?: string | null

  @Property({ name: 'notes', type: 'text', nullable: true })
  notes?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy?: string | null

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  // Relationships
  @OneToMany(() => FmsFileUnit, (unit) => unit.file)
  units = new Collection<FmsFileUnit>(this)

  @OneToMany(() => FmsFileLeg, (leg) => leg.file)
  legs = new Collection<FmsFileLeg>(this)
}

// ─── Entity 2: FmsFileUnit ────────────────────────────────────────────────────

@Entity({ tableName: 'fms_file_units' })
@Index({ name: 'fms_file_units_file_idx', properties: ['file'] })
@Index({ name: 'fms_file_units_cargo_type_idx', properties: ['cargoType'] })
export class FmsFileUnit {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt' | 'commodityDescription' | 'grossWeight' | 'weightUnit' | 'volume' | 'volumeUnit' | 'isHazardous' | 'containerNumber' | 'containerType' | 'packageCount' | 'packagesDetail' | 'sortOrder'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'cargo_type', type: 'text' })
  cargoType!: string // CargoType: 'FCL' | 'LCL'

  @Property({ name: 'origin_location_id', type: 'uuid' })
  originLocationId!: string

  @Property({ name: 'destination_location_id', type: 'uuid' })
  destinationLocationId!: string

  // Shared cargo fields
  @Property({ name: 'commodity_description', type: 'text', nullable: true })
  commodityDescription?: string | null

  @Property({ name: 'gross_weight', type: 'numeric', precision: 12, scale: 3, nullable: true })
  grossWeight?: string | null

  @Property({ name: 'weight_unit', type: 'text', nullable: true })
  weightUnit?: string | null

  @Property({ name: 'volume', type: 'numeric', precision: 12, scale: 3, nullable: true })
  volume?: string | null

  @Property({ name: 'volume_unit', type: 'text', nullable: true })
  volumeUnit?: string | null

  @Property({ name: 'is_hazardous', type: 'boolean', default: false })
  isHazardous: boolean = false

  // FCL-specific
  @Property({ name: 'container_number', type: 'text', nullable: true })
  containerNumber?: string | null

  @Property({ name: 'container_type', type: 'text', nullable: true })
  containerType?: string | null

  // LCL-specific
  @Property({ name: 'package_count', type: 'integer', nullable: true })
  packageCount?: number | null

  @Property({ name: 'packages_detail', type: 'jsonb', nullable: true })
  packagesDetail?: PackageDetail[] | null

  // Common
  @Property({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder: number = 0

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  // Relationships
  @ManyToOne(() => FmsFile, { fieldName: 'file_id' })
  file!: FmsFile

  @OneToMany(() => FmsFileUnitLeg, (ul) => ul.unit)
  unitLegs = new Collection<FmsFileUnitLeg>(this)
}

// ─── Entity 3: FmsFileLeg ─────────────────────────────────────────────────────

@Entity({ tableName: 'fms_file_legs' })
@Index({ name: 'fms_file_legs_file_idx', properties: ['file'] })
@Index({ name: 'fms_file_legs_sequence_idx', properties: ['file', 'legSequence'] })
export class FmsFileLeg {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt' | 'ptdTimestamps' | 'etdTimestamps' | 'atdTimestamps' | 'ptaTimestamps' | 'etaTimestamps' | 'ataTimestamps' | 'bookingNumber' | 'carrierId' | 'blNumber' | 'vesselName' | 'vesselImo' | 'voyageNumber' | 'flightNumber' | 'aircraftType' | 'notes' | 'createdBy' | 'updatedBy'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'leg_sequence', type: 'integer' })
  legSequence!: number

  @Property({ name: 'type', type: 'text' })
  type!: string // LegType: 'TRUCK' | 'SHIP' | 'RAIL' | 'AIR'

  @Property({ name: 'origin_location_id', type: 'uuid' })
  originLocationId!: string

  @Property({ name: 'destination_location_id', type: 'uuid' })
  destinationLocationId!: string

  // SCD Timestamps (departure)
  @Property({ name: 'ptd_timestamps', type: 'jsonb', nullable: true })
  ptdTimestamps?: LegTimestampEntry[] | null

  @Property({ name: 'etd_timestamps', type: 'jsonb', nullable: true })
  etdTimestamps?: LegTimestampEntry[] | null

  @Property({ name: 'atd_timestamps', type: 'jsonb', nullable: true })
  atdTimestamps?: LegTimestampEntry[] | null

  // SCD Timestamps (arrival)
  @Property({ name: 'pta_timestamps', type: 'jsonb', nullable: true })
  ptaTimestamps?: LegTimestampEntry[] | null

  @Property({ name: 'eta_timestamps', type: 'jsonb', nullable: true })
  etaTimestamps?: LegTimestampEntry[] | null

  @Property({ name: 'ata_timestamps', type: 'jsonb', nullable: true })
  ataTimestamps?: LegTimestampEntry[] | null

  // Booking / carrier / B/L
  @Property({ name: 'booking_number', type: 'text', nullable: true })
  bookingNumber?: string | null

  @Property({ name: 'carrier_id', type: 'uuid', nullable: true })
  carrierId?: string | null

  @Property({ name: 'bl_number', type: 'text', nullable: true })
  blNumber?: string | null

  // SHIP-specific
  @Property({ name: 'vessel_name', type: 'text', nullable: true })
  vesselName?: string | null

  @Property({ name: 'vessel_imo', type: 'text', nullable: true })
  vesselImo?: string | null

  @Property({ name: 'voyage_number', type: 'text', nullable: true })
  voyageNumber?: string | null

  // AIR-specific
  @Property({ name: 'flight_number', type: 'text', nullable: true })
  flightNumber?: string | null

  @Property({ name: 'aircraft_type', type: 'text', nullable: true })
  aircraftType?: string | null

  @Property({ name: 'notes', type: 'text', nullable: true })
  notes?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy?: string | null

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  // Relationships
  @ManyToOne(() => FmsFile, { fieldName: 'file_id' })
  file!: FmsFile

  @OneToMany(() => FmsFileUnitLeg, (ul) => ul.leg)
  unitLegs = new Collection<FmsFileUnitLeg>(this)
}

// ─── Entity 4: FmsFileUnitLeg ─────────────────────────────────────────────────

@Entity({ tableName: 'fms_file_unit_legs' })
@Unique({ name: 'fms_file_unit_legs_unit_leg_unique', properties: ['organizationId', 'unit', 'leg'] })
@Index({ name: 'fms_file_unit_legs_unit_idx', properties: ['unit'] })
@Index({ name: 'fms_file_unit_legs_leg_idx', properties: ['leg'] })
export class FmsFileUnitLeg {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt' | 'truckPlate' | 'trailerPlate' | 'driverFullName' | 'driverIdNumber' | 'driverPhone' | 'sealNumber' | 'blNumber' | 'consolidationContainerNumber' | 'notes'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  // TRUCK-specific
  @Property({ name: 'truck_plate', type: 'text', nullable: true })
  truckPlate?: string | null

  @Property({ name: 'trailer_plate', type: 'text', nullable: true })
  trailerPlate?: string | null

  @Property({ name: 'driver_full_name', type: 'text', nullable: true })
  driverFullName?: string | null

  @Property({ name: 'driver_id_number', type: 'text', nullable: true })
  driverIdNumber?: string | null

  @Property({ name: 'driver_phone', type: 'text', nullable: true })
  driverPhone?: string | null

  // SHIP-specific
  @Property({ name: 'seal_number', type: 'text', nullable: true })
  sealNumber?: string | null

  @Property({ name: 'bl_number', type: 'text', nullable: true })
  blNumber?: string | null

  @Property({ name: 'consolidation_container_number', type: 'text', nullable: true })
  consolidationContainerNumber?: string | null

  @Property({ name: 'notes', type: 'text', nullable: true })
  notes?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  // Relationships
  @ManyToOne(() => FmsFileUnit, { fieldName: 'unit_id' })
  unit!: FmsFileUnit

  @ManyToOne(() => FmsFileLeg, { fieldName: 'leg_id' })
  leg!: FmsFileLeg
}
