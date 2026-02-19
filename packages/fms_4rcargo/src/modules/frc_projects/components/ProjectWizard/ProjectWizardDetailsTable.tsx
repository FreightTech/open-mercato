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
} from '@open-mercato/ui/backend/dynamic-table'

import type { ProjectDraft, ContractorOption } from './types'
import { PROJECT_STATUS_OPTIONS, CURRENCY_OPTIONS } from './types'

interface ProjectWizardDetailsTableProps {
  draft: ProjectDraft
  onDraftChange: (updates: Partial<ProjectDraft>) => void
  contractors: ContractorOption[]
  nextTableRef?: React.RefObject<HTMLDivElement>
}

export function ProjectWizardDetailsTable({
  draft,
  onDraftChange,
  contractors,
  nextTableRef,
}: ProjectWizardDetailsTableProps) {
  const tableRef = useRef<HTMLDivElement>(null)

  const contractorOptions = useMemo(
    () => contractors.map((c) => ({ value: c.id, label: c.name })),
    [contractors]
  )

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'accountId',
      title: 'Account',
      width: 200,
      type: 'dropdown',
      source: contractorOptions,
    },
    {
      data: 'status',
      title: 'Status',
      width: 120,
      type: 'dropdown',
      source: PROJECT_STATUS_OPTIONS,
    },
    {
      data: 'totalValue',
      title: 'Total Value',
      width: 120,
      type: 'numeric',
    },
    {
      data: 'currencyCode',
      title: 'Currency',
      width: 90,
      type: 'dropdown',
      source: CURRENCY_OPTIONS,
    },
  ], [contractorOptions])

  const tableData = useMemo(() => [{
    id: 'draft',
    accountId: draft.accountId ?? '',
    status: draft.status,
    totalValue: draft.totalValue ?? '',
    currencyCode: draft.currencyCode,
  }], [draft])

  const handleCellChange = useCallback((field: string, value: unknown) => {
    const updates: Partial<ProjectDraft> = {}

    switch (field) {
      case 'accountId':
        updates.accountId = value ? String(value) : null
        break
      case 'status':
        updates.status = String(value) as ProjectDraft['status']
        break
      case 'totalValue':
        updates.totalValue = value ? String(value) : null
        break
      case 'currencyCode':
        updates.currencyCode = String(value)
        break
    }

    onDraftChange(updates)
  }, [onDraftChange])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        handleCellChange(payload.prop, payload.newValue)

        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveSuccessEvent)
      },
    },
    tableRef as React.RefObject<HTMLElement>
  )

  return (
    <div className="border rounded-lg">
      <div className="px-3 py-1.5 border-b">
        <h3 className="text-sm font-medium">Project Details</h3>
      </div>
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
        siblingTableRefs={{ next: nextTableRef }}
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
