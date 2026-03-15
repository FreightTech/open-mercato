/**
 * Transports Module - Dynamic Table Config API
 *
 * Returns a unified column configuration for all transport types.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
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
  SHIPMENT_TYPES,
} from '../../../fms_projects/data/types'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['transports.transports.view'] },
}

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
 * Unified column set covering all transport types
 */
function getUnifiedColumns(): TableColumnConfig[] {
  return [
    // Identifiers
    { data: 'containerNumber', title: 'Container #', type: 'text', width: 130 },
    { data: 'bookingNumber', title: 'Booking', type: 'text', width: 120 },
    { data: 'blNumber', title: 'B/L #', type: 'text', width: 120 },
    { data: 'projectNumber', title: 'Order #', type: 'text', width: 160, readOnly: true },
    { data: 'shipmentType', title: 'Type', type: 'dropdown', width: 70, source: SHIPMENT_TYPES, readOnly: true },
    // Type
    { data: 'containerType', title: 'Container', type: 'dropdown', width: 80, source: CONTAINER_TYPES },
    { data: 'containerMode', title: 'Mode', type: 'dropdown', width: 60, source: CONTAINER_MODES },
    { data: 'direction', title: 'Direction', type: 'dropdown', width: 80, source: DIRECTIONS },
    { data: 'vehicleType', title: 'Vehicle', type: 'dropdown', width: 80, source: ROAD_VEHICLE_TYPES },
    // Origin / Destination
    { data: 'origin', title: 'Origin', type: 'text', width: 100 },
    { data: 'destination', title: 'Destination', type: 'text', width: 100 },
    // Project-level location columns (FK to FmsLocation, editable via entity search)
    { data: 'placeOfLoadingName', title: 'Place of Loading', type: 'text', width: 160 },
    { data: 'portOfLoadingName', title: 'Port of Loading', type: 'text', width: 160 },
    { data: 'portOfDestinationName', title: 'Port of Destination', type: 'text', width: 160 },
    { data: 'placeOfDeliveryName', title: 'Place of Delivery', type: 'text', width: 160 },
    { data: 'loadingAddress', title: 'Loading', type: 'text', width: 200 },
    { data: 'unloadingAddress', title: 'Unloading', type: 'text', width: 200 },
    { data: 'dropOffLocation', title: 'Drop-off', type: 'text', width: 150 },
    // Dates
    { data: 'date', title: 'ETA/ATA', type: 'text', width: 140, renderer: 'etaAta' },
    { data: 'cutOff', title: 'Cut Off', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    { data: 'ctoCutOffDate', title: 'CTO Cut Off', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    { data: 'docsDueDate', title: 'Docs Due', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    { data: 'deliveryTime', title: 'Time', type: 'text', width: 70 },
    // Pickup planning
    { data: 'pickupRequiredBy', title: 'Pickup By', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    { data: 'estimatedPickup', title: 'Est. Pickup', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    { data: 'actualPickup', title: 'Act. Pickup', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    // Delivery planning
    { data: 'deliveryRequiredBy', title: 'Delivery By', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    { data: 'estimatedDelivery', title: 'Est. Delivery', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    { data: 'actualDelivery', title: 'Act. Delivery', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    // Carrier & Shipping
    { data: 'shippingLine', title: 'Shipping Line', type: 'text', width: 100 },
    { data: 'carrierName', title: 'Carrier', type: 'text', width: 120 },
    { data: 'rate', title: 'Rate', type: 'numeric', width: 100 },
    { data: 'contactInfo', title: 'Contact', type: 'text', width: 150, readOnly: true },
    // Status
    { data: 'pinCode', title: 'PIN', type: 'text', width: 80 },
    { data: 'vgmStatus', title: 'VGM', type: 'dropdown', width: 80, source: VGM_STATUSES },
    { data: 'vgmWeight', title: 'VGM Weight', type: 'numeric', width: 100 },
    { data: 'customsClearance', title: 'Customs', type: 'text', width: 200 },
    { data: 'customsClearanceStatus', title: 'Customs Status', type: 'dropdown', width: 100, source: CUSTOMS_CLEARANCE_STATUSES },
    { data: 'onBoardStatus', title: 'On Board', type: 'dropdown', width: 80, source: ON_BOARD_STATUSES },
    { data: 'releaseType', title: 'Release Type', type: 'dropdown', width: 100, source: RELEASE_TYPES },
    { data: 'serviceLevel', title: 'Service', type: 'dropdown', width: 80, source: SERVICE_LEVELS },
    { data: 'weighingStatus', title: 'Weighing', type: 'text', width: 80 },
    { data: 'customsStatus', title: 'Road Customs', type: 'text', width: 100 },
    // Cargo details
    { data: 'goods', title: 'Goods', type: 'text', width: 150 },
    { data: 'hsCode', title: 'HS Code', type: 'text', width: 80 },
    { data: 'weight', title: 'Weight', type: 'numeric', width: 60 },
    { data: 'packsCount', title: 'Pcs', type: 'numeric', width: 50 },
    { data: 'packType', title: 'Pack Type', type: 'dropdown', width: 60, source: PACK_TYPES },
    // Voyage details
    { data: 'voyageNumber', title: 'Voyage', type: 'text', width: 100 },
    { data: 'carrierScac', title: 'SCAC', type: 'text', width: 60 },
    // Air-specific
    { data: 'mawbNumber', title: 'MAWB', type: 'text', width: 120 },
    { data: 'hawbNumber', title: 'HAWB', type: 'text', width: 120 },
    { data: 'flightNumber', title: 'Flight', type: 'text', width: 80 },
    // Parties
    { data: 'notifyPartyName', title: 'Notify Party', type: 'text', width: 120, readOnly: true },
    // Other
    { data: 'forwarder', title: 'Forwarder', type: 'text', width: 100, readOnly: true },
    { data: 'unloadingNotes', title: 'Unloading Notes', type: 'text', width: 200 },
    { data: 'notes', title: 'Notes', type: 'text', width: 150 },
    { data: 'additional', title: 'Additional', type: 'text', width: 150, readOnly: true },
  ]
}

export async function GET(request: NextRequest) {
  const columns = getUnifiedColumns()

  return NextResponse.json({
    columns,
    meta: {
      defaultSortField: 'date',
      defaultSortDir: 'desc',
      pageSize: 100,
    },
  })
}
