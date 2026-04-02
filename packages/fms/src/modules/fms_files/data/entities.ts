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
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt' | 'assigneeId' | 'notes' | 'createdBy' | 'updatedBy' | 'offerId' | 'rfqId'

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

  @Property({ name: 'offer_id', type: 'uuid', nullable: true })
  offerId?: string | null

  @Property({ name: 'rfq_id', type: 'uuid', nullable: true })
  rfqId?: string | null

  // Relationships
  @OneToMany(() => FmsFileUnit, (unit) => unit.file)
  units = new Collection<FmsFileUnit>(this)

  @OneToMany(() => FmsFileLeg, (leg) => leg.file)
  legs = new Collection<FmsFileLeg>(this)

  @OneToMany(() => FmsFileLine, (line) => line.file)
  lines = new Collection<FmsFileLine>(this)

  @OneToMany(() => FmsFileInvoice, (inv) => inv.file)
  invoices = new Collection<FmsFileInvoice>(this)

  @OneToMany(() => FmsFileNote, (note) => note.file)
  fileNotes = new Collection<FmsFileNote>(this)
}

// ─── Entity 2: FmsFileUnit ────────────────────────────────────────────────────

@Entity({ tableName: 'fms_file_units' })
@Index({ name: 'fms_file_units_file_idx', properties: ['file'] })
@Index({ name: 'fms_file_units_cargo_type_idx', properties: ['cargoType'] })
@Index({ name: 'fms_file_units_tracked_shipment_idx', properties: ['trackedShipmentId'] })
export class FmsFileUnit {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt' | 'originLocationId' | 'destinationLocationId' | 'commodityDescription' | 'grossWeight' | 'weightUnit' | 'volume' | 'volumeUnit' | 'isHazardous' | 'containerNumber' | 'containerType' | 'packageCount' | 'packagesDetail' | 'sortOrder' | 'trackedShipmentId'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'cargo_type', type: 'text' })
  cargoType!: string // CargoType: 'FCL' | 'LCL'

  @Property({ name: 'origin_location_id', type: 'uuid', nullable: true })
  originLocationId?: string | null

  @Property({ name: 'destination_location_id', type: 'uuid', nullable: true })
  destinationLocationId?: string | null

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

  // Shipment tracking link
  @Property({ name: 'tracked_shipment_id', type: 'uuid', nullable: true })
  trackedShipmentId?: string | null

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
@Index({ name: 'fms_file_legs_tracking_job_idx', properties: ['trackingJobId'] })
export class FmsFileLeg {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt' | 'originLocationId' | 'destinationLocationId' | 'ptdTimestamps' | 'etdTimestamps' | 'atdTimestamps' | 'ptaTimestamps' | 'etaTimestamps' | 'ataTimestamps' | 'bookingNumber' | 'carrierId' | 'blNumber' | 'vesselName' | 'vesselImo' | 'voyageNumber' | 'flightNumber' | 'aircraftType' | 'notes' | 'createdBy' | 'updatedBy' | 'trackingJobId' | 'gateInCutoff' | 'documentationCutoff' | 'vgmCutoff' | 'dangerousGoodsCutoff' | 'demFreeTime' | 'detFreeTime'

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

  @Property({ name: 'origin_location_id', type: 'uuid', nullable: true })
  originLocationId?: string | null

  @Property({ name: 'destination_location_id', type: 'uuid', nullable: true })
  destinationLocationId?: string | null

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

  // SHIP cut-offs and free time
  @Property({ name: 'gate_in_cutoff', type: Date, nullable: true })
  gateInCutoff?: Date | null

  @Property({ name: 'documentation_cutoff', type: Date, nullable: true })
  documentationCutoff?: Date | null

  @Property({ name: 'vgm_cutoff', type: Date, nullable: true })
  vgmCutoff?: Date | null

  @Property({ name: 'dangerous_goods_cutoff', type: Date, nullable: true })
  dangerousGoodsCutoff?: Date | null

  @Property({ name: 'dem_free_time', type: 'integer', nullable: true })
  demFreeTime?: number | null

  @Property({ name: 'det_free_time', type: 'integer', nullable: true })
  detFreeTime?: number | null

  // AIR-specific
  @Property({ name: 'flight_number', type: 'text', nullable: true })
  flightNumber?: string | null

  @Property({ name: 'aircraft_type', type: 'text', nullable: true })
  aircraftType?: string | null

  // Shipment tracking job link
  @Property({ name: 'tracking_job_id', type: 'uuid', nullable: true })
  trackingJobId?: string | null

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

// ─── Entity 5: FmsFileNote ────────────────────────────────────────────────────

@Entity({ tableName: 'fms_file_notes' })
@Index({ name: 'fms_file_notes_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'fms_file_notes_file_idx', properties: ['file'] })
export class FmsFileNote {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt' | 'authorUserId' | 'authorName' | 'attachmentId'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @ManyToOne(() => FmsFile, { fieldName: 'file_id' })
  file!: FmsFile

  @Property({ type: 'text' })
  body!: string

  @Property({ name: 'author_user_id', type: 'uuid', nullable: true })
  authorUserId?: string | null

  @Property({ name: 'author_name', type: 'text', nullable: true })
  authorName?: string | null

  @Property({ name: 'attachment_id', type: 'uuid', nullable: true })
  attachmentId?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

// ─── Entity 4: FmsFileUnitLeg ─────────────────────────────────────────────────

@Entity({ tableName: 'fms_file_unit_legs' })
@Unique({ name: 'fms_file_unit_legs_unit_leg_unique', properties: ['organizationId', 'unit', 'leg'] })
@Index({ name: 'fms_file_unit_legs_unit_idx', properties: ['unit'] })
@Index({ name: 'fms_file_unit_legs_leg_idx', properties: ['leg'] })
export class FmsFileUnitLeg {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt' | 'truckPlate' | 'trailerPlate' | 'driverFullName' | 'driverIdNumber' | 'driverPhone' | 'sealNumber' | 'blNumber' | 'consolidationContainerNumber' | 'notes' | 'ptd' | 'etd' | 'atd' | 'pta' | 'eta' | 'ata' | 'dropoffLocationId' | 'dropoffTime'

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

  // Per-container departure timestamps for this leg
  @Property({ name: 'ptd', type: 'text', nullable: true })
  ptd?: string | null

  @Property({ name: 'etd', type: 'text', nullable: true })
  etd?: string | null

  @Property({ name: 'atd', type: 'text', nullable: true })
  atd?: string | null

  // Per-container arrival timestamps for this leg
  @Property({ name: 'pta', type: 'text', nullable: true })
  pta?: string | null

  @Property({ name: 'eta', type: 'text', nullable: true })
  eta?: string | null

  @Property({ name: 'ata', type: 'text', nullable: true })
  ata?: string | null

  // TRUCK drop-off
  @Property({ name: 'dropoff_location_id', type: 'uuid', nullable: true })
  dropoffLocationId?: string | null

  @Property({ name: 'dropoff_time', type: 'text', nullable: true })
  dropoffTime?: string | null

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

// ─── Entity: FmsFileLine ──────────────────────────────────────────────────────

type FileLineSourceType = 'manual' | 'offer'

@Entity({ tableName: 'fms_file_lines' })
@Index({ name: 'fms_file_lines_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'fms_file_lines_file_idx', properties: ['file'] })
export class FmsFileLine {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt' | 'lineNumber' | 'sourceType' | 'quantity' | 'currencyCode' | 'soldUnitPrice' | 'soldAmount' | 'sourceOfferLineId' | 'productId' | 'priceId' | 'chargeCode' | 'chargeCategory' | 'chargeUnit' | 'containerType' | 'containerSize' | 'estimatedUnitCost' | 'estimatedCost' | 'actualUnitCost' | 'actualCost' | 'actualSellUnitPrice' | 'actualSellAmount' | 'notes'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @ManyToOne(() => FmsFile, { fieldName: 'file_id' })
  file!: FmsFile

  @Property({ name: 'line_number', type: 'integer', default: 0 })
  lineNumber: number = 0

  // Source tracking
  @Property({ name: 'source_offer_line_id', type: 'uuid', nullable: true })
  sourceOfferLineId?: string | null

  @Property({ name: 'source_type', type: 'text', default: 'manual' })
  sourceType: FileLineSourceType = 'manual'

  // Product references (module-isomorphic UUIDs, no @ManyToOne)
  @Property({ name: 'product_id', type: 'uuid', nullable: true })
  productId?: string | null

  @Property({ name: 'price_id', type: 'uuid', nullable: true })
  priceId?: string | null

  // Product snapshot
  @Property({ name: 'product_name', type: 'text' })
  productName!: string

  @Property({ name: 'charge_code', type: 'text', nullable: true })
  chargeCode?: string | null

  @Property({ name: 'charge_category', type: 'text', nullable: true })
  chargeCategory?: string | null

  @Property({ name: 'charge_unit', type: 'text', nullable: true })
  chargeUnit?: string | null

  @Property({ name: 'container_type', type: 'text', nullable: true })
  containerType?: string | null

  @Property({ name: 'container_size', type: 'text', nullable: true })
  containerSize?: string | null

  // Quantities & Currency
  @Property({ name: 'quantity', type: 'numeric', precision: 18, scale: 4, default: '1' })
  quantity: string = '1'

  @Property({ name: 'currency_code', type: 'text', default: 'USD' })
  currencyCode: string = 'USD'

  // Sold amounts
  @Property({ name: 'sold_unit_price', type: 'numeric', precision: 18, scale: 4, default: '0' })
  soldUnitPrice: string = '0'

  @Property({ name: 'sold_amount', type: 'numeric', precision: 18, scale: 4, default: '0' })
  soldAmount: string = '0'

  // Estimated costs
  @Property({ name: 'estimated_unit_cost', type: 'numeric', precision: 18, scale: 4, nullable: true })
  estimatedUnitCost?: string | null

  @Property({ name: 'estimated_cost', type: 'numeric', precision: 18, scale: 4, nullable: true })
  estimatedCost?: string | null

  // Actual costs
  @Property({ name: 'actual_unit_cost', type: 'numeric', precision: 18, scale: 4, nullable: true })
  actualUnitCost?: string | null

  @Property({ name: 'actual_cost', type: 'numeric', precision: 18, scale: 4, nullable: true })
  actualCost?: string | null

  // Actual sell
  @Property({ name: 'actual_sell_unit_price', type: 'numeric', precision: 18, scale: 4, nullable: true })
  actualSellUnitPrice?: string | null

  @Property({ name: 'actual_sell_amount', type: 'numeric', precision: 18, scale: 4, nullable: true })
  actualSellAmount?: string | null

  @Property({ name: 'notes', type: 'text', nullable: true })
  notes?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}

// ─── Entity: FmsFileInvoice ───────────────────────────────────────────────────

@Entity({ tableName: 'fms_file_invoices' })
@Index({ name: 'fms_file_invoices_org_tenant_idx', properties: ['organizationId', 'tenantId'] })
@Index({ name: 'fms_file_invoices_file_idx', properties: ['file'] })
@Index({ name: 'fms_file_invoices_document_idx', properties: ['documentId'] })
@Index({ name: 'fms_file_invoices_status_idx', properties: ['status'] })
export class FmsFileInvoice {
  [OptionalProps]?: 'createdAt' | 'updatedAt' | 'deletedAt' | 'documentId' | 'invoiceNumber' | 'sellerName' | 'sellerNip' | 'buyerName' | 'buyerNip' | 'sellerDetails' | 'buyerDetails' | 'netAmount' | 'vatAmount' | 'grossAmount' | 'currencyCode' | 'invoiceDate' | 'paymentDueDate' | 'serviceDate' | 'paymentMethod' | 'lineItems' | 'confidence' | 'extractionStrategies' | 'rawExtractionData' | 'status' | 'reviewedBy' | 'reviewedAt' | 'reviewNotes'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @ManyToOne(() => FmsFile, { fieldName: 'file_id' })
  file!: FmsFile

  @Property({ name: 'document_id', type: 'uuid', nullable: true })
  documentId?: string | null

  // Invoice identity
  @Property({ name: 'invoice_number', type: 'text', nullable: true })
  invoiceNumber?: string | null

  @Property({ name: 'seller_name', type: 'text', nullable: true })
  sellerName?: string | null

  @Property({ name: 'seller_nip', type: 'text', nullable: true })
  sellerNip?: string | null

  @Property({ name: 'buyer_name', type: 'text', nullable: true })
  buyerName?: string | null

  @Property({ name: 'buyer_nip', type: 'text', nullable: true })
  buyerNip?: string | null

  @Property({ name: 'seller_details', type: 'jsonb', nullable: true })
  sellerDetails?: Record<string, unknown> | null

  @Property({ name: 'buyer_details', type: 'jsonb', nullable: true })
  buyerDetails?: Record<string, unknown> | null

  // Financial (numeric 18.4)
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

  @Property({ name: 'payment_method', type: 'text', nullable: true })
  paymentMethod?: string | null

  @Property({ name: 'line_items', type: 'jsonb', nullable: true })
  lineItems?: unknown[] | null

  // Extraction metadata
  @Property({ name: 'confidence', type: 'text', default: 'REVIEW' })
  confidence: string = 'REVIEW'

  @Property({ name: 'extraction_strategies', type: 'jsonb', nullable: true })
  extractionStrategies?: string[] | null

  @Property({ name: 'raw_extraction_data', type: 'jsonb', nullable: true })
  rawExtractionData?: Record<string, unknown> | null

  // Review workflow
  @Property({ name: 'status', type: 'text', default: 'pending_review' })
  status: string = 'pending_review'

  @Property({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy?: string | null

  @Property({ name: 'reviewed_at', type: Date, nullable: true })
  reviewedAt?: Date | null

  @Property({ name: 'review_notes', type: 'text', nullable: true })
  reviewNotes?: string | null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'updated_at', type: Date, onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt?: Date | null
}
