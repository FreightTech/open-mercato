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
import { formatDateForApi } from '../../../lib/dateUtils'
import { loadInitialUsers, loadInitialAirports } from '../../../lib/initialSuggestions'

export interface ProjectDetailsData {
  id: string
  totalValue: string | null
  currencyCode: string
  originAirportId: string | null
  originAirport: { id: string; code: string; city: string | null } | null
  destinationAirportId: string | null
  destinationAirport: { id: string; code: string; city: string | null } | null
  shipmentReadyDate: string | null
  requiredDeliveryDate: string | null
  awbNumbers: string[]
  notes: string | null
  assignedToId?: string | null
  assignedToName?: string | null
}

interface ProjectDetailsEditTableProps {
  projectId: string
  data: ProjectDetailsData
  onFieldSave: (field: string, value: unknown) => Promise<void>
  tableRef?: React.RefObject<HTMLDivElement | null>
  siblingTableRefs?: {
    prev?: React.RefObject<HTMLDivElement | null>
    next?: React.RefObject<HTMLDivElement | null>
  }
}

const CURRENCY_OPTIONS = ['EUR', 'USD', 'PLN', 'GBP', 'CHF']

export function ProjectDetailsEditTable({
  projectId,
  data,
  onFieldSave,
  tableRef: externalTableRef,
  siblingTableRefs,
}: ProjectDetailsEditTableProps) {
  const t = useT()
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef

  const airportEditorConfig = useMemo(() => ({
    entityType: 'fms_locations:fms_location',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({ id: r.recordId, code: r.presenter?.title || '' }),
    placeholder: t('frc_projects.detail.searchAirports', 'Search airports...'),
    minQueryLength: 2,
    additionalFilters: { type: 'airport' },
    initialSuggestions: {
      loadItems: loadInitialAirports,
      limit: 4,
    },
  }), [t])

  const userEditorConfig = useMemo(() => ({
    entityType: 'auth:user',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
    placeholder: t('frc_projects.detail.searchUsers', 'Search users...'),
    minQueryLength: 2,
    initialSuggestions: {
      loadItems: loadInitialUsers,
      limit: 4,
    },
  }), [t])

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'assignedToDisplay',
      title: t('frc_projects.detail.columns.assignedTo', 'Assigned To'),
      width: 150,
      type: 'text',
      editor: createEntitySearchEditor(userEditorConfig),
    },
    {
      data: 'totalValue',
      title: t('frc_projects.detail.columns.totalValue', 'Total Value'),
      width: 120,
      type: 'numeric',
    },
    {
      data: 'currencyCode',
      title: t('frc_projects.detail.columns.currency', 'Currency'),
      width: 90,
      type: 'dropdown',
      source: CURRENCY_OPTIONS,
    },
    {
      data: 'originAirportDisplay',
      title: t('frc_projects.detail.columns.origin', 'Origin'),
      width: 100,
      type: 'text',
      editor: createEntitySearchEditor(airportEditorConfig),
    },
    {
      data: 'destinationAirportDisplay',
      title: t('frc_projects.detail.columns.destination', 'Destination'),
      width: 100,
      type: 'text',
      editor: createEntitySearchEditor(airportEditorConfig),
    },
    {
      data: 'shipmentReadyDate',
      title: t('frc_projects.detail.columns.shipmentReady', 'Shipment Ready'),
      width: 120,
      type: 'date',
    },
    {
      data: 'requiredDeliveryDate',
      title: t('frc_projects.detail.columns.requiredDelivery', 'Required Delivery'),
      width: 130,
      type: 'date',
    },
    {
      data: 'awbNumbersDisplay',
      title: t('frc_projects.detail.columns.awbNumbers', 'AWB Numbers'),
      width: 180,
      type: 'text',
    },
    {
      data: 'notes',
      title: t('frc_projects.detail.columns.notes', 'Notes'),
      width: 200,
      type: 'text',
    },
  ], [t, airportEditorConfig, userEditorConfig])

  const tableData = useMemo(() => [{
    id: data.id,
    assignedToDisplay: data.assignedToName ?? '',
    totalValue: data.totalValue ?? '',
    currencyCode: data.currencyCode,
    originAirportDisplay: data.originAirport?.code ?? '',
    destinationAirportDisplay: data.destinationAirport?.code ?? '',
    shipmentReadyDate: data.shipmentReadyDate ?? '',
    requiredDeliveryDate: data.requiredDeliveryDate ?? '',
    awbNumbersDisplay: (data.awbNumbers ?? []).join(', '),
    notes: data.notes ?? '',
    // Store full objects for reference
    _originAirport: data.originAirport,
    _destinationAirport: data.destinationAirport,
    _assignedToId: data.assignedToId,
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

      if (field === 'assignedToDisplay') {
        apiField = 'assignedToId'
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
      } else if (field === 'awbNumbersDisplay') {
        apiField = 'awbNumbers'
        // Convert comma-separated string to array
        const strValue = String(value ?? '')
        processedValue = strValue
          .split(',')
          .map(s => s.trim())
          .filter(s => s.length > 0)
      } else if (field === 'totalValue') {
        processedValue = value ? String(value) : null
      } else if (field === 'notes') {
        processedValue = value ? String(value) : null
      } else if (field === 'shipmentReadyDate' || field === 'requiredDeliveryDate') {
        processedValue = formatDateForApi(value)
      } else {
        processedValue = String(value ?? '')
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
