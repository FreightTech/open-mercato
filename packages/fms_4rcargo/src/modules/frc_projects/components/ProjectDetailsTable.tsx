'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback } from 'react'
import {
  DynamicTable,
  TableEvents,
  dispatch,
  useEventHandlers,
} from '@open-mercato/ui/backend/dynamic-table'
import type {
  ColumnDef,
  CellEditSaveEvent,
  CellSaveStartEvent,
  CellSaveSuccessEvent,
  CellSaveErrorEvent,
} from '@open-mercato/ui/backend/dynamic-table'
import { useT } from '@open-mercato/shared/lib/i18n/context'

import { FRC_PROJECT_STATUSES } from '../../../lib/types'

export type ProjectDetailsData = {
  id: string
  projectNumber: string
  status: string
  awbNumber: string | null
  totalValue: string | null
  currencyCode: string
  createdAt: string
}

interface ProjectDetailsTableProps {
  projectId: string
  data: ProjectDetailsData
  onFieldSave: (field: string, value: unknown) => Promise<void>
  tableRef?: React.RefObject<HTMLDivElement | null>
  siblingTableRefs?: {
    prev?: React.RefObject<HTMLDivElement | null>
    next?: React.RefObject<HTMLDivElement | null>
  }
}

const STATUS_OPTIONS = FRC_PROJECT_STATUSES.map((s) => s)
const CURRENCY_OPTIONS = ['EUR', 'USD', 'GBP', 'CHF', 'PLN']

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString()
  } catch {
    return dateStr
  }
}

export function ProjectDetailsTable({
  projectId,
  data,
  onFieldSave,
  tableRef: externalTableRef,
  siblingTableRefs,
}: ProjectDetailsTableProps) {
  const t = useT()
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'projectNumber',
      title: t('frc_projects.detail.columns.projectNumber', 'Project #'),
      width: 130,
      type: 'text',
      readOnly: true,
    },
    {
      data: 'status',
      title: t('frc_projects.detail.columns.status', 'Status'),
      width: 110,
      type: 'dropdown',
      source: STATUS_OPTIONS,
    },
    {
      data: 'awbNumber',
      title: t('frc_projects.detail.columns.awbNumber', 'AWB Number'),
      width: 130,
      type: 'text',
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
      data: 'createdAt',
      title: t('frc_projects.detail.columns.createdAt', 'Created'),
      width: 100,
      type: 'text',
      readOnly: true,
    },
  ], [t])

  const tableData = useMemo(() => [{
    id: data.id,
    projectNumber: data.projectNumber,
    status: data.status,
    awbNumber: data.awbNumber ?? '',
    totalValue: data.totalValue ?? '',
    currencyCode: data.currencyCode,
    createdAt: formatDate(data.createdAt),
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
      let processedValue: unknown = value

      switch (field) {
        case 'status':
        case 'currencyCode':
          processedValue = String(value ?? '')
          break
        case 'awbNumber':
          processedValue = value ? String(value) : null
          break
        case 'totalValue':
          processedValue = value ? String(value) : null
          break
      }

      await onFieldSave(field, processedValue)

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
