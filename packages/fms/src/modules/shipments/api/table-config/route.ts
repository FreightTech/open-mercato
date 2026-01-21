/**
 * Shipments Module - Dynamic Table Config API
 *
 * Returns column configuration based on the selected shipment type tab.
 * Each tab (EXP, IMP, RAIL, FTL, DEPOT) has different columns matching
 * the real-world data structure from user spreadsheets.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { SHIPMENT_TYPES, CONTAINER_TYPES, VGM_STATUSES, CUSTOMS_CLEARANCE_STATUSES, ROAD_VEHICLE_TYPES } from '../../../fms_projects/data/types'
import type { ShipmentType } from '../../../fms_projects/data/types'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['shipments.shipments.view'] },
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
 * Based on real data: Date, Container Type, Armator, Nr.zał, Relacja, Port, Container#, BKG...
 */
function getExpColumns(): TableColumnConfig[] {
  return [
    { data: 'date', title: 'Data', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    { data: 'containerType', title: 'Kontener', type: 'dropdown', width: 80, source: CONTAINER_TYPES },
    { data: 'shippingLine', title: 'Armator', type: 'text', width: 100 },
    { data: 'attachmentNumber', title: 'Nr. zał.', type: 'text', width: 80 },
    { data: 'route', title: 'Relacja', type: 'text', width: 250 },
    { data: 'port', title: 'Port', type: 'text', width: 60 },
    { data: 'containerNumber', title: 'Numer kontenera', type: 'text', width: 130 },
    { data: 'bookingNumber', title: 'BKG', type: 'text', width: 120 },
    { data: 'projectNumber', title: 'Numer zlecenia', type: 'text', width: 160, readOnly: true },
    { data: 'carrierName', title: 'Przewoźnik', type: 'text', width: 100 },
    { data: 'rate', title: 'Stawka', type: 'numeric', width: 100 },
    { data: 'vgmStatus', title: 'VGM', type: 'dropdown', width: 80, source: VGM_STATUSES },
    { data: 'customsClearance', title: 'Odprawa', type: 'text', width: 200 },
    { data: 'notes', title: 'Uwagi', type: 'text', width: 150 },
    { data: 'forwarder', title: 'Spedytor', type: 'text', width: 100, readOnly: true },
    { data: 'weight', title: 'WAGA', type: 'numeric', width: 60 },
    { data: 'goods', title: 'TOWAR', type: 'text', width: 150 },
    { data: 'additional', title: 'Dodatkowe', type: 'text', width: 150 },
    { data: 'cutOff', title: 'Cut Off', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    { data: 'destination', title: 'Miejsce docelowe', type: 'text', width: 120 },
  ]
}

/**
 * Get columns for IMP (Sea Import) tab
 * Based on real data: NO date at start! Relacja, Container#, Port, PIN, Order#...
 */
function getImpColumns(): TableColumnConfig[] {
  return [
    { data: 'route', title: 'Relacja', type: 'text', width: 250 },
    { data: 'containerNumber', title: 'Numer kontenera', type: 'text', width: 130 },
    { data: 'port', title: 'Port', type: 'text', width: 60 },
    { data: 'pinCode', title: 'PIN', type: 'text', width: 80 },
    { data: 'projectNumber', title: 'Numer zlecenia', type: 'text', width: 160, readOnly: true },
    { data: 'rate', title: 'Stawka', type: 'numeric', width: 100 },
    { data: 'carrierName', title: 'Przewoźnik', type: 'text', width: 120 },
    { data: 'vgmWeight', title: 'VGM', type: 'numeric', width: 100 }, // Actual kg for IMP
    { data: 'customsClearance', title: 'Odprawa', type: 'text', width: 150 },
    { data: 'notes', title: 'Uwagi', type: 'text', width: 150 },
    { data: 'deliveryTime', title: 'Godzina', type: 'text', width: 70 },
    { data: 'forwarder', title: 'Spedytor', type: 'text', width: 100, readOnly: true },
    { data: 'goods', title: 'TOWAR', type: 'text', width: 180 },
    { data: 'additional', title: 'Dodatkowe', type: 'text', width: 150 },
  ]
}

/**
 * Get columns for RAIL (KOLEJ) tab
 * Based on real data: Date, Container Type, Direction indicator, Nr.zał, Relacja, Port, Container#, Drop-off...
 */
function getRailColumns(): TableColumnConfig[] {
  return [
    { data: 'date', title: 'Data', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    { data: 'containerType', title: 'Kontener', type: 'dropdown', width: 80, source: CONTAINER_TYPES },
    { data: 'direction', title: 'Dodatkowe', type: 'text', width: 60 }, // IMP indicator
    { data: 'attachmentNumber', title: 'Nr. zał.', type: 'text', width: 80 },
    { data: 'route', title: 'Relacja', type: 'text', width: 200 },
    { data: 'port', title: 'Port', type: 'text', width: 200 }, // Rail terminal
    { data: 'containerNumber', title: 'Numer kontenera', type: 'text', width: 130 },
    { data: 'dropOffLocation', title: 'Złożenie kontenera', type: 'text', width: 200 },
    { data: 'projectNumber', title: 'Numer zlecenia', type: 'text', width: 160, readOnly: true },
    { data: 'carrierName', title: 'Przewoźnik', type: 'text', width: 100 },
    { data: 'rate', title: 'Stawka', type: 'numeric', width: 100 },
    { data: 'vgmStatus', title: 'VGM', type: 'dropdown', width: 80, source: VGM_STATUSES },
    { data: 'customsClearance', title: 'Odprawa', type: 'text', width: 200 },
    { data: 'notes', title: 'Uwagi', type: 'text', width: 150 },
    { data: 'forwarder', title: 'Spedytor', type: 'text', width: 100, readOnly: true },
    { data: 'weight', title: 'WAGA', type: 'numeric', width: 60 },
    { data: 'goods', title: 'TOWAR', type: 'text', width: 150 },
  ]
}

/**
 * Get columns for FTL/LTL (Road Transport) tab
 * Based on real data: Date, Type, Contact, Loading, Unloading, Unloading Notes, BKG...
 */
function getFtlColumns(): TableColumnConfig[] {
  return [
    { data: 'date', title: 'Data', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    { data: 'vehicleType', title: 'TYP', type: 'dropdown', width: 80, source: ROAD_VEHICLE_TYPES },
    { data: 'contactInfo', title: 'Nr. zał.', type: 'text', width: 150 }, // Contact details
    { data: 'loadingAddress', title: 'Załadunek', type: 'text', width: 200 },
    { data: 'unloadingAddress', title: 'Rozładunek', type: 'text', width: 200 },
    { data: 'unloadingNotes', title: 'Uwagi rozładunek', type: 'text', width: 200 },
    { data: 'bookingNumber', title: 'BKG', type: 'text', width: 100 },
    { data: 'projectNumber', title: 'Numer zlecenia', type: 'text', width: 160, readOnly: true },
    { data: 'carrierName', title: 'Przewoźnik', type: 'text', width: 120 },
    { data: 'rate', title: 'Stawka', type: 'text', width: 100 }, // Text to support EUR suffix
    { data: 'weighingStatus', title: 'Ważenie', type: 'text', width: 80 },
    { data: 'customsStatus', title: 'Odprawa', type: 'text', width: 100 },
    { data: 'notes', title: 'Uwagi', type: 'text', width: 150 },
    { data: 'forwarder', title: 'Spedytor', type: 'text', width: 100, readOnly: true },
    { data: 'weight', title: 'WAGA', type: 'numeric', width: 60 },
    { data: 'goods', title: 'TOWAR', type: 'text', width: 200 },
    { data: 'additional', title: 'Dodatkowe', type: 'text', width: 200 },
  ]
}

/**
 * Get columns for AIR (Air Freight) tab
 * Based on air cargo shipment tracking requirements
 */
function getAirColumns(): TableColumnConfig[] {
  return [
    { data: 'date', title: 'Data', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    { data: 'mawbNumber', title: 'MAWB', type: 'text', width: 120 },
    { data: 'hawbNumber', title: 'HAWB', type: 'text', width: 120 },
    { data: 'route', title: 'Relacja', type: 'text', width: 200 },
    { data: 'originAirport', title: 'Origin', type: 'text', width: 80 },
    { data: 'destinationAirport', title: 'Destination', type: 'text', width: 80 },
    { data: 'flightNumber', title: 'Flight', type: 'text', width: 80 },
    { data: 'pieces', title: 'Pieces', type: 'numeric', width: 60 },
    { data: 'grossWeight', title: 'Weight', type: 'numeric', width: 80 },
    { data: 'chargeableWeight', title: 'Chargeable', type: 'numeric', width: 90 },
    { data: 'projectNumber', title: 'Numer zlecenia', type: 'text', width: 160, readOnly: true },
    { data: 'carrierCode', title: 'Carrier', type: 'text', width: 80 },
    { data: 'rate', title: 'Stawka', type: 'numeric', width: 100 },
    { data: 'customsClearance', title: 'Odprawa', type: 'text', width: 150 },
    { data: 'notes', title: 'Uwagi', type: 'text', width: 150 },
    { data: 'forwarder', title: 'Spedytor', type: 'text', width: 100, readOnly: true },
    { data: 'goods', title: 'TOWAR', type: 'text', width: 180 },
  ]
}

/**
 * Get columns for DEPOT tab
 * Simplified container tracking for depot/terminal operations
 */
function getDepotColumns(): TableColumnConfig[] {
  return [
    { data: 'date', title: 'Data', type: 'date', width: 100, dateFormat: 'dd/MM/yyyy' },
    { data: 'containerType', title: 'Kontener', type: 'dropdown', width: 80, source: CONTAINER_TYPES },
    { data: 'containerNumber', title: 'Numer kontenera', type: 'text', width: 130 },
    { data: 'projectNumber', title: 'Numer zlecenia', type: 'text', width: 160, readOnly: true },
    { data: 'port', title: 'Lokalizacja', type: 'text', width: 200 },
    { data: 'customsClearanceStatus', title: 'Status', type: 'dropdown', width: 100, source: CUSTOMS_CLEARANCE_STATUSES },
    { data: 'notes', title: 'Uwagi', type: 'text', width: 150 },
    { data: 'forwarder', title: 'Spedytor', type: 'text', width: 100, readOnly: true },
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
      defaultSortField: shipmentType === 'IMP' ? 'route' : 'date',
      defaultSortDir: 'desc',
      pageSize: 100,
    },
  })
}
