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

import type { OpportunityDraft } from './types'
import {
  SALES_STAGE_OPTIONS,
  CURRENCY_OPTIONS,
  PRODUCT_OPTIONS,
} from './types'

interface OpportunityDetailsTableProps {
  draft: OpportunityDraft
  onDraftChange: (updates: Partial<OpportunityDraft>) => void
  nextTableRef?: React.RefObject<HTMLDivElement>
}

export function OpportunityDetailsTable({
  draft,
  onDraftChange,
  nextTableRef,
}: OpportunityDetailsTableProps) {
  const tableRef = useRef<HTMLDivElement>(null)

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'name',
      title: 'Opportunity Name *',
      width: 200,
      type: 'text',
    },
    {
      data: 'product',
      title: 'Product',
      width: 150,
      type: 'dropdown',
      source: PRODUCT_OPTIONS,
    },
    {
      data: 'commodity',
      title: 'Commodity',
      width: 150,
      type: 'text',
    },
    {
      data: 'salesStage',
      title: 'Sales Stage',
      width: 120,
      type: 'dropdown',
      source: SALES_STAGE_OPTIONS,
    },
    {
      data: 'probability',
      title: 'Probability %',
      width: 100,
      type: 'numeric',
    },
    {
      data: 'currencyCode',
      title: 'Currency',
      width: 90,
      type: 'dropdown',
      source: CURRENCY_OPTIONS,
    },
  ], [])

  const tableData = useMemo(() => [{
    id: 'draft',
    name: draft.name,
    product: draft.product ?? '',
    commodity: draft.commodity ?? '',
    salesStage: draft.salesStage,
    probability: draft.probability,
    currencyCode: draft.currencyCode,
  }], [draft])

  const handleCellChange = useCallback((field: string, value: unknown) => {
    const updates: Partial<OpportunityDraft> = {}

    switch (field) {
      case 'name':
        updates.name = String(value ?? '')
        break
      case 'product':
        updates.product = value ? String(value) : null
        break
      case 'commodity':
        updates.commodity = value ? String(value) : null
        break
      case 'salesStage':
        updates.salesStage = String(value) as OpportunityDraft['salesStage']
        break
      case 'probability':
        updates.probability = Number(value) || 0
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
        <h3 className="text-sm font-medium">Opportunity Details</h3>
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
