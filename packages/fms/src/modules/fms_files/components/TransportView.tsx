'use client'

import * as React from 'react'
import { useRef, useMemo, useEffect, useState, useCallback } from 'react'
import { Truck, Ship, Plane, TrainFront, Trash2, Plus, Container, Package, Route, Radio, ExternalLink } from 'lucide-react'
import { FmsFileShipmentDrawer } from './FmsFileShipmentDrawer'
import { FmsTruckLegDrawer } from './FmsTruckLegDrawer'
import type { TruckRowData } from './FmsTruckLegDrawer'
import { FmsAirLegDrawer } from './FmsAirLegDrawer'
import type { AirRowData } from './FmsAirLegDrawer'
import { FmsShipLegDrawer } from './FmsShipLegDrawer'
import type { ShipRowData } from './FmsShipLegDrawer'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@open-mercato/ui/primitives/tooltip'
import { deriveUnitLegStatus } from '../data/types'
import { StatusBadge } from './StatusBadge'
import { AddUnitDialog } from './AddUnitDialog'
import { AddLegDialog } from './AddLegDialog'
import { AssignUnitsDialog } from './AssignUnitsDialog'
import { DynamicTable, createEntitySearchEditor } from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef, CellEditSaveEvent, CellSaveSuccessEvent, CellSaveErrorEvent, CellContextMenuEvent, PerspectiveConfig, ContextMenuAction } from '@open-mercato/ui/backend/dynamic-table'
import { dispatch, TableEvents } from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

// ─── Types ────────────────────────────────────────────────────────────────────

type UnitRow = {
  id: string
  cargoType: string
  containerNumber?: string | null
  containerType?: string | null
  commodityDescription?: string | null
  grossWeight?: string | null
  weightUnit?: string | null
  volume?: string | null
  volumeUnit?: string | null
  isHazardous?: boolean
  packageCount?: number | null
  originLocationId?: string | null
  destinationLocationId?: string | null
  originName?: string | null
  destinationName?: string | null
  trackedShipmentId?: string | null
}

type LegRow = {
  id: string
  legSequence: number
  type: string
  originLocationId?: string | null
  destinationLocationId?: string | null
  carrierId?: string | null
  originName?: string | null
  destinationName?: string | null
  carrierName?: string | null
  etd?: string | null
  eta?: string | null
  bookingNumber?: string | null
  blNumber?: string | null
  vesselName?: string | null
  vesselImo?: string | null
  voyageNumber?: string | null
  gateInCutoff?: string | null
  documentationCutoff?: string | null
  vgmCutoff?: string | null
  dangerousGoodsCutoff?: string | null
  demFreeTime?: number | null
  detFreeTime?: number | null
  flightNumber?: string | null
  aircraftType?: string | null
}

type UnitLegRow = {
  id: string
  unitId: string
  legId: string
  truckPlate?: string | null
  trailerPlate?: string | null
  driverFullName?: string | null
  driverIdNumber?: string | null
  driverPhone?: string | null
  sealNumber?: string | null
  blNumber?: string | null
  notes?: string | null
  ptd?: string | null
  etd?: string | null
  atd?: string | null
  pta?: string | null
  eta?: string | null
  ata?: string | null
}

type Props = {
  fileId: string
  units: UnitRow[]
  legs: LegRow[]
  unitLegs: UnitLegRow[]
  isFCL: boolean
  onDeleteLeg?: (legId: string) => void
  onDeleteUnit?: (unitId: string) => void
  onUnitAdded?: () => void
  onAnnotationChange?: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LEG_TYPE_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; className: string }> = {
  TRUCK: { icon: Truck,       className: 'bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800' },
  SHIP:  { icon: Ship,        className: 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800' },
  AIR:   { icon: Plane,       className: 'bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-800' },
  RAIL:  { icon: TrainFront,  className: 'bg-green-50 text-green-600 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800' },
}

function ModeBadgeRenderer(v: unknown) {
  const type = v as string | null
  if (!type) return null
  const cfg = LEG_TYPE_CONFIG[type] ?? { icon: Truck, className: 'bg-muted text-muted-foreground border-border' }
  const Icon = cfg.icon
  return React.createElement(
    'span',
    { className: `inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded border ${cfg.className}` },
    React.createElement(Icon, { className: 'w-2.5 h-2.5' }),
    type,
  )
}


function unitLabel(unit: UnitRow): string {
  if (unit.cargoType === 'FCL') return unit.containerNumber || '(TBD)'
  return unit.commodityDescription || 'LCL unit'
}

// Unit-owned fields (saved to /files/:id/units/:unitId)
const UNIT_FIELDS = new Set(['containerNumber', 'containerType', 'commodityDescription', 'grossWeight', 'weightUnit', 'volume', 'volumeUnit', 'isHazardous', 'packageCount'])
// Unit-leg-owned fields (saved to /unit-legs/:id) — excludes timestamps, which route based on leg type
const UNIT_LEG_FIELDS = new Set(['truckPlate', 'trailerPlate', 'driverFullName', 'sealNumber', 'blNumber', 'notes'])
// Leg-owned fields (saved to /files/:id/legs/:legId) — ship/air/booking metadata
const LEG_DIRECT_FIELDS = new Map<string, string>([
  ['bookingNumber', 'bookingNumber'],
  ['legBlNumber', 'blNumber'],
  ['vesselName', 'vesselName'],
  ['vesselImo', 'vesselImo'],
  ['voyageNumber', 'voyageNumber'],
  ['gateInCutoff', 'gateInCutoff'],
  ['documentationCutoff', 'documentationCutoff'],
  ['vgmCutoff', 'vgmCutoff'],
  ['dangerousGoodsCutoff', 'dangerousGoodsCutoff'],
  ['demFreeTime', 'demFreeTime'],
  ['detFreeTime', 'detFreeTime'],
  ['flightNumber', 'flightNumber'],
  ['aircraftType', 'aircraftType'],
])
// All 6 timestamp columns — TRUCK legs use unit-leg simple fields, others use leg-level SCD arrays
const ALL_TIMESTAMP_FIELDS = new Set(['ptd', 'etd', 'atd', 'pta', 'eta', 'ata'])

// ─── Timestamp history tooltip ────────────────────────────────────────────────

type TimestampEntry = {
  value: string
  offset: string | null
  source: string
  updatedAt: string
}

const TIMESTAMP_SOURCE_LABELS: Record<string, string> = {
  carrier_api: 'Carrier API',
  manual: 'Manual',
  ais: 'AIS',
  port: 'Port',
  edi: 'EDI',
}

const TIMESTAMP_SOURCE_COLORS: Record<string, string> = {
  carrier_api: 'bg-blue-100 text-blue-700',
  manual: 'bg-purple-100 text-purple-700',
  ais: 'bg-green-100 text-green-700',
  port: 'bg-orange-100 text-orange-700',
  edi: 'bg-gray-100 text-gray-700',
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function TimestampHistoryCell({ value, timestamps }: { value: string | null; timestamps: TimestampEntry[] | null }) {
  if (!value) return React.createElement('span', { className: 'text-xs text-muted-foreground' }, '-')

  const sorted = timestamps && timestamps.length > 1
    ? [...timestamps].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    : null

  const cell = React.createElement(
    'span',
    { className: `text-xs ${sorted ? 'border-b border-dashed border-muted-foreground/50 cursor-help' : ''}` },
    value,
    sorted && React.createElement('span', { className: 'ml-1 text-[10px] text-amber-500' }, `(${sorted.length})`),
  )

  if (!sorted) return cell

  return React.createElement(TooltipProvider, null,
    React.createElement(Tooltip, { delayDuration: 200 },
      React.createElement(TooltipTrigger, { asChild: true }, cell),
      React.createElement(TooltipContent, { side: 'bottom', align: 'start', className: 'max-w-xs p-0' },
        React.createElement('div', { className: 'p-2 space-y-1.5 max-h-64 overflow-y-auto' },
          sorted.map((entry, i) =>
            React.createElement('div', {
              key: `${entry.value}-${entry.updatedAt}-${i}`,
              className: `text-xs rounded p-1.5 ${i === 0 ? 'bg-accent' : 'bg-muted'}`,
            },
              React.createElement('div', { className: 'flex items-center justify-between gap-2' },
                React.createElement('span', { className: 'font-medium text-foreground' }, entry.value),
                React.createElement('span', {
                  className: `inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium ${TIMESTAMP_SOURCE_COLORS[entry.source] ?? 'bg-gray-100 text-gray-700'}`,
                }, TIMESTAMP_SOURCE_LABELS[entry.source] ?? entry.source),
              ),
              React.createElement('div', { className: 'text-[10px] text-muted-foreground mt-0.5' },
                `Updated: ${formatUpdatedAt(entry.updatedAt)}`,
                i === 0 && React.createElement('span', { className: 'ml-1 text-primary font-medium' }, '(latest)'),
              ),
            ),
          ),
        ),
      ),
    ),
  )
}

function timestampHistoryRenderer(v: unknown, row: Record<string, unknown> | undefined, colConfig?: { data?: string }) {
  const field = colConfig?.data as string
  const timestamps = row?.[`${field}Timestamps`] as TimestampEntry[] | null
  return React.createElement(TimestampHistoryCell, { value: v as string | null, timestamps })
}

// ─── Column definitions ───────────────────────────────────────────────────────

function WeightRenderer(v: unknown, row: Record<string, unknown> | undefined) {
  if (v == null || v === '') return React.createElement('span', { className: 'text-muted-foreground text-xs' }, '-')
  const unit = (row?.weightUnit as string | null) ?? 'kg'
  return React.createElement('span', { className: 'text-xs' }, `${v} ${unit}`)
}

function VolumeRenderer(v: unknown, row: Record<string, unknown> | undefined) {
  if (v == null || v === '') return React.createElement('span', { className: 'text-muted-foreground text-xs' }, '-')
  const unit = (row?.volumeUnit as string | null) ?? 'cbm'
  return React.createElement('span', { className: 'text-xs' }, `${v} ${unit}`)
}



const CUTOFF_APPROACHING_MS = 48 * 60 * 60 * 1000

function cutoffRenderer(v: unknown, row?: Record<string, unknown>) {
  if (v == null || v === '') return React.createElement('span', { className: 'text-muted-foreground text-xs' }, '—')
  const d = new Date(v as string)
  if (Number.isNaN(d.getTime())) return React.createElement('span', { className: 'text-xs' }, v as string)
  const formatted = d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })

  // Check if leg has departed (cutoff no longer relevant)
  const hasAtd = row?.atd != null && row.atd !== ''
  if (hasAtd) return React.createElement('span', { className: 'text-xs font-mono text-muted-foreground' }, formatted)

  const now = Date.now()
  const diffMs = d.getTime() - now

  if (diffMs < 0) {
    return React.createElement('span', { className: 'text-xs font-mono text-red-600 dark:text-red-400 font-semibold' }, `${formatted} ⚠`)
  }

  if (diffMs < CUTOFF_APPROACHING_MS) {
    const hoursLeft = Math.ceil(diffMs / (60 * 60 * 1000))
    return React.createElement('span', { className: 'text-xs font-mono text-amber-600 dark:text-amber-400' }, `${formatted} (${hoursLeft}h)`)
  }

  return React.createElement('span', { className: 'text-xs font-mono' }, formatted)
}

function demDetRenderer(v: unknown, row?: Record<string, unknown>) {
  if (v == null || v === '') return React.createElement('span', { className: 'text-muted-foreground text-xs' }, '—')
  const freeTimeDays = Number(v)
  if (Number.isNaN(freeTimeDays) || freeTimeDays <= 0) return React.createElement('span', { className: 'text-xs' }, String(v))

  // Check if leg has ATA (needed for D&D to start counting)
  const ata = row?.ata as string | null
  if (!ata) return React.createElement('span', { className: 'text-xs' }, `${freeTimeDays}d`)

  const ataDate = new Date(ata)
  if (Number.isNaN(ataDate.getTime())) return React.createElement('span', { className: 'text-xs' }, `${freeTimeDays}d`)

  const elapsedDays = Math.floor((Date.now() - ataDate.getTime()) / (24 * 60 * 60 * 1000))
  const overdue = elapsedDays - freeTimeDays

  if (overdue > 0) {
    return React.createElement('span', { className: 'text-xs font-semibold text-red-600 dark:text-red-400' }, `${freeTimeDays}d (+${overdue}d)`)
  }
  if (elapsedDays >= freeTimeDays - 2) {
    return React.createElement('span', { className: 'text-xs text-amber-600 dark:text-amber-400' }, `${freeTimeDays}d (${freeTimeDays - elapsedDays}d left)`)
  }

  return React.createElement('span', { className: 'text-xs' }, `${freeTimeDays}d`)
}

function locationNameRenderer(v: unknown) {
  const str = String(v || '')
  if (!str) return React.createElement('span', { className: 'text-muted-foreground text-xs' }, '—')
  try {
    const parsed = JSON.parse(str)
    if (parsed?.name) return React.createElement('span', { className: 'text-xs' }, parsed.name)
    if (parsed?.id) return React.createElement('span', { className: 'text-muted-foreground text-xs' }, '—')
  } catch { /* plain string */ }
  return React.createElement('span', { className: 'text-xs' }, str)
}

function StatusRenderer(v: unknown) {
  if (!v) return null
  return React.createElement(StatusBadge, { status: v as string })
}

function buildUnassignedColumns(isFCL: boolean): ColumnDef[] {
  const cols: ColumnDef[] = []
  if (isFCL) {
    cols.push(
      { data: 'containerNumber', title: 'Container #', width: 140, readOnly: false, sticky: 'left' as const,
        renderer: (v: unknown) => React.createElement('span', { className: 'font-mono text-xs font-medium' }, (v as string) ?? '(TBD)') },
      { data: 'containerType', title: 'Type', width: 80, readOnly: false },
    )
  } else {
    cols.push(
      { data: 'commodityDescription', title: 'Commodity', width: 200, readOnly: false, sticky: 'left' as const },
      { data: 'packageCount', title: 'Pkgs', width: 60, readOnly: false },
    )
  }
  cols.push(
    { data: 'grossWeight', title: 'Weight', width: 100, readOnly: false, renderer: WeightRenderer },
    { data: 'volume', title: 'Volume', width: 90, readOnly: false, renderer: VolumeRenderer },
    { data: 'isHazardous', title: 'HAZ', width: 55, type: 'boolean' as const, readOnly: false },
    { data: 'originName', title: 'Origin', width: 190, readOnly: false, editor: createEntitySearchEditor({ entityType: 'fms_locations:fms_location', extractValue: (r: any) => JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }), placeholder: 'Search location…', minQueryLength: 2 }), renderer: locationNameRenderer },
    { data: 'destinationName', title: 'Destination', width: 190, readOnly: false, editor: createEntitySearchEditor({ entityType: 'fms_locations:fms_location', extractValue: (r: any) => JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }), placeholder: 'Search location…', minQueryLength: 2 }), renderer: locationNameRenderer },
  )
  return cols
}

function buildColumns(filterMode: string, isFCL: boolean): ColumnDef[] {
  const cols: ColumnDef[] = []

  if (isFCL) {
    cols.push(
      { data: 'containerNumber', title: 'Container #', width: 140, readOnly: false, sticky: 'left' as const,
        renderer: (v: unknown) => React.createElement('span', { className: 'font-mono text-xs font-medium' }, (v as string) ?? '(TBD)') },
      { data: 'containerType', title: 'Type', width: 60, readOnly: false, sticky: 'left' as const },
    )
  } else {
    cols.push(
      { data: 'commodityDescription', title: 'Commodity', width: 180, readOnly: false, sticky: 'left' as const },
      { data: 'packageCount', title: 'Pkgs', width: 60, readOnly: false },
    )
  }

  cols.push(
    { data: 'derivedStatus', title: 'Status', width: 100, readOnly: true, renderer: StatusRenderer },
    { data: 'legSequence', title: 'Leg', width: 35, readOnly: true },
    { data: 'type', title: 'Mode', width: 90, readOnly: true, renderer: ModeBadgeRenderer },
    { data: 'originName', title: 'Leg Origin', width: 190, readOnly: false, editor: createEntitySearchEditor({ entityType: 'fms_locations:fms_location', extractValue: (r: any) => JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }), placeholder: 'Search location…', minQueryLength: 2 }), renderer: locationNameRenderer },
    { data: 'destinationName', title: 'Leg Destination', width: 190, readOnly: false, editor: createEntitySearchEditor({ entityType: 'fms_locations:fms_location', extractValue: (r: any) => JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }), placeholder: 'Search location…', minQueryLength: 2 }), renderer: locationNameRenderer },
    { data: 'carrierName', title: 'Carrier', width: 100, readOnly: false, editor: createEntitySearchEditor({ entityType: 'fms_products:fms_carrier', extractValue: (r: any) => JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }), placeholder: 'Search carrier…', minQueryLength: 1 }), renderer: locationNameRenderer },
  )

  if (filterMode === 'ALL' || filterMode === 'SHIP' || filterMode === 'TRUCK' || filterMode === 'RAIL') {
    cols.push({ data: 'bookingNumber', title: 'Booking #', width: 130, readOnly: false })
  }
  if (filterMode === 'ALL' || filterMode === 'SHIP') {
    cols.push({ data: 'vesselName', title: 'Vessel', width: 140, readOnly: false })
    cols.push({ data: 'voyageNumber', title: 'Voyage', width: 80, readOnly: false })
    cols.push({ data: 'vesselImo', title: 'IMO', width: 90, readOnly: false })
    cols.push({ data: 'gateInCutoff', title: 'Gate-in C/O', width: 120, readOnly: false, renderer: cutoffRenderer })
    cols.push({ data: 'documentationCutoff', title: 'Docs C/O', width: 120, readOnly: false, renderer: cutoffRenderer })
    cols.push({ data: 'vgmCutoff', title: 'VGM C/O', width: 120, readOnly: false, renderer: cutoffRenderer })
    cols.push({ data: 'dangerousGoodsCutoff', title: 'DG C/O', width: 120, readOnly: false, renderer: cutoffRenderer })
    cols.push({ data: 'demFreeTime', title: 'DEM (days)', width: 110, readOnly: false, renderer: demDetRenderer })
    cols.push({ data: 'detFreeTime', title: 'DET (days)', width: 110, readOnly: false, renderer: demDetRenderer })
  }
  if (filterMode === 'AIR') {
    cols.push({ data: 'flightNumber', title: 'Flight #', width: 90, readOnly: false })
    cols.push({ data: 'aircraftType', title: 'Aircraft Type', width: 110, readOnly: false })
  }
  if (filterMode === 'ALL') {
    cols.push({ data: 'flightNumber', title: 'Flight #', width: 90, readOnly: false })
  }
  if (filterMode === 'ALL' || filterMode === 'SHIP' || filterMode === 'AIR') {
    cols.push({ data: 'legBlNumber', title: filterMode === 'AIR' ? 'Master AWB' : 'Master B/L', width: 140, readOnly: false })
  }

  cols.push(
    { data: 'ptd', title: 'PTD', width: 110, readOnly: false, renderer: timestampHistoryRenderer },
    { data: 'etd', title: 'ETD', width: 110, readOnly: false, renderer: timestampHistoryRenderer },
    { data: 'atd', title: 'ATD', width: 110, readOnly: false, renderer: timestampHistoryRenderer },
    { data: 'pta', title: 'PTA', width: 110, readOnly: false, renderer: timestampHistoryRenderer },
    { data: 'eta', title: 'ETA', width: 110, readOnly: false, renderer: timestampHistoryRenderer },
    { data: 'ata', title: 'ATA', width: 110, readOnly: false, renderer: timestampHistoryRenderer },
  )

  if (filterMode === 'ALL' || filterMode === 'TRUCK') {
    cols.push({ data: 'truckPlate', title: 'Truck Plate', width: 100, readOnly: false })
    cols.push({ data: 'trailerPlate', title: 'Trailer', width: 95, readOnly: false })
    cols.push({ data: 'driverFullName', title: 'Driver', width: 130, readOnly: false })
  }
  if (filterMode === 'ALL' || filterMode === 'SHIP' || filterMode === 'AIR') {
    cols.push({ data: 'sealNumber', title: 'Seal #', width: 90, readOnly: false })
    cols.push({ data: 'blNumber', title: 'B/L / AWB', width: 140, readOnly: false })
  }
  cols.push({ data: 'notes', title: 'Notes', width: 150, readOnly: false })

  // Required by DynamicTable for group header title lookup — not rendered as a visible column
  cols.push({ data: 'containerLabel', title: 'Container', width: 0, readOnly: true })

  return cols
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TransportView({ fileId, units, legs, unitLegs, isFCL, onDeleteLeg, onDeleteUnit, onUnitAdded, onAnnotationChange }: Props) {
  const tableRef = useRef<HTMLDivElement>(null)
  const [selectedLegId, setSelectedLegId] = useState<string | 'ALL' | 'UNITS'>('UNITS')
  const [addUnitOpen, setAddUnitOpen] = useState(false)
  const [addLegOpen, setAddLegOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [trackingShipmentId, setTrackingShipmentId] = useState<string | null>(null)
  const [truckRow, setTruckRow] = useState<TruckRowData | null>(null)
  const [airRow, setAirRow] = useState<AirRowData | null>(null)
  const [shipRow, setShipRow] = useState<ShipRowData | null>(null)

  const legById = useMemo(() => new Map(legs.map((l) => [l.id, l])), [legs])
  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units])

  // Legs sorted by sequence for tabs
  const sortedLegs = useMemo(() => [...legs].sort((a, b) => a.legSequence - b.legSequence), [legs])

  // Build flat rows: one per unit-leg assignment, plus unassigned units
  const allRows = useMemo(() => {
    const makeUnitFields = (unit: UnitRow) => ({
      unitId: unit.id,
      containerLabel: unitLabel(unit),
      containerNumber: unit.containerNumber ?? null,
      containerType: unit.containerType ?? null,
      commodityDescription: unit.commodityDescription ?? null,
      grossWeight: unit.grossWeight ?? null,
      packageCount: unit.packageCount ?? null,
      trackedShipmentId: unit.trackedShipmentId ?? null,
    })

    const rows = unitLegs.map((ul) => {
      const unit = unitById.get(ul.unitId)
      const leg = legById.get(ul.legId)
      if (!unit || !leg) return null

      // Resolve effective timestamps based on transport mode
      const ptd = leg.type === 'TRUCK' ? (ul.ptd ?? null) : ((leg as any).ptdTimestamps?.at(-1)?.value ?? (leg as any).ptd ?? null)
      const etd = leg.type === 'TRUCK' ? (ul.etd ?? null) : ((leg as any).etdTimestamps?.at(-1)?.value ?? (leg as any).etd ?? null)
      const atd = leg.type === 'TRUCK' ? (ul.atd ?? null) : ((leg as any).atdTimestamps?.at(-1)?.value ?? (leg as any).atd ?? null)
      const pta = leg.type === 'TRUCK' ? (ul.pta ?? null) : ((leg as any).ptaTimestamps?.at(-1)?.value ?? (leg as any).pta ?? null)
      const eta = leg.type === 'TRUCK' ? (ul.eta ?? null) : ((leg as any).etaTimestamps?.at(-1)?.value ?? (leg as any).eta ?? null)
      const ata = leg.type === 'TRUCK' ? (ul.ata ?? null) : ((leg as any).ataTimestamps?.at(-1)?.value ?? (leg as any).ata ?? null)

      return {
        id: ul.id,
        unitLegId: ul.id as string | null,
        legId: leg.id as string | null,
        ...makeUnitFields(unit),
        legSequence: leg.legSequence as number | null,
        type: leg.type as string | null,
        derivedStatus: deriveUnitLegStatus({ ptd, etd, atd, pta, eta, ata }, leg.type),
        originName: leg.originLocationId ? JSON.stringify({ id: leg.originLocationId, name: leg.originName ?? '' }) : (leg.originName ?? null),
        destinationName: leg.destinationLocationId ? JSON.stringify({ id: leg.destinationLocationId, name: leg.destinationName ?? '' }) : (leg.destinationName ?? null),
        carrierName: leg.carrierId ? JSON.stringify({ id: leg.carrierId, name: leg.carrierName ?? '' }) : (leg.carrierName ?? null),
        bookingNumber: leg.bookingNumber ?? null,
        legBlNumber: leg.blNumber ?? null,
        vesselName: leg.vesselName ?? null,
        vesselImo: leg.vesselImo ?? null,
        voyageNumber: leg.voyageNumber ?? null,
        gateInCutoff: leg.gateInCutoff ?? null,
        documentationCutoff: leg.documentationCutoff ?? null,
        vgmCutoff: leg.vgmCutoff ?? null,
        dangerousGoodsCutoff: leg.dangerousGoodsCutoff ?? null,
        demFreeTime: leg.demFreeTime ?? null,
        detFreeTime: leg.detFreeTime ?? null,
        flightNumber: leg.flightNumber ?? null,
        aircraftType: leg.aircraftType ?? null,
        truckPlate: ul.truckPlate ?? null,
        trailerPlate: ul.trailerPlate ?? null,
        driverFullName: ul.driverFullName ?? null,
        driverIdNumber: ul.driverIdNumber ?? null,
        driverPhone: ul.driverPhone ?? null,
        sealNumber: ul.sealNumber ?? null,
        ptdTimestamps: leg.type !== 'TRUCK' ? (leg as any).ptdTimestamps ?? null : null,
        etdTimestamps: leg.type !== 'TRUCK' ? (leg as any).etdTimestamps ?? null : null,
        atdTimestamps: leg.type !== 'TRUCK' ? (leg as any).atdTimestamps ?? null : null,
        ptaTimestamps: leg.type !== 'TRUCK' ? (leg as any).ptaTimestamps ?? null : null,
        etaTimestamps: leg.type !== 'TRUCK' ? (leg as any).etaTimestamps ?? null : null,
        ataTimestamps: leg.type !== 'TRUCK' ? (leg as any).ataTimestamps ?? null : null,
        blNumber: ul.blNumber ?? null,
        notes: ul.notes ?? null,
        ptd, etd, atd, pta, eta, ata,
      }
    }).filter((r): r is NonNullable<typeof r> => r !== null)

    // Include units with no leg assignments so they appear in the table
    const assignedUnitIds = new Set(unitLegs.map((ul) => ul.unitId))
    for (const unit of unitById.values()) {
      if (!assignedUnitIds.has(unit.id)) {
        rows.push({
          id: `unassigned-${unit.id}`,
          unitLegId: null,
          legId: null,
          ...makeUnitFields(unit),
          legSequence: null,
          type: null,
          derivedStatus: 'PENDING' as const,
          originName: unit.originName ?? null,
          destinationName: unit.destinationName ?? null,
          carrierName: null,
          bookingNumber: null,
          legBlNumber: null,
          vesselName: null,
          vesselImo: null,
          voyageNumber: null,
          gateInCutoff: null,
          documentationCutoff: null,
          vgmCutoff: null,
          dangerousGoodsCutoff: null,
          demFreeTime: null,
          detFreeTime: null,
          flightNumber: null,
          aircraftType: null,
          truckPlate: null,
          trailerPlate: null,
          driverFullName: null,
          driverIdNumber: null,
          driverPhone: null,
          sealNumber: null,
          ptdTimestamps: null,
          etdTimestamps: null,
          atdTimestamps: null,
          ptaTimestamps: null,
          etaTimestamps: null,
          ataTimestamps: null,
          blNumber: null,
          notes: null,
          ptd: null,
          etd: null,
          atd: null,
          pta: null,
          eta: null,
          ata: null,
        })
      }
    }

    return rows
  }, [unitLegs, unitById, legById])

  // One flat row per unit for the Units tab
  const unitRows = useMemo(() => units.map((u) => ({
    id: u.id,
    unitId: u.id,
    containerLabel: unitLabel(u),
    containerNumber: u.containerNumber ?? null,
    containerType: u.containerType ?? null,
    commodityDescription: u.commodityDescription ?? null,
    grossWeight: u.grossWeight ?? null,
    weightUnit: u.weightUnit ?? null,
    volume: u.volume ?? null,
    volumeUnit: u.volumeUnit ?? null,
    isHazardous: u.isHazardous ?? false,
    packageCount: u.packageCount ?? null,
    originLocationId: u.originLocationId ?? null,
    destinationLocationId: u.destinationLocationId ?? null,
    originName: u.originName ?? null,
    destinationName: u.destinationName ?? null,
    notes: null as string | null,
    // unused leg fields — present so TS doesn't complain about shape mismatch
    unitLegId: null as string | null,
    legId: null as string | null,
    legSequence: null as number | null,
    type: null as string | null,
    carrierName: null as string | null,
    bookingNumber: null as string | null,
    legBlNumber: null as string | null,
    vesselName: null as string | null,
    vesselImo: null as string | null,
    voyageNumber: null as string | null,
    gateInCutoff: null as string | null,
    documentationCutoff: null as string | null,
    vgmCutoff: null as string | null,
    dangerousGoodsCutoff: null as string | null,
    demFreeTime: null as number | null,
    detFreeTime: null as number | null,
    flightNumber: null as string | null,
    aircraftType: null as string | null,
    truckPlate: null as string | null,
    trailerPlate: null as string | null,
    driverFullName: null as string | null,
    sealNumber: null as string | null,
    blNumber: null as string | null,
    ptd: null as string | null, etd: null as string | null, atd: null as string | null,
    pta: null as string | null, eta: null as string | null, ata: null as string | null,
  })), [units])

  const isUnits = selectedLegId === 'UNITS'

  const filteredRows = useMemo(() => {
    if (isUnits) return unitRows
    if (selectedLegId === 'ALL') return allRows
    return allRows.filter((r) => r.legId === selectedLegId)
  }, [allRows, unitRows, selectedLegId, isUnits])

  // Derive column mode from selected leg's type (or ALL)
  const selectedLeg = selectedLegId === 'ALL' || isUnits ? null : legById.get(selectedLegId)
  const columns = useMemo(
    () => isUnits ? buildUnassignedColumns(isFCL) : buildColumns(selectedLeg?.type ?? 'ALL', isFCL),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isUnits, selectedLeg?.type, isFCL],
  )

  // Perspective: flat for Units tab and individual leg tabs; grouped by container only for ALL
  const groupPerspective = useMemo((): PerspectiveConfig => {
    if (isUnits) {
      return {
        id: 'transport-units',
        name: 'Units',
        columns: { visible: columns.map((c) => c.data), hidden: [] },
        filters: [],
        sorting: [],
        grouping: [],
      }
    }
    const isAll = selectedLegId === 'ALL'
    return {
      id: `transport-${selectedLegId}`,
      name: 'Transport',
      columns: {
        visible: columns.filter((c) => c.data !== 'containerLabel').map((c) => c.data),
        hidden: ['containerLabel'],
      },
      filters: [],
      sorting: isAll ? [{ id: 'sort-leg', field: 'legSequence', direction: 'asc' }] : [],
      grouping: isAll ? [{ id: 'grp-container', field: 'containerLabel', direction: 'asc' }] : [],
    }
  }, [columns, selectedLegId, isUnits])

  // Leg tabs toolbar
  const filterTabs = React.createElement(
    'div',
    { className: 'flex items-center gap-0' },
    React.createElement(
      'button',
      {
        className: `px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${selectedLegId === 'UNITS' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`,
        onClick: () => setSelectedLegId('UNITS'),
        type: 'button',
      },
      'Units',
    ),
    React.createElement(
      'button',
      {
        className: `px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${selectedLegId === 'ALL' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`,
        onClick: () => setSelectedLegId('ALL'),
        type: 'button',
      },
      'All',
    ),
    ...sortedLegs.map((leg) => {
      const cfg = LEG_TYPE_CONFIG[leg.type]
      const Icon = cfg?.icon ?? Truck
      const isActive = selectedLegId === leg.id
      const textClass = cfg?.className?.split(' ').find((c) => c.startsWith('text-')) ?? 'text-foreground'
      return React.createElement(
        'button',
        {
          key: leg.id,
          className: `px-2 py-1 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${isActive ? `border-current ${textClass}` : 'border-transparent text-muted-foreground hover:text-foreground'}`,
          onClick: () => setSelectedLegId(leg.id),
          type: 'button',
        },
        React.createElement(Icon, { className: 'w-3.5 h-3.5 shrink-0' }),
        React.createElement('span', { className: 'flex flex-col items-start' },
          React.createElement('span', { className: 'max-w-[90px] truncate leading-tight text-[11px]' }, leg.originName ?? '?'),
          React.createElement('span', { className: 'max-w-[90px] truncate leading-tight text-[11px]' }, leg.destinationName ?? '?'),
        ),
      )
    }),
  )

  // Delete action per row
  const actionsRenderer = useCallback((rowData: Record<string, unknown> | null) => {
    if (isUnits && rowData?.unitId && onDeleteUnit) {
      return React.createElement(
        'button',
        {
          className: 'p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors cursor-pointer',
          onClick: (e: React.MouseEvent) => { e.stopPropagation(); onDeleteUnit(rowData.unitId as string) },
          title: isFCL ? 'Remove container' : 'Remove package',
          type: 'button',
        },
        React.createElement(Trash2, { className: 'w-3.5 h-3.5' }),
      )
    }
    if (!isUnits) {
      const type = rowData?.type as string | null

      const trackingBtn = type === 'SHIP' && rowData?.trackedShipmentId
        ? React.createElement(
            'button',
            {
              className: 'p-1 text-muted-foreground hover:text-primary transition-colors cursor-pointer',
              onClick: (e: React.MouseEvent) => { e.stopPropagation(); setTrackingShipmentId(rowData.trackedShipmentId as string) },
              title: 'View container tracking details',
              type: 'button',
            },
            React.createElement(ExternalLink, { className: 'h-4 w-4' }),
          )
        : null

      const shipBtn = type === 'SHIP' && !rowData?.trackedShipmentId
        ? React.createElement(
            'button',
            {
              className: 'p-1 text-muted-foreground hover:text-primary transition-colors cursor-pointer',
              onClick: (e: React.MouseEvent) => { e.stopPropagation(); setShipRow(rowData as ShipRowData) },
              title: 'View ship leg details',
              type: 'button',
            },
            React.createElement(ExternalLink, { className: 'h-4 w-4' }),
          )
        : null

      const truckBtn = type === 'TRUCK'
        ? React.createElement(
            'button',
            {
              className: 'p-1 text-muted-foreground hover:text-primary transition-colors cursor-pointer',
              onClick: (e: React.MouseEvent) => { e.stopPropagation(); setTruckRow(rowData as TruckRowData) },
              title: 'View truck leg details',
              type: 'button',
            },
            React.createElement(ExternalLink, { className: 'h-4 w-4' }),
          )
        : null

      const airBtn = type === 'AIR'
        ? React.createElement(
            'button',
            {
              className: 'p-1 text-muted-foreground hover:text-primary transition-colors cursor-pointer',
              onClick: (e: React.MouseEvent) => { e.stopPropagation(); setAirRow(rowData as AirRowData) },
              title: 'View air leg details',
              type: 'button',
            },
            React.createElement(ExternalLink, { className: 'h-4 w-4' }),
          )
        : null

      const deleteBtn = rowData?.legId && onDeleteLeg
        ? React.createElement(
            'button',
            {
              className: 'p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors cursor-pointer',
              onClick: (e: React.MouseEvent) => { e.stopPropagation(); onDeleteLeg(rowData.legId as string) },
              title: 'Delete leg',
              type: 'button',
            },
            React.createElement(Trash2, { className: 'w-3.5 h-3.5' }),
          )
        : null

      const buttons = [trackingBtn, shipBtn, truckBtn, airBtn, deleteBtn].filter(Boolean)
      if (buttons.length > 0) {
        return React.createElement('div', { className: 'flex items-center gap-0.5' }, ...buttons)
      }
    }
    return null
  }, [isUnits, isFCL, onDeleteUnit, onDeleteLeg])

  // Keep a ref so the save handler always sees the latest rows without re-attaching
  const filteredRowsRef = useRef(filteredRows)
  useEffect(() => { filteredRowsRef.current = filteredRows }, [filteredRows])

  // Cell context menu: unit options for grossWeight and volume cells
  const cellActions = useCallback((rowData: any, col: ColumnDef): ContextMenuAction[] => {
    if (col.data === 'grossWeight') {
      return [
        { id: 'kg', label: 'kg' },
        { id: 'lb', label: 'lb' },
        { id: 'ton', label: 'ton' },
        { id: 'mt', label: 'mt' },
      ]
    }
    if (col.data === 'volume') {
      return [
        { id: 'cbm', label: 'cbm' },
        { id: 'cft', label: 'cft' },
        { id: 'liter', label: 'liter' },
      ]
    }
    return []
  }, [])

  // Handle unit selection from right-click context menu on weight/volume cells
  useEffect(() => {
    const el = tableRef.current
    if (!el) return

    const handler = async (e: Event) => {
      const { rowData, col, actionId } = (e as CustomEvent<CellContextMenuEvent>).detail
      if (!rowData?.unitId) return
      const field = col.data === 'grossWeight' ? 'weightUnit' : col.data === 'volume' ? 'volumeUnit' : null
      if (!field) return
      await apiCall(`/api/fms_files/files/${fileId}/units/${rowData.unitId}`, {
        method: 'PUT',
        body: JSON.stringify({ [field]: actionId }),
      })
      onUnitAdded?.()
    }

    el.addEventListener(TableEvents.CELL_CONTEXT_MENU_ACTION, handler)
    return () => el.removeEventListener(TableEvents.CELL_CONTEXT_MENU_ACTION, handler)
  }, [fileId, onUnitAdded])

  // Cell save: route unit fields → units API, unit-leg fields → unit-legs API
  useEffect(() => {
    const el = tableRef.current
    if (!el) return

    const handler = async (e: Event) => {
      const { id: rowId, prop, newValue, rowIndex, colIndex } = (e as CustomEvent<CellEditSaveEvent>).detail
      if (!rowId) return

      const row = filteredRowsRef.current.find((r) => r.id === rowId)
      if (!row) return

      const value = newValue === '' ? null : newValue
      let res

      if (prop === 'carrierName') {
        if (!row.legId) return
        let carrierId: string | null = null
        try { carrierId = JSON.parse(String(value ?? '')).id ?? null } catch { /* ignore */ }
        res = await apiCall(`/api/fms_files/files/${fileId}/legs/${row.legId}`, {
          method: 'PUT',
          body: JSON.stringify({ carrierId }),
        })
      } else if (prop === 'originName' || prop === 'destinationName') {
        const apiField = prop === 'originName' ? 'originLocationId' : 'destinationLocationId'
        let locationId: string | null = null
        try { locationId = JSON.parse(String(value ?? '')).id ?? null } catch { /* ignore */ }
        if (!locationId) return
        if (row.legId) {
          res = await apiCall(`/api/fms_files/files/${fileId}/legs/${row.legId}`, {
            method: 'PUT',
            body: JSON.stringify({ [apiField]: locationId }),
          })
        } else {
          res = await apiCall(`/api/fms_files/files/${fileId}/units/${row.unitId}`, {
            method: 'PUT',
            body: JSON.stringify({ [apiField]: locationId }),
          })
        }
      } else if (ALL_TIMESTAMP_FIELDS.has(prop)) {
        if (!value) return
        if (row.type === 'TRUCK') {
          // Truck: each truck departs/arrives independently — save to unit-leg
          if (!row.unitLegId) return
          res = await apiCall(`/api/fms_files/unit-legs/${row.unitLegId}`, {
            method: 'PUT',
            body: JSON.stringify({ [prop]: String(value) }),
          })
        } else {
          // Ship/Rail/Air: shared departure/arrival for all units — append to leg SCD array
          if (!row.legId) return
          res = await apiCall(`/api/fms_files/files/${fileId}/legs/${row.legId}/timestamps`, {
            method: 'POST',
            body: JSON.stringify({ timestampType: prop, value: String(value) }),
          })
        }
      } else if (LEG_DIRECT_FIELDS.has(prop)) {
        if (!row.legId) return
        const apiField = LEG_DIRECT_FIELDS.get(prop)!
        res = await apiCall(`/api/fms_files/files/${fileId}/legs/${row.legId}`, {
          method: 'PUT',
          body: JSON.stringify({ [apiField]: value }),
        })
      } else if (UNIT_FIELDS.has(prop)) {
        res = await apiCall(`/api/fms_files/files/${fileId}/units/${row.unitId}`, {
          method: 'PUT',
          body: JSON.stringify({ [prop]: value }),
        })
      } else if (UNIT_LEG_FIELDS.has(prop) && row.unitLegId) {
        res = await apiCall(`/api/fms_files/unit-legs/${row.unitLegId}`, {
          method: 'PUT',
          body: JSON.stringify({ [prop]: value }),
        })
      } else {
        return
      }

      if (res.ok) {
        dispatch<CellSaveSuccessEvent>(el, TableEvents.CELL_SAVE_SUCCESS, { rowIndex, colIndex })
        onUnitAdded?.() // refresh so containerLabel grouping updates
      } else {
        dispatch<CellSaveErrorEvent>(el, TableEvents.CELL_SAVE_ERROR, { rowIndex, colIndex, error: 'Save failed' })
      }
    }

    el.addEventListener(TableEvents.CELL_EDIT_SAVE, handler)
    return () => el.removeEventListener(TableEvents.CELL_EDIT_SAVE, handler)
  }, [fileId, onUnitAdded])

  const defaultOriginLocationId = units[0]?.originLocationId ?? null
  const defaultDestinationLocationId = units[0]?.destinationLocationId ?? null

  const btnClass = 'inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border border-border bg-card hover:bg-muted transition-colors text-foreground cursor-pointer'

  const isLegTab = !isUnits && selectedLegId !== 'ALL'

  const addButton = React.createElement(
    'div',
    { className: 'flex items-center gap-1.5' },
    isLegTab && React.createElement(
      'button',
      { type: 'button', className: btnClass, onClick: () => setAssignOpen(true), title: 'Assign units to this leg' },
      'Assign',
    ),
    React.createElement(
      'button',
      { type: 'button', className: btnClass, onClick: () => setAddUnitOpen(true), title: isFCL ? 'Add container' : 'Add package' },
      React.createElement(Plus, { className: 'w-3 h-3' }),
      React.createElement(isFCL ? Container : Package, { className: 'w-3.5 h-3.5' }),
    ),
    React.createElement(
      'button',
      { type: 'button', className: btnClass, onClick: () => setAddLegOpen(true), title: 'Add leg' },
      React.createElement(Plus, { className: 'w-3 h-3' }),
      React.createElement(Route, { className: 'w-3.5 h-3.5' }),
    ),
    isLegTab && onDeleteLeg && React.createElement(
      'button',
      { type: 'button', className: 'inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border border-destructive/40 bg-destructive/10 hover:bg-destructive/20 transition-colors text-destructive cursor-pointer', onClick: () => onDeleteLeg(selectedLegId as string), title: 'Delete this leg' },
      React.createElement(Trash2, { className: 'w-3 h-3' }),
      React.createElement(Route, { className: 'w-3.5 h-3.5' }),
    ),
  )

  return (
    <>
      <DynamicTable
        tableRef={tableRef}
        data={filteredRows}
        columns={columns}
        height="auto"
        tableName="Transport"
        stretchColumns={isUnits}
        actionsRenderer={actionsRenderer}
        cellActions={cellActions}
        enableComments
        commentsEntityType={(row: any) => row.unitLegId ? 'fms_file_unit_leg' : 'fms_file_unit'}
        commentsViewContext="transport"
        onAnnotationChange={onAnnotationChange}
        savedPerspectives={[groupPerspective]}
        activePerspectiveId={groupPerspective.id}
        uiConfig={{
          borderless: true,
          hideAddRowButton: true,
          hidePerspectiveTabs: true,
          topBarStart: filterTabs,
          topBarEnd: addButton,
        }}
      />
      <AddUnitDialog
        fileId={fileId}
        cargoType={isFCL ? 'FCL' : 'LCL'}
        open={addUnitOpen}
        onOpenChange={setAddUnitOpen}
        defaultOriginLocationId={defaultOriginLocationId}
        defaultDestinationLocationId={defaultDestinationLocationId}
        onSaved={() => {
          setAddUnitOpen(false)
          onUnitAdded?.()
        }}
      />
      <AddLegDialog
        fileId={fileId}
        nextSequence={legs.length + 1}
        units={units as any[]}
        open={addLegOpen}
        onOpenChange={setAddLegOpen}
        onSaved={() => onUnitAdded?.()}
      />
      {isLegTab && (
        <AssignUnitsDialog
          legId={selectedLegId}
          units={units}
          existingAssignments={unitLegs
            .filter((ul) => ul.legId === selectedLegId)
            .map((ul) => ({ id: ul.id, unitId: ul.unitId }))}
          open={assignOpen}
          onOpenChange={setAssignOpen}
          onSaved={() => { setAssignOpen(false); onUnitAdded?.() }}
        />
      )}
      <FmsFileShipmentDrawer
        open={!!trackingShipmentId}
        onOpenChange={(open) => { if (!open) setTrackingShipmentId(null) }}
        shipmentId={trackingShipmentId}
      />
      <FmsTruckLegDrawer
        open={!!truckRow}
        onOpenChange={(open) => { if (!open) setTruckRow(null) }}
        rowData={truckRow}
      />
      <FmsAirLegDrawer
        open={!!airRow}
        onOpenChange={(open) => { if (!open) setAirRow(null) }}
        rowData={airRow}
      />
      <FmsShipLegDrawer
        open={!!shipRow}
        onOpenChange={(open) => { if (!open) setShipRow(null) }}
        rowData={shipRow}
      />
    </>
  )
}
