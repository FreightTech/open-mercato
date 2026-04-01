'use client'

import * as React from 'react'
import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DynamicTable, createEntitySearchEditor, createDateTimeEditor } from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef, KeyboardShortcutsConfig, ContextMenuAction, CellContextMenuEvent, CellEditSaveEvent, CellSaveSuccessEvent, CellSaveErrorEvent } from '@open-mercato/ui/backend/dynamic-table'
import { useDynamicTablePage, TableEvents, dispatch } from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { AlertTriangle, Ship, Truck, TrainFront, Plane, Radio, ExternalLink } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@open-mercato/ui/primitives/tooltip'
import { FmsTruckLegDrawer } from '../../components/FmsTruckLegDrawer'
import type { TruckRowData } from '../../components/FmsTruckLegDrawer'
import { FmsAirLegDrawer } from '../../components/FmsAirLegDrawer'
import type { AirRowData } from '../../components/FmsAirLegDrawer'
import { FmsFileShipmentDrawer } from '../../components/FmsFileShipmentDrawer'

// ─── Tab types ────────────────────────────────────────────────────────────────

type TabId = 'UNITS' | 'ALL' | 'TRUCK' | 'RAIL' | 'AIR' | 'SEA'

const LEG_TYPE_CONFIG: Record<string, { icon: React.ElementType; textClass: string; legType: string }> = {
  TRUCK: { icon: Truck,      textClass: 'text-orange-600 dark:text-orange-400', legType: 'TRUCK' },
  RAIL:  { icon: TrainFront, textClass: 'text-green-600 dark:text-green-400',  legType: 'RAIL'  },
  AIR:   { icon: Plane,      textClass: 'text-purple-600 dark:text-purple-400', legType: 'AIR'  },
  SEA:   { icon: Ship,       textClass: 'text-blue-600 dark:text-blue-400',    legType: 'SHIP'  },
}

const TYPE_TABS: TabId[] = ['TRUCK', 'RAIL', 'AIR', 'SEA']

// ─── Timestamp history tooltip ───────────────────────────────────────────────

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

function formatTimestampValue(value: string): string {
  if (!value.includes('T')) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d} ${h}:${min}`
}

function TimestampHistoryCell({ value, timestamps }: { value: string | null; timestamps: TimestampEntry[] | null }) {
  if (!value) return <span className="text-xs text-muted-foreground">-</span>

  const displayValue = formatTimestampValue(value)

  const sorted = timestamps && timestamps.length > 1
    ? [...timestamps].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    : null

  const cell = (
    <span className={`text-xs ${sorted ? 'border-b border-dashed border-muted-foreground/50 cursor-help' : ''}`}>
      {displayValue}
      {sorted && <span className="ml-1 text-[10px] text-amber-500">({sorted.length})</span>}
    </span>
  )

  if (!sorted) return cell

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>{cell}</TooltipTrigger>
        <TooltipContent side="bottom" align="start" className="max-w-xs p-0">
          <div className="p-2 space-y-1.5 max-h-64 overflow-y-auto">
            {sorted.map((entry, i) => (
              <div key={`${entry.value}-${entry.updatedAt}-${i}`}
                className={`text-xs rounded p-1.5 ${i === 0 ? 'bg-accent' : 'bg-muted'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{formatTimestampValue(entry.value)}</span>
                  <span className={`inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium ${TIMESTAMP_SOURCE_COLORS[entry.source] ?? 'bg-gray-100 text-gray-700'}`}>
                    {TIMESTAMP_SOURCE_LABELS[entry.source] ?? entry.source}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Updated: {formatUpdatedAt(entry.updatedAt)}
                  {i === 0 && <span className="ml-1 text-primary font-medium">(latest)</span>}
                </div>
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ─── Renderers ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  'PENDING': { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-300', label: 'Pending' },
  'PLANNED': { bg: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-700 dark:text-blue-300', label: 'Planned' },
  'ESTIMATED': { bg: 'bg-indigo-100 dark:bg-indigo-900', text: 'text-indigo-700 dark:text-indigo-300', label: 'Estimated' },
  'DEPARTED': { bg: 'bg-amber-100 dark:bg-amber-900', text: 'text-amber-700 dark:text-amber-300', label: 'Departed' },
  'PRE_ARRIVAL': { bg: 'bg-teal-100 dark:bg-teal-900', text: 'text-teal-700 dark:text-teal-300', label: 'Pre-Arrival' },
  'ARRIVED': { bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-700 dark:text-green-300', label: 'Arrived' },
}
const STATUS_FALLBACK = { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-300', label: 'Unknown' }

const LEG_TYPE_ICON_COLORS: Record<string, string> = {
  TRUCK: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  SHIP: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  RAIL: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  AIR: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
}

const LEG_TYPE_ICONS: Record<string, React.ElementType> = {
  TRUCK: Truck,
  SHIP: Ship,
  RAIL: TrainFront,
  AIR: Plane,
}

const RENDERERS: Record<string, (value: unknown, rowData: Record<string, unknown>) => React.ReactNode> = {
  referenceNumber: (value, rowData) => {
    const fileId = rowData.fileId as string | null
    if (!fileId) return React.createElement('span', { className: 'font-mono text-xs text-foreground' }, value as string)
    return React.createElement('a', {
      href: `/backend/fms-files/${fileId}`,
      className: 'font-mono text-xs text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300',
      onClick: (e: MouseEvent) => e.stopPropagation(),
    }, value as string)
  },

  status: (value) => {
    const status = value as string | null
    if (!status) return null
    const colors = STATUS_COLORS[status] ?? STATUS_FALLBACK
    return React.createElement('span', {
      className: `inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${colors.bg} ${colors.text}`,
    }, colors.label)
  },

  cargoType: (value) => {
    const ct = value as string | null
    if (!ct) return null
    const color = ct === 'FCL'
      ? 'text-blue-600 border-blue-300 dark:text-blue-400 dark:border-blue-700'
      : 'text-purple-600 border-purple-300 dark:text-purple-400 dark:border-purple-700'
    return React.createElement('span', {
      className: `inline-flex px-1.5 rounded text-[10px] font-semibold border ${color}`,
    }, ct)
  },

  shipmentType: (value) =>
    React.createElement('span', {
      className: 'inline-flex px-1.5 rounded text-[10px] font-medium border border-border text-muted-foreground',
    }, value as string),

  containerCommodity: (_value, rowData) => {
    const containerNumber = rowData.containerNumber as string | null
    const commodity = rowData.commodityDescription as string | null
    const cargoType = rowData.cargoType as string | null

    if (cargoType === 'FCL') {
      return React.createElement('span', { className: 'font-mono text-xs text-foreground' }, containerNumber ?? '(TBD)')
    }
    const text = commodity ?? '-'
    const truncated = text.length > 35 ? text.substring(0, 35) + '...' : text
    return React.createElement('span', { className: 'text-xs text-foreground', title: text }, truncated)
  },

  legType: (value) => {
    if (!value) {
      return React.createElement('span', {
        className: 'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
      }, 'UNASSIGNED')
    }
    const type = value as string
    const colorClass = LEG_TYPE_ICON_COLORS[type] ?? LEG_TYPE_ICON_COLORS.TRUCK
    const IconComponent = LEG_TYPE_ICONS[type] ?? Truck
    return React.createElement('span', {
      className: `inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${colorClass}`,
    },
      React.createElement(IconComponent, { className: 'w-3 h-3' }),
      type,
    )
  },

  timestampHistory: ((value: any, rowData: any, colConfig: any) => {
    const field = colConfig?.data as string
    const timestamps = rowData[`${field}Timestamps`] as TimestampEntry[] | null
    return React.createElement(TimestampHistoryCell, { value: value as string | null, timestamps })
  }) as any,

  weight: (value, rowData) => {
    const weight = value as number | null
    const unit = rowData.weightUnit as string | null
    if (weight != null) {
      return React.createElement('span', { className: 'text-xs text-foreground' }, `${weight.toLocaleString()} ${unit ?? 'kg'}`)
    }
    return React.createElement('span', { className: 'text-xs text-muted-foreground' }, '-')
  },

  volume: (value, rowData) => {
    const vol = value as number | null
    const unit = rowData.volumeUnit as string | null
    if (vol != null) {
      return React.createElement('span', { className: 'text-xs text-foreground' }, `${vol} ${unit ?? ''}`)
    }
    return null
  },

  hazardous: (value) => {
    if (value) {
      return React.createElement(AlertTriangle, { className: 'w-3.5 h-3.5 text-amber-500' })
    }
    return null
  },

  cutoffDatetime: (value) => {
    if (value == null || value === '') return React.createElement('span', { className: 'text-muted-foreground text-xs' }, '—')
    const d = new Date(value as string)
    if (Number.isNaN(d.getTime())) return React.createElement('span', { className: 'text-xs' }, value as string)
    return React.createElement('span', { className: 'text-xs' }, formatTimestampValue(value as string))
  },

  locationName: (value) => {
    const str = String(value || '')
    if (!str) return React.createElement('span', { className: 'text-muted-foreground text-xs' }, '—')
    try {
      const parsed = JSON.parse(str)
      if (parsed?.name) return React.createElement('span', { className: 'text-xs' }, parsed.name)
      if (parsed?.id) return React.createElement('span', { className: 'text-muted-foreground text-xs' }, '—')
    } catch { /* plain string */ }
    return React.createElement('span', { className: 'text-xs' }, str)
  },
}

// ─── Editors ──────────────────────────────────────────────────────────────────

const EDITORS = {
  'entitySearch-location': createEntitySearchEditor({
    entityType: 'fms_locations:fms_location',
    extractValue: (r: any) => JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
    placeholder: 'Search location…',
    minQueryLength: 2,
  }),
  'entitySearch-carrier': createEntitySearchEditor({
    entityType: 'fms_products:fms_carrier',
    extractValue: (r: any) => JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
    placeholder: 'Search carrier…',
    minQueryLength: 1,
  }),
  'datetime': createDateTimeEditor(),
}

// ─── Save routing ─────────────────────────────────────────────────────────────

// Fields owned by FmsFileUnit
const UNIT_FIELDS = new Set(['containerNumber', 'containerType', 'commodityDescription', 'grossWeight', 'weightUnit', 'volume', 'volumeUnit', 'isHazardous', 'packageCount'])
// Fields owned by FmsFileUnitLeg (non-timestamp)
const UNIT_LEG_FIELDS = new Set(['truckPlate', 'trailerPlate', 'driverFullName', 'driverPhone', 'sealNumber', 'unitBl', 'consolidationContainer', 'notes'])
// Plain fields owned by FmsFileLeg (no JSON parsing needed)
const LEG_DIRECT_FIELDS = new Set(['bookingNumber', 'masterBl', 'vesselName', 'voyageNumber', 'gateInCutoff', 'documentationCutoff', 'vgmCutoff', 'dangerousGoodsCutoff', 'demFreeTime', 'detFreeTime'])
// Columns that are only relevant for SHIP legs — hidden on all other tabs
const SHIP_ONLY_COLUMNS = new Set(['gateInCutoff', 'documentationCutoff', 'vgmCutoff', 'dangerousGoodsCutoff', 'demFreeTime', 'detFreeTime'])
// All 6 timestamp columns — routing depends on leg type (TRUCK → unit-leg, others → leg SCD array)
const ALL_TIMESTAMP_FIELDS = new Set(['ptd', 'etd', 'atd', 'pta', 'eta', 'ata'])
/** Parse a suffixed prop like "ptd_1" → { base: "ptd", legIndex: 1 }, or "ptd" → { base: "ptd", legIndex: null } */
function parseLegProp(prop: string): { base: string; legIndex: number | null } {
  const match = prop.match(/^(.+?)_(\d+)$/)
  if (match) return { base: match[1], legIndex: parseInt(match[2], 10) }
  return { base: prop, legIndex: null }
}
// Field name mappings: transport page column → API field
const UNIT_LEG_FIELD_MAP: Record<string, string> = { unitBl: 'blNumber', consolidationContainer: 'consolidationContainerNumber' }
const LEG_FIELD_MAP: Record<string, string> = { masterBl: 'blNumber' }

// ─── Table content (keyed per tab) ────────────────────────────────────────────

interface TransportTableProps {
  columns: ColumnDef[]
  extraParams: Record<string, string>
  topBar: React.ReactNode
  onRowAction: (actionId: string, rowData: Record<string, unknown>) => void
  actionsRenderer?: (rowData: Record<string, unknown>, rowIndex: number) => React.ReactNode
}

function TransportTable({ columns, extraParams, topBar, onRowAction, actionsRenderer }: TransportTableProps) {
  const queryClient = useQueryClient()
  const dataRef = useRef<any[]>([])

  const keyboardShortcuts = useMemo((): KeyboardShortcutsConfig => ({
    rowActions: [
      { id: 'view', label: 'Open file', key: 'Enter', shift: true },
    ],
  }), [])

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

  const table = useDynamicTablePage({
    source: '/api/fms_files/transport',
    columns,
    tableName: 'FMS Transport (New)',
    perspectives: 'fms-files-transport',
    defaultSort: { field: 'containerNumber', direction: 'asc' },
    defaultPageSize: 100,
    queryKey: 'fms-files-transport',
    extraParams,
    idColumn: 'unitId',
    tableProps: {
      height: 'fill',
      keyboardShortcuts,
      enableComments: true,
      commentsEntityType: 'fms_file_unit',
      commentsViewContext: 'transport',
      uiConfig: {
        hideAddRowButton: true,
        enableFullscreen: true,
        borderless: true,
        topBarStart: topBar,
      },
    },
  })

  const tableRef = table.props.tableRef

  // Keep dataRef in sync so event handlers always see the latest page data
  useEffect(() => { dataRef.current = table.props.data ?? [] }, [table.props.data])

  // Context menu action handler (weight/volume unit changes)
  useEffect(() => {
    const el = (tableRef as React.RefObject<HTMLDivElement>)?.current
    if (!el) return

    const handler = async (e: Event) => {
      const { rowData, col, actionId } = (e as CustomEvent<CellContextMenuEvent>).detail
      const unitId = rowData?.unitId as string | undefined
      const fileId = rowData?.fileId as string | undefined
      if (!unitId || !fileId) return
      const field = col.data === 'grossWeight' ? 'weightUnit' : col.data === 'volume' ? 'volumeUnit' : null
      if (!field) return
      await apiCall(`/api/fms_files/files/${fileId}/units/${unitId}`, {
        method: 'PUT',
        body: JSON.stringify({ [field]: actionId }),
      })
      queryClient.invalidateQueries({ queryKey: ['fms-files-transport'] })
    }

    el.addEventListener(TableEvents.CELL_CONTEXT_MENU_ACTION, handler)
    return () => el.removeEventListener(TableEvents.CELL_CONTEXT_MENU_ACTION, handler)
  }, [queryClient, tableRef])

  // Cell save: route to unit / unit-leg / leg API based on the column
  useEffect(() => {
    const el = (tableRef as React.RefObject<HTMLDivElement>)?.current
    if (!el) return

    const handler = async (e: Event) => {
      const { rowIndex, prop, newValue, colIndex } = (e as CustomEvent<CellEditSaveEvent>).detail
      const row = dataRef.current[rowIndex] as any
      if (!row) return

      const fileId = row.fileId as string
      const unitId = row.unitId as string
      const legId = row.legId as string | null
      const unitLegId = row.id as string // FmsFileUnitLeg.id for leg rows, unit id for unit rows

      const value = newValue === '' ? null : newValue
      let res: Awaited<ReturnType<typeof apiCall>> | undefined

      if (prop === 'legOrigin' || prop === 'legDestination') {
        if (!legId) return
        const apiField = prop === 'legOrigin' ? 'originLocationId' : 'destinationLocationId'
        let locationId: string | null = null
        try { locationId = JSON.parse(String(value ?? '')).id ?? null } catch { /* plain string */ }
        if (!locationId) return
        res = await apiCall(`/api/fms_files/files/${fileId}/legs/${legId}`, {
          method: 'PUT', body: JSON.stringify({ [apiField]: locationId }),
        })
      } else if (prop === 'carrierName') {
        if (!legId) return
        let carrierId: string | null = null
        try { carrierId = JSON.parse(String(value ?? '')).id ?? null } catch { /* ignore */ }
        res = await apiCall(`/api/fms_files/files/${fileId}/legs/${legId}`, {
          method: 'PUT', body: JSON.stringify({ carrierId }),
        })
      } else if (prop === 'unitOrigin' || prop === 'unitDestination') {
        const apiField = prop === 'unitOrigin' ? 'originLocationId' : 'destinationLocationId'
        let locationId: string | null = null
        try { locationId = JSON.parse(String(value ?? '')).id ?? null } catch { /* plain string */ }
        if (!locationId) return
        res = await apiCall(`/api/fms_files/files/${fileId}/units/${unitId}`, {
          method: 'PUT', body: JSON.stringify({ [apiField]: locationId }),
        })
      } else if (ALL_TIMESTAMP_FIELDS.has(prop) || ALL_TIMESTAMP_FIELDS.has(parseLegProp(prop).base)) {
        const { base, legIndex } = parseLegProp(prop)
        // For Units tab, resolve legId/unitLegId/legType from the _N suffix
        const resolvedLegId = legIndex ? (row[`legId_${legIndex}`] as string | null) : legId
        const resolvedUnitLegId = legIndex ? (row[`unitLegId_${legIndex}`] as string | null) : unitLegId
        const resolvedLegType = legIndex ? (row[`legType_${legIndex}`] as string | null) : (row.legType as string | null)

        if (resolvedLegType === 'TRUCK') {
          // Truck: per-unit-leg simple text field (each truck departs/arrives independently)
          if (!resolvedUnitLegId) return
          res = await apiCall(`/api/fms_files/unit-legs/${resolvedUnitLegId}`, {
            method: 'PUT', body: JSON.stringify({ [base]: value ? String(value) : null }),
          })
        } else {
          // Ship/Rail/Air: leg-level SCD timestamp (shared by all units on this leg)
          if (!resolvedLegId) return
          if (!value) return // SCD arrays don't support clearing — skip
          res = await apiCall(`/api/fms_files/files/${fileId}/legs/${resolvedLegId}/timestamps`, {
            method: 'POST', body: JSON.stringify({ timestampType: base, value: String(value) }),
          })
        }
      } else if (LEG_DIRECT_FIELDS.has(prop)) {
        if (!legId) return
        res = await apiCall(`/api/fms_files/files/${fileId}/legs/${legId}`, {
          method: 'PUT', body: JSON.stringify({ [LEG_FIELD_MAP[prop] ?? prop]: value }),
        })
      } else if (UNIT_FIELDS.has(prop)) {
        res = await apiCall(`/api/fms_files/files/${fileId}/units/${unitId}`, {
          method: 'PUT', body: JSON.stringify({ [prop]: value }),
        })
      } else if (UNIT_LEG_FIELDS.has(prop)) {
        if (!legId) return // no unit-leg on the units tab
        res = await apiCall(`/api/fms_files/unit-legs/${unitLegId}`, {
          method: 'PUT', body: JSON.stringify({ [UNIT_LEG_FIELD_MAP[prop] ?? prop]: value }),
        })
      } else {
        return
      }

      if (res?.ok) {
        dispatch<CellSaveSuccessEvent>(el, TableEvents.CELL_SAVE_SUCCESS, { rowIndex, colIndex })
        queryClient.invalidateQueries({ queryKey: ['fms-files-transport'] })
      } else {
        dispatch<CellSaveErrorEvent>(el, TableEvents.CELL_SAVE_ERROR, { rowIndex, colIndex, error: 'Save failed' })
      }
    }

    el.addEventListener(TableEvents.CELL_EDIT_SAVE, handler)
    return () => el.removeEventListener(TableEvents.CELL_EDIT_SAVE, handler)
  }, [queryClient, tableRef])

  return (
    <DynamicTable
      {...table.props}
      onRowAction={onRowAction}
      actionsRenderer={actionsRenderer}
      cellActions={cellActions}
      pagination={{
        ...table.props.pagination!,
        limitOptions: [50, 100, 200],
      }}
    />
  )
}

// ─── Units-tab column definitions ────────────────────────────────────────────

const UNITS_BASE_COLUMNS: ColumnDef[] = [
  { data: 'referenceNumber', title: 'Reference #', width: 210, readOnly: true, renderer: RENDERERS.referenceNumber },
  { data: 'containerNumber', title: 'Container / Commodity', width: 200, readOnly: false, renderer: RENDERERS.containerCommodity },
  { data: 'containerType', title: 'Cnt Type', width: 70, readOnly: false },
  { data: 'cargoType', title: 'Type', width: 55, readOnly: true, renderer: RENDERERS.cargoType },
  { data: 'shipmentType', title: 'Ship', width: 55, readOnly: true, renderer: RENDERERS.shipmentType },
  { data: 'grossWeight', title: 'Weight', width: 100, readOnly: false, renderer: RENDERERS.weight },
  { data: 'volume', title: 'Volume', width: 80, readOnly: false, renderer: RENDERERS.volume },
  { data: 'isHazardous', title: 'Haz', width: 45, type: 'boolean' as const, readOnly: false, renderer: RENDERERS.hazardous },
  { data: 'packageCount', title: 'Pkgs', width: 55, readOnly: false },
  { data: 'unitOrigin', title: 'Unit Origin', width: 140, readOnly: false, editor: EDITORS['entitySearch-location'], renderer: RENDERERS.locationName },
  { data: 'unitDestination', title: 'Unit Dest', width: 140, readOnly: false, editor: EDITORS['entitySearch-location'], renderer: RENDERERS.locationName },
  { data: 'contractorName', title: 'Client', width: 140, readOnly: true },
  { data: 'assigneeName', title: 'Assignee', width: 115, readOnly: true },
]

function generateLegColumns(maxLegs: number): ColumnDef[] {
  const cols: ColumnDef[] = []
  for (let i = 1; i <= maxLegs; i++) {
    const p = (s: string) => `${s}_${i}`
    const t = (s: string) => `${s} ${i}`
    // Identity
    cols.push({ data: p('legType'), title: t('Leg') + ' Mode', width: 70, readOnly: true, renderer: RENDERERS.legType })
    cols.push({ data: p('legOrigin'), title: t('Leg') + ' Origin', width: 150, readOnly: true })
    cols.push({ data: p('legDestination'), title: t('Leg') + ' Dest', width: 150, readOnly: true })
    cols.push({ data: p('carrierName'), title: t('Carrier'), width: 120, readOnly: true })
    // Timestamps
    const dtEditor = EDITORS['datetime']
    cols.push({ data: p('ptd'), title: t('PTD'), width: 90, readOnly: false, renderer: RENDERERS.timestampHistory, editor: dtEditor })
    cols.push({ data: p('etd'), title: t('ETD'), width: 90, readOnly: false, renderer: RENDERERS.timestampHistory, editor: dtEditor })
    cols.push({ data: p('atd'), title: t('ATD'), width: 100, readOnly: false, renderer: RENDERERS.timestampHistory, editor: dtEditor })
    cols.push({ data: p('pta'), title: t('PTA'), width: 90, readOnly: false, renderer: RENDERERS.timestampHistory, editor: dtEditor })
    cols.push({ data: p('eta'), title: t('ETA'), width: 90, readOnly: false, renderer: RENDERERS.timestampHistory, editor: dtEditor })
    cols.push({ data: p('ata'), title: t('ATA'), width: 100, readOnly: false, renderer: RENDERERS.timestampHistory, editor: dtEditor })
    // Booking / vessel
    cols.push({ data: p('bookingNumber'), title: t('Booking #'), width: 130, readOnly: true })
    cols.push({ data: p('masterBl'), title: t('Master B/L'), width: 140, readOnly: true })
    cols.push({ data: p('vesselName'), title: t('Vessel'), width: 130, readOnly: true })
    cols.push({ data: p('voyageNumber'), title: t('Voyage'), width: 90, readOnly: true })
    cols.push({ data: p('flightNumber'), title: t('Flight #'), width: 90, readOnly: true })
    // Cutoffs & free time
    cols.push({ data: p('gateInCutoff'), title: t('Gate-in C/O'), width: 120, readOnly: true, renderer: RENDERERS.cutoffDatetime })
    cols.push({ data: p('documentationCutoff'), title: t('Docs C/O'), width: 120, readOnly: true, renderer: RENDERERS.cutoffDatetime })
    cols.push({ data: p('vgmCutoff'), title: t('VGM C/O'), width: 120, readOnly: true, renderer: RENDERERS.cutoffDatetime })
    cols.push({ data: p('dangerousGoodsCutoff'), title: t('DG C/O'), width: 120, readOnly: true, renderer: RENDERERS.cutoffDatetime })
    cols.push({ data: p('demFreeTime'), title: t('DEM (days)'), width: 90, readOnly: true })
    cols.push({ data: p('detFreeTime'), title: t('DET (days)'), width: 90, readOnly: true })
    // Unit-leg assignment
    cols.push({ data: p('truckPlate'), title: t('Truck Plate'), width: 100, readOnly: true })
    cols.push({ data: p('trailerPlate'), title: t('Trailer'), width: 95, readOnly: true })
    cols.push({ data: p('driverFullName'), title: t('Driver'), width: 125, readOnly: true })
    cols.push({ data: p('sealNumber'), title: t('Seal #'), width: 95, readOnly: true })
    cols.push({ data: p('unitBl'), title: t('Unit B/L'), width: 150, readOnly: true })
    cols.push({ data: p('notes'), title: t('Notes'), width: 150, readOnly: true })
  }
  return cols
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FmsFilesTransportPage() {
  const router = useRouter()
  const [selectedTab, setSelectedTab] = useState<TabId>('ALL')
  const [truckRow, setTruckRow] = useState<TruckRowData | null>(null)
  const [airRow, setAirRow] = useState<AirRowData | null>(null)
  const [shipmentId, setShipmentId] = useState<string | null>(null)

  const { data: tableConfig, isLoading: configLoading } = useQuery({
    queryKey: ['fms-files-transport-table-config'],
    queryFn: async () => {
      const response = await apiCall<{ columns: Array<{ data: string; title: string; width: number; type?: string; readOnly?: boolean; renderer?: string; editor?: string }> }>('/api/fms_files/transport/table-config')
      if (!response.ok) throw new Error('Failed to load table config')
      return response.result
    },
  })

  const { data: unitsMeta, isLoading: unitsMetaLoading } = useQuery({
    queryKey: ['fms-transport-units-meta'],
    queryFn: async () => {
      const response = await apiCall<{ meta?: { maxLegs?: number } }>('/api/fms_files/transport?view=units&page=1&limit=1')
      if (!response.ok) throw new Error('Failed to load units meta')
      return response.result?.meta
    },
    enabled: selectedTab === 'UNITS',
    staleTime: 60_000,
  })

  const columns = useMemo((): ColumnDef[] => {
    if (!tableConfig?.columns) return []
    return tableConfig.columns
      .filter((col) => selectedTab === 'SEA' || selectedTab === 'ALL' || !SHIP_ONLY_COLUMNS.has(col.data))
      .map((col) => {
        const renderer = col.renderer ? RENDERERS[col.renderer] : undefined
        const editor = col.editor ? EDITORS[col.editor as keyof typeof EDITORS] : undefined
        return {
          ...col,
          type: col.type === 'checkbox' ? 'boolean' : col.type,
          renderer,
          editor,
        } as ColumnDef
      })
  }, [tableConfig, selectedTab])

  const unitsColumns = useMemo((): ColumnDef[] => {
    const maxLegs = unitsMeta?.maxLegs ?? 0
    return [...UNITS_BASE_COLUMNS, ...generateLegColumns(maxLegs)]
  }, [unitsMeta])

  const extraParams = useMemo((): Record<string, string> => {
    if (selectedTab === 'UNITS') return { view: 'units' }
    if (selectedTab === 'ALL') return {}
    return { legType: LEG_TYPE_CONFIG[selectedTab].legType }
  }, [selectedTab])

  const handleRowAction = useCallback((actionId: string, rowData: Record<string, unknown>) => {
    if (actionId === 'view') {
      const fileId = rowData.fileId as string
      if (fileId) {
        router.push(`/backend/fms-files/${fileId}`)
      }
    }
  }, [router])

  const actionsRenderer = useCallback((rowData: Record<string, unknown>) => {
    const legType = rowData.legType as string | null
    if (legType === 'TRUCK') {
      return (
        <button
          type="button"
          title="Truck leg details"
          className="p-1 text-muted-foreground hover:text-primary transition-colors"
          onClick={() => setTruckRow({
            containerNumber: rowData.containerNumber as string | null,
            containerType: rowData.containerType as string | null,
            commodityDescription: rowData.commodityDescription as string | null,
            grossWeight: rowData.grossWeight != null ? String(rowData.grossWeight) : null,
            weightUnit: rowData.weightUnit as string | null,
            packageCount: rowData.packageCount as number | null,
            isHazardous: rowData.isHazardous as boolean | null,
            originName: rowData.legOrigin as string | null,
            destinationName: rowData.legDestination as string | null,
            carrierName: rowData.carrierName as string | null,
            bookingNumber: rowData.bookingNumber as string | null,
            truckPlate: rowData.truckPlate as string | null,
            trailerPlate: rowData.trailerPlate as string | null,
            driverFullName: rowData.driverFullName as string | null,
            driverIdNumber: rowData.driverIdNumber as string | null,
            driverPhone: rowData.driverPhone as string | null,
            ptd: rowData.ptd as string | null,
            etd: rowData.etd as string | null,
            atd: rowData.atd as string | null,
            pta: rowData.pta as string | null,
            eta: rowData.eta as string | null,
            ata: rowData.ata as string | null,
            notes: rowData.notes as string | null,
          })}
        >
          <ExternalLink className="h-4 w-4" />
        </button>
      )
    }
    if (legType === 'AIR') {
      return (
        <button
          type="button"
          title="Air leg details"
          className="p-1 text-muted-foreground hover:text-primary transition-colors"
          onClick={() => setAirRow({
            containerNumber: rowData.containerNumber as string | null,
            containerType: rowData.containerType as string | null,
            commodityDescription: rowData.commodityDescription as string | null,
            grossWeight: rowData.grossWeight != null ? String(rowData.grossWeight) : null,
            weightUnit: rowData.weightUnit as string | null,
            packageCount: rowData.packageCount as number | null,
            isHazardous: rowData.isHazardous as boolean | null,
            originName: rowData.legOrigin as string | null,
            destinationName: rowData.legDestination as string | null,
            carrierName: rowData.carrierName as string | null,
            flightNumber: rowData.flightNumber as string | null,
            aircraftType: rowData.aircraftType as string | null,
            bookingNumber: rowData.bookingNumber as string | null,
            legBlNumber: rowData.masterBl as string | null,
            blNumber: rowData.unitBl as string | null,
            sealNumber: rowData.sealNumber as string | null,
            ptd: rowData.ptd as string | null,
            etd: rowData.etd as string | null,
            atd: rowData.atd as string | null,
            pta: rowData.pta as string | null,
            eta: rowData.eta as string | null,
            ata: rowData.ata as string | null,
            etdTimestamps: rowData.etdTimestamps as AirRowData['etdTimestamps'],
            etaTimestamps: rowData.etaTimestamps as AirRowData['etaTimestamps'],
            notes: rowData.notes as string | null,
          })}
        >
          <ExternalLink className="h-4 w-4" />
        </button>
      )
    }
    if (legType === 'SHIP') {
      const trackedShipmentId = rowData.trackedShipmentId as string | null
      if (!trackedShipmentId) return null
      return (
        <button
          type="button"
          title="Shipment tracking"
          className="p-1 text-muted-foreground hover:text-primary transition-colors"
          onClick={() => setShipmentId(trackedShipmentId)}
        >
          <ExternalLink className="h-4 w-4" />
        </button>
      )
    }
    return null
  }, [])

  const topBar = React.createElement(
    'div',
    { className: 'flex items-center gap-0' },
    React.createElement(
      'button',
      {
        className: `px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${selectedTab === 'UNITS' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`,
        onClick: () => setSelectedTab('UNITS'),
        type: 'button',
      },
      'Units',
    ),
    React.createElement(
      'button',
      {
        className: `px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${selectedTab === 'ALL' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`,
        onClick: () => setSelectedTab('ALL'),
        type: 'button',
      },
      'All',
    ),
    ...TYPE_TABS.map((tabId) => {
      const cfg = LEG_TYPE_CONFIG[tabId]
      const Icon = cfg.icon
      const isActive = selectedTab === tabId
      return React.createElement(
        'button',
        {
          key: tabId,
          className: `px-2.5 py-1.5 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${isActive ? `border-current ${cfg.textClass}` : 'border-transparent text-muted-foreground hover:text-foreground'}`,
          onClick: () => setSelectedTab(tabId),
          type: 'button',
        },
        React.createElement(Icon, { className: 'w-3.5 h-3.5 shrink-0' }),
        tabId === 'SEA' ? 'Sea' : tabId.charAt(0) + tabId.slice(1).toLowerCase(),
      )
    }),
  )

  const isLoadingConfig = configLoading || (selectedTab === 'UNITS' && unitsMetaLoading && !unitsMeta)

  if (isLoadingConfig) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground text-sm">Loading table configuration...</p>
      </div>
    )
  }

  const activeColumns = selectedTab === 'UNITS' ? unitsColumns : columns

  return (
    <>
      <div className="-mx-4 lg:-mx-6 -mb-4 lg:-mb-6 -mt-7 lg:-mt-9">
        <TransportTable
          key={selectedTab}
          columns={activeColumns}
          extraParams={extraParams}
          topBar={topBar}
          onRowAction={handleRowAction}
          actionsRenderer={selectedTab !== 'UNITS' ? actionsRenderer : undefined}
        />
      </div>
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
      <FmsFileShipmentDrawer
        open={!!shipmentId}
        onOpenChange={(open) => { if (!open) setShipmentId(null) }}
        shipmentId={shipmentId}
      />
    </>
  )
}
