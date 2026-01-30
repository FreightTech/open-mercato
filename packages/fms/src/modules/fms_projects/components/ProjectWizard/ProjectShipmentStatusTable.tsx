'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback, useState } from 'react'
import {
  DynamicTable,
  TableEvents,
  dispatch,
  useEventHandlers,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  CellEditSaveEvent,
  CellSaveStartEvent,
  CellSaveSuccessEvent,
  CellSaveErrorEvent,
  ColumnDef,
} from '@open-mercato/ui/backend/dynamic-table'
import { Badge } from '@open-mercato/ui/primitives/badge'
import type { Project, ProjectSeaContainer } from './hooks/useProjectWizard'

type ProjectShipmentStatusTableProps = {
  project: Project
  seaContainers: ProjectSeaContainer[]
  onContainerUpdate: (containerId: string, field: string, value: unknown) => void
  tableRef?: React.RefObject<HTMLDivElement | null>
  autoSelectOnFocus?: boolean
  siblingTableRefs?: { prev?: React.RefObject<HTMLDivElement | null>; next?: React.RefObject<HTMLDivElement | null> }
}

type TabType = 'origin' | 'global' | 'destination'

// Extended SeaContainer type with cutoff fields
interface ExtendedSeaContainer extends ProjectSeaContainer {
  pickupRequiredBy?: string | null
  ctoCutOffDate?: string | null
  docsDueDate?: string | null
  cutOffDate?: string | null
  vgmStatus?: string | null
  vgmWeight?: string | null
  pinCode?: string | null
  deliveryTime?: string | null
  estimatedDelivery?: string | null
  customsClearanceStatus?: string | null
}

// Determine which tabs to show based on shipment type and direction
function getCutoffVisibility(shipmentType: string, direction: string, incoterm: string | null) {
  const isSeaExport = ['EXP', 'DEPOT'].includes(shipmentType)
  const isSeaImport = shipmentType === 'IMP'
  const isRail = shipmentType === 'RAIL'

  // FOB/FCA/EXW = seller responsibility at origin -> show Origin tab
  // CIF/CFR/CIP = buyer responsibility at destination -> show Destination tab
  const sellerIncoterms = ['EXW', 'FCA', 'FAS', 'FOB']
  const buyerIncoterms = ['CIF', 'CFR', 'CIP', 'DAP', 'DPU', 'DDP']

  return {
    showOrigin: isSeaExport || isRail || (incoterm ? sellerIncoterms.includes(incoterm) : false),
    showGlobal: isSeaExport || isSeaImport || isRail,
    showDestination: isSeaImport || (incoterm ? buyerIncoterms.includes(incoterm) : false),
    showVGM: isSeaExport,
  }
}

// Format date for display
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return '-'
  }
}

// Determine status badge for a cutoff date
function getCutoffStatus(dateStr: string | null | undefined): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  if (!dateStr) return { label: 'Pending', variant: 'secondary' }

  const date = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return { label: 'Passed', variant: 'default' }
  if (diffDays <= 2) return { label: 'Urgent', variant: 'destructive' }
  if (diffDays <= 7) return { label: 'Upcoming', variant: 'outline' }
  return { label: 'Scheduled', variant: 'secondary' }
}

// Custom cell renderer for date with status badge
function DateStatusRenderer({ value }: { value: string | null | undefined }) {
  const dateStr = formatDate(value)
  const status = getCutoffStatus(value)

  return (
    <div className="flex items-center gap-2">
      <span>{dateStr}</span>
      {value && <Badge variant={status.variant} className="text-xs">{status.label}</Badge>}
    </div>
  )
}

export function ProjectShipmentStatusTable({
  project,
  seaContainers,
  onContainerUpdate,
  tableRef: externalTableRef,
  autoSelectOnFocus,
  siblingTableRefs,
}: ProjectShipmentStatusTableProps) {
  const visibility = getCutoffVisibility(project.shipmentType, project.direction, project.incoterm)

  // Default to first available tab
  const getDefaultTab = (): TabType => {
    if (visibility.showOrigin) return 'origin'
    if (visibility.showGlobal) return 'global'
    if (visibility.showDestination) return 'destination'
    return 'global'
  }

  const [activeTab, setActiveTab] = useState<TabType>(getDefaultTab())
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef

  // Cast containers to extended type
  const containers = seaContainers as ExtendedSeaContainer[]

  // Origin tab columns (for exports)
  const originColumns = useMemo((): ColumnDef[] => [
    {
      data: 'containerNumber',
      title: 'Container',
      width: 120,
      readOnly: true,
    },
    {
      data: 'pickupRequiredBy',
      title: 'Cargo Ready',
      width: 140,
      type: 'date',
      renderer: (val: unknown) => <DateStatusRenderer value={val as string | null} />,
    },
    ...(visibility.showVGM ? [{
      data: 'vgmStatus',
      title: 'VGM Status',
      width: 110,
      type: 'dropdown' as const,
      source: ['pending', 'submitted', 'verified'],
    }] : []),
    {
      data: 'docsDueDate',
      title: 'Doc Cutoff (SI)',
      width: 140,
      type: 'date',
      renderer: (val: unknown) => <DateStatusRenderer value={val as string | null} />,
    },
    {
      data: 'ctoCutOffDate',
      title: 'Cargo Cutoff',
      width: 140,
      type: 'date',
      renderer: (val: unknown) => <DateStatusRenderer value={val as string | null} />,
    },
    {
      data: 'cutOffDate',
      title: 'Port Gate Close',
      width: 140,
      type: 'date',
      renderer: (val: unknown) => <DateStatusRenderer value={val as string | null} />,
    },
  ], [visibility.showVGM])

  // Global tab columns (vessel/voyage info)
  const globalColumns = useMemo((): ColumnDef[] => [
    {
      data: 'containerNumber',
      title: 'Container',
      width: 120,
      readOnly: true,
    },
    {
      data: 'vesselName',
      title: 'Vessel',
      width: 130,
      type: 'text',
    },
    {
      data: 'voyageNumber',
      title: 'Voyage',
      width: 100,
      type: 'text',
    },
    {
      data: 'etd',
      title: 'ETD',
      width: 110,
      type: 'date',
    },
    {
      data: 'eta',
      title: 'ETA',
      width: 110,
      type: 'date',
    },
    {
      data: 'atd',
      title: 'ATD',
      width: 110,
      type: 'date',
    },
    {
      data: 'ata',
      title: 'ATA',
      width: 110,
      type: 'date',
    },
    {
      data: 'status',
      title: 'Status',
      width: 100,
      type: 'dropdown',
      source: ['not_ready', 'ready', 'in_transit', 'delivered'],
      renderer: (val: unknown) => {
        const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
          not_ready: { label: 'Not Ready', variant: 'secondary' },
          ready: { label: 'Ready', variant: 'outline' },
          in_transit: { label: 'In Transit', variant: 'default' },
          delivered: { label: 'Delivered', variant: 'default' },
        }
        const status = statusMap[val as string] || { label: val as string, variant: 'secondary' as const }
        return <Badge variant={status.variant}>{status.label}</Badge>
      },
    },
  ], [])

  // Destination tab columns (for imports)
  const destinationColumns = useMemo((): ColumnDef[] => [
    {
      data: 'containerNumber',
      title: 'Container',
      width: 120,
      readOnly: true,
    },
    {
      data: 'pinCode',
      title: 'PIN Code',
      width: 100,
      type: 'text',
    },
    {
      data: 'deliveryTime',
      title: 'Delivery Time',
      width: 110,
      type: 'text',
    },
    {
      data: 'estimatedDelivery',
      title: 'Est. Delivery',
      width: 140,
      type: 'date',
      renderer: (val: unknown) => <DateStatusRenderer value={val as string | null} />,
    },
    {
      data: 'customsClearanceStatus',
      title: 'Customs Status',
      width: 130,
      type: 'dropdown',
      source: ['pending', 'in_progress', 'cleared'],
      renderer: (val: unknown) => {
        const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
          pending: { label: 'Pending', variant: 'secondary' },
          in_progress: { label: 'In Progress', variant: 'outline' },
          cleared: { label: 'Cleared', variant: 'default' },
        }
        const status = statusMap[val as string] || { label: val as string || 'Pending', variant: 'secondary' as const }
        return <Badge variant={status.variant}>{status.label}</Badge>
      },
    },
  ], [])

  // Select columns based on active tab
  const columns = useMemo(() => {
    switch (activeTab) {
      case 'origin':
        return originColumns
      case 'destination':
        return destinationColumns
      case 'global':
      default:
        return globalColumns
    }
  }, [activeTab, originColumns, globalColumns, destinationColumns])

  // Table data mapping
  const tableData = useMemo(() => {
    return containers.map((container) => ({
      id: container.id,
      containerNumber: container.containerNumber || 'TBD',
      // Origin fields
      pickupRequiredBy: container.pickupRequiredBy || null,
      vgmStatus: container.vgmStatus || 'pending',
      docsDueDate: container.docsDueDate || null,
      ctoCutOffDate: container.ctoCutOffDate || null,
      cutOffDate: container.cutOffDate || null,
      // Global fields
      vesselName: container.vesselName || '',
      voyageNumber: container.voyageNumber || '',
      etd: container.etd || null,
      eta: container.eta || null,
      atd: container.atd || null,
      ata: container.ata || null,
      status: container.status || 'not_ready',
      // Destination fields
      pinCode: container.pinCode || '',
      deliveryTime: container.deliveryTime || '',
      estimatedDelivery: container.estimatedDelivery || null,
      customsClearanceStatus: container.customsClearanceStatus || 'pending',
    }))
  }, [containers])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          onContainerUpdate(payload.id as string, payload.prop, payload.newValue)

          dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
            rowIndex: payload.rowIndex,
            colIndex: payload.colIndex,
          } as CellSaveSuccessEvent)
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Update failed'
          dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
            rowIndex: payload.rowIndex,
            colIndex: payload.colIndex,
            error: errorMessage,
          } as CellSaveErrorEvent)
        }
      },
    },
    tableRef as React.RefObject<HTMLElement>
  )

  // Don't render if no tabs should be shown
  if (!visibility.showOrigin && !visibility.showGlobal && !visibility.showDestination) {
    return null
  }

  // Don't render if no containers
  if (containers.length === 0) {
    return (
      <div className="border rounded-lg p-4">
        <div className="text-sm text-muted-foreground">No containers to display shipment status</div>
      </div>
    )
  }

  return (
    <div className="border rounded-lg">
      {/* Tab buttons */}
      <div className="flex border-b">
        {visibility.showOrigin && (
          <button
            onClick={() => setActiveTab('origin')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'origin'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Origin Cutoffs
          </button>
        )}
        {visibility.showGlobal && (
          <button
            onClick={() => setActiveTab('global')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'global'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Shipping Status
          </button>
        )}
        {visibility.showDestination && (
          <button
            onClick={() => setActiveTab('destination')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'destination'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Destination
          </button>
        )}
      </div>

      {/* Table content */}
      <DynamicTable
        tableRef={tableRef}
        data={tableData}
        columns={columns}
        tableName=""
        idColumnName="id"
        width="100%"
        colHeaders={true}
        rowHeaders={false}
        stretchColumns={true}
        autoSelectOnFocus={autoSelectOnFocus}
        siblingTableRefs={siblingTableRefs}
        uiConfig={{
          hideSearch: true,
          hideAddRowButton: true,
          hideActionsColumn: true,
          toolbarPosition: 'bottom',
          hideFilterPopover: true,
          hideSortButton: true,
        }}
      />
    </div>
  )
}
