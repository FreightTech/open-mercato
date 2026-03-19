'use client'

import * as React from 'react'
import { useRef, useMemo, useEffect, useState, useCallback } from 'react'
import { Truck, Ship, Plane, TrainFront, Trash2, Plus } from 'lucide-react'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { AddUnitDialog } from './AddUnitDialog'
import { AddLegDialog } from './AddLegDialog'
import { AssignUnitsDialog } from './AssignUnitsDialog'
import { EditLegDialog } from './EditLegDialog'
import { DynamicTable, createEntitySearchEditor } from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef, CellEditSaveEvent, CellSaveSuccessEvent, CellSaveErrorEvent, PerspectiveConfig } from '@open-mercato/ui/backend/dynamic-table'
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
}

type LegRow = {
  id: string
  legSequence: number
  type: string
  originLocationId?: string | null
  destinationLocationId?: string | null
  originName?: string | null
  destinationName?: string | null
  carrierName?: string | null
  etd?: string | null
  eta?: string | null
  etaUpdateCount?: number
}

type UnitLegRow = {
  id: string
  unitId: string
  legId: string
  truckPlate?: string | null
  trailerPlate?: string | null
  driverFullName?: string | null
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
  onUnitAdded?: () => void
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

function EtaRenderer(v: unknown, row: Record<string, unknown> | undefined) {
  const count = (row?.etaUpdateCount as number) ?? 0
  if (!v) return React.createElement('span', { className: 'text-muted-foreground text-xs' }, '-')
  return React.createElement(
    'span', { className: 'text-xs' },
    v as string,
    count > 1 ? React.createElement('span', { className: 'ml-1 text-amber-500 text-[10px]' }, `(${count}x)`) : null,
  )
}

function unitLabel(unit: UnitRow): string {
  if (unit.cargoType === 'FCL') return unit.containerNumber || '(TBD)'
  return unit.commodityDescription || 'LCL unit'
}

// Unit-owned fields (saved to /files/:id/units/:unitId)
const UNIT_FIELDS = new Set(['containerNumber', 'containerType', 'commodityDescription', 'grossWeight', 'weightUnit', 'volume', 'volumeUnit', 'isHazardous', 'packageCount'])
// Unit-leg-owned fields (saved to /unit-legs/:id)
const UNIT_LEG_FIELDS = new Set(['truckPlate', 'driverFullName', 'sealNumber', 'blNumber', 'notes', 'ptd', 'etd', 'atd', 'pta', 'eta', 'ata'])

// ─── Column definitions ───────────────────────────────────────────────────────

function WeightRenderer(v: unknown, row: Record<string, unknown> | undefined) {
  if (v == null || v === '') return React.createElement('span', { className: 'text-muted-foreground text-xs' }, '-')
  const unit = (row?.weightUnit as string | null) ?? 'kg'
  return React.createElement('span', { className: 'text-xs' }, `${v} ${unit}`)
}

function VolumeRenderer(v: unknown, row: Record<string, unknown> | undefined) {
  if (v == null || v === '') return React.createElement('span', { className: 'text-muted-foreground text-xs' }, '-')
  const unit = (row?.volumeUnit as string | null) ?? 'CBM'
  return React.createElement('span', { className: 'text-xs' }, `${v} ${unit}`)
}



function locationNameRenderer(v: unknown) {
  const str = String(v || '')
  if (!str) return React.createElement('span', { className: 'text-muted-foreground text-xs' }, '—')
  try {
    const parsed = JSON.parse(str)
    if (parsed?.name) return React.createElement('span', { className: 'text-xs' }, parsed.name)
  } catch { /* plain string */ }
  return React.createElement('span', { className: 'text-xs' }, str)
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
    { data: 'weightUnit', title: 'W. Unit', width: 75, readOnly: false, type: 'dropdown' as const, source: ['kg', 'lb', 'ton', 'mt'] },
    { data: 'volume', title: 'Volume', width: 90, readOnly: false, renderer: VolumeRenderer },
    { data: 'volumeUnit', title: 'V. Unit', width: 75, readOnly: false, type: 'dropdown' as const, source: ['cbm', 'cft', 'liter'] },
    { data: 'isHazardous', title: 'HAZ', width: 55, type: 'boolean' as const, readOnly: false },
    { data: 'originName', title: 'Origin', width: 280, readOnly: false, editor: createEntitySearchEditor({ entityType: 'fms_locations:fms_location', extractValue: (r: any) => JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }), placeholder: 'Search location…', minQueryLength: 2 }), renderer: locationNameRenderer },
    { data: 'destinationName', title: 'Destination', width: 280, readOnly: false, editor: createEntitySearchEditor({ entityType: 'fms_locations:fms_location', extractValue: (r: any) => JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }), placeholder: 'Search location…', minQueryLength: 2 }), renderer: locationNameRenderer },
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
    { data: 'legSequence', title: 'Leg', width: 35, readOnly: true },
    { data: 'type', title: 'Mode', width: 90, readOnly: true, renderer: ModeBadgeRenderer },
    { data: 'originName', title: 'Leg Origin', width: 280, readOnly: false, editor: createEntitySearchEditor({ entityType: 'fms_locations:fms_location', extractValue: (r: any) => JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }), placeholder: 'Search location…', minQueryLength: 2 }), renderer: locationNameRenderer },
    { data: 'destinationName', title: 'Leg Destination', width: 280, readOnly: false, editor: createEntitySearchEditor({ entityType: 'fms_locations:fms_location', extractValue: (r: any) => JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }), placeholder: 'Search location…', minQueryLength: 2 }), renderer: locationNameRenderer },
    { data: 'carrierName', title: 'Carrier', width: 120, readOnly: true },
    { data: 'legEtd', title: 'Leg ETD', width: 90, readOnly: true },
    { data: 'legEta', title: 'Leg ETA', width: 110, readOnly: true, renderer: EtaRenderer },
  )

  cols.push(
    { data: 'ptd', title: 'PTD', width: 110, readOnly: false },
    { data: 'etd', title: 'ETD', width: 110, readOnly: false },
    { data: 'atd', title: 'ATD', width: 110, readOnly: false },
    { data: 'pta', title: 'PTA', width: 110, readOnly: false },
    { data: 'eta', title: 'ETA', width: 110, readOnly: false },
    { data: 'ata', title: 'ATA', width: 110, readOnly: false },
  )

  if (filterMode === 'ALL' || filterMode === 'TRUCK') {
    cols.push({ data: 'truckPlate', title: 'Truck Plate', width: 100, readOnly: false })
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

export function TransportView({ fileId, units, legs, unitLegs, isFCL, onDeleteLeg, onUnitAdded }: Props) {
  const tableRef = useRef<HTMLDivElement>(null)
  const [selectedLegId, setSelectedLegId] = useState<string | 'ALL' | 'UNITS'>('UNITS')
  const [addUnitOpen, setAddUnitOpen] = useState(false)
  const [addLegOpen, setAddLegOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [editLegOpen, setEditLegOpen] = useState(false)

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
    })

    const rows = unitLegs.map((ul) => {
      const unit = unitById.get(ul.unitId)
      const leg = legById.get(ul.legId)
      if (!unit || !leg) return null
      return {
        id: ul.id,
        unitLegId: ul.id as string | null,
        legId: leg.id as string | null,
        ...makeUnitFields(unit),
        legSequence: leg.legSequence as number | null,
        type: leg.type as string | null,
        originName: leg.originLocationId ? JSON.stringify({ id: leg.originLocationId, name: leg.originName ?? '' }) : (leg.originName ?? null),
        destinationName: leg.destinationLocationId ? JSON.stringify({ id: leg.destinationLocationId, name: leg.destinationName ?? '' }) : (leg.destinationName ?? null),
        carrierName: leg.carrierName ?? null,
        legEtd: leg.etd ?? null,
        legEta: leg.eta ?? null,
        etaUpdateCount: leg.etaUpdateCount ?? 0,
        truckPlate: ul.truckPlate ?? null,
        driverFullName: ul.driverFullName ?? null,
        sealNumber: ul.sealNumber ?? null,
        blNumber: ul.blNumber ?? null,
        notes: ul.notes ?? null,
        ptd: ul.ptd ?? null,
        etd: ul.etd ?? null,
        atd: ul.atd ?? null,
        pta: ul.pta ?? null,
        eta: ul.eta ?? null,
        ata: ul.ata ?? null,
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
          originName: unit.originName ?? null,
          destinationName: unit.destinationName ?? null,
          carrierName: null,
          legEtd: null,
          legEta: null,
          etaUpdateCount: 0,
          truckPlate: null,
          driverFullName: null,
          sealNumber: null,
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
    legEtd: null as string | null,
    legEta: null as string | null,
    etaUpdateCount: 0,
    truckPlate: null as string | null,
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
          className: `px-3 py-1.5 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${isActive ? `border-current ${textClass}` : 'border-transparent text-muted-foreground hover:text-foreground'}`,
          onClick: () => setSelectedLegId(leg.id),
          type: 'button',
        },
        React.createElement(Icon, { className: 'w-3 h-3' }),
        `Leg ${leg.legSequence}`,
      )
    }),
  )

  // Delete action per row
  const actionsRenderer = useCallback((rowData: { legId?: string } | null) => {
    if (!rowData?.legId || !onDeleteLeg) return null
    return React.createElement(
      'button',
      {
        className: 'p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors',
        onClick: (e: React.MouseEvent) => { e.stopPropagation(); onDeleteLeg(rowData.legId!) },
        title: 'Delete leg',
        type: 'button',
      },
      React.createElement(Trash2, { className: 'w-3.5 h-3.5' }),
    )
  }, [onDeleteLeg])

  // Keep a ref so the save handler always sees the latest rows without re-attaching
  const filteredRowsRef = useRef(filteredRows)
  useEffect(() => { filteredRowsRef.current = filteredRows }, [filteredRows])

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

      if (prop === 'originName' || prop === 'destinationName') {
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

  const btnClass = 'inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border border-border bg-card hover:bg-muted transition-colors text-foreground'

  const isLegTab = !isUnits && selectedLegId !== 'ALL'

  const addButton = React.createElement(
    'div',
    { className: 'flex items-center gap-1.5' },
    isLegTab && React.createElement(
      'button',
      { type: 'button', className: btnClass, onClick: () => setAssignOpen(true) },
      'Assign',
    ),
    isLegTab && selectedLeg && React.createElement(
      'button',
      { type: 'button', className: btnClass, onClick: () => setEditLegOpen(true) },
      'Edit Route',
    ),
    React.createElement(
      'button',
      { type: 'button', className: btnClass, onClick: () => setAddLegOpen(true) },
      React.createElement(Plus, { className: 'w-3 h-3' }),
      'Add Leg',
    ),
    React.createElement(
      'button',
      { type: 'button', className: btnClass, onClick: () => setAddUnitOpen(true) },
      React.createElement(Plus, { className: 'w-3 h-3' }),
      isFCL ? 'Add Container' : 'Add Package',
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
      {isLegTab && selectedLeg && (
        <EditLegDialog
          fileId={fileId}
          leg={selectedLeg}
          open={editLegOpen}
          onOpenChange={setEditLegOpen}
          onSaved={() => { setEditLegOpen(false); onUnitAdded?.() }}
        />
      )}
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
    </>
  )
}
