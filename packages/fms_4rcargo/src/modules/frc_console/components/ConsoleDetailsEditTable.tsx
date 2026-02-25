'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback } from 'react'
import {
  DynamicTable,
  TableEvents,
  dispatch,
  useEventHandlers,
  createEntitySearchEditor,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  ColumnDef,
  CellEditSaveEvent,
  CellSaveStartEvent,
  CellSaveSuccessEvent,
  CellSaveErrorEvent,
} from '@open-mercato/ui/backend/dynamic-table'
import { useT } from '@open-mercato/shared/lib/i18n/context'

import { FRC_CONSOLE_STATUSES } from '../../../lib/types'
import { formatDateForApi } from '../../../lib/dateUtils'

export type ConsoleDetailsData = {
  id: string
  name: string
  customName: string | null
  date: string
  status: string
  notes: string | null
  truck: { id: string; name: string } | null
  project: { id: string; number: string } | null
  originAirport: { id: string; code: string; city: string | null } | null
  destinationAirport: { id: string; code: string; city: string | null } | null
}

interface ConsoleDetailsEditTableProps {
  consoleId: string
  data: ConsoleDetailsData
  onFieldSave: (field: string, value: unknown) => Promise<void>
  tableRef?: React.RefObject<HTMLDivElement | null>
  siblingTableRefs?: {
    prev?: React.RefObject<HTMLDivElement | null>
    next?: React.RefObject<HTMLDivElement | null>
  }
}

const STATUS_OPTIONS = FRC_CONSOLE_STATUSES.map((s) => s)

export function ConsoleDetailsEditTable({
  consoleId,
  data,
  onFieldSave,
  tableRef: externalTableRef,
  siblingTableRefs,
}: ConsoleDetailsEditTableProps) {
  const t = useT()
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef

  const truckEditorConfig = useMemo(() => ({
    entityType: 'frc_trucks:frc_truck',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
    placeholder: t('frc_console.detail.searchTrucks', 'Search trucks...'),
    minQueryLength: 1,
  }), [t])

  const projectEditorConfig = useMemo(() => ({
    entityType: 'frc_projects:frc_project',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({ id: r.recordId, number: r.presenter?.title || '' }),
    placeholder: t('frc_console.detail.searchProjects', 'Search projects...'),
    minQueryLength: 1,
  }), [t])

  const airportEditorConfig = useMemo(() => ({
    entityType: 'fms_locations:fms_location',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({ id: r.recordId, code: r.presenter?.title || '' }),
    placeholder: t('frc_console.detail.searchAirports', 'Search airports...'),
    minQueryLength: 2,
    additionalFilters: { type: 'airport' },
  }), [t])

  // Renderer for project column - makes project number a clickable link
  const projectRenderer = useCallback((_value: unknown, row: Record<string, unknown>) => {
    const projectData = row._project as { id: string; number: string } | null
    if (!projectData) return <span className="text-muted-foreground">-</span>
    return (
      <a
        href={`/backend/frc-projects/${projectData.id}`}
        className="font-mono text-xs text-blue-600 hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {projectData.number}
      </a>
    )
  }, [])

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'name',
      title: t('frc_console.detail.columns.name', 'Console Name'),
      width: 160,
      type: 'text',
      readOnly: true,
    },
    {
      data: 'customName',
      title: t('frc_console.detail.columns.customName', 'Custom Name'),
      width: 140,
      type: 'text',
    },
    {
      data: 'date',
      title: t('frc_console.detail.columns.date', 'Date'),
      width: 110,
      type: 'date',
    },
    {
      data: 'status',
      title: t('frc_console.detail.columns.status', 'Status'),
      width: 100,
      type: 'dropdown',
      source: STATUS_OPTIONS,
    },
    {
      data: 'truckDisplay',
      title: t('frc_console.detail.columns.truck', 'Truck'),
      width: 120,
      type: 'text',
      editor: createEntitySearchEditor(truckEditorConfig),
    },
    {
      data: 'projectDisplay',
      title: t('frc_console.detail.columns.project', 'Project'),
      width: 110,
      type: 'text',
      editor: createEntitySearchEditor(projectEditorConfig),
      renderer: projectRenderer,
    },
    {
      data: 'originAirportDisplay',
      title: t('frc_console.detail.columns.origin', 'Origin'),
      width: 90,
      type: 'text',
      editor: createEntitySearchEditor(airportEditorConfig),
    },
    {
      data: 'destinationAirportDisplay',
      title: t('frc_console.detail.columns.destination', 'Destination'),
      width: 90,
      type: 'text',
      editor: createEntitySearchEditor(airportEditorConfig),
    },
    {
      data: 'notes',
      title: t('frc_console.detail.columns.notes', 'Notes'),
      width: 180,
      type: 'text',
    },
  ], [t, truckEditorConfig, projectEditorConfig, airportEditorConfig, projectRenderer])

  const tableData = useMemo(() => [{
    id: data.id,
    name: data.name,
    customName: data.customName ?? '',
    date: data.date,
    status: data.status,
    truckDisplay: data.truck?.name ?? '',
    projectDisplay: data.project?.number ?? '',
    originAirportDisplay: data.originAirport?.code ?? '',
    destinationAirportDisplay: data.destinationAirport?.code ?? '',
    notes: data.notes ?? '',
    // Store full objects for reference
    _truck: data.truck,
    _project: data.project,
    _originAirport: data.originAirport,
    _destinationAirport: data.destinationAirport,
  }], [data])

  const handleCellSave = useCallback(async (
    field: string,
    value: unknown,
    rowIndex: number,
    colIndex: number
  ) => {
    dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
      rowIndex,
      colIndex,
    } as CellSaveStartEvent)

    try {
      let apiField = field
      let processedValue: unknown = value

      if (field === 'truckDisplay') {
        apiField = 'truckId'
        try {
          const parsed = JSON.parse(String(value))
          processedValue = parsed.id
        } catch {
          processedValue = null
        }
      } else if (field === 'projectDisplay') {
        apiField = 'projectId'
        try {
          const parsed = JSON.parse(String(value))
          processedValue = parsed.id
        } catch {
          processedValue = null
        }
      } else if (field === 'originAirportDisplay') {
        apiField = 'originAirportId'
        try {
          const parsed = JSON.parse(String(value))
          processedValue = parsed.id
        } catch {
          processedValue = null
        }
      } else if (field === 'destinationAirportDisplay') {
        apiField = 'destinationAirportId'
        try {
          const parsed = JSON.parse(String(value))
          processedValue = parsed.id
        } catch {
          processedValue = null
        }
      } else if (field === 'name' || field === 'status') {
        processedValue = String(value ?? '')
      } else if (field === 'customName') {
        // customName can be empty string (which will be converted to null on server)
        processedValue = value ? String(value) : null
      } else if (field === 'date') {
        processedValue = formatDateForApi(value)
      } else if (field === 'notes') {
        processedValue = value ? String(value) : null
      }

      await onFieldSave(apiField, processedValue)

      dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
        rowIndex,
        colIndex,
      } as CellSaveSuccessEvent)
    } catch (error) {
      dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
        rowIndex,
        colIndex,
        error: error instanceof Error ? error.message : 'Failed to save',
      } as CellSaveErrorEvent)
    }
  }, [onFieldSave, tableRef])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: (payload: CellEditSaveEvent) => {
        handleCellSave(payload.prop, payload.newValue, payload.rowIndex, payload.colIndex)
      },
    },
    tableRef as React.RefObject<HTMLElement>
  )

  return (
    <div className="border rounded-lg overflow-hidden">
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
        siblingTableRefs={siblingTableRefs}
        uiConfig={{
          hideToolbar: true,
          hideSearch: true,
          hideAddRowButton: true,
          hideActionsColumn: true,
          hideBottomBar: true,
          hideFilterButton: true,
        }}
      />
    </div>
  )
}
