/**
 * FMS Projects Module - Entity Definitions
 * ORM entities for project management (shipment operations)
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
  FmsProjectStatus,
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
  InvoiceConfidenceLevel,
  InvoiceReviewStatus,
  TransportUnitStatus,
  AirDeliveryStatus,
  AirLocationType,
  AirUnitType,
  RoadVehicleType,
  ProjectLineSourceType,
  ContainerMode,
  ServiceLevel,
  ReleaseType,
  PaymentTermsOption,
  ChargesApply,
  PackType,
  OnBoardStatus,
} from './types'
import { Contractor } from '../../contractors/data/entities'
import { FmsLocation } from '../../fms_locations/data/entities'
import { FmsQuote, FmsOffer } from '../../fms_quotes/data/entities'

// ============================================================================
// FmsProject Entity
// ============================================================================

@Entity({ tableName: 'fms_projects' })
@Index({ name: 'fms_projects_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'fms_projects_workflow_idx', properties: ['workflowInstanceId'] })
@Index({ name: 'fms_projects_status_idx', properties: ['organizationId', 'tenantId', 'currentStep'] })
@Index({ name: 'fms_projects_client_idx', properties: ['client', 'organizationId', 'tenantId'] })
@Unique({ name: 'fms_projects_number_unique', properties: ['organizationId', 'projectNumber'] })
export class FmsProject {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  // Project identification
  @Property({ name: 'project_number', type: 'text' })
  projectNumber!: string // Format: {TYPE}/{FCL|LCL}/{SEQUENCE}/{YEAR}/{COMPANY}

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
  currentStep?: FmsProjectStatus | null // Denormalized for performance

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

  // Transport modes (array of selected modes: sea, air, road)
  @Property({ name: 'transport_modes', type: 'jsonb', nullable: true })
  transportModes?: TransportMode[] | null

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
  @Property({ name: 'project_date', type: Date })
  projectDate: Date = new Date()

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

  @Property({ name: 'transport_unit_count', type: 'integer', nullable: true })
  transportUnitCount?: number | null

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

  // ============================================================================
  // CargoWise-Aligned Fields (New)
  // ============================================================================

  // Container mode (FCL vs LCL distinction)
  @Property({ name: 'container_mode', type: 'text', nullable: true })
  containerMode?: ContainerMode | null

  // Service level
  @Property({ name: 'service_level', type: 'text', nullable: true })
  serviceLevel?: ServiceLevel | null

  // Bill of Lading details
  @Property({ name: 'bl_number', type: 'text', nullable: true })
  blNumber?: string | null

  @Property({ name: 'bl_type', type: 'text', nullable: true })
  blType?: string | null

  @Property({ name: 'release_type', type: 'text', nullable: true })
  releaseType?: ReleaseType | null

  // Additional parties (linked to Contractors)
  @ManyToOne(() => Contractor, { fieldName: 'notify_party_id', nullable: true })
  notifyParty?: Contractor | null

  @ManyToOne(() => Contractor, { fieldName: 'controlling_agent_id', nullable: true })
  controllingAgent?: Contractor | null

  @ManyToOne(() => Contractor, { fieldName: 'controlling_customer_id', nullable: true })
  controllingCustomer?: Contractor | null

  // Sending/Receiving agents (linked to Contractors)
  @ManyToOne(() => Contractor, { fieldName: 'sending_agent_id', nullable: true })
  sendingAgent?: Contractor | null

  @ManyToOne(() => Contractor, { fieldName: 'receiving_agent_id', nullable: true })
  receivingAgent?: Contractor | null

  @Property({ name: 'agents_reference', type: 'text', nullable: true })
  agentsReference?: string | null

  // Cargo valuation
  @Property({ name: 'goods_value', type: 'numeric', precision: 18, scale: 2, nullable: true })
  goodsValue?: string | null

  @Property({ name: 'goods_value_currency', type: 'text', nullable: true })
  goodsValueCurrency?: string | null

  @Property({ name: 'insurance_value', type: 'numeric', precision: 18, scale: 2, nullable: true })
  insuranceValue?: string | null

  @Property({ name: 'insurance_value_currency', type: 'text', nullable: true })
  insuranceValueCurrency?: string | null

  // Domestic/International
  @Property({ name: 'is_domestic', type: 'boolean', default: false })
  isDomestic: boolean = false

  // Additional terms
  @Property({ name: 'additional_terms', type: 'text', nullable: true })
  additionalTerms?: string | null

  // Financial (linked to Contractors)
  @ManyToOne(() => Contractor, { fieldName: 'creditor_id', nullable: true })
  creditor?: Contractor | null

  @Property({ name: 'payment_terms', type: 'text', nullable: true })
  paymentTerms?: PaymentTermsOption | null

  // Status tracking
  @Property({ name: 'ct_status', type: 'text', nullable: true })
  ctStatus?: string | null

  @Property({ name: 'e_freight_status', type: 'text', nullable: true })
  eFreightStatus?: string | null

  @Property({ name: 'charges_apply', type: 'text', nullable: true })
  chargesApply?: ChargesApply | null

  // Timestamps (ALWAYS include)
  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null

  // Collections (within module - OK to use @OneToMany)
  @OneToMany(() => FmsProjectLeg, (leg) => leg.project)
  legs = new Collection<FmsProjectLeg>(this)

  @OneToMany(() => FmsSeaContainer, (container) => container.project)
  seaContainers = new Collection<FmsSeaContainer>(this)

  @OneToMany(() => FmsAirUnit, (airUnit) => airUnit.project)
  airUnits = new Collection<FmsAirUnit>(this)

  @OneToMany(() => FmsRoadUnit, (roadUnit) => roadUnit.project)
  roadUnits = new Collection<FmsRoadUnit>(this)

  @OneToMany(() => FmsProjectCargo, (cargo) => cargo.project)
  cargo = new Collection<FmsProjectCargo>(this)

  @OneToMany(() => FmsProjectInvoice, (invoice) => invoice.project)
  invoices = new Collection<FmsProjectInvoice>(this)

  @OneToMany(() => FmsProjectLine, (line) => line.project)
  lines = new Collection<FmsProjectLine>(this)
}

// ============================================================================
// FmsProjectLine Entity (Financial Tracking)
// ============================================================================

@Entity({ tableName: 'fms_project_lines' })
@Index({ name: 'fms_project_lines_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'fms_project_lines_project_idx', properties: ['project'] })
export class FmsProjectLine {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @ManyToOne(() => FmsProject, { fieldName: 'project_id' })
  project!: FmsProject

  @Property({ name: 'line_number', type: 'integer', default: 0 })
  lineNumber: number = 0

  // Source tracking
  @Property({ name: 'source_offer_line_id', type: 'uuid', nullable: true })
  sourceOfferLineId?: string | null

  @Property({ name: 'source_type', type: 'text', default: 'manual' })
  sourceType: ProjectLineSourceType = 'manual'

  // Product references (module-isomorphic UUIDs, no @ManyToOne)
  @Property({ name: 'product_id', type: 'uuid', nullable: true })
  productId?: string | null

  @Property({ name: 'variant_id', type: 'uuid', nullable: true })
  variantId?: string | null

  @Property({ name: 'price_id', type: 'uuid', nullable: true })
  priceId?: string | null

  // Product snapshot
  @Property({ name: 'product_name', type: 'text' })
  productName!: string

  @Property({ name: 'charge_code', type: 'text', nullable: true })
  chargeCode?: string | null

  @Property({ name: 'container_size', type: 'text', nullable: true })
  containerSize?: string | null

  // Additional type fields from offer lines
  @Property({ name: 'charge_category', type: 'text', nullable: true })
  chargeCategory?: string | null

  @Property({ name: 'charge_unit', type: 'text', nullable: true })
  chargeUnit?: string | null

  @Property({ name: 'container_type', type: 'text', nullable: true })
  containerType?: string | null

  // Quantities & Currency (quantity editable even for offer lines)
  @Property({ name: 'quantity', type: 'numeric', precision: 18, scale: 4, default: '1' })
  quantity: string = '1'

  @Property({ name: 'currency_code', type: 'text', default: 'USD' })
  currencyCode: string = 'USD'

  // Sold amounts (from offer - locked)
  @Property({ name: 'sold_unit_price', type: 'numeric', precision: 18, scale: 4, default: '0' })
  soldUnitPrice: string = '0'

  @Property({ name: 'sold_amount', type: 'numeric', precision: 18, scale: 4, default: '0' })
  soldAmount: string = '0'

  // Actual costs (manually entered)
  @Property({ name: 'actual_unit_cost', type: 'numeric', precision: 18, scale: 4, nullable: true })
  actualUnitCost?: string | null

  @Property({ name: 'actual_cost', type: 'numeric', precision: 18, scale: 4, nullable: true })
  actualCost?: string | null

  @Property({ name: 'notes', type: 'text', nullable: true })
  notes?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

// ============================================================================
// FmsProjectLeg Entity
// ============================================================================

@Entity({ tableName: 'fms_project_legs' })
@Index({ name: 'fms_project_legs_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'fms_project_legs_project_idx', properties: ['project', 'legSequence'] })
export class FmsProjectLeg {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @ManyToOne(() => FmsProject, { fieldName: 'project_id' })
  project!: FmsProject

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
// FmsSeaContainer Entity (Sea Transport - FCL)
// ============================================================================

@Entity({ tableName: 'fms_sea_containers' })
@Index({ name: 'fms_sea_containers_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'fms_sea_containers_project_idx', properties: ['project'] })
@Index({ name: 'fms_sea_containers_number_idx', properties: ['containerNumber'] })
export class FmsSeaContainer {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @ManyToOne(() => FmsProject, { fieldName: 'project_id' })
  project!: FmsProject

  // Container Info
  @Property({ name: 'container_type', type: 'text' })
  containerType!: ContainerType

  @Property({ name: 'container_number', type: 'text', nullable: true })
  containerNumber?: string | null

  @Property({ name: 'seal_number', type: 'text', nullable: true })
  sealNumber?: string | null

  @Property({ name: 'ownership_type', type: 'text', default: 'coc' })
  ownershipType: ContainerOwnershipType = 'coc'

  // Shipping References
  @Property({ name: 'booking_number', type: 'text', nullable: true })
  bookingNumber?: string | null

  @Property({ name: 'bl_number', type: 'text', nullable: true })
  blNumber?: string | null

  // Vessel Info
  @Property({ name: 'vessel_name', type: 'text', nullable: true })
  vesselName?: string | null

  @Property({ name: 'vessel_imo', type: 'text', nullable: true })
  vesselImo?: string | null

  @Property({ name: 'voyage_number', type: 'text', nullable: true })
  voyageNumber?: string | null

  // Routing
  @Property({ name: 'origin_port', type: 'text', nullable: true })
  originPort?: string | null

  @Property({ name: 'destination_port', type: 'text', nullable: true })
  destinationPort?: string | null

  // Dates
  @Property({ name: 'etd', type: Date, nullable: true })
  etd?: Date | null

  @Property({ name: 'eta', type: Date, nullable: true })
  eta?: Date | null

  @Property({ name: 'atd', type: Date, nullable: true })
  atd?: Date | null

  @Property({ name: 'ata', type: Date, nullable: true })
  ata?: Date | null

  // Status
  @Property({ name: 'status', type: 'text', default: 'not_ready' })
  status: TransportUnitStatus = 'not_ready'

  @Property({ name: 'is_hazardous', type: 'boolean', default: false })
  isHazardous: boolean = false

  @Property({ name: 'notes', type: 'text', nullable: true })
  notes?: string | null

  // VGM fields (Verified Gross Mass)
  @Property({ name: 'vgm_status', type: 'text', nullable: true })
  vgmStatus?: 'pending' | 'submitted' | 'verified' | null

  @Property({ name: 'vgm_weight', type: 'numeric', precision: 12, scale: 3, nullable: true })
  vgmWeight?: string | null // Actual VGM weight in kg (e.g., 23400.000)

  // Customs fields
  @Property({ name: 'customs_clearance_status', type: 'text', nullable: true })
  customsClearanceStatus?: 'pending' | 'in_progress' | 'cleared' | null

  @Property({ name: 'customs_clearance_location', type: 'text', nullable: true })
  customsClearanceLocation?: string | null // "Port" or full address

  // Import-specific fields
  @Property({ name: 'pin_code', type: 'text', nullable: true })
  pinCode?: string | null // PIN code for import (e.g., 347840)

  @Property({ name: 'delivery_time', type: 'text', nullable: true })
  deliveryTime?: string | null // Scheduled time (e.g., "11:00")

  // Rail-specific fields
  @Property({ name: 'drop_off_location', type: 'text', nullable: true })
  dropOffLocation?: string | null // Container drop-off location

  // Export-specific fields
  @Property({ name: 'cut_off_date', type: Date, nullable: true })
  cutOffDate?: Date | null

  // ============================================================================
  // CargoWise-Aligned Fields (New)
  // ============================================================================

  // Packing details
  @Property({ name: 'packs_count', type: 'integer', nullable: true })
  packsCount?: number | null

  @Property({ name: 'pack_type', type: 'text', nullable: true })
  packType?: PackType | null

  @Property({ name: 'inners_count', type: 'integer', nullable: true })
  innersCount?: number | null

  @Property({ name: 'inner_type', type: 'text', nullable: true })
  innerType?: string | null

  // Measurements
  @Property({ name: 'loading_meters', type: 'numeric', precision: 12, scale: 3, nullable: true })
  loadingMeters?: string | null

  @Property({ name: 'chargeable_weight', type: 'numeric', precision: 12, scale: 3, nullable: true })
  chargeableWeight?: string | null

  @Property({ name: 'wv_ratio', type: 'numeric', precision: 8, scale: 4, nullable: true })
  wvRatio?: string | null

  // Cargo identification
  @Property({ name: 'marks_and_numbers', type: 'text', nullable: true })
  marksAndNumbers?: string | null

  @Property({ name: 'hs_code', type: 'text', nullable: true })
  hsCode?: string | null

  // B/L status
  @Property({ name: 'on_board_status', type: 'text', nullable: true })
  onBoardStatus?: OnBoardStatus | null

  @Property({ name: 'on_board_date', type: Date, nullable: true })
  onBoardDate?: Date | null

  @Property({ name: 'bl_issue_date', type: Date, nullable: true })
  blIssueDate?: Date | null

  @Property({ name: 'originals_count', type: 'integer', nullable: true })
  originalsCount?: number | null

  @Property({ name: 'express_bills_count', type: 'integer', nullable: true })
  expressBillsCount?: number | null

  // Carrier details
  @Property({ name: 'carrier_scac', type: 'text', nullable: true })
  carrierScac?: string | null

  @Property({ name: 'imo_number', type: 'text', nullable: true })
  imoNumber?: string | null

  // Cut-off dates
  @Property({ name: 'cto_receival_date', type: Date, nullable: true })
  ctoReceivalDate?: Date | null

  @Property({ name: 'cto_cut_off_date', type: Date, nullable: true })
  ctoCutOffDate?: Date | null

  @Property({ name: 'docs_due_date', type: Date, nullable: true })
  docsDueDate?: Date | null

  // Environmental
  @Property({ name: 'co2_emissions', type: 'numeric', precision: 12, scale: 3, nullable: true })
  co2Emissions?: string | null

  // Pickup planning (pre-carriage: shipper → port)
  @Property({ name: 'pickup_required_from', type: Date, nullable: true })
  pickupRequiredFrom?: Date | null

  @Property({ name: 'pickup_required_by', type: Date, nullable: true })
  pickupRequiredBy?: Date | null

  @Property({ name: 'estimated_pickup', type: Date, nullable: true })
  estimatedPickup?: Date | null

  @Property({ name: 'actual_pickup', type: Date, nullable: true })
  actualPickup?: Date | null

  @Property({ name: 'pickup_location_id', type: 'uuid', nullable: true })
  pickupLocationId?: string | null

  @Property({ name: 'pickup_notes', type: 'text', nullable: true })
  pickupNotes?: string | null

  // Delivery planning (on-carriage: port → consignee)
  @Property({ name: 'delivery_required_by', type: Date, nullable: true })
  deliveryRequiredBy?: Date | null

  @Property({ name: 'estimated_delivery', type: Date, nullable: true })
  estimatedDelivery?: Date | null

  @Property({ name: 'actual_delivery', type: Date, nullable: true })
  actualDelivery?: Date | null

  @Property({ name: 'delivery_location_id', type: 'uuid', nullable: true })
  deliveryLocationId?: string | null

  @Property({ name: 'delivery_notes', type: 'text', nullable: true })
  deliveryNotes?: string | null

  // Timestamps
  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

// ============================================================================
// FmsAirUnit Entity (Air Transport)
// ============================================================================

@Entity({ tableName: 'fms_air_units' })
@Index({ name: 'fms_air_units_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'fms_air_units_project_idx', properties: ['project'] })
@Index({ name: 'fms_air_units_mawb_idx', properties: ['mawbNumber'] })
export class FmsAirUnit {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @ManyToOne(() => FmsProject, { fieldName: 'project_id' })
  project!: FmsProject

  // Status & Handling (CRITICAL)
  @Property({ name: 'delivery_status', type: 'text', default: 'awaiting' })
  deliveryStatus: AirDeliveryStatus = 'awaiting'

  @Property({ name: 'is_loose', type: 'boolean', default: true })
  isLoose: boolean = true // true = loose cargo, false = unitised (on ULD/pallet)

  @Property({ name: 'is_stackable', type: 'boolean', default: true })
  isStackable: boolean = true

  @Property({ name: 'is_dgr', type: 'boolean', default: false })
  isDgr: boolean = false // Dangerous Goods Regulation

  @Property({ name: 'dgr_un_number', type: 'text', nullable: true })
  dgrUnNumber?: string | null

  @Property({ name: 'dgr_class', type: 'text', nullable: true })
  dgrClass?: string | null

  // Cargo Dimensions
  @Property({ name: 'pieces', type: 'integer', nullable: true })
  pieces?: number | null

  @Property({ name: 'gross_weight', type: 'numeric', precision: 18, scale: 4, nullable: true })
  grossWeight?: string | null // kg

  @Property({ name: 'chargeable_weight', type: 'numeric', precision: 18, scale: 4, nullable: true })
  chargeableWeight?: string | null // kg

  @Property({ name: 'volume', type: 'numeric', precision: 18, scale: 4, nullable: true })
  volume?: string | null // cbm

  @Property({ name: 'loading_meters', type: 'numeric', precision: 18, scale: 4, nullable: true })
  loadingMeters?: string | null // LDM

  // Cargo Info
  @Property({ name: 'commodity', type: 'text', nullable: true })
  commodity?: string | null

  @Property({ name: 'description', type: 'text', nullable: true })
  description?: string | null

  @Property({ name: 'target_rate', type: 'numeric', precision: 18, scale: 4, nullable: true })
  targetRate?: string | null // per kg

  // Unit Info (Optional - for unitised cargo)
  @Property({ name: 'unit_type', type: 'text', nullable: true })
  unitType?: AirUnitType | null

  @Property({ name: 'unit_number', type: 'text', nullable: true })
  unitNumber?: string | null

  // Routing
  @Property({ name: 'origin_type', type: 'text', default: 'airport' })
  originType: AirLocationType = 'airport'

  @Property({ name: 'origin_airport', type: 'text', nullable: true })
  originAirport?: string | null // IATA code

  @Property({ name: 'destination_airport', type: 'text', nullable: true })
  destinationAirport?: string | null // IATA code

  // Dates
  @Property({ name: 'shipment_ready_date', type: Date, nullable: true })
  shipmentReadyDate?: Date | null

  @Property({ name: 'required_at_destination', type: Date, nullable: true })
  requiredAtDestination?: Date | null

  @Property({ name: 'etd', type: Date, nullable: true })
  etd?: Date | null

  @Property({ name: 'eta', type: Date, nullable: true })
  eta?: Date | null

  @Property({ name: 'atd', type: Date, nullable: true })
  atd?: Date | null

  @Property({ name: 'ata', type: Date, nullable: true })
  ata?: Date | null

  // Shipping References
  @Property({ name: 'mawb_number', type: 'text', nullable: true })
  mawbNumber?: string | null // Master Air Waybill

  @Property({ name: 'hawb_number', type: 'text', nullable: true })
  hawbNumber?: string | null // House Air Waybill

  @Property({ name: 'booking_number', type: 'text', nullable: true })
  bookingNumber?: string | null

  // Flight Info
  @Property({ name: 'flight_number', type: 'text', nullable: true })
  flightNumber?: string | null

  @Property({ name: 'carrier_code', type: 'text', nullable: true })
  carrierCode?: string | null // Airline IATA code

  @Property({ name: 'aircraft_type', type: 'text', nullable: true })
  aircraftType?: string | null

  // Notes
  @Property({ name: 'notes', type: 'text', nullable: true })
  notes?: string | null

  // Customs fields
  @Property({ name: 'customs_clearance_status', type: 'text', nullable: true })
  customsClearanceStatus?: 'pending' | 'in_progress' | 'cleared' | null

  @Property({ name: 'customs_clearance_location', type: 'text', nullable: true })
  customsClearanceLocation?: string | null

  // Timestamps
  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

// ============================================================================
// FmsRoadUnit Entity (Road Transport)
// ============================================================================

@Entity({ tableName: 'fms_road_units' })
@Index({ name: 'fms_road_units_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'fms_road_units_project_idx', properties: ['project'] })
@Index({ name: 'fms_road_units_cmr_idx', properties: ['cmrNumber'] })
export class FmsRoadUnit {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @ManyToOne(() => FmsProject, { fieldName: 'project_id' })
  project!: FmsProject

  // Vehicle Info
  @Property({ name: 'vehicle_type', type: 'text' })
  vehicleType!: RoadVehicleType

  @Property({ name: 'truck_number', type: 'text', nullable: true })
  truckNumber?: string | null

  @Property({ name: 'trailer_number', type: 'text', nullable: true })
  trailerNumber?: string | null

  @Property({ name: 'driver_name', type: 'text', nullable: true })
  driverName?: string | null

  @Property({ name: 'driver_phone', type: 'text', nullable: true })
  driverPhone?: string | null

  // Shipping References
  @Property({ name: 'cmr_number', type: 'text', nullable: true })
  cmrNumber?: string | null

  @Property({ name: 'booking_number', type: 'text', nullable: true })
  bookingNumber?: string | null

  // Carrier
  @Property({ name: 'carrier_name', type: 'text', nullable: true })
  carrierName?: string | null

  @Property({ name: 'carrier_contact', type: 'text', nullable: true })
  carrierContact?: string | null

  // Routing
  @Property({ name: 'origin_address', type: 'text', nullable: true })
  originAddress?: string | null

  @Property({ name: 'destination_address', type: 'text', nullable: true })
  destinationAddress?: string | null

  // Dates
  @Property({ name: 'pickup_date', type: Date, nullable: true })
  pickupDate?: Date | null

  @Property({ name: 'delivery_date', type: Date, nullable: true })
  deliveryDate?: Date | null

  @Property({ name: 'actual_pickup', type: Date, nullable: true })
  actualPickup?: Date | null

  @Property({ name: 'actual_delivery', type: Date, nullable: true })
  actualDelivery?: Date | null

  // Cargo
  @Property({ name: 'pieces', type: 'integer', nullable: true })
  pieces?: number | null

  @Property({ name: 'gross_weight', type: 'numeric', precision: 18, scale: 4, nullable: true })
  grossWeight?: string | null

  @Property({ name: 'pallet_spaces', type: 'integer', nullable: true })
  palletSpaces?: number | null

  @Property({ name: 'loading_meters', type: 'numeric', precision: 18, scale: 4, nullable: true })
  loadingMeters?: string | null

  // Status
  @Property({ name: 'status', type: 'text', default: 'not_ready' })
  status: TransportUnitStatus = 'not_ready'

  @Property({ name: 'is_hazardous', type: 'boolean', default: false })
  isHazardous: boolean = false // ADR goods

  @Property({ name: 'notes', type: 'text', nullable: true })
  notes?: string | null

  // Unloading details
  @Property({ name: 'unloading_notes', type: 'text', nullable: true })
  unloadingNotes?: string | null // Notes specific to unloading

  // Weighing
  @Property({ name: 'weighing_status', type: 'text', nullable: true })
  weighingStatus?: string | null

  // Rate with currency
  @Property({ name: 'rate', type: 'numeric', precision: 18, scale: 4, nullable: true })
  rate?: string | null

  @Property({ name: 'rate_currency', type: 'text', nullable: true, default: 'PLN' })
  rateCurrency?: string | null // PLN, EUR, etc.

  // Customs
  @Property({ name: 'customs_status', type: 'text', nullable: true })
  customsStatus?: string | null // "Brak" = None

  // Timestamps
  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

// ============================================================================
// FmsProjectCargo Entity (LCL)
// ============================================================================

@Entity({ tableName: 'fms_project_cargo' })
@Index({ name: 'fms_project_cargo_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'fms_project_cargo_project_idx', properties: ['project'] })
export class FmsProjectCargo {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @ManyToOne(() => FmsProject, { fieldName: 'project_id' })
  project!: FmsProject

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

// ============================================================================
// FmsProjectInvoice Entity (Extracted Invoice Data)
// ============================================================================

/**
 * Invoice Line Item structure (stored in JSONB)
 */
export interface InvoiceLineItem {
  description: string
  quantity: number
  unit: string
  unitPriceNetto: number
  vatRate: number
  rowTotalNetto: number
  rowVat: number
  rowTotalBrutto: number
}

/**
 * Seller/Buyer party structure (stored in JSONB)
 */
export interface InvoiceParty {
  name: string
  nip?: string
  address?: string
  city?: string
  postalCode?: string
  bankAccount?: string
}

@Entity({ tableName: 'fms_project_invoices' })
@Index({ name: 'fms_project_invoices_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'fms_project_invoices_project_idx', properties: ['project'] })
@Index({ name: 'fms_project_invoices_document_idx', properties: ['documentId'] })
@Index({ name: 'fms_project_invoices_status_idx', properties: ['status'] })
export class FmsProjectInvoice {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @ManyToOne(() => FmsProject, { fieldName: 'project_id' })
  project!: FmsProject

  // Link to the source document
  @Property({ name: 'document_id', type: 'uuid' })
  documentId!: string

  // Extracted invoice data
  @Property({ name: 'invoice_number', type: 'text', nullable: true })
  invoiceNumber?: string | null

  // Seller information
  @Property({ name: 'seller_name', type: 'text', nullable: true })
  sellerName?: string | null

  @Property({ name: 'seller_nip', type: 'text', nullable: true })
  sellerNip?: string | null

  @Property({ name: 'seller_details', type: 'jsonb', nullable: true })
  sellerDetails?: InvoiceParty | null

  // Buyer information
  @Property({ name: 'buyer_name', type: 'text', nullable: true })
  buyerName?: string | null

  @Property({ name: 'buyer_nip', type: 'text', nullable: true })
  buyerNip?: string | null

  @Property({ name: 'buyer_details', type: 'jsonb', nullable: true })
  buyerDetails?: InvoiceParty | null

  // Financial totals
  @Property({ name: 'net_amount', type: 'numeric', precision: 18, scale: 4, nullable: true })
  netAmount?: string | null

  @Property({ name: 'vat_amount', type: 'numeric', precision: 18, scale: 4, nullable: true })
  vatAmount?: string | null

  @Property({ name: 'gross_amount', type: 'numeric', precision: 18, scale: 4, nullable: true })
  grossAmount?: string | null

  @Property({ name: 'currency_code', type: 'text', default: 'PLN' })
  currencyCode: string = 'PLN'

  // Dates
  @Property({ name: 'invoice_date', type: Date, nullable: true })
  invoiceDate?: Date | null

  @Property({ name: 'payment_due_date', type: Date, nullable: true })
  paymentDueDate?: Date | null

  @Property({ name: 'service_date', type: Date, nullable: true })
  serviceDate?: Date | null

  // Payment method
  @Property({ name: 'payment_method', type: 'text', nullable: true })
  paymentMethod?: string | null

  // Line items (JSONB)
  @Property({ name: 'line_items', type: 'jsonb', nullable: true })
  lineItems?: InvoiceLineItem[] | null

  // Extraction metadata
  @Property({ name: 'confidence', type: 'text', default: 'REVIEW' })
  confidence: InvoiceConfidenceLevel = 'REVIEW'

  @Property({ name: 'extraction_strategies', type: 'jsonb', nullable: true })
  extractionStrategies?: string[] | null

  @Property({ name: 'raw_extraction_data', type: 'jsonb', nullable: true })
  rawExtractionData?: Record<string, any> | null

  // Review status
  @Property({ name: 'status', type: 'text', default: 'pending_review' })
  status: InvoiceReviewStatus = 'pending_review'

  @Property({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy?: string | null

  @Property({ name: 'reviewed_at', type: Date, nullable: true })
  reviewedAt?: Date | null

  @Property({ name: 'review_notes', type: 'text', nullable: true })
  reviewNotes?: string | null

  // Timestamps
  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}
