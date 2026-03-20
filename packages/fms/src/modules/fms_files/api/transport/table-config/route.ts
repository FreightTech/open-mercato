/**
 * FMS Files Transport - Table Config API
 *
 * Returns column definitions for the transport leg table.
 * One row = one FmsFileUnitLeg (unit × leg assignment).
 * Columns cover File, Unit, Leg, and Assignment fields.
 */

import { NextResponse } from 'next/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['fms_files.files.view'] },
}

export interface TableColumnConfig {
  data: string
  title: string
  width: number
  type?: 'text' | 'numeric' | 'date' | 'dropdown' | 'checkbox'
  readOnly?: boolean
  renderer?: string
  editor?: string
  source?: string[]
  dateFormat?: string
  hidden?: boolean
}

function getColumns(): TableColumnConfig[] {
  return [
    // ── File context ──────────────────────────────────────────────────
    { data: 'referenceNumber', title: 'Reference #', width: 210, readOnly: true, renderer: 'referenceNumber' },

    // ── Unit identifiers (what we're shipping) ────────────────────────
    { data: 'containerNumber', title: 'Container / Commodity', width: 200, readOnly: false, renderer: 'containerCommodity' },
    { data: 'containerType', title: 'Cnt Type', width: 70, readOnly: false },

    // ── Leg (the transport segment) ───────────────────────────────────
    { data: 'legSequence', title: 'Leg', width: 45, type: 'numeric', readOnly: true },
    { data: 'legType', title: 'Mode', width: 70, readOnly: true, renderer: 'legType' },
    { data: 'legOrigin', title: 'Leg Origin', width: 155, readOnly: false, editor: 'entitySearch-location', renderer: 'locationName' },
    { data: 'legDestination', title: 'Leg Destination', width: 155, readOnly: false, editor: 'entitySearch-location', renderer: 'locationName' },
    { data: 'carrierName', title: 'Carrier', width: 130, readOnly: false, editor: 'entitySearch-carrier', renderer: 'locationName' },

    // ── Timestamps (SCD arrays — editing appends a new manual entry) ─────────
    { data: 'ptd', title: 'PTD', width: 90, readOnly: false },
    { data: 'etd', title: 'ETD', width: 90, readOnly: false },
    { data: 'atd', title: 'ATD', width: 100, readOnly: false },
    { data: 'pta', title: 'PTA', width: 90, readOnly: false },
    { data: 'eta', title: 'ETA', width: 90, readOnly: false, renderer: 'etaWithCount' },
    { data: 'ata', title: 'ATA', width: 100, readOnly: false },
    { data: 'derivedStatus', title: 'Status', width: 125, readOnly: true, renderer: 'status' },
    { data: 'cargoType', title: 'Type', width: 55, readOnly: true, renderer: 'cargoType' },
    { data: 'shipmentType', title: 'Ship', width: 55, readOnly: true, renderer: 'shipmentType' },

    // ── Assignment details (per unit-leg) ─────────────────────────────
    { data: 'truckPlate', title: 'Truck Plate', width: 100, readOnly: false },
    { data: 'trailerPlate', title: 'Trailer', width: 95, readOnly: false },
    { data: 'driverFullName', title: 'Driver', width: 125, readOnly: false },
    { data: 'sealNumber', title: 'Seal #', width: 95, readOnly: false },
    { data: 'unitBl', title: 'Unit B/L', width: 150, readOnly: false },
    { data: 'consolidationContainer', title: 'Consol. Cnt', width: 130, readOnly: false },

    // ── Booking / vessel ──────────────────────────────────────────────
    { data: 'bookingNumber', title: 'Booking #', width: 130, readOnly: false },
    { data: 'masterBl', title: 'Master B/L', width: 145, readOnly: false },
    { data: 'vesselName', title: 'Vessel', width: 130, readOnly: false },
    { data: 'voyageNumber', title: 'Voyage', width: 90, readOnly: false },


    // ── Cargo details ─────────────────────────────────────────────────
    { data: 'grossWeight', title: 'Weight', width: 100, type: 'numeric', readOnly: false, renderer: 'weight' },
    { data: 'volume', title: 'Volume', width: 80, type: 'numeric', readOnly: false, renderer: 'volume' },
    { data: 'isHazardous', title: 'Haz', width: 45, type: 'checkbox', readOnly: false, renderer: 'hazardous' },
    { data: 'packageCount', title: 'Pkgs', width: 55, type: 'numeric', readOnly: false },

    // ── Parties ───────────────────────────────────────────────────────
    { data: 'contractorName', title: 'Client', width: 140, readOnly: true },
    { data: 'assigneeName', title: 'Assignee', width: 115, readOnly: true },

    // ── Other ─────────────────────────────────────────────────────────
    { data: 'driverPhone', title: 'Driver Phone', width: 120, readOnly: false, hidden: true },
    { data: 'unitOrigin', title: 'Unit Origin', width: 140, readOnly: true, hidden: true },
    { data: 'unitDestination', title: 'Unit Dest', width: 140, readOnly: true, hidden: true },
    { data: 'notes', title: 'Notes', width: 150, readOnly: false, hidden: true },
  ]
}

export async function GET() {
  const columns = getColumns()
  // Filter out hidden columns by default, but include all in meta
  const visibleColumns = columns.filter((c) => !c.hidden)
  return NextResponse.json({
    columns: visibleColumns,
    allColumns: columns,
    meta: { totalColumns: columns.length, visibleColumns: visibleColumns.length },
  })
}
