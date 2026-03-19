'use client'

import * as React from 'react'
import { useRef, useMemo, useEffect, useState, useCallback } from 'react'
import { Truck, Ship, Plane, TrainFront, Trash2, Plus } from 'lucide-react'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { AddUnitDialog } from './AddUnitDialog'
import { AddLegDialog } from './AddLegDialog'
import { DynamicTable } from '@open-mercato/ui/backend/dynamic-table'
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
  grossWeight?: number | null
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
const UNIT_FIELDS = new Set(['containerNumber', 'containerType', 'commodityDescription', 'grossWeight', 'packageCount'])
// Unit-leg-owned fields (saved to /unit-legs/:id)
const UNIT_LEG_FIELDS = new Set(['truckPlate', 'driverFullName', 'sealNumber', 'blNumber', 'notes', 'ptd', 'etd', 'atd', 'pta', 'eta', 'ata'])

// ─── Column definitions ───────────────────────────────────────────────────────

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
    { data: 'legSequence', title: 'Leg', width: 45, readOnly: true },
    { data: 'type', title: 'Mode', width: 90, readOnly: true, renderer: ModeBadgeRenderer },
    { data: 'originName', title: 'Leg Origin', width: 160, readOnly: true },
    { data: 'destinationName', title: 'Leg Destination', width: 160, readOnly: true },
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
  const [selectedLegId, setSelectedLegId] = useState<string | 'ALL'>('ALL')
  const [addUnitOpen, setAddUnitOpen] = useState(false)
  const [addLegOpen, setAddLegOpen] = useState(false)

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
        originName: leg.originName ?? null,
        destinationName: leg.destinationName ?? null,
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
          originName: null,
          destinationName: null,
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

  const filteredRows = useMemo(() => {
    if (selectedLegId === 'ALL') return allRows
    return allRows.filter((r) => r.legId === selectedLegId)
  }, [allRows, selectedLegId])

  // Derive column mode from selected leg's type (or ALL)
  const selectedLeg = selectedLegId === 'ALL' ? null : legById.get(selectedLegId)
  const columns = useMemo(
    () => buildColumns(selectedLeg?.type ?? 'ALL', isFCL),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedLeg?.type, isFCL],
  )

  // Perspective for grouping — ID is stable per leg selection
  const groupPerspective = useMemo((): PerspectiveConfig => ({
    id: `transport-grouped-${selectedLegId}`,
    name: 'Transport',
    columns: {
      visible: columns.filter((c) => c.data !== 'containerLabel').map((c) => c.data),
      hidden: ['containerLabel'],
    },
    filters: [],
    sorting: [{ id: 'sort-leg', field: 'legSequence', direction: 'asc' }],
    grouping: [{ id: 'grp-container', field: 'containerLabel', direction: 'asc' }],
  }), [columns, selectedLegId])

  // Leg tabs toolbar
  const filterTabs = React.createElement(
    'div',
    { className: 'flex items-center gap-0' },
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

      if (UNIT_FIELDS.has(prop)) {
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

  const addButton = React.createElement(
    'div',
    { className: 'flex items-center gap-1.5' },
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
    </>
  )
}
