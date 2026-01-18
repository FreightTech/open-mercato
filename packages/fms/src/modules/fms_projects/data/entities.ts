/**
 * FMS Files Module - Entity Definitions
 * ORM entities for file management (logistics industry term for active shipments)
 */

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
  FmsFileStatus,
  TransportMode,
  CargoType,
  ContainerType,
  ShipmentType,
  Direction,
  Incoterm,
  WeightUnit,
  VolumeUnit,
  DimensionUnit,
  ContainerOwnershipType,
  PackagingType,
  CargoReadinessStatus,
} from './types'
import { Contractor } from '../../contractors/data/entities'
import { FmsLocation } from '../../fms_locations/data/entities'
import { FmsQuote, FmsOffer } from '../../fms_quotes/data/entities'

// ============================================================================
// FmsFile Entity
// ============================================================================

@Entity({ tableName: 'fms_files' })
@Index({ name: 'fms_files_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'fms_files_workflow_idx', properties: ['workflowInstanceId'] })
@Index({ name: 'fms_files_status_idx', properties: ['organizationId', 'tenantId', 'currentStep'] })
@Index({ name: 'fms_files_client_idx', properties: ['client', 'organizationId', 'tenantId'] })
@Unique({ name: 'fms_files_number_unique', properties: ['organizationId', 'fileNumber'] })
export class FmsFile {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  // File identification
  @Property({ name: 'file_number', type: 'text' })
  fileNumber!: string // Format: {TYPE}/{FCL|LCL}/{SEQUENCE}/{YEAR}/{COMPANY}

  // Relationships within fms package - CAN use @ManyToOne
  @ManyToOne(() => Contractor, { fieldName: 'client_id', nullable: true })
  client?: Contractor | null

  @ManyToOne(() => FmsQuote, { fieldName: 'quote_id', nullable: true })
  quote?: FmsQuote | null

  @ManyToOne(() => FmsOffer, { fieldName: 'offer_id', nullable: true })
  offer?: FmsOffer | null

  // Note: Shipment will be in fms_shipments module (future), stored as plain ID for now
  @Property({ name: 'shipment_id', type: 'uuid', nullable: true })
  shipmentId?: string | null

  // Workflow integration (CRITICAL)
  @Property({ name: 'workflow_instance_id', type: 'uuid', nullable: true })
  workflowInstanceId?: string | null

  @Property({ name: 'current_step', type: 'text', nullable: true })
  currentStep?: FmsFileStatus | null // Denormalized for performance

  @Property({ name: 'workflow_context', type: 'jsonb', nullable: true })
  workflowContext?: Record<string, any> | null

  // Core fields
  @Property({ name: 'shipment_type', type: 'text' })
  shipmentType!: ShipmentType // EXP, IMP, RAIL, FTL, LTL, DEPOT

  @Property({ name: 'direction', type: 'text' })
  direction!: Direction // export, import, domestic

  @Property({ name: 'cargo_type', type: 'text' })
  cargoType!: CargoType // fcl, lcl

  @Property({ name: 'incoterm', type: 'text', nullable: true })
  incoterm?: Incoterm | null

  // Locations
  @ManyToOne(() => FmsLocation, { fieldName: 'origin_location_id', nullable: true })
  originLocation?: FmsLocation | null

  @ManyToOne(() => FmsLocation, { fieldName: 'destination_location_id', nullable: true })
  destinationLocation?: FmsLocation | null

  @Property({ name: 'origin_address', type: 'text', nullable: true })
  originAddress?: string | null

  @Property({ name: 'destination_address', type: 'text', nullable: true })
  destinationAddress?: string | null

  // Dates
  @Property({ name: 'file_date', type: Date })
  fileDate: Date = new Date()

  @Property({ name: 'requested_pickup_date', type: Date, nullable: true })
  requestedPickupDate?: Date | null

  @Property({ name: 'requested_delivery_date', type: Date, nullable: true })
  requestedDeliveryDate?: Date | null

  // References
  @Property({ name: 'client_reference', type: 'text', nullable: true })
  clientReference?: string | null

  @Property({ name: 'internal_reference', type: 'text', nullable: true })
  internalReference?: string | null

  // Cargo details
  @Property({ name: 'commodity_description', type: 'text', nullable: true })
  commodityDescription?: string | null

  @Property({ name: 'hs_code', type: 'text', nullable: true })
  hsCode?: string | null

  @Property({ name: 'container_count', type: 'integer', nullable: true })
  containerCount?: number | null

  // Total weights/volumes (aggregate from cargo/containers)
  @Property({ name: 'total_gross_weight', type: 'numeric', precision: 18, scale: 4, nullable: true })
  totalGrossWeight?: string | null

  @Property({ name: 'total_volume', type: 'numeric', precision: 18, scale: 4, nullable: true })
  totalVolume?: string | null

  @Property({ name: 'weight_unit', type: 'text', nullable: true })
  weightUnit?: WeightUnit | null

  @Property({ name: 'volume_unit', type: 'text', nullable: true })
  volumeUnit?: VolumeUnit | null

  // Financial
  @Property({ name: 'currency_code', type: 'text', default: 'USD' })
  currencyCode: string = 'USD'

  @Property({ name: 'estimated_cost', type: 'numeric', precision: 18, scale: 4, nullable: true })
  estimatedCost?: string | null

  // Special requirements
  @Property({ name: 'requires_insurance', type: 'boolean', default: false })
  requiresInsurance: boolean = false

  @Property({ name: 'requires_customs_brokerage', type: 'boolean', default: false })
  requiresCustomsBrokerage: boolean = false

  @Property({ name: 'is_hazardous', type: 'boolean', default: false })
  isHazardous: boolean = false

  @Property({ name: 'hazmat_details', type: 'text', nullable: true })
  hazmatDetails?: string | null

  @Property({ name: 'special_instructions', type: 'text', nullable: true })
  specialInstructions?: string | null

  // Internal notes
  @Property({ name: 'internal_notes', type: 'text', nullable: true })
  internalNotes?: string | null

  // Timestamps (ALWAYS include)
  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  // Collections (within module - OK to use @OneToMany)
  @OneToMany(() => FmsFileLeg, (leg) => leg.file)
  legs = new Collection<FmsFileLeg>(this)

  @OneToMany(() => FmsFileContainer, (container) => container.file)
  containers = new Collection<FmsFileContainer>(this)

  @OneToMany(() => FmsFileCargo, (cargo) => cargo.file)
  cargo = new Collection<FmsFileCargo>(this)
}

// ============================================================================
// FmsFileLeg Entity
// ============================================================================

@Entity({ tableName: 'fms_file_legs' })
@Index({ name: 'fms_file_legs_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'fms_file_legs_file_idx', properties: ['file', 'legSequence'] })
export class FmsFileLeg {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @ManyToOne(() => FmsFile, { fieldName: 'file_id' })
  file!: FmsFile

  @Property({ name: 'leg_sequence', type: 'integer' })
  legSequence!: number

  @Property({ name: 'transport_mode', type: 'text' })
  transportMode!: TransportMode

  // Locations
  @ManyToOne(() => FmsLocation, { fieldName: 'origin_location_id', nullable: true })
  originLocation?: FmsLocation | null

  @ManyToOne(() => FmsLocation, { fieldName: 'destination_location_id', nullable: true })
  destinationLocation?: FmsLocation | null

  @Property({ name: 'origin_address', type: 'text', nullable: true })
  originAddress?: string | null

  @Property({ name: 'destination_address', type: 'text', nullable: true })
  destinationAddress?: string | null

  // Carrier information
  @ManyToOne(() => Contractor, { fieldName: 'carrier_id', nullable: true })
  carrier?: Contractor | null

  @Property({ name: 'carrier_name', type: 'text', nullable: true })
  carrierName?: string | null

  @Property({ name: 'vessel_name', type: 'text', nullable: true })
  vesselName?: string | null

  @Property({ name: 'voyage_number', type: 'text', nullable: true })
  voyageNumber?: string | null

  @Property({ name: 'flight_number', type: 'text', nullable: true })
  flightNumber?: string | null

  // Dates
  @Property({ name: 'estimated_departure', type: Date, nullable: true })
  estimatedDeparture?: Date | null

  @Property({ name: 'estimated_arrival', type: Date, nullable: true })
  estimatedArrival?: Date | null

  @Property({ name: 'actual_departure', type: Date, nullable: true })
  actualDeparture?: Date | null

  @Property({ name: 'actual_arrival', type: Date, nullable: true })
  actualArrival?: Date | null

  // Financial
  @Property({ name: 'estimated_cost', type: 'numeric', precision: 18, scale: 4, nullable: true })
  estimatedCost?: string | null

  @Property({ name: 'actual_cost', type: 'numeric', precision: 18, scale: 4, nullable: true })
  actualCost?: string | null

  // Notes
  @Property({ name: 'notes', type: 'text', nullable: true })
  notes?: string | null

  // Timestamps
  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

// ============================================================================
// FmsFileContainer Entity (FCL)
// ============================================================================

@Entity({ tableName: 'fms_file_containers' })
@Index({ name: 'fms_file_containers_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'fms_file_containers_file_idx', properties: ['file'] })
@Index({ name: 'fms_file_containers_number_idx', properties: ['containerNumber'] })
export class FmsFileContainer {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @ManyToOne(() => FmsFile, { fieldName: 'file_id' })
  file!: FmsFile

  @Property({ name: 'container_type', type: 'text' })
  containerType!: ContainerType

  @Property({ name: 'container_number', type: 'text', nullable: true })
  containerNumber?: string | null

  @Property({ name: 'seal_number', type: 'text', nullable: true })
  sealNumber?: string | null

  // Ownership
  @Property({ name: 'ownership_type', type: 'text', default: 'coc' })
  ownershipType: ContainerOwnershipType = 'coc'

  // Dimensions (optional override)
  @Property({ name: 'length', type: 'numeric', precision: 18, scale: 4, nullable: true })
  length?: string | null

  @Property({ name: 'width', type: 'numeric', precision: 18, scale: 4, nullable: true })
  width?: string | null

  @Property({ name: 'height', type: 'numeric', precision: 18, scale: 4, nullable: true })
  height?: string | null

  @Property({ name: 'dimension_unit', type: 'text', nullable: true })
  dimensionUnit?: DimensionUnit | null

  // Weight
  @Property({ name: 'tare_weight', type: 'numeric', precision: 18, scale: 4, nullable: true })
  tareWeight?: string | null

  @Property({ name: 'gross_weight', type: 'numeric', precision: 18, scale: 4, nullable: true })
  grossWeight?: string | null

  @Property({ name: 'net_weight', type: 'numeric', precision: 18, scale: 4, nullable: true })
  netWeight?: string | null

  @Property({ name: 'weight_unit', type: 'text', nullable: true })
  weightUnit?: WeightUnit | null

  // Cargo details
  @Property({ name: 'commodity_description', type: 'text', nullable: true })
  commodityDescription?: string | null

  @Property({ name: 'package_count', type: 'integer', nullable: true })
  packageCount?: number | null

  // Special requirements
  @Property({ name: 'is_reefer', type: 'boolean', default: false })
  isReefer: boolean = false

  @Property({ name: 'temperature_min', type: 'numeric', precision: 18, scale: 4, nullable: true })
  temperatureMin?: string | null

  @Property({ name: 'temperature_max', type: 'numeric', precision: 18, scale: 4, nullable: true })
  temperatureMax?: string | null

  @Property({ name: 'temperature_unit', type: 'text', nullable: true })
  temperatureUnit?: 'C' | 'F' | null

  @Property({ name: 'is_hazardous', type: 'boolean', default: false })
  isHazardous: boolean = false

  @Property({ name: 'hazmat_class', type: 'text', nullable: true })
  hazmatClass?: string | null

  @Property({ name: 'un_number', type: 'text', nullable: true })
  unNumber?: string | null

  // Tracking
  @Property({ name: 'pickup_date', type: Date, nullable: true })
  pickupDate?: Date | null

  @Property({ name: 'delivery_date', type: Date, nullable: true })
  deliveryDate?: Date | null

  @Property({ name: 'status', type: 'text', default: 'not_ready' })
  status: CargoReadinessStatus = 'not_ready'

  // Notes
  @Property({ name: 'notes', type: 'text', nullable: true })
  notes?: string | null

  // Timestamps
  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

// ============================================================================
// FmsFileCargo Entity (LCL)
// ============================================================================

@Entity({ tableName: 'fms_file_cargo' })
@Index({ name: 'fms_file_cargo_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'fms_file_cargo_file_idx', properties: ['file'] })
export class FmsFileCargo {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @ManyToOne(() => FmsFile, { fieldName: 'file_id' })
  file!: FmsFile

  @Property({ name: 'cargo_sequence', type: 'integer', nullable: true })
  cargoSequence?: number | null

  // Description
  @Property({ name: 'commodity_description', type: 'text' })
  commodityDescription!: string

  @Property({ name: 'hs_code', type: 'text', nullable: true })
  hsCode?: string | null

  // Packaging
  @Property({ name: 'package_type', type: 'text' })
  packageType!: PackagingType

  @Property({ name: 'package_count', type: 'integer' })
  packageCount!: number

  @Property({ name: 'marks_and_numbers', type: 'text', nullable: true })
  marksAndNumbers?: string | null

  // Dimensions per piece
  @Property({ name: 'length', type: 'numeric', precision: 18, scale: 4, nullable: true })
  length?: string | null

  @Property({ name: 'width', type: 'numeric', precision: 18, scale: 4, nullable: true })
  width?: string | null

  @Property({ name: 'height', type: 'numeric', precision: 18, scale: 4, nullable: true })
  height?: string | null

  @Property({ name: 'dimension_unit', type: 'text', nullable: true })
  dimensionUnit?: DimensionUnit | null

  // Weight
  @Property({ name: 'gross_weight', type: 'numeric', precision: 18, scale: 4 })
  grossWeight!: string

  @Property({ name: 'net_weight', type: 'numeric', precision: 18, scale: 4, nullable: true })
  netWeight?: string | null

  @Property({ name: 'weight_unit', type: 'text' })
  weightUnit!: WeightUnit

  // Volume
  @Property({ name: 'volume', type: 'numeric', precision: 18, scale: 4, nullable: true })
  volume?: string | null

  @Property({ name: 'volume_unit', type: 'text', nullable: true })
  volumeUnit?: VolumeUnit | null

  // Special requirements
  @Property({ name: 'is_hazardous', type: 'boolean', default: false })
  isHazardous: boolean = false

  @Property({ name: 'hazmat_class', type: 'text', nullable: true })
  hazmatClass?: string | null

  @Property({ name: 'un_number', type: 'text', nullable: true })
  unNumber?: string | null

  @Property({ name: 'is_stackable', type: 'boolean', default: true })
  isStackable: boolean = true

  @Property({ name: 'requires_refrigeration', type: 'boolean', default: false })
  requiresRefrigeration: boolean = false

  @Property({ name: 'temperature_min', type: 'numeric', precision: 18, scale: 4, nullable: true })
  temperatureMin?: string | null

  @Property({ name: 'temperature_max', type: 'numeric', precision: 18, scale: 4, nullable: true })
  temperatureMax?: string | null

  @Property({ name: 'temperature_unit', type: 'text', nullable: true })
  temperatureUnit?: 'C' | 'F' | null

  // Financial
  @Property({ name: 'declared_value', type: 'numeric', precision: 18, scale: 4, nullable: true })
  declaredValue?: string | null

  @Property({ name: 'declared_value_currency', type: 'text', nullable: true })
  declaredValueCurrency?: string | null

  // Tracking
  @Property({ name: 'status', type: 'text', default: 'not_ready' })
  status: CargoReadinessStatus = 'not_ready'

  // Notes
  @Property({ name: 'notes', type: 'text', nullable: true })
  notes?: string | null

  // Timestamps
  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}
