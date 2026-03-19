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
  source?: string[]
  dateFormat?: string
  hidden?: boolean
}

function getColumns(): TableColumnConfig[] {
  return [
    // ── Unit identifiers (what we're shipping) ────────────────────────
    { data: 'containerNumber', title: 'Container / Commodity', width: 200, readOnly: true, renderer: 'containerCommodity' },
    { data: 'containerType', title: 'Cnt Type', width: 70, readOnly: true },

    // ── Leg (the transport segment) ───────────────────────────────────
    { data: 'legSequence', title: 'Leg', width: 45, type: 'numeric', readOnly: true },
    { data: 'legType', title: 'Mode', width: 70, readOnly: true, renderer: 'legType' },
    { data: 'legOrigin', title: 'Leg Origin', width: 155, readOnly: true },
    { data: 'legDestination', title: 'Leg Destination', width: 155, readOnly: true },
    { data: 'carrierName', title: 'Carrier', width: 130, readOnly: true },

    // ── Timestamps ────────────────────────────────────────────────────
    { data: 'etd', title: 'ETD', width: 90, readOnly: true },
    { data: 'eta', title: 'ETA', width: 90, readOnly: true, renderer: 'etaWithCount' },
    { data: 'atd', title: 'ATD', width: 100, readOnly: true },
    { data: 'ata', title: 'ATA', width: 100, readOnly: true },

    // ── File context ──────────────────────────────────────────────────
    { data: 'referenceNumber', title: 'Reference #', width: 210, readOnly: true, renderer: 'referenceNumber' },
    { data: 'derivedStatus', title: 'Status', width: 125, readOnly: true, renderer: 'status' },
    { data: 'cargoType', title: 'Type', width: 55, readOnly: true, renderer: 'cargoType' },
    { data: 'shipmentType', title: 'Ship', width: 55, readOnly: true, renderer: 'shipmentType' },

    // ── Assignment details (per unit-leg) ─────────────────────────────
    { data: 'truckPlate', title: 'Truck Plate', width: 100, readOnly: true },
    { data: 'trailerPlate', title: 'Trailer', width: 95, readOnly: true },
    { data: 'driverFullName', title: 'Driver', width: 125, readOnly: true },
    { data: 'sealNumber', title: 'Seal #', width: 95, readOnly: true },
    { data: 'unitBl', title: 'Unit B/L', width: 150, readOnly: true },
    { data: 'consolidationContainer', title: 'Consol. Cnt', width: 130, readOnly: true },

    // ── Booking / vessel ──────────────────────────────────────────────
    { data: 'bookingNumber', title: 'Booking #', width: 130, readOnly: true },
    { data: 'masterBl', title: 'Master B/L', width: 145, readOnly: true },
    { data: 'vesselName', title: 'Vessel', width: 130, readOnly: true },
    { data: 'voyageNumber', title: 'Voyage', width: 90, readOnly: true },

    // ── Planned timestamps (hidden by default) ────────────────────────
    { data: 'ptd', title: 'PTD', width: 90, readOnly: true, hidden: true },
    { data: 'pta', title: 'PTA', width: 90, readOnly: true, hidden: true },

    // ── Cargo details ─────────────────────────────────────────────────
    { data: 'grossWeight', title: 'Weight', width: 100, type: 'numeric', readOnly: true, renderer: 'weight' },
    { data: 'volume', title: 'Volume', width: 80, type: 'numeric', readOnly: true, renderer: 'volume' },
    { data: 'isHazardous', title: 'Haz', width: 45, type: 'checkbox', readOnly: true, renderer: 'hazardous' },
    { data: 'packageCount', title: 'Pkgs', width: 55, type: 'numeric', readOnly: true },

    // ── Parties ───────────────────────────────────────────────────────
    { data: 'contractorName', title: 'Client', width: 140, readOnly: true },
    { data: 'assigneeName', title: 'Assignee', width: 115, readOnly: true },

    // ── Other ─────────────────────────────────────────────────────────
    { data: 'driverPhone', title: 'Driver Phone', width: 120, readOnly: true, hidden: true },
    { data: 'unitOrigin', title: 'Unit Origin', width: 140, readOnly: true, hidden: true },
    { data: 'unitDestination', title: 'Unit Dest', width: 140, readOnly: true, hidden: true },
    { data: 'notes', title: 'Notes', width: 150, readOnly: true, hidden: true },
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
