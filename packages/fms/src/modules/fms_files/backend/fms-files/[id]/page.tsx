'use client'

import * as React from 'react'
import { useRef, useMemo, useState, useCallback, useEffect, useLayoutEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, AlertTriangle, ChevronDown, Trash2, PanelRightOpen, PanelRightClose } from 'lucide-react'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Button } from '@open-mercato/ui/primitives/button'
import { Popover, PopoverContent, PopoverTrigger } from '@open-mercato/ui/primitives/popover'
import { Input } from '@open-mercato/ui/primitives/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@open-mercato/ui/primitives/tabs'
import { DynamicTable } from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef, CellEditSaveEvent, CellSaveSuccessEvent, CellSaveErrorEvent, NewRowSaveEvent, NewRowSaveSuccessEvent, NewRowSaveErrorEvent } from '@open-mercato/ui/backend/dynamic-table'
import { dispatch, TableEvents } from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { LoadingMessage } from '@open-mercato/ui/backend/detail'
import {
  MOCK_FCL_FILE, MOCK_LCL_FILE,
  MOCK_FCL_UNITS, MOCK_LCL_UNITS,
  MOCK_LCL_PACKAGES,
  MOCK_FCL_LEGS, MOCK_LCL_LEGS,
  MOCK_FCL_UNITLEG_MAP, MOCK_LCL_UNITLEG_MAP,
} from '../../../data/mock'
import type { MockFile, MockLegRow, MockUnitRow, MockUnitLegRow, MockPackageRow } from '../../../data/mock'
import { StatusBadge } from '../../../components/StatusBadge'
import { AddLegDialog } from '../../../components/AddLegDialog'
import { AssignUnitsDialog } from '../../../components/AssignUnitsDialog'
import type { ExistingAssignment } from '../../../components/AssignUnitsDialog'
import { TransportView } from '../../../components/TransportView'
import { FileActivitySection } from '../../../components/FileActivitySection'

// ─── Column Definitions ───────────────────────────────────────────────────────

function fclUnitColumns(): ColumnDef[] {
  return [
    { data: 'containerNumber', title: 'Container #', width: 160, readOnly: false,
      renderer: (v: unknown) => React.createElement('span', { className: 'font-mono text-xs' }, (v as string) ?? '(TBD)') },
    { data: 'containerType', title: 'Type', width: 80, readOnly: false },
    { data: 'grossWeight', title: 'Weight (kg)', width: 110, readOnly: false },
    { data: 'commodityDescription', title: 'Commodity', width: 200, readOnly: false },
    { data: 'originName', title: 'Origin', width: 160, readOnly: true },
    { data: 'destinationName', title: 'Destination', width: 160, readOnly: true },
    { data: 'legCoverage', title: 'Cov.', width: 60, readOnly: true,
      renderer: (v: unknown) => {
        const val = v as string
        const isWarning = val?.startsWith('0/') ?? false
        return React.createElement('span', {
          className: `text-xs font-mono ${isWarning ? 'text-amber-500 font-semibold' : 'text-foreground'}`,
        }, isWarning ? `! ${val}` : val)
      } },
  ]
}

function lclUnitColumns(): ColumnDef[] {
  return [
    { data: 'commodityDescription', title: 'Commodity', width: 250, readOnly: false },
    { data: 'packageCount', title: 'Pkgs', width: 60, readOnly: false },
    { data: 'grossWeight', title: 'Weight (kg)', width: 110, readOnly: false },
    { data: 'volume', title: 'Volume (cbm)', width: 110, readOnly: false },
    { data: 'isHazardous', title: 'Haz', width: 45, readOnly: true,
      renderer: (v: unknown) => v ? React.createElement(AlertTriangle, { className: 'w-3.5 h-3.5 text-amber-500' }) : null },
    { data: 'originName', title: 'Origin', width: 140, readOnly: true },
    { data: 'destinationName', title: 'Destination', width: 140, readOnly: true },
    { data: 'legCoverage', title: 'Cov.', width: 60, readOnly: true },
  ]
}

function packageDetailColumns(): ColumnDef[] {
  return [
    { data: 'commodityDescription', title: 'Commodity', width: 180, readOnly: true },
    { data: 'packageCount', title: 'Pkgs', width: 55, readOnly: true },
    { data: 'packageType', title: 'Type', width: 55, readOnly: true },
    { data: 'grossWeight', title: 'Weight', width: 90, readOnly: true,
      renderer: (v: unknown, row: Record<string, unknown>) =>
        React.createElement('span', { className: 'text-xs' }, `${(v as number).toLocaleString()} ${row.weightUnit}`) },
    { data: 'volume', title: 'Volume', width: 80, readOnly: true,
      renderer: (v: unknown, row: Record<string, unknown>) =>
        React.createElement('span', { className: 'text-xs' }, `${v} ${row.volumeUnit}`) },
    { data: 'isHazardous', title: 'Haz?', width: 50, readOnly: true,
      renderer: (v: unknown) => v
        ? React.createElement('span', { className: 'text-amber-500 text-xs font-semibold' }, 'Yes')
        : React.createElement('span', { className: 'text-muted-foreground text-xs' }, 'No') },
  ]
}

function legsOverviewColumns(): ColumnDef[] {
  return [
    { data: 'legSequence', title: 'Seq', width: 45, readOnly: true },
    { data: 'type', title: 'Type', width: 65, readOnly: true,
      renderer: (v: unknown) => React.createElement(Badge, { variant: 'outline', className: 'text-[10px] px-1.5' }, v as string) },
    { data: 'originName', title: 'Origin', width: 160, readOnly: true },
    { data: 'destinationName', title: 'Destination', width: 160, readOnly: true },
    { data: 'carrierName', title: 'Carrier', width: 130, readOnly: true },
    { data: 'etd', title: 'ETD', width: 90, readOnly: true },
    { data: 'eta', title: 'ETA', width: 90, readOnly: true,
      renderer: (v: unknown, row: Record<string, unknown>) => {
        const count = row.etaUpdateCount as number
        if (!v) return React.createElement('span', { className: 'text-muted-foreground text-xs' }, '-')
        return React.createElement('span', { className: 'text-xs' },
          v as string,
          count > 1 ? React.createElement('span', { className: 'ml-1 text-amber-500 text-[10px]', key: 'cnt' }, `(${count}x)`) : null,
        )
      } },
  ]
}

function unitLegColumns(legType: string, isFCL: boolean): ColumnDef[] {
  const cols: ColumnDef[] = []

  if (isFCL) {
    cols.push(
      { data: 'containerNumber', title: 'Container #', width: 150, readOnly: true,
        renderer: (v: unknown) => React.createElement('span', { className: 'font-mono text-xs' }, (v as string) ?? '(TBD)') },
      { data: 'containerType', title: 'Type', width: 55, readOnly: true },
      { data: 'grossWeight', title: 'Weight', width: 90, readOnly: true,
        renderer: (v: unknown, row: Record<string, unknown>) =>
          React.createElement('span', { className: 'text-xs' }, v != null ? `${(v as number).toLocaleString()} ${row.weightUnit ?? 'kg'}` : '-') },
    )
  }

  if (legType === 'TRUCK') {
    cols.push(
      { data: 'truckPlate', title: 'Truck Plate', width: 110, readOnly: false },
      { data: 'trailerPlate', title: 'Trailer', width: 100, readOnly: false },
      { data: 'driverFullName', title: 'Driver', width: 130, readOnly: false },
      { data: 'driverPhone', title: 'Phone', width: 130, readOnly: false },
    )
    if (isFCL) {
      cols.push({ data: 'sealNumber', title: 'Seal #', width: 90, readOnly: false })
    }
  }

  if (legType === 'SHIP') {
    if (isFCL) {
      cols.push({ data: 'sealNumber', title: 'Seal #', width: 100, readOnly: false })
    }
    cols.push({ data: 'blNumber', title: isFCL ? 'B/L' : 'House B/L', width: 160, readOnly: false })
    if (!isFCL) {
      cols.push({ data: 'consolidationContainerNumber', title: 'Consol. Container', width: 160, readOnly: false })
    }
  }

  if (legType === 'AIR') {
    cols.push({ data: 'blNumber', title: 'AWB #', width: 160, readOnly: false })
  }

  cols.push({ data: 'notes', title: 'Notes', width: 150, readOnly: false })

  return cols
}

// ─── Leg Info Card ────────────────────────────────────────────────────────────

function LegInfoCard({ leg }: { leg: MockLegRow }) {
  return (
    <div className="space-y-2 mb-3">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-[10px]">{leg.type}</Badge>
        <span className="text-sm font-medium text-foreground">{leg.originName}</span>
        <span className="text-muted-foreground">→</span>
        <span className="text-sm font-medium text-foreground">{leg.destinationName}</span>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
        {leg.carrierName && <div><span className="text-muted-foreground">Carrier:</span> <span className="text-foreground">{leg.carrierName}</span></div>}
        {leg.bookingNumber && <div><span className="text-muted-foreground">Booking:</span> <span className="font-mono text-foreground">{leg.bookingNumber}</span></div>}
        {leg.blNumber && <div><span className="text-muted-foreground">Master B/L:</span> <span className="font-mono text-foreground">{leg.blNumber}</span></div>}
      </div>
      {leg.vesselName && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
          <div><span className="text-muted-foreground">Vessel:</span> <span className="text-foreground">{leg.vesselName}</span></div>
          {leg.vesselImo && <div><span className="text-muted-foreground">IMO:</span> <span className="font-mono text-foreground">{leg.vesselImo}</span></div>}
          {leg.voyageNumber && <div><span className="text-muted-foreground">Voyage:</span> <span className="font-mono text-foreground">{leg.voyageNumber}</span></div>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-6 text-xs">
        <div className="flex gap-3">
          <span className="text-muted-foreground">PTD:</span><span>{leg.ptd ?? '-'}</span>
          <span className="text-muted-foreground">ETD:</span><span>{leg.etd ?? '-'}</span>
          <span className="text-muted-foreground">ATD:</span><span className="font-medium">{leg.atd ?? '-'}</span>
        </div>
        <div className="flex gap-3">
          <span className="text-muted-foreground">PTA:</span><span>{leg.pta ?? '-'}</span>
          <span className="text-muted-foreground">ETA:</span>
          <span>
            {leg.eta ?? '-'}
            {leg.etaUpdateCount > 1 && <span className="text-amber-500 ml-0.5">({leg.etaUpdateCount}x)</span>}
          </span>
          <span className="text-muted-foreground">ATA:</span><span className="font-medium">{leg.ata ?? '-'}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Page Component ───────────────────────────────────────────────────────────

export default function FmsFileDetailPage({ params: propsParams }: { params?: { id?: string } }) {
  const router = useRouter()
  const routerParams = useParams<{ id?: string; slug?: string[] }>()


  const fileId = propsParams?.id
    ?? routerParams?.id
    ?? (Array.isArray(routerParams?.slug) ? routerParams.slug[routerParams.slug.length - 1] : undefined)
    ?? ''

  // Fetch file data from API
  const { data: apiFile, isLoading: fileLoading } = useQuery({
    queryKey: ['fms-file', fileId],
    queryFn: async () => {
      if (!fileId) return null
      const res = await apiCall<any>(`/api/fms_files/files/${fileId}`)
      if (!res.ok) return null
      return res.result
    },
    enabled: !!fileId,
  })

  // Fallback to mock data when API returns nothing (e.g., no DB data yet)
  const file: MockFile = apiFile ?? (fileId === 'file-lcl-1' ? MOCK_LCL_FILE : MOCK_FCL_FILE)
  const isFCL = file.cargoType === 'FCL'

  // Use API-returned units/legs if available, otherwise mock
  const units: MockUnitRow[] = apiFile?.units ?? (isFCL ? MOCK_FCL_UNITS : MOCK_LCL_UNITS)
  const legs: MockLegRow[] = apiFile?.legs ?? (isFCL ? MOCK_FCL_LEGS : MOCK_LCL_LEGS)

  // Build unit-leg map: legId → array of merged (unit + unit-leg) rows
  const realUnitLegMap = useMemo(() => {
    if (!apiFile?.unitLegs) return null
    const unitById = Object.fromEntries(units.map((u: any) => [u.id, u]))
    const map: Record<string, any[]> = {}
    for (const ul of apiFile.unitLegs as any[]) {
      const unit = unitById[ul.unitId]
      if (!map[ul.legId]) map[ul.legId] = []
      map[ul.legId].push({
        id: ul.id,
        unitId: ul.unitId,
        legId: ul.legId,
        containerNumber: unit?.containerNumber,
        containerType: unit?.containerType,
        grossWeight: unit?.grossWeight,
        weightUnit: unit?.weightUnit,
        truckPlate: ul.truckPlate,
        trailerPlate: ul.trailerPlate,
        driverFullName: ul.driverFullName,
        driverPhone: ul.driverPhone,
        sealNumber: ul.sealNumber,
        blNumber: ul.blNumber,
        consolidationContainerNumber: ul.consolidationContainerNumber,
        notes: ul.notes,
      })
    }
    return map
  }, [apiFile?.unitLegs, units])

  const unitLegMap: Record<string, any[]> = realUnitLegMap ?? (isFCL ? MOCK_FCL_UNITLEG_MAP : MOCK_LCL_UNITLEG_MAP)

  // Group legs by sequence for tabs
  const legGroups = useMemo(() => {
    const groups: Map<number, MockLegRow[]> = new Map()
    for (const leg of legs) {
      const existing = groups.get(leg.legSequence) ?? []
      existing.push(leg)
      groups.set(leg.legSequence, existing)
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a - b)
  }, [legs])

  const [activityOpen, setActivityOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('fms-file-activity-open') !== 'false'
  })

  const toggleActivity = useCallback(() => {
    setActivityOpen((prev) => {
      const next = !prev
      localStorage.setItem('fms-file-activity-open', String(next))
      return next
    })
  }, [])

  const [selectedLegTab, setSelectedLegTab] = useState(String(legGroups[0]?.[0] ?? '1'))
  const [addLegOpen, setAddLegOpen] = useState(false)
  const [assignUnitsLegId, setAssignUnitsLegId] = useState<string | null>(null)
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false)
  const [assigneeSearch, setAssigneeSearch] = useState('')
  const [viewMode, setViewMode] = useState<'classic' | 'transport'>('classic')
  const queryClient = useQueryClient()

  // Fetch users for assignee picker
  const { data: usersData } = useQuery({
    queryKey: ['auth-users-for-picker'],
    queryFn: async () => {
      const res = await apiCall<{ items: Array<{ id: string; email: string; name?: string }> }>('/api/auth/users?pageSize=100')
      return res.ok ? (res.result?.items ?? []) : []
    },
  })
  const { data: profileData } = useQuery({
    queryKey: ['auth-profile'],
    queryFn: async () => {
      const res = await apiCall<{ id: string; email: string }>('/api/auth/profile')
      return res.ok ? res.result : null
    },
  })

  const handleAssigneeSelect = useCallback(async (userId: string | null) => {
    setAssigneePickerOpen(false)
    const res = await apiCall(`/api/fms_files/files/${fileId}`, {
      method: 'PUT',
      body: JSON.stringify({ assigneeId: userId }),
    })
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: ['fms-file', fileId] })
    }
  }, [fileId, queryClient])

  // Table refs
  const unitsTableRef = useRef<HTMLDivElement>(null)
  const packagesTableRef = useRef<HTMLDivElement>(null)
  const legsTableRef = useRef<HTMLDivElement>(null)
  const unitLegTableRef = useRef<HTMLDivElement>(null)

  const handleDeleteLeg = useCallback(async (legId: string) => {
    if (!confirm('Delete this leg? All unit assignments for this leg will also be removed.')) return
    const res = await apiCall(`/api/fms_files/files/${fileId}/legs/${legId}`, { method: 'DELETE' })
    if (res.ok) queryClient.invalidateQueries({ queryKey: ['fms-file', fileId] })
  }, [fileId, queryClient])

  const legActionsRenderer = useCallback((rowData: any) => {
    if (!rowData?.id) return null
    return React.createElement('button', {
      className: 'p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors',
      onClick: (e: React.MouseEvent) => { e.stopPropagation(); handleDeleteLeg(rowData.id) },
      title: 'Delete leg',
    }, React.createElement(Trash2, { className: 'w-3.5 h-3.5' }))
  }, [handleDeleteLeg])

  // Keep a ref to default location IDs so event handlers always have fresh values
  const defaultLocationRef = useRef({ originLocationId: '', destinationLocationId: '' })
  useLayoutEffect(() => {
    defaultLocationRef.current = {
      originLocationId: (units[0] as any)?.originLocationId ?? '',
      destinationLocationId: (units[0] as any)?.destinationLocationId ?? '',
    }
  }, [units])

  useEffect(() => {
    const el = unitsTableRef.current
    if (!el) return

    const cellSaveHandler = async (e: Event) => {
      const { id: unitId, prop, newValue, rowIndex, colIndex } = (e as CustomEvent<CellEditSaveEvent>).detail
      if (!unitId) return

      const res = await apiCall(`/api/fms_files/files/${fileId}/units/${unitId}`, {
        method: 'PUT',
        body: JSON.stringify({ [prop]: newValue === '' ? null : newValue }),
      })

      if (res.ok) {
        dispatch<CellSaveSuccessEvent>(el, TableEvents.CELL_SAVE_SUCCESS, { rowIndex, colIndex })
      } else {
        dispatch<CellSaveErrorEvent>(el, TableEvents.CELL_SAVE_ERROR, { rowIndex, colIndex, error: 'Save failed' })
      }
    }

    const newRowHandler = async (e: Event) => {
      const { rowIndex, rowData } = (e as CustomEvent<NewRowSaveEvent>).detail
      const { originLocationId, destinationLocationId } = defaultLocationRef.current

      const body: Record<string, unknown> = {
        fileId,
        cargoType: isFCL ? 'FCL' : 'LCL',
        originLocationId: originLocationId || null,
        destinationLocationId: destinationLocationId || null,
      }

      if (isFCL) {
        body.containerType = rowData.containerType || '20GP'
        body.containerNumber = rowData.containerNumber || null
        body.grossWeight = rowData.grossWeight ? parseFloat(rowData.grossWeight) : null
        body.commodityDescription = rowData.commodityDescription || null
      } else {
        body.packageCount = rowData.packageCount ? parseInt(rowData.packageCount) : null
        body.grossWeight = rowData.grossWeight ? parseFloat(rowData.grossWeight) : null
        body.volume = rowData.volume ? parseFloat(rowData.volume) : null
        body.commodityDescription = rowData.commodityDescription || null
      }

      const res = await apiCall(`/api/fms_files/files/${fileId}/units`, {
        method: 'POST',
        body: JSON.stringify(body),
      })

      if (res.ok) {
        dispatch<NewRowSaveSuccessEvent>(el, TableEvents.NEW_ROW_SAVE_SUCCESS, { rowIndex, savedRowData: res.result })
        queryClient.invalidateQueries({ queryKey: ['fms-file', fileId] })
      } else {
        dispatch<NewRowSaveErrorEvent>(el, TableEvents.NEW_ROW_SAVE_ERROR, { rowIndex, error: 'Failed to add unit' })
      }
    }

    el.addEventListener(TableEvents.CELL_EDIT_SAVE, cellSaveHandler)
    el.addEventListener(TableEvents.NEW_ROW_SAVE, newRowHandler)
    return () => {
      el.removeEventListener(TableEvents.CELL_EDIT_SAVE, cellSaveHandler)
      el.removeEventListener(TableEvents.NEW_ROW_SAVE, newRowHandler)
    }
  }, [fileId, isFCL, fileLoading, queryClient])

  // Column definitions
  const unitCols = useMemo(() => isFCL ? fclUnitColumns() : lclUnitColumns(), [isFCL])
  const legsCols = useMemo(() => legsOverviewColumns(), [])
  const packageCols = useMemo(() => packageDetailColumns(), [])

  // Handle leg row click → select corresponding tab
  const handleLegRowClick = useCallback((rowIndex: number) => {
    const leg = legs[rowIndex]
    if (leg) {
      setSelectedLegTab(String(leg.legSequence))
    }
  }, [legs])

  if (fileLoading) {
    return React.createElement(LoadingMessage, null)
  }

  return (
    <div className="flex gap-6 pb-20">
    <div className="flex-1 min-w-0 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/backend/fms-files')} className="p-1.5 rounded hover:bg-muted transition-colors">
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-foreground font-mono">{file.referenceNumber}</h1>
            <Badge variant="outline" className="text-[10px]">{file.cargoType}</Badge>
            <Badge variant="outline" className="text-[10px]">{file.shipmentType}</Badge>
            <StatusBadge status={file.derivedStatus} />
          </div>
        </div>
        <button
          onClick={toggleActivity}
          title={activityOpen ? 'Hide activity' : 'Show activity'}
          className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground"
        >
          {activityOpen
            ? <PanelRightClose className="w-4 h-4" />
            : <PanelRightOpen className="w-4 h-4" />}
        </button>
        <Button variant="destructive" size="sm">Delete</Button>
      </div>

      {/* Key-value grid */}
      <div className="grid grid-cols-4 gap-4 border border-border rounded-lg bg-card px-4 py-3">
        <div>
          <p className="text-[10px] uppercase text-muted-foreground font-medium">Client</p>
          <p className="text-sm text-foreground">{file.contractorName}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground font-medium">Assignee</p>
          <Popover open={assigneePickerOpen} onOpenChange={setAssigneePickerOpen}>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1 text-sm text-foreground hover:text-primary transition-colors group">
                {(file as any).assigneeName ?? <span className="text-muted-foreground">Unassigned</span>}
                <ChevronDown className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="start">
              <Input
                placeholder="Search users..."
                value={assigneeSearch}
                onChange={(e) => setAssigneeSearch(e.target.value)}
                className="mb-2 h-7 text-xs"
              />
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                <button
                  className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors text-muted-foreground"
                  onClick={() => { setAssigneeSearch(''); handleAssigneeSelect(null) }}
                >
                  Unassigned
                </button>
                {profileData?.id && (
                  <button
                    className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors font-medium"
                    onClick={() => { setAssigneeSearch(''); handleAssigneeSelect(profileData.id) }}
                  >
                    Assign to me ({profileData.email})
                  </button>
                )}
                <div className="border-t border-border my-1" />
                {(usersData ?? [])
                  .filter((u) => {
                    const q = assigneeSearch.toLowerCase()
                    return !q || u.email.toLowerCase().includes(q) || (u.name ?? '').toLowerCase().includes(q)
                  })
                  .map((u) => (
                    <button
                      key={u.id}
                      className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors"
                      onClick={() => { setAssigneeSearch(''); handleAssigneeSelect(u.id) }}
                    >
                      {u.name || u.email}
                    </button>
                  ))
                }
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground font-medium">{isFCL ? 'Units' : 'Packages'}</p>
          <p className="text-sm text-foreground">
            {isFCL ? `${units.length}x ${units[0]?.containerType ?? ''}` : `${units[0]?.packageCount ?? 0} total`}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground font-medium">Created</p>
          <p className="text-sm text-foreground">{file.createdAt}</p>
        </div>
      </div>

      {/* Warnings */}
      {(file.warnings?.length ?? 0) > 0 && (
        <div className="border border-amber-500/30 rounded-lg bg-amber-500/10 px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <p className="text-sm font-medium text-amber-500">Warnings ({file.warnings.length})</p>
          </div>
          {file.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className="text-amber-500 mt-0.5">!</span>
              <span className="text-foreground">{w.message} <span className="text-muted-foreground">({w.affectedItems.join(', ')})</span></span>
            </div>
          ))}
        </div>
      )}

      {/* View toggle */}
      <div className="flex items-center gap-1 border border-border rounded-lg p-0.5 w-fit">
        <button
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === 'classic' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => setViewMode('classic')}
        >
          Classic
        </button>
        <button
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === 'transport' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => setViewMode('transport')}
        >
          Transport
        </button>
      </div>

      {/* Transport view */}
      {viewMode === 'transport' && (
        <TransportView
          fileId={fileId}
          units={units as any[]}
          legs={legs as any[]}
          unitLegs={(apiFile?.unitLegs ?? []) as any[]}
          isFCL={isFCL}
          onDeleteLeg={handleDeleteLeg}
          onUnitAdded={() => queryClient.invalidateQueries({ queryKey: ['fms-file', fileId] })}
          onAnnotationChange={() => queryClient.invalidateQueries({ queryKey: ['fms_file_activity', fileId] })}
        />
      )}

      {/* Classic view */}
      {viewMode === 'classic' && <>

      {/* Units */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
            Units ({units.length})
          </h2>
        </div>
        <DynamicTable
          tableRef={unitsTableRef}
          data={units}
          columns={unitCols}
          height="auto"
          tableName="Units"
          stretchColumns
          uiConfig={{ borderless: true }}
        />
      </div>

      {/* Package Detail (LCL only) */}
      {!isFCL && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
              Package Detail ({MOCK_LCL_PACKAGES.length})
            </h2>
            <Button size="sm" variant="outline"><Plus className="w-3 h-3 mr-1" /> Add Package</Button>
          </div>
          <DynamicTable
            tableRef={packagesTableRef}
            data={MOCK_LCL_PACKAGES}
            columns={packageCols}
            height="auto"
            tableName="Package Detail"
            stretchColumns
            uiConfig={{ hideAddRowButton: true, borderless: true }}
          />
        </div>
      )}

      {/* Route Legs Overview */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
            Route Legs ({legs.length})
          </h2>
          <Button type="button" size="sm" variant="outline" onClick={() => setAddLegOpen(true)}><Plus className="w-3 h-3 mr-1" /> Add Leg</Button>
        </div>
        <DynamicTable
          tableRef={legsTableRef}
          data={legs}
          columns={legsCols}
          height="auto"
          tableName="Route Legs"
          onRowClick={handleLegRowClick}
          actionsRenderer={legActionsRenderer}
          stretchColumns
          uiConfig={{ hideAddRowButton: true, borderless: true }}
        />
      </div>

      {/* Leg Detail Tabs */}
      <div className="border border-border rounded-lg bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-3">
          Leg Detail
        </h2>
        <Tabs value={selectedLegTab} onValueChange={setSelectedLegTab}>
          <TabsList className="mb-3">
            {legGroups.map(([seq, groupLegs]) => {
              const first = groupLegs[0]
              const label = groupLegs.length > 1
                ? `Leg ${seq}: ${first.type} (×${groupLegs.length})`
                : `Leg ${seq}: ${first.type}`
              const subtitle = first.destinationName.split('(')[0].trim()
              return (
                <TabsTrigger key={seq} value={String(seq)}>
                  <span className="flex flex-col items-start leading-tight">
                    <span className="text-xs">{label}</span>
                    <span className="text-[10px] text-muted-foreground font-normal">▸ {subtitle}</span>
                  </span>
                </TabsTrigger>
              )
            })}
          </TabsList>

          {legGroups.map(([seq, groupLegs]) => (
            <TabsContent key={seq} value={String(seq)}>
              <div className="space-y-4 pt-1">
                {groupLegs.map((leg) => {
                  const unitLegData = unitLegMap[leg.id] ?? []
                  const cols = unitLegColumns(leg.type, isFCL)

                  return (
                    <div key={leg.id} className="border border-border rounded-lg bg-card p-4">
                      {groupLegs.length > 1 && (
                        <Badge variant="secondary" className="text-[9px] mb-2">
                          {leg.originName} → {leg.destinationName}
                        </Badge>
                      )}
                      <LegInfoCard leg={leg} />
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] uppercase text-muted-foreground font-medium tracking-wider">
                          Units on this leg ({unitLegData.length})
                        </p>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs h-6"
                          onClick={() => setAssignUnitsLegId(leg.id)}
                        >
                          Assign Units
                        </Button>
                      </div>
                      <DynamicTable
                        tableRef={unitLegTableRef}
                        data={unitLegData}
                        columns={cols}
                        height="auto"
                        tableName={`Leg ${seq} Units`}
                        stretchColumns
                        uiConfig={{ hideAddRowButton: true, borderless: true }}
                      />
                    </div>
                  )
                })}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      </>}

      <AddLegDialog
        fileId={fileId}
        nextSequence={legs.length + 1}
        units={units as any[]}
        open={addLegOpen}
        onOpenChange={setAddLegOpen}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['fms-file', fileId] })}
      />

      {assignUnitsLegId && (() => {
        const existingAssignments: ExistingAssignment[] = (unitLegMap[assignUnitsLegId] ?? []).map(
          (ul: any) => ({ id: ul.id, unitId: ul.unitId })
        )
        return (
          <AssignUnitsDialog
            legId={assignUnitsLegId}
            units={units as any[]}
            existingAssignments={existingAssignments}
            open={!!assignUnitsLegId}
            onOpenChange={(open) => { if (!open) setAssignUnitsLegId(null) }}
            onSaved={() => queryClient.invalidateQueries({ queryKey: ['fms-file', fileId] })}
          />
        )
      })()}
    </div>

    {/* Activity panel */}
    {activityOpen && (
      <div className="w-[360px] shrink-0 sticky top-4 self-start max-h-[calc(100vh-6rem)] overflow-hidden">
        <FileActivitySection fileId={fileId} />
      </div>
    )}

    </div>
  )
}
