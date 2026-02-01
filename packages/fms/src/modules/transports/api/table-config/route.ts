/**
 * Transports Module - Dynamic Table Config API
 *
 * Returns column configuration based on the selected shipment type tab.
 * Each tab (EXP, IMP, RAIL, FTL, DEPOT) has different columns matching
 * the real-world data structure from user spreadsheets.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  SHIPMENT_TYPES,
  CONTAINER_TYPES,
  VGM_STATUSES,
  CUSTOMS_CLEARANCE_STATUSES,
  ROAD_VEHICLE_TYPES,
  CONTAINER_MODES,
  SERVICE_LEVELS,
  RELEASE_TYPES,
  PACK_TYPES,
  ON_BOARD_STATUSES,
  DIRECTIONS,
} from '../../../fms_projects/data/types'
import type { ShipmentType } from '../../../fms_projects/data/types'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['transports.transports.view'] },
}

const querySchema = z.object({
  shipmentType: z.enum(SHIPMENT_TYPES).default('EXP'),
})

export interface TableColumnConfig {
  data: string
  title: string
  width: number
  type?: 'text' | 'numeric' | 'date' | 'dropdown' | 'checkbox'
  dateFormat?: string
  readOnly?: boolean
  source?: readonly string[]
  renderer?: string
}

/**
 * Get columns for EXP (Sea Export) tab
 * Order: identifiers → type → origin/destination → dates → other fields
 */
function getExpColumns(): TableColumnConfig[] {
  return [
    // Identifiers
    { data: 'containerNumber', title: 'Container #', type: 'text', width: 130 },
    { data: 'bookingNumber', title: 'Booking', type: 'text', width: 120 },
    { data: 'blNumber', title: 'B/L #', type: 'text', width: 120 },
    { data: 'projectNumber', title: 'Order #', type: 'text', width: 160, readOnly: true },
    // Type
    { data: 'containerType', title: 'Container', type: 'dropdown', width: 80, source: CONTAINER_TYPES },
    { data: 'containerMode', title: 'Mode', type: 'dropdown', width: 60, source: CONTAINER_MODES },
    // Origin / Destination
    { data: 'origin', title: 'Origin', type: 'text', width: 100 },
    { data: 'destination', title: 'Destination', type: 'text', width: 100 },
    // Dates
    { data: 'date', title: 'ETD', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    { data: 'cutOff', title: 'Cut Off', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    { data: 'ctoCutOffDate', title: 'CTO Cut Off', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    { data: 'docsDueDate', title: 'Docs Due', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    // Pickup planning (pre-carriage)
    { data: 'pickupRequiredBy', title: 'Pickup By', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    { data: 'estimatedPickup', title: 'Est. Pickup', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    { data: 'actualPickup', title: 'Act. Pickup', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    // Carrier & Shipping
    { data: 'shippingLine', title: 'Shipping Line', type: 'text', width: 100 },
    { data: 'carrierName', title: 'Carrier', type: 'text', width: 100 },
    { data: 'rate', title: 'Rate', type: 'numeric', width: 100 },
    // Status
    { data: 'vgmStatus', title: 'VGM', type: 'dropdown', width: 80, source: VGM_STATUSES },
    { data: 'customsClearance', title: 'Customs', type: 'text', width: 200 },
    { data: 'onBoardStatus', title: 'On Board', type: 'dropdown', width: 80, source: ON_BOARD_STATUSES },
    { data: 'releaseType', title: 'Release Type', type: 'dropdown', width: 100, source: RELEASE_TYPES },
    { data: 'serviceLevel', title: 'Service', type: 'dropdown', width: 80, source: SERVICE_LEVELS },
    // Cargo details
    { data: 'goods', title: 'Goods', type: 'text', width: 150 },
    { data: 'hsCode', title: 'HS Code', type: 'text', width: 80 },
    { data: 'weight', title: 'Weight', type: 'numeric', width: 60 },
    { data: 'packsCount', title: 'Pcs', type: 'numeric', width: 50 },
    { data: 'packType', title: 'Pack Type', type: 'dropdown', width: 60, source: PACK_TYPES },
    // Voyage details
    { data: 'voyageNumber', title: 'Voyage', type: 'text', width: 100 },
    { data: 'carrierScac', title: 'SCAC', type: 'text', width: 60 },
    // Other
    { data: 'forwarder', title: 'Forwarder', type: 'text', width: 100, readOnly: true },
    { data: 'notes', title: 'Notes', type: 'text', width: 150 },
    { data: 'additional', title: 'Additional', type: 'text', width: 150 },
  ]
}

/**
 * Get columns for IMP (Sea Import) tab
 * Order: identifiers → type → origin/destination → dates → other fields
 */
function getImpColumns(): TableColumnConfig[] {
  return [
    // Identifiers
    { data: 'containerNumber', title: 'Container #', type: 'text', width: 130 },
    { data: 'blNumber', title: 'B/L #', type: 'text', width: 120 },
    { data: 'pinCode', title: 'PIN', type: 'text', width: 80 },
    { data: 'projectNumber', title: 'Order #', type: 'text', width: 160, readOnly: true },
    // Type
    { data: 'containerMode', title: 'Mode', type: 'dropdown', width: 60, source: CONTAINER_MODES },
    // Origin / Destination
    { data: 'origin', title: 'Origin', type: 'text', width: 100 },
    { data: 'destination', title: 'Destination', type: 'text', width: 100 },
    // Dates
    { data: 'date', title: 'ETA', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    { data: 'deliveryTime', title: 'Time', type: 'text', width: 70 },
    // Delivery planning (on-carriage)
    { data: 'deliveryRequiredBy', title: 'Delivery By', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    { data: 'estimatedDelivery', title: 'Est. Delivery', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    { data: 'actualDelivery', title: 'Act. Delivery', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    // Carrier & Shipping
    { data: 'carrierName', title: 'Carrier', type: 'text', width: 120 },
    { data: 'rate', title: 'Rate', type: 'numeric', width: 100 },
    // Status
    { data: 'vgmWeight', title: 'VGM', type: 'numeric', width: 100 },
    { data: 'customsClearance', title: 'Customs', type: 'text', width: 150 },
    { data: 'onBoardStatus', title: 'On Board', type: 'dropdown', width: 80, source: ON_BOARD_STATUSES },
    { data: 'releaseType', title: 'Release Type', type: 'dropdown', width: 100, source: RELEASE_TYPES },
    { data: 'serviceLevel', title: 'Service', type: 'dropdown', width: 80, source: SERVICE_LEVELS },
    // Cargo details
    { data: 'goods', title: 'Goods', type: 'text', width: 180 },
    { data: 'hsCode', title: 'HS Code', type: 'text', width: 80 },
    { data: 'packsCount', title: 'Pcs', type: 'numeric', width: 50 },
    { data: 'packType', title: 'Pack Type', type: 'dropdown', width: 60, source: PACK_TYPES },
    // Voyage details
    { data: 'voyageNumber', title: 'Voyage', type: 'text', width: 100 },
    // Parties
    { data: 'notifyPartyName', title: 'Notify Party', type: 'text', width: 120, readOnly: true },
    // Other
    { data: 'forwarder', title: 'Forwarder', type: 'text', width: 100, readOnly: true },
    { data: 'notes', title: 'Notes', type: 'text', width: 150 },
    { data: 'additional', title: 'Additional', type: 'text', width: 150 },
  ]
}

/**
 * Get columns for RAIL tab
 * Order: identifiers → type → origin/destination → dates → other fields
 */
function getRailColumns(): TableColumnConfig[] {
  return [
    // Identifiers
    { data: 'containerNumber', title: 'Container #', type: 'text', width: 130 },
    { data: 'blNumber', title: 'B/L #', type: 'text', width: 120 },
    { data: 'projectNumber', title: 'Order #', type: 'text', width: 160, readOnly: true },
    // Type
    { data: 'containerType', title: 'Container', type: 'dropdown', width: 80, source: CONTAINER_TYPES },
    { data: 'containerMode', title: 'Mode', type: 'dropdown', width: 60, source: CONTAINER_MODES },
    { data: 'direction', title: 'Direction', type: 'dropdown', width: 80, source: DIRECTIONS },
    // Origin / Destination
    { data: 'origin', title: 'Origin', type: 'text', width: 120 },
    { data: 'destination', title: 'Destination', type: 'text', width: 120 },
    { data: 'dropOffLocation', title: 'Drop-off', type: 'text', width: 150 },
    // Dates
    { data: 'date', title: 'Date', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    { data: 'ctoCutOffDate', title: 'CTO Cut Off', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    // Pickup/Delivery planning
    { data: 'pickupRequiredBy', title: 'Pickup By', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    { data: 'actualPickup', title: 'Act. Pickup', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    { data: 'deliveryRequiredBy', title: 'Delivery By', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    { data: 'actualDelivery', title: 'Act. Delivery', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    // Carrier & Shipping
    { data: 'carrierName', title: 'Carrier', type: 'text', width: 100 },
    { data: 'rate', title: 'Rate', type: 'numeric', width: 100 },
    // Status
    { data: 'vgmStatus', title: 'VGM', type: 'dropdown', width: 80, source: VGM_STATUSES },
    { data: 'customsClearance', title: 'Customs', type: 'text', width: 200 },
    // Cargo details
    { data: 'goods', title: 'Goods', type: 'text', width: 150 },
    { data: 'hsCode', title: 'HS Code', type: 'text', width: 80 },
    { data: 'weight', title: 'Weight', type: 'numeric', width: 60 },
    { data: 'packsCount', title: 'Pcs', type: 'numeric', width: 50 },
    // Other
    { data: 'forwarder', title: 'Forwarder', type: 'text', width: 100, readOnly: true },
    { data: 'notes', title: 'Notes', type: 'text', width: 150 },
  ]
}

/**
 * Get columns for FTL/LTL (Road Transport) tab
 * Order: identifiers → type → origin/destination → dates → other fields
 */
function getFtlColumns(): TableColumnConfig[] {
  return [
    // Identifiers
    { data: 'bookingNumber', title: 'Booking', type: 'text', width: 100 },
    { data: 'projectNumber', title: 'Order #', type: 'text', width: 160, readOnly: true },
    // Type
    { data: 'vehicleType', title: 'Type', type: 'dropdown', width: 80, source: ROAD_VEHICLE_TYPES },
    // Origin / Destination
    { data: 'loadingAddress', title: 'Loading', type: 'text', width: 200 },
    { data: 'unloadingAddress', title: 'Unloading', type: 'text', width: 200 },
    { data: 'unloadingNotes', title: 'Unloading Notes', type: 'text', width: 200 },
    // Dates
    { data: 'date', title: 'Date', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    // Carrier & Shipping
    { data: 'carrierName', title: 'Carrier', type: 'text', width: 120 },
    { data: 'rate', title: 'Rate', type: 'numeric', width: 100 },
    { data: 'contactInfo', title: 'Contact', type: 'text', width: 150 },
    // Status
    { data: 'weighingStatus', title: 'Weighing', type: 'text', width: 80 },
    { data: 'customsStatus', title: 'Customs', type: 'text', width: 100 },
    // Cargo details
    { data: 'goods', title: 'Goods', type: 'text', width: 200 },
    { data: 'weight', title: 'Weight', type: 'numeric', width: 60 },
    // Other
    { data: 'forwarder', title: 'Forwarder', type: 'text', width: 100, readOnly: true },
    { data: 'notes', title: 'Notes', type: 'text', width: 150 },
    { data: 'additional', title: 'Additional', type: 'text', width: 200 },
  ]
}

/**
 * Get columns for AIR (Air Freight) tab
 * Order: identifiers → type → origin/destination → dates → other fields
 */
function getAirColumns(): TableColumnConfig[] {
  return [
    // Identifiers
    { data: 'mawbNumber', title: 'MAWB', type: 'text', width: 120 },
    { data: 'hawbNumber', title: 'HAWB', type: 'text', width: 120 },
    { data: 'flightNumber', title: 'Flight', type: 'text', width: 80 },
    { data: 'projectNumber', title: 'Order #', type: 'text', width: 160, readOnly: true },
    // Origin / Destination
    { data: 'originAirport', title: 'Origin', type: 'text', width: 80 },
    { data: 'destinationAirport', title: 'Destination', type: 'text', width: 80 },
    // Dates
    { data: 'date', title: 'Date', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    // Carrier & Shipping
    { data: 'carrierCode', title: 'Carrier', type: 'text', width: 80 },
    { data: 'rate', title: 'Rate', type: 'numeric', width: 100 },
    // Status
    { data: 'customsClearance', title: 'Customs', type: 'text', width: 150 },
    // Cargo details
    { data: 'goods', title: 'Goods', type: 'text', width: 180 },
    { data: 'pieces', title: 'Pieces', type: 'numeric', width: 60 },
    { data: 'grossWeight', title: 'Weight', type: 'numeric', width: 80 },
    { data: 'chargeableWeight', title: 'Chargeable', type: 'numeric', width: 90 },
    // Other
    { data: 'forwarder', title: 'Forwarder', type: 'text', width: 100, readOnly: true },
    { data: 'notes', title: 'Notes', type: 'text', width: 150 },
  ]
}

/**
 * Get columns for DEPOT tab
 * Order: identifiers → type → location → dates → other fields
 */
function getDepotColumns(): TableColumnConfig[] {
  return [
    // Identifiers
    { data: 'containerNumber', title: 'Container #', type: 'text', width: 130 },
    { data: 'blNumber', title: 'B/L #', type: 'text', width: 120 },
    { data: 'projectNumber', title: 'Order #', type: 'text', width: 160, readOnly: true },
    { data: 'marksAndNumbers', title: 'Marks/Numbers', type: 'text', width: 150 },
    // Type
    { data: 'containerType', title: 'Container', type: 'dropdown', width: 80, source: CONTAINER_TYPES },
    { data: 'containerMode', title: 'Mode', type: 'dropdown', width: 60, source: CONTAINER_MODES },
    // Location
    { data: 'origin', title: 'Location', type: 'text', width: 200 },
    // Dates
    { data: 'date', title: 'Date', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    // Pickup/Delivery dates
    { data: 'pickupRequiredBy', title: 'Pickup By', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    { data: 'actualPickup', title: 'Act. Pickup', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    { data: 'deliveryRequiredBy', title: 'Delivery By', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    { data: 'actualDelivery', title: 'Act. Delivery', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    // Status
    { data: 'customsClearanceStatus', title: 'Status', type: 'dropdown', width: 100, source: CUSTOMS_CLEARANCE_STATUSES },
    // Other
    { data: 'forwarder', title: 'Forwarder', type: 'text', width: 100, readOnly: true },
    { data: 'notes', title: 'Notes', type: 'text', width: 150 },
  ]
}

/**
 * Get columns for the specified shipment type
 */
function getColumnsForShipmentType(shipmentType: ShipmentType): TableColumnConfig[] {
  switch (shipmentType) {
    case 'EXP':
      return getExpColumns()
    case 'IMP':
      return getImpColumns()
    case 'RAIL':
      return getRailColumns()
    case 'FTL':
    case 'LTL':
      return getFtlColumns()
    case 'AIR':
      return getAirColumns()
    case 'DEPOT':
      return getDepotColumns()
    default:
      return getExpColumns() // Default to EXP
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const query: Record<string, string | undefined> = {}
  url.searchParams.forEach((value, key) => {
    query[key] = value
  })

  const parse = querySchema.safeParse(query)
  if (!parse.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', details: parse.error },
      { status: 400 }
    )
  }

  const { shipmentType } = parse.data
  const columns = getColumnsForShipmentType(shipmentType)

  return NextResponse.json({
    shipmentType,
    columns,
    // Additional metadata for the table
    meta: {
      defaultSortField: 'date',
      defaultSortDir: 'desc',
      pageSize: 100,
    },
  })
}
