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

  // Entity search editor config for contractors (clients)
  const contractorEditorConfig = useMemo(() => ({
    entityType: 'contractors:contractor',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({ id: r.recordId, name: r.presenter?.title || '' }),
    placeholder: 'Search clients...',
    minQueryLength: 2,
  }), [])

  // JSON renderer for displaying client name
  const clientRenderer = useCallback((value: unknown) => {
    const strValue = String(value || '')
    if (!strValue) {
      return <span className="text-gray-400">Select client...</span>
    }
    // Try to find matching contractor by ID (for existing data)
    const contractor = contractors.find(c => c.id === strValue)
    if (contractor) {
      return <span className="truncate">{contractor.name}</span>
    }
    // Try to parse as JSON (for new selections)
    try {
      const parsed = JSON.parse(strValue)
      if (parsed && typeof parsed === 'object' && 'name' in parsed) {
        return <span className="truncate">{parsed.name}</span>
      }
    } catch {
      // Not JSON
    }
    return <span className="truncate">{strValue}</span>
  }, [contractors])

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'accountId',
      title: 'Client',
      width: 200,
      renderer: clientRenderer,
      editor: createEntitySearchEditor(contractorEditorConfig),
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
  ], [clientRenderer, contractorEditorConfig])

  const tableData = useMemo(() => [{
    id: 'draft',
    accountId: draft.accountId && draft.accountName 
      ? JSON.stringify({ id: draft.accountId, name: draft.accountName })
      : draft.accountId ?? '',
    status: draft.status,
    totalValue: draft.totalValue ?? '',
    currencyCode: draft.currencyCode,
  }], [draft])

  const handleCellChange = useCallback((field: string, value: unknown) => {
    const updates: Partial<ProjectDraft> = {}

    switch (field) {
      case 'accountId':
        // Handle entity search JSON value
        if (value) {
          try {
            const parsed = JSON.parse(String(value))
            if (parsed && typeof parsed === 'object' && 'id' in parsed) {
              updates.accountId = parsed.id
              updates.accountName = parsed.name || null
              break
            }
          } catch {
            // Not JSON, use as-is
          }
        }
        updates.accountId = value ? String(value) : null
        updates.accountName = null
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
