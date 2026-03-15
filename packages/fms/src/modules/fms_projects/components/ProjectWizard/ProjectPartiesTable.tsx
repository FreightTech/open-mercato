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
  enableComments?: boolean
  commentsEntityType?: string
  commentsViewContext?: string
}

// Party row - single row with each role as a column
interface PartyRow {
  id: string
  client: string
  shipper: string
  consignee: string
  agent: string
}

export function ProjectPartiesTable({
  project,
  onUpdate,
  tableRef: externalTableRef,
  siblingTableRefs,
  autoSelectOnFocus,
  enableComments,
  commentsEntityType,
  commentsViewContext,
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

  // JSON renderer helper for contractor columns
  const contractorRenderer = useCallback((value: unknown) => {
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

  const contractorEditor = useMemo(() => createEntitySearchEditor(contractorEditorConfig), [contractorEditorConfig])

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'client',
      title: 'Client',
      width: 180,
      renderer: contractorRenderer,
      editor: contractorEditor,
    },
    {
      data: 'shipper',
      title: 'Shipper',
      width: 180,
      renderer: contractorRenderer,
      editor: contractorEditor,
    },
    {
      data: 'consignee',
      title: 'Consignee',
      width: 180,
      renderer: contractorRenderer,
      editor: contractorEditor,
    },
    {
      data: 'agent',
      title: 'Agent',
      width: 180,
      renderer: contractorRenderer,
      editor: contractorEditor,
      readOnly: true,
    },
  ], [contractorRenderer, contractorEditor])

  // Build table data - single row with each role as a column
  const tableData = useMemo((): PartyRow[] => {
    return [
      {
        id: 'parties',
        client: project.clientId && project.clientName
          ? JSON.stringify({ id: project.clientId, name: project.clientName })
          : '',
        shipper: project.shipperId && project.shipperName
          ? JSON.stringify({ id: project.shipperId, name: project.shipperName })
          : '',
        consignee: project.consigneeId && project.consigneeName
          ? JSON.stringify({ id: project.consigneeId, name: project.consigneeName })
          : '',
        agent: '', // Would come from offer provider
      },
    ]
  }, [project])

  const handleCellChange = useCallback((_rowId: string, field: string, value: unknown) => {
    const strValue = String(value || '')

    try {
      const parsed = JSON.parse(strValue)
      if (parsed && typeof parsed === 'object' && 'id' in parsed) {
        switch (field) {
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
    switch (field) {
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
      enableComments={enableComments}
      commentsEntityType={commentsEntityType}
      commentsViewContext={commentsViewContext}
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
