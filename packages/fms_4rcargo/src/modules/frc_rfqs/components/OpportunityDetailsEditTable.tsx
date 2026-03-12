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

import {
  SALES_STAGE_OPTIONS,
  CURRENCY_OPTIONS,
  PRODUCT_OPTIONS,
} from './OpportunityWizard/types'
import { loadInitialUsers } from '../../../lib/loadInitialUsers'

// User renderer for Assigned To column
const UserNameRenderer = (value: unknown, row: Record<string, unknown>) => {
  const assignedToName = row.assignedToName as string | null
  // Value might be JSON from EntitySearchEditor
  let displayName = assignedToName || value
  if (typeof displayName === 'string' && displayName.startsWith('{')) {
    try {
      const parsed = JSON.parse(displayName)
      displayName = parsed.name || displayName
    } catch {
      // Use value as-is
    }
  }
  if (!displayName) return <span className="text-muted-foreground">-</span>
  return <span className="text-foreground">{String(displayName)}</span>
}

export type OpportunityDetailsData = {
  id: string
  name: string
  product: string | null
  commodity: string | null
  salesStage: string
  probability: number
  currencyCode: string
  amount: string | null
  assignedToId: string | null
  assignedToName: string | null
}

interface OpportunityDetailsEditTableProps {
  rfqId: string
  data: OpportunityDetailsData
  onFieldSave: (field: string, value: unknown) => Promise<void>
  tableRef?: React.RefObject<HTMLDivElement | null>
  siblingTableRefs?: {
    prev?: React.RefObject<HTMLDivElement | null>
    next?: React.RefObject<HTMLDivElement | null>
  }
}

export function OpportunityDetailsEditTable({
  rfqId,
  data,
  onFieldSave,
  tableRef: externalTableRef,
  siblingTableRefs,
}: OpportunityDetailsEditTableProps) {
  const t = useT()
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef

  // User editor config for assigned to field
  const userEditorConfig = useMemo(() => ({
    entityType: 'auth:user',
    extractValue: (r: { recordId: string; presenter?: { title?: string } }) =>
      JSON.stringify({
        id: r.recordId,
        name: r.presenter?.title || '',
      }),
    placeholder: 'Search users...',
    minQueryLength: 2,
    initialSuggestions: {
      loadItems: loadInitialUsers,
      limit: 4,
    },
  }), [])

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'name',
      title: t('frc_rfqs.detail.columns.name', 'Opportunity Name'),
      width: 200,
      type: 'text',
    },
    {
      data: 'product',
      title: t('frc_rfqs.detail.columns.product', 'Product'),
      width: 150,
      type: 'dropdown',
      source: PRODUCT_OPTIONS,
    },
    {
      data: 'commodity',
      title: t('frc_rfqs.detail.columns.commodity', 'Commodity'),
      width: 150,
      type: 'text',
    },
    {
      data: 'salesStage',
      title: t('frc_rfqs.detail.columns.salesStage', 'Sales Stage'),
      width: 130,
      type: 'dropdown',
      source: SALES_STAGE_OPTIONS,
    },
    {
      data: 'probability',
      title: t('frc_rfqs.detail.columns.probability', 'Probability %'),
      width: 100,
      type: 'numeric',
    },
    {
      data: 'currencyCode',
      title: t('frc_rfqs.detail.columns.currency', 'Currency'),
      width: 90,
      type: 'dropdown',
      source: CURRENCY_OPTIONS,
    },
    {
      data: 'amount',
      title: t('frc_rfqs.detail.columns.amount', 'Amount'),
      width: 120,
      type: 'numeric',
    },
    {
      data: 'assignedToName',
      title: t('frc_rfqs.detail.columns.assignedTo', 'Assigned To'),
      width: 150,
      type: 'text',
      renderer: UserNameRenderer,
      editor: createEntitySearchEditor(userEditorConfig),
    },
  ], [t, userEditorConfig])

  const tableData = useMemo(() => [{
    id: data.id,
    name: data.name,
    product: data.product ?? '',
    commodity: data.commodity ?? '',
    salesStage: data.salesStage,
    probability: data.probability,
    currencyCode: data.currencyCode,
    amount: data.amount ?? '',
    assignedToId: data.assignedToId,
    assignedToName: data.assignedToName ?? '',
  }], [data])

  const handleCellSave = useCallback(async (field: string, value: unknown, rowIndex: number, colIndex: number) => {
    dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
      rowIndex,
      colIndex,
    } as CellSaveStartEvent)

    try {
      let actualField = field
      let processedValue: unknown = value

      switch (field) {
        case 'name':
          processedValue = String(value ?? '')
          break
        case 'product':
        case 'commodity':
          processedValue = value ? String(value) : null
          break
        case 'salesStage':
        case 'currencyCode':
          processedValue = String(value)
          break
        case 'probability':
          processedValue = Number(value) || 0
          break
        case 'amount':
          processedValue = value ? String(value) : null
          break
        case 'assignedToName':
          // Parse JSON from entity search to get assignedToId
          actualField = 'assignedToId'
          try {
            const parsed = JSON.parse(String(value))
            processedValue = parsed.id || null
          } catch {
            // Not JSON, set assignedToId to null (unlinking)
            processedValue = value || null
          }
          break
      }

      await onFieldSave(actualField, processedValue)

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
