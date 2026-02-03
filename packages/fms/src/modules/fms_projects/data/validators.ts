/**
 * FMS Projects Module - Validation Schemas
 * Zod schemas for project entities (shipment operations)
 */

import { z } from 'zod'
import {
  FMS_PROJECT_STATUSES,
  TRANSPORT_MODES,
  CARGO_TYPES,
  CONTAINER_TYPES,
  SHIPMENT_TYPES,
  DIRECTIONS,
  INCOTERMS,
  WEIGHT_UNITS,
  VOLUME_UNITS,
  DIMENSION_UNITS,
  CURRENCY_CODES,
  CONTAINER_OWNERSHIP_TYPES,
  PACKAGING_TYPES,
  CARGO_READINESS_STATUSES,
  INVOICE_CONFIDENCE_LEVELS,
  INVOICE_REVIEW_STATUSES,
  TRANSPORT_UNIT_STATUSES,
  AIR_DELIVERY_STATUSES,
  AIR_LOCATION_TYPES,
  AIR_UNIT_TYPES,
  ROAD_VEHICLE_TYPES,
  PROJECT_LINE_SOURCE_TYPES,
  VGM_STATUSES,
  CUSTOMS_CLEARANCE_STATUSES,
  CONTAINER_MODES,
  SERVICE_LEVELS,
  RELEASE_TYPES,
  PACK_TYPES,
  ON_BOARD_STATUSES,
  PAYMENT_TERMS_OPTIONS,
  CHARGES_APPLY_OPTIONS,
} from './types'

// Helper schemas
const uuid = () => z.string().uuid()

const scoped = z.object({
  organizationId: uuid(),
  tenantId: uuid(),
})

const currencyCode = z
  .string()
  .trim()
  .regex(/^[A-Z]{3}$/, 'currency code must be a three-letter ISO code')

const decimal = (opts?: { min?: number; max?: number }) => {
  let schema = z.coerce.number()
  if (typeof opts?.min === 'number') schema = schema.min(opts.min)
  if (typeof opts?.max === 'number') schema = schema.max(opts.max)
  return schema
}

// ============================================================================
// FmsProject Schemas
// ============================================================================

// API input schema - organizationId and tenantId are injected by the server
export const fmsProjectCreateSchema = z.object({
  organizationId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
}).extend({
  // Relationships
  clientId: uuid().optional().nullable(),
  offerId: uuid().optional().nullable(),
  quoteId: uuid().optional().nullable(),

  // Core project fields
  shipmentType: z.enum(SHIPMENT_TYPES),
  direction: z.enum(DIRECTIONS),
  cargoType: z.enum(CARGO_TYPES),
  incoterm: z.enum(INCOTERMS).optional().nullable(),

  // Transport modes (selected modes: sea, air, road)
  transportModes: z.array(z.enum(TRANSPORT_MODES)).optional().nullable(),

  // Locations
  originLocationId: uuid().optional().nullable(),
  destinationLocationId: uuid().optional().nullable(),
  placeOfLoadingId: uuid().optional().nullable(),
  placeOfDischargeId: uuid().optional().nullable(),
  originAddress: z.string().trim().max(500).optional().nullable(),
  destinationAddress: z.string().trim().max(500).optional().nullable(),

  // Dates
  projectDate: z.coerce.date().optional(),
  requestedPickupDate: z.coerce.date().optional().nullable(),
  requestedDeliveryDate: z.coerce.date().optional().nullable(),

  // References
  clientReference: z.string().trim().max(100).optional().nullable(),
  internalReference: z.string().trim().max(100).optional().nullable(),

  // Cargo details
  commodityDescription: z.string().trim().max(500).optional().nullable(),
  hsCode: z.string().trim().max(20).optional().nullable(),
  containerCount: z.coerce.number().int().min(1).optional().nullable(),
  transportUnitCount: z.coerce.number().int().min(1).optional().nullable(),

  // Total weights/volumes (aggregate from cargo/containers)
  totalGrossWeight: decimal({ min: 0 }).optional().nullable(),
  totalVolume: decimal({ min: 0 }).optional().nullable(),
  weightUnit: z.enum(WEIGHT_UNITS).optional().nullable(),
  volumeUnit: z.enum(VOLUME_UNITS).optional().nullable(),

  // Financial
  currencyCode: z.enum(CURRENCY_CODES).optional().default('USD'),
  estimatedCost: decimal({ min: 0 }).optional().nullable(),

  // Special requirements
  requiresInsurance: z.boolean().optional().default(false),
  requiresCustomsBrokerage: z.boolean().optional().default(false),
  isHazardous: z.boolean().optional().default(false),
  hazmatDetails: z.string().trim().max(1000).optional().nullable(),
  specialInstructions: z.string().trim().max(2000).optional().nullable(),

  // Internal notes
  internalNotes: z.string().trim().max(2000).optional().nullable(),

  // Workflow (optional - set by system)
  workflowInstanceId: uuid().optional().nullable(),
  currentStep: z.string().trim().max(100).optional().nullable(),
  workflowContext: z.record(z.string(), z.any()).optional().nullable(),

  // CargoWise-aligned fields (new)
  containerMode: z.enum(CONTAINER_MODES).optional().nullable(),
  serviceLevel: z.enum(SERVICE_LEVELS).optional().nullable(),
  blNumber: z.string().trim().max(100).optional().nullable(),
  blType: z.string().trim().max(50).optional().nullable(),
  releaseType: z.enum(RELEASE_TYPES).optional().nullable(),

  // Additional parties (linked to Contractors)
  notifyPartyId: uuid().optional().nullable(),
  controllingAgentId: uuid().optional().nullable(),
  controllingCustomerId: uuid().optional().nullable(),
  sendingAgentId: uuid().optional().nullable(),
  receivingAgentId: uuid().optional().nullable(),
  agentsReference: z.string().trim().max(100).optional().nullable(),

  // Cargo valuation
  goodsValue: decimal({ min: 0 }).optional().nullable(),
  goodsValueCurrency: currencyCode.optional().nullable(),
  insuranceValue: decimal({ min: 0 }).optional().nullable(),
  insuranceValueCurrency: currencyCode.optional().nullable(),

  // Domestic/International
  isDomestic: z.boolean().optional().default(false),

  // Additional terms
  additionalTerms: z.string().trim().max(1000).optional().nullable(),

  // Financial
  creditorId: uuid().optional().nullable(),
  paymentTerms: z.enum(PAYMENT_TERMS_OPTIONS).optional().nullable(),

  // Status tracking
  ctStatus: z.string().trim().max(50).optional().nullable(),
  eFreightStatus: z.string().trim().max(50).optional().nullable(),
  chargesApply: z.enum(CHARGES_APPLY_OPTIONS).optional().nullable(),

  // Project Detail View Fields (New)
  // Booking reference (project-level)
  bookingNumber: z.string().trim().max(100).optional().nullable(),

  // Operator (user assignment)
  operatorId: uuid().optional().nullable(),
  operatorName: z.string().trim().max(255).optional().nullable(),

  // Sales person (user assignment)
  salesPersonId: uuid().optional().nullable(),
  salesPersonName: z.string().trim().max(255).optional().nullable(),

  // Shipper (contractor)
  shipperId: uuid().optional().nullable(),

  // Consignee (contractor)
  consigneeId: uuid().optional().nullable(),

  // Shipping dates (project-level)
  etd: z.coerce.date().optional().nullable(),
  eta: z.coerce.date().optional().nullable(),
  atd: z.coerce.date().optional().nullable(),
  ata: z.coerce.date().optional().nullable(),

  // Cutoff dates (project-level)
  cargoReadyDate: z.coerce.date().optional().nullable(),
  vgmCutoffDate: z.coerce.date().optional().nullable(),
  docCutoffDate: z.coerce.date().optional().nullable(),
  gateInDate: z.coerce.date().optional().nullable(),
  gateCloseDate: z.coerce.date().optional().nullable(),

  // Carrier (project-level)
  carrierId: uuid().optional().nullable(),
})

export const fmsProjectUpdateSchema = z
  .object({
    id: uuid(),
  })
  .merge(fmsProjectCreateSchema.omit({ organizationId: true, tenantId: true }).partial())

export type FmsProjectCreateInput = z.infer<typeof fmsProjectCreateSchema>
export type FmsProjectUpdateInput = z.infer<typeof fmsProjectUpdateSchema>

// ============================================================================
// FmsProjectLeg Schemas
// ============================================================================

// Full schema with all fields (for internal use)
const fmsProjectLegFullSchema = scoped.extend({
  projectId: uuid(),
  legSequence: z.coerce.number().int().positive(),
  transportMode: z.enum(TRANSPORT_MODES),

  // Locations
  originLocationId: uuid().optional().nullable(),
  destinationLocationId: uuid().optional().nullable(),
  originAddress: z.string().trim().max(500).optional().nullable(),
  destinationAddress: z.string().trim().max(500).optional().nullable(),

  // Carrier information
  carrierId: uuid().optional().nullable(),
  carrierName: z.string().trim().max(255).optional().nullable(),
  vesselName: z.string().trim().max(255).optional().nullable(),
  voyageNumber: z.string().trim().max(100).optional().nullable(),
  flightNumber: z.string().trim().max(100).optional().nullable(),

  // Dates
  estimatedDeparture: z.coerce.date().optional().nullable(),
  estimatedArrival: z.coerce.date().optional().nullable(),
  actualDeparture: z.coerce.date().optional().nullable(),
  actualArrival: z.coerce.date().optional().nullable(),

  // Financial
  estimatedCost: decimal({ min: 0 }).optional().nullable(),
  actualCost: decimal({ min: 0 }).optional().nullable(),

  // Notes
  notes: z.string().trim().max(1000).optional().nullable(),
})

// API input schema - excludes framework-injected fields (organizationId, tenantId, projectId)
export const fmsProjectLegCreateSchema = fmsProjectLegFullSchema.omit({
  organizationId: true,
  tenantId: true,
  projectId: true,
})

export const fmsProjectLegUpdateSchema = z
  .object({
    id: uuid(),
  })
  .merge(fmsProjectLegCreateSchema.partial())

export type FmsProjectLegCreateInput = z.infer<typeof fmsProjectLegCreateSchema>
export type FmsProjectLegUpdateInput = z.infer<typeof fmsProjectLegUpdateSchema>

// ============================================================================
// FmsSeaContainer Schemas (Sea Transport - FCL)
// ============================================================================

// Full schema with all fields (for internal use)
const fmsSeaContainerFullSchema = scoped.extend({
  projectId: uuid(),

  // Container Info
  containerType: z.enum(CONTAINER_TYPES),
  containerNumber: z.string().trim().max(100).optional().nullable(),
  sealNumber: z.string().trim().max(100).optional().nullable(),
  ownershipType: z.enum(CONTAINER_OWNERSHIP_TYPES).optional().default('coc'),

  // Shipping References
  bookingNumber: z.string().trim().max(100).optional().nullable(),
  blNumber: z.string().trim().max(100).optional().nullable(),

  // Vessel Info
  vesselName: z.string().trim().max(255).optional().nullable(),
  vesselImo: z.string().trim().max(20).optional().nullable(),
  voyageNumber: z.string().trim().max(100).optional().nullable(),

  // Routing
  originPort: z.string().trim().max(100).optional().nullable(),
  destinationPort: z.string().trim().max(100).optional().nullable(),

  // Dates
  etd: z.coerce.date().optional().nullable(),
  eta: z.coerce.date().optional().nullable(),
  atd: z.coerce.date().optional().nullable(),
  ata: z.coerce.date().optional().nullable(),

  // Status
  status: z.enum(TRANSPORT_UNIT_STATUSES).optional().default('not_ready'),
  isHazardous: z.boolean().optional().default(false),

  // Notes
  notes: z.string().trim().max(1000).optional().nullable(),

  // VGM fields (Verified Gross Mass)
  vgmStatus: z.enum(VGM_STATUSES).optional().nullable(),
  vgmWeight: decimal({ min: 0 }).optional().nullable(),

  // Customs fields
  customsClearanceStatus: z.enum(CUSTOMS_CLEARANCE_STATUSES).optional().nullable(),
  customsClearanceLocation: z.string().trim().max(500).optional().nullable(),

  // Import-specific fields
  pinCode: z.string().trim().max(50).optional().nullable(),
  deliveryTime: z.string().trim().max(20).optional().nullable(),

  // Rail-specific fields
  dropOffLocation: z.string().trim().max(500).optional().nullable(),

  // Export-specific fields
  cutOffDate: z.coerce.date().optional().nullable(),

  // CargoWise-aligned fields (new)
  // Packing details
  packsCount: z.coerce.number().int().min(0).optional().nullable(),
  packType: z.enum(PACK_TYPES).optional().nullable(),
  innersCount: z.coerce.number().int().min(0).optional().nullable(),
  innerType: z.string().trim().max(50).optional().nullable(),

  // Measurements
  loadingMeters: decimal({ min: 0 }).optional().nullable(),
  chargeableWeight: decimal({ min: 0 }).optional().nullable(),
  wvRatio: decimal({ min: 0 }).optional().nullable(),

  // Cargo identification
  marksAndNumbers: z.string().trim().max(1000).optional().nullable(),
  hsCode: z.string().trim().max(20).optional().nullable(),

  // B/L status
  onBoardStatus: z.enum(ON_BOARD_STATUSES).optional().nullable(),
  onBoardDate: z.coerce.date().optional().nullable(),
  blIssueDate: z.coerce.date().optional().nullable(),
  originalsCount: z.coerce.number().int().min(0).optional().nullable(),
  expressBillsCount: z.coerce.number().int().min(0).optional().nullable(),

  // Carrier details
  carrierScac: z.string().trim().max(10).optional().nullable(),
  imoNumber: z.string().trim().max(20).optional().nullable(),

  // Cut-off dates
  ctoReceivalDate: z.coerce.date().optional().nullable(),
  ctoCutOffDate: z.coerce.date().optional().nullable(),
  docsDueDate: z.coerce.date().optional().nullable(),

  // Environmental
  co2Emissions: decimal({ min: 0 }).optional().nullable(),

  // Pickup planning (pre-carriage: shipper → port)
  pickupRequiredFrom: z.coerce.date().optional().nullable(),
  pickupRequiredBy: z.coerce.date().optional().nullable(),
  estimatedPickup: z.coerce.date().optional().nullable(),
  actualPickup: z.coerce.date().optional().nullable(),
  pickupLocationId: uuid().optional().nullable(),
  pickupNotes: z.string().trim().max(1000).optional().nullable(),

  // Delivery planning (on-carriage: port → consignee)
  deliveryRequiredBy: z.coerce.date().optional().nullable(),
  estimatedDelivery: z.coerce.date().optional().nullable(),
  actualDelivery: z.coerce.date().optional().nullable(),
  deliveryLocationId: uuid().optional().nullable(),
  deliveryNotes: z.string().trim().max(1000).optional().nullable(),
})

// API input schema - excludes framework-injected fields (organizationId, tenantId, projectId)
export const fmsSeaContainerCreateSchema = fmsSeaContainerFullSchema.omit({
  organizationId: true,
  tenantId: true,
  projectId: true,
})

export const fmsSeaContainerUpdateSchema = z
  .object({
    id: uuid().optional(), // Optional when using nested route with containerId in URL
  })
  .merge(fmsSeaContainerCreateSchema.partial())

export type FmsSeaContainerCreateInput = z.infer<typeof fmsSeaContainerCreateSchema>
export type FmsSeaContainerUpdateInput = z.infer<typeof fmsSeaContainerUpdateSchema>

// Command input schema - includes projectId for command handlers
export const fmsSeaContainerCommandCreateSchema = fmsSeaContainerCreateSchema.extend({
  projectId: uuid(),
  tenantId: uuid(),
  organizationId: uuid(),
})
export type FmsSeaContainerCommandCreateInput = z.infer<typeof fmsSeaContainerCommandCreateSchema>

// ============================================================================
// FmsAirUnit Schemas (Air Transport)
// ============================================================================

// Full schema with all fields (for internal use)
const fmsAirUnitFullSchema = scoped.extend({
  projectId: uuid(),

  // Status & Handling
  deliveryStatus: z.enum(AIR_DELIVERY_STATUSES).optional().default('awaiting'),
  isLoose: z.boolean().optional().default(true),
  isStackable: z.boolean().optional().default(true),
  isDgr: z.boolean().optional().default(false),
  dgrUnNumber: z.string().trim().max(50).optional().nullable(),
  dgrClass: z.string().trim().max(50).optional().nullable(),

  // Cargo Dimensions
  pieces: z.coerce.number().int().min(1).optional().nullable(),
  grossWeight: decimal({ min: 0 }).optional().nullable(),
  chargeableWeight: decimal({ min: 0 }).optional().nullable(),
  volume: decimal({ min: 0 }).optional().nullable(),
  loadingMeters: decimal({ min: 0 }).optional().nullable(),

  // Cargo Info
  commodity: z.string().trim().max(255).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  targetRate: decimal({ min: 0 }).optional().nullable(),

  // Unit Info (Optional)
  unitType: z.enum(AIR_UNIT_TYPES).optional().nullable(),
  unitNumber: z.string().trim().max(100).optional().nullable(),

  // Routing
  originType: z.enum(AIR_LOCATION_TYPES).optional().default('airport'),
  originAirport: z.string().trim().max(10).optional().nullable(),
  destinationAirport: z.string().trim().max(10).optional().nullable(),

  // Dates
  shipmentReadyDate: z.coerce.date().optional().nullable(),
  requiredAtDestination: z.coerce.date().optional().nullable(),
  etd: z.coerce.date().optional().nullable(),
  eta: z.coerce.date().optional().nullable(),
  atd: z.coerce.date().optional().nullable(),
  ata: z.coerce.date().optional().nullable(),

  // Shipping References
  mawbNumber: z.string().trim().max(50).optional().nullable(),
  hawbNumber: z.string().trim().max(50).optional().nullable(),
  bookingNumber: z.string().trim().max(100).optional().nullable(),

  // Flight Info
  flightNumber: z.string().trim().max(50).optional().nullable(),
  carrierCode: z.string().trim().max(10).optional().nullable(),
  aircraftType: z.string().trim().max(50).optional().nullable(),

  // Notes
  notes: z.string().trim().max(1000).optional().nullable(),

  // Customs fields
  customsClearanceStatus: z.enum(CUSTOMS_CLEARANCE_STATUSES).optional().nullable(),
  customsClearanceLocation: z.string().trim().max(500).optional().nullable(),
})

// API input schema - excludes framework-injected fields (organizationId, tenantId, projectId)
export const fmsAirUnitCreateSchema = fmsAirUnitFullSchema.omit({
  organizationId: true,
  tenantId: true,
  projectId: true,
})

export const fmsAirUnitUpdateSchema = z
  .object({
    id: uuid(),
  })
  .merge(fmsAirUnitCreateSchema.partial())

export type FmsAirUnitCreateInput = z.infer<typeof fmsAirUnitCreateSchema>
export type FmsAirUnitUpdateInput = z.infer<typeof fmsAirUnitUpdateSchema>

// ============================================================================
// FmsRoadUnit Schemas (Road Transport)
// ============================================================================

// Full schema with all fields (for internal use)
const fmsRoadUnitFullSchema = scoped.extend({
  projectId: uuid(),

  // Vehicle Info
  vehicleType: z.enum(ROAD_VEHICLE_TYPES),
  truckNumber: z.string().trim().max(50).optional().nullable(),
  trailerNumber: z.string().trim().max(50).optional().nullable(),
  driverName: z.string().trim().max(255).optional().nullable(),
  driverPhone: z.string().trim().max(50).optional().nullable(),

  // Shipping References
  cmrNumber: z.string().trim().max(100).optional().nullable(),
  bookingNumber: z.string().trim().max(100).optional().nullable(),

  // Carrier
  carrierName: z.string().trim().max(255).optional().nullable(),
  carrierContact: z.string().trim().max(255).optional().nullable(),

  // Routing
  originAddress: z.string().trim().max(500).optional().nullable(),
  destinationAddress: z.string().trim().max(500).optional().nullable(),

  // Dates
  pickupDate: z.coerce.date().optional().nullable(),
  deliveryDate: z.coerce.date().optional().nullable(),
  actualPickup: z.coerce.date().optional().nullable(),
  actualDelivery: z.coerce.date().optional().nullable(),

  // Cargo
  pieces: z.coerce.number().int().min(1).optional().nullable(),
  grossWeight: decimal({ min: 0 }).optional().nullable(),
  palletSpaces: z.coerce.number().int().min(1).optional().nullable(),
  loadingMeters: decimal({ min: 0 }).optional().nullable(),

  // Status
  status: z.enum(TRANSPORT_UNIT_STATUSES).optional().default('not_ready'),
  isHazardous: z.boolean().optional().default(false),

  // Notes
  notes: z.string().trim().max(1000).optional().nullable(),

  // Unloading details
  unloadingNotes: z.string().trim().max(1000).optional().nullable(),

  // Weighing
  weighingStatus: z.string().trim().max(50).optional().nullable(),

  // Rate with currency
  rate: decimal({ min: 0 }).optional().nullable(),
  rateCurrency: z.enum(CURRENCY_CODES).optional().default('PLN'),

  // Customs
  customsStatus: z.string().trim().max(100).optional().nullable(),
})

// API input schema - excludes framework-injected fields (organizationId, tenantId, projectId)
export const fmsRoadUnitCreateSchema = fmsRoadUnitFullSchema.omit({
  organizationId: true,
  tenantId: true,
  projectId: true,
})

export const fmsRoadUnitUpdateSchema = z
  .object({
    id: uuid(),
  })
  .merge(fmsRoadUnitCreateSchema.partial())

export type FmsRoadUnitCreateInput = z.infer<typeof fmsRoadUnitCreateSchema>
export type FmsRoadUnitUpdateInput = z.infer<typeof fmsRoadUnitUpdateSchema>

// ============================================================================
// FmsProjectCargo Schemas (LCL)
// ============================================================================

// Full schema with all fields (for internal use)
const fmsProjectCargoFullSchema = scoped.extend({
  projectId: uuid(),
  cargoSequence: z.coerce.number().int().positive().optional(),

  // Description
  commodityDescription: z.string().trim().max(500),
  hsCode: z.string().trim().max(20).optional().nullable(),

  // Packaging
  packageType: z.enum(PACKAGING_TYPES),
  packageCount: z.coerce.number().int().min(1),
  marksAndNumbers: z.string().trim().max(255).optional().nullable(),

  // Dimensions per piece
  length: decimal({ min: 0 }).optional().nullable(),
  width: decimal({ min: 0 }).optional().nullable(),
  height: decimal({ min: 0 }).optional().nullable(),
  dimensionUnit: z.enum(DIMENSION_UNITS).optional().nullable(),

  // Weight
  grossWeight: decimal({ min: 0 }),
  netWeight: decimal({ min: 0 }).optional().nullable(),
  weightUnit: z.enum(WEIGHT_UNITS),

  // Volume
  volume: decimal({ min: 0 }).optional().nullable(),
  volumeUnit: z.enum(VOLUME_UNITS).optional().nullable(),

  // Special requirements
  isHazardous: z.boolean().optional().default(false),
  hazmatClass: z.string().trim().max(50).optional().nullable(),
  unNumber: z.string().trim().max(50).optional().nullable(),
  isStackable: z.boolean().optional().default(true),
  requiresRefrigeration: z.boolean().optional().default(false),
  temperatureMin: decimal().optional().nullable(),
  temperatureMax: decimal().optional().nullable(),
  temperatureUnit: z.enum(['C', 'F']).optional().nullable(),

  // Financial
  declaredValue: decimal({ min: 0 }).optional().nullable(),
  declaredValueCurrency: z.enum(CURRENCY_CODES).optional().nullable(),

  // Tracking
  status: z.enum(CARGO_READINESS_STATUSES).optional().default('not_ready'),

  // Notes
  notes: z.string().trim().max(1000).optional().nullable(),
})

// API input schema - excludes framework-injected fields (organizationId, tenantId, projectId)
export const fmsProjectCargoCreateSchema = fmsProjectCargoFullSchema.omit({
  organizationId: true,
  tenantId: true,
  projectId: true,
})

export const fmsProjectCargoUpdateSchema = z
  .object({
    id: uuid(),
  })
  .merge(fmsProjectCargoCreateSchema.partial())

export type FmsProjectCargoCreateInput = z.infer<typeof fmsProjectCargoCreateSchema>
export type FmsProjectCargoUpdateInput = z.infer<typeof fmsProjectCargoUpdateSchema>

// Command input schema - includes projectId for command handlers
export const fmsProjectCargoCommandCreateSchema = fmsProjectCargoCreateSchema.extend({
  projectId: uuid(),
  tenantId: uuid(),
  organizationId: uuid(),
})
export type FmsProjectCargoCommandCreateInput = z.infer<typeof fmsProjectCargoCommandCreateSchema>

// ============================================================================
// FmsProjectInvoice Schemas
// ============================================================================

export const invoiceLineItemSchema = z.object({
  description: z.string(),
  quantity: z.coerce.number(),
  unit: z.string(),
  unitPriceNetto: z.coerce.number(),
  vatRate: z.coerce.number(),
  rowTotalNetto: z.coerce.number(),
  rowVat: z.coerce.number(),
  rowTotalBrutto: z.coerce.number(),
})

export const invoicePartySchema = z.object({
  name: z.string(),
  nip: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  bankAccount: z.string().optional(),
})

export const fmsProjectInvoiceCreateSchema = scoped.extend({
  projectId: uuid(),
  documentId: uuid(),

  // Extracted invoice data
  invoiceNumber: z.string().trim().max(100).optional().nullable(),

  // Seller information
  sellerName: z.string().trim().max(255).optional().nullable(),
  sellerNip: z.string().trim().max(50).optional().nullable(),
  sellerDetails: invoicePartySchema.optional().nullable(),

  // Buyer information
  buyerName: z.string().trim().max(255).optional().nullable(),
  buyerNip: z.string().trim().max(50).optional().nullable(),
  buyerDetails: invoicePartySchema.optional().nullable(),

  // Financial totals
  netAmount: decimal({ min: 0 }).optional().nullable(),
  vatAmount: decimal({ min: 0 }).optional().nullable(),
  grossAmount: decimal({ min: 0 }).optional().nullable(),
  currencyCode: z.string().trim().max(3).optional().default('PLN'),

  // Dates
  invoiceDate: z.coerce.date().optional().nullable(),
  paymentDueDate: z.coerce.date().optional().nullable(),
  serviceDate: z.coerce.date().optional().nullable(),

  // Payment method
  paymentMethod: z.string().trim().max(100).optional().nullable(),

  // Line items
  lineItems: z.array(invoiceLineItemSchema).optional().nullable(),

  // Extraction metadata
  confidence: z.enum(INVOICE_CONFIDENCE_LEVELS).optional().default('REVIEW'),
  extractionStrategies: z.array(z.string()).optional().nullable(),
  rawExtractionData: z.record(z.string(), z.any()).optional().nullable(),

  // Review status
  status: z.enum(INVOICE_REVIEW_STATUSES).optional().default('pending_review'),
  reviewedBy: uuid().optional().nullable(),
  reviewedAt: z.coerce.date().optional().nullable(),
  reviewNotes: z.string().trim().max(1000).optional().nullable(),
})

export const fmsProjectInvoiceUpdateSchema = z
  .object({
    id: uuid(),
  })
  .merge(fmsProjectInvoiceCreateSchema.omit({ organizationId: true, tenantId: true, projectId: true, documentId: true }).partial())

export const fmsProjectInvoiceReviewSchema = z.object({
  id: uuid(),
  status: z.enum(['approved', 'rejected']),
  reviewNotes: z.string().trim().max(1000).optional().nullable(),
})

export type FmsProjectInvoiceCreateInput = z.infer<typeof fmsProjectInvoiceCreateSchema>
export type FmsProjectInvoiceUpdateInput = z.infer<typeof fmsProjectInvoiceUpdateSchema>
export type FmsProjectInvoiceReviewInput = z.infer<typeof fmsProjectInvoiceReviewSchema>

// ============================================================================
// FmsProjectLine Schemas (Financial Tracking)
// ============================================================================

// Full schema with all fields (for internal use)
const fmsProjectLineFullSchema = scoped.extend({
  projectId: uuid(),

  // Line number
  lineNumber: z.coerce.number().int().min(0).optional().default(0),

  // Source tracking
  sourceOfferLineId: uuid().optional().nullable(),
  sourceType: z.enum(PROJECT_LINE_SOURCE_TYPES).optional().default('manual'),

  // Product references (for traceability)
  productId: uuid().optional().nullable(),
  variantId: uuid().optional().nullable(),
  priceId: uuid().optional().nullable(),

  // Product snapshot
  productName: z.string().trim().min(1).max(500),
  chargeCode: z.string().trim().max(100).optional().nullable(),
  containerSize: z.string().trim().max(50).optional().nullable(),

  // Additional type fields
  chargeCategory: z.string().trim().max(100).optional().nullable(),
  chargeUnit: z.string().trim().max(50).optional().nullable(),
  containerType: z.string().trim().max(50).optional().nullable(),

  // Quantities & Currency
  quantity: decimal({ min: 0 }).optional().default(1),
  currencyCode: z.enum(CURRENCY_CODES).optional().default('USD'),

  // Sold amounts (from offer)
  soldUnitPrice: decimal({ min: 0 }).optional().default(0),
  soldAmount: decimal({ min: 0 }).optional().default(0),

  // Actual costs (manually entered)
  actualUnitCost: decimal({ min: 0 }).optional().nullable(),
  actualCost: decimal({ min: 0 }).optional().nullable(),

  // Notes
  notes: z.string().trim().max(1000).optional().nullable(),
})

// API input schema - excludes framework-injected fields (organizationId, tenantId, projectId)
export const fmsProjectLineCreateSchema = fmsProjectLineFullSchema.omit({
  organizationId: true,
  tenantId: true,
  projectId: true,
})

export const fmsProjectLineUpdateSchema = z
  .object({
    id: uuid(),
  })
  .merge(fmsProjectLineCreateSchema.partial())

export type FmsProjectLineCreateInput = z.infer<typeof fmsProjectLineCreateSchema>
export type FmsProjectLineUpdateInput = z.infer<typeof fmsProjectLineUpdateSchema>

// ============================================================================
// FmsProjectNote Schemas (Project Notes)
// ============================================================================

export const fmsProjectNoteCreateSchema = z.object({
  body: z.string().trim().min(1).max(5000),
})

export const fmsProjectNoteUpdateSchema = z.object({
  id: uuid(),
  body: z.string().trim().min(1).max(5000).optional(),
})

export type FmsProjectNoteCreateInput = z.infer<typeof fmsProjectNoteCreateSchema>
export type FmsProjectNoteUpdateInput = z.infer<typeof fmsProjectNoteUpdateSchema>
