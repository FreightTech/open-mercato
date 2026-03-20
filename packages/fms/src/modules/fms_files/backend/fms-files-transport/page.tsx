'use client'

import * as React from 'react'
import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DynamicTable, createEntitySearchEditor } from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef, KeyboardShortcutsConfig, ContextMenuAction, CellContextMenuEvent, CellEditSaveEvent, CellSaveSuccessEvent, CellSaveErrorEvent } from '@open-mercato/ui/backend/dynamic-table'
import { useDynamicTablePage, TableEvents, dispatch } from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { AlertTriangle, Ship, Truck, TrainFront, Plane } from 'lucide-react'

// ─── Tab types ────────────────────────────────────────────────────────────────

type TabId = 'UNITS' | 'ALL' | 'TRUCK' | 'RAIL' | 'AIR' | 'SEA'

const LEG_TYPE_CONFIG: Record<string, { icon: React.ElementType; textClass: string; legType: string }> = {
  TRUCK: { icon: Truck,      textClass: 'text-orange-600 dark:text-orange-400', legType: 'TRUCK' },
  RAIL:  { icon: TrainFront, textClass: 'text-green-600 dark:text-green-400',  legType: 'RAIL'  },
  AIR:   { icon: Plane,      textClass: 'text-purple-600 dark:text-purple-400', legType: 'AIR'  },
  SEA:   { icon: Ship,       textClass: 'text-blue-600 dark:text-blue-400',    legType: 'SHIP'  },
}

const TYPE_TABS: TabId[] = ['TRUCK', 'RAIL', 'AIR', 'SEA']

// ─── Renderers ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  'Empty': { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-300' },
  'Planning': { bg: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-700 dark:text-blue-300' },
  'Ready': { bg: 'bg-indigo-100 dark:bg-indigo-900', text: 'text-indigo-700 dark:text-indigo-300' },
  'In Transit': { bg: 'bg-amber-100 dark:bg-amber-900', text: 'text-amber-700 dark:text-amber-300' },
  'Delivered': { bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-700 dark:text-green-300' },
  'Partially Delivered': { bg: 'bg-yellow-100 dark:bg-yellow-900', text: 'text-yellow-700 dark:text-yellow-300' },
}

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
    const colors = STATUS_COLORS[status] ?? STATUS_COLORS['Empty']
    return React.createElement('span', {
      className: `inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${colors.bg} ${colors.text}`,
    }, status)
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

  etaWithCount: (value, rowData) => {
    const count = rowData.etaUpdateCount as number
    if (!value) return React.createElement('span', { className: 'text-xs text-muted-foreground' }, '-')
    return React.createElement('span', { className: 'text-xs' },
      value as string,
      count > 1 ? React.createElement('span', { key: 'c', className: 'ml-1 text-amber-500 text-[10px]' }, `(${count}x)`) : null,
    )
  },

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
}

// ─── Save routing ─────────────────────────────────────────────────────────────

// Fields owned by FmsFileUnit
const UNIT_FIELDS = new Set(['containerNumber', 'containerType', 'commodityDescription', 'grossWeight', 'weightUnit', 'volume', 'volumeUnit', 'isHazardous', 'packageCount'])
// Fields owned by FmsFileUnitLeg
const UNIT_LEG_FIELDS = new Set(['truckPlate', 'trailerPlate', 'driverFullName', 'driverPhone', 'sealNumber', 'unitBl', 'consolidationContainer', 'notes', 'ptd', 'pta'])
// Plain fields owned by FmsFileLeg (no JSON parsing needed)
const LEG_DIRECT_FIELDS = new Set(['bookingNumber', 'masterBl', 'vesselName', 'voyageNumber'])
// SCD timestamp fields on FmsFileLeg — each edit appends a new manual entry
const LEG_TIMESTAMP_FIELDS = new Set(['etd', 'atd', 'eta', 'ata'])
// Field name mappings: transport page column → API field
const UNIT_LEG_FIELD_MAP: Record<string, string> = { unitBl: 'blNumber', consolidationContainer: 'consolidationContainerNumber' }
const LEG_FIELD_MAP: Record<string, string> = { masterBl: 'blNumber' }

// ─── Table content (keyed per tab) ────────────────────────────────────────────

interface TransportTableProps {
  columns: ColumnDef[]
  extraParams: Record<string, string>
  topBar: React.ReactNode
  onRowAction: (actionId: string, rowData: Record<string, unknown>) => void
}

function TransportTable({ columns, extraParams, topBar, onRowAction }: TransportTableProps) {
  const queryClient = useQueryClient()
  const tableRef = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    const el = tableRef.current
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
  }, [queryClient])

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

  // Keep dataRef in sync so event handlers always see the latest page data
  useEffect(() => { dataRef.current = table.props.data }, [table.props.data])

  // Cell save: route to unit / unit-leg / leg API based on the column
  useEffect(() => {
    const el = tableRef.current
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
      } else if (LEG_TIMESTAMP_FIELDS.has(prop)) {
        if (!legId || !value) return
        res = await apiCall(`/api/fms_files/files/${fileId}/legs/${legId}/timestamps`, {
          method: 'POST', body: JSON.stringify({ timestampType: prop, value: String(value) }),
        })
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
  }, [queryClient])

  return (
    <DynamicTable
      {...table.props}
      tableRef={tableRef}
      onRowAction={onRowAction}
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
    cols.push({ data: `legType_${i}`, title: `Leg ${i} Mode`, width: 70, readOnly: true, renderer: RENDERERS.legType })
    cols.push({ data: `legOrigin_${i}`, title: `Leg ${i} Origin`, width: 150, readOnly: true })
    cols.push({ data: `legDestination_${i}`, title: `Leg ${i} Dest`, width: 150, readOnly: true })
    cols.push({ data: `carrierName_${i}`, title: `Leg ${i} Carrier`, width: 120, readOnly: true })
    cols.push({ data: `etd_${i}`, title: `ETD ${i}`, width: 90, readOnly: true })
    cols.push({ data: `eta_${i}`, title: `ETA ${i}`, width: 90, readOnly: true })
    cols.push({ data: `atd_${i}`, title: `ATD ${i}`, width: 100, readOnly: true })
    cols.push({ data: `ata_${i}`, title: `ATA ${i}`, width: 100, readOnly: true })
  }
  return cols
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FmsFilesTransportPage() {
  const router = useRouter()
  const [selectedTab, setSelectedTab] = useState<TabId>('ALL')

  const { data: tableConfig, isLoading: configLoading } = useQuery({
    queryKey: ['fms-files-transport-table-config'],
    queryFn: async () => {
      const response = await apiCall<{ columns: Array<{ data: string; title: string; width: number; type?: string; readOnly?: boolean; renderer?: string }> }>('/api/fms_files/transport/table-config')
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
    return tableConfig.columns.map((col) => {
      const renderer = col.renderer ? RENDERERS[col.renderer] : undefined
      const editor = col.editor ? EDITORS[col.editor as keyof typeof EDITORS] : undefined
      return {
        ...col,
        type: col.type === 'checkbox' ? 'boolean' : col.type,
        renderer,
        editor,
      } as ColumnDef
    })
  }, [tableConfig])

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
    <div className="-mx-4 lg:-mx-6 -mb-4 lg:-mb-6 -mt-7 lg:-mt-9">
      <TransportTable
        key={selectedTab}
        columns={activeColumns}
        extraParams={extraParams}
        topBar={topBar}
        onRowAction={handleRowAction}
      />
    </div>
  )
}
