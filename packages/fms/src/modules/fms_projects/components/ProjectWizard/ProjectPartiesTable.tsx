'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback } from 'react'
import {
  DynamicTable,
  TableEvents,
  dispatch,
  useEventHandlers,
} from '@open-mercato/ui/backend/dynamic-table'
import { createEntitySearchEditor } from '@open-mercato/ui/backend/dynamic-table/components/EntitySearchEditor'
import type {
  CellEditSaveEvent,
  CellSaveStartEvent,
  CellSaveSuccessEvent,
  CellSaveErrorEvent,
  ColumnDef,
} from '@open-mercato/ui/backend/dynamic-table'
import type { Project } from './hooks/useProjectWizard'

type ProjectPartiesTableProps = {
  project: Project
  onUpdate: (updates: Partial<Project>) => void
  tableRef?: React.RefObject<HTMLDivElement | null>
  siblingTableRefs?: { prev?: React.RefObject<HTMLDivElement | null>; next?: React.RefObject<HTMLDivElement | null> }
  autoSelectOnFocus?: boolean
}

// Party role types
type PartyRole = 'client' | 'shipper' | 'consignee' | 'agent'

interface PartyRow {
  id: PartyRole
  role: string
  name: string
}

export function ProjectPartiesTable({
  project,
  onUpdate,
  tableRef: externalTableRef,
  siblingTableRefs,
  autoSelectOnFocus,
}: ProjectPartiesTableProps) {
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef

  // Contractor editor config
  const contractorEditorConfig = useMemo(() => ({
    entityType: 'contractors:contractor',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({
        id: r.recordId,
        name: r.presenter?.title || '',
      }),
    placeholder: 'Search contractors...',
    minQueryLength: 2,
  }), [])

  // JSON renderer helper for name column
  const nameRenderer = useCallback((value: unknown) => {
    const strValue = String(value || '')
    if (!strValue) {
      return <span className="text-gray-400">Select contractor...</span>
    }
    try {
      const parsed = JSON.parse(strValue)
      if (parsed && typeof parsed === 'object' && 'name' in parsed) {
        return <span className="truncate">{parsed.name}</span>
      }
    } catch {
      // Not JSON
    }
    return <span className="truncate">{strValue}</span>
  }, [])

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'role',
      title: 'Role',
      width: 100,
      readOnly: true,
      renderer: (val: unknown) => (
        <span className="font-medium">{val as string}</span>
      ),
    },
    {
      data: 'name',
      title: 'Name',
      width: 300,
      renderer: nameRenderer,
      editor: createEntitySearchEditor(contractorEditorConfig),
    },
  ], [nameRenderer, contractorEditorConfig])

  // Build table data from project
  const tableData = useMemo((): PartyRow[] => {
    return [
      {
        id: 'client',
        role: 'Client',
        name: project.clientId && project.clientName
          ? JSON.stringify({ id: project.clientId, name: project.clientName })
          : '',
      },
      {
        id: 'shipper',
        role: 'Shipper',
        name: project.shipperId && project.shipperName
          ? JSON.stringify({ id: project.shipperId, name: project.shipperName })
          : '',
      },
      {
        id: 'consignee',
        role: 'Consignee',
        name: project.consigneeId && project.consigneeName
          ? JSON.stringify({ id: project.consigneeId, name: project.consigneeName })
          : '',
      },
      {
        id: 'agent',
        role: 'Agent',
        name: '', // Would come from offer provider
      },
    ]
  }, [project])

  const handleCellChange = useCallback((rowId: string, field: string, value: unknown) => {
    if (field !== 'name') return // Only name is editable

    const role = rowId as PartyRole
    const strValue = String(value || '')

    try {
      const parsed = JSON.parse(strValue)
      if (parsed && typeof parsed === 'object' && 'id' in parsed) {
        switch (role) {
          case 'client':
            onUpdate({ clientId: parsed.id, clientName: parsed.name || '' })
            break
          case 'shipper':
            onUpdate({ shipperId: parsed.id, shipperName: parsed.name || '' })
            break
          case 'consignee':
            onUpdate({ consigneeId: parsed.id, consigneeName: parsed.name || '' })
            break
          // Agent is read-only from offer for now
        }
        return
      }
    } catch {
      // Not JSON
    }

    // Clear the selection
    switch (role) {
      case 'client':
        onUpdate({ clientId: null, clientName: null })
        break
      case 'shipper':
        onUpdate({ shipperId: null, shipperName: null })
        break
      case 'consignee':
        onUpdate({ consigneeId: null, consigneeName: null })
        break
    }
  }, [onUpdate])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: async (payload: CellEditSaveEvent) => {
        dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
          rowIndex: payload.rowIndex,
          colIndex: payload.colIndex,
        } as CellSaveStartEvent)

        try {
          handleCellChange(payload.id as string, payload.prop, payload.newValue)

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

  return (
    <DynamicTable
      tableRef={tableRef}
      data={tableData}
      columns={columns}
      tableName="Parties"
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
        hideBottomBar: true,
        hideFilterPopover: true,
        hideSortButton: true,
        hideColumnsButton: true,
      }}
    />
  )
}
