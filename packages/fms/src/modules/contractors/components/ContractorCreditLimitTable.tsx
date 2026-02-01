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
  CellEditSaveEvent,
  CellSaveStartEvent,
  CellSaveSuccessEvent,
  CellSaveErrorEvent,
  NewRowSaveEvent,
  NewRowSaveSuccessEvent,
  NewRowSaveErrorEvent,
  ColumnDef,
} from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'

const CURRENCIES = ['USD', 'EUR', 'PLN', 'GBP', 'CHF'] as const

type CreditLimit = {
  id: string
  creditLimit: string
  currencyCode: string
  isUnlimited: boolean
  paymentDays?: number
  currentExposure?: string
  notes?: string | null
}

type ContractorCreditLimitTableProps = {
  contractorId: string
  creditLimit?: CreditLimit | null
  onUpdated?: () => void
}

export function ContractorCreditLimitTable({
  contractorId,
  creditLimit,
  onUpdated,
}: ContractorCreditLimitTableProps) {
  const t = useT()
  const tableRef = useRef<HTMLDivElement>(null)

  // Table columns definition
  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'creditLimit',
      title: t('contractors.credit.limit', 'Credit Limit'),
      width: 150,
      type: 'numeric',
    },
    {
      data: 'currencyCode',
      title: t('contractors.credit.currency', 'Currency'),
      width: 100,
      type: 'dropdown',
      source: [...CURRENCIES],
    },
    {
      data: 'paymentDays',
      title: t('contractors.credit.paymentDays', 'Payment Days'),
      width: 120,
      type: 'numeric',
    },
    {
      data: 'isUnlimited',
      title: t('contractors.credit.unlimited', 'Unlimited'),
      width: 100,
      type: 'checkbox',
    },
    {
      data: 'currentExposure',
      title: t('contractors.credit.exposure', 'Current Exposure'),
      width: 150,
      type: 'numeric',
      readOnly: true,
      renderer: (value: unknown) => {
        const num = parseFloat(String(value) || '0')
        return <span className="text-muted-foreground">{num.toFixed(2)}</span>
      },
    },
    {
      data: 'notes',
      title: t('contractors.credit.notes', 'Notes'),
      width: 200,
      type: 'text',
    },
  ], [t])

  // Table data - empty array shows "Add Row" to create first entry
  const tableData = useMemo(() => {
    if (!creditLimit) return []
    return [{
      id: creditLimit.id,
      creditLimit: creditLimit.creditLimit,
      currencyCode: creditLimit.currencyCode,
      paymentDays: creditLimit.paymentDays,
      isUnlimited: creditLimit.isUnlimited,
      currentExposure: creditLimit.currentExposure,
      notes: creditLimit.notes ?? '',
    }]
  }, [creditLimit])

  // Handle cell edit save
  const handleCellSave = useCallback(async (payload: CellEditSaveEvent) => {
    dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
      rowIndex: payload.rowIndex,
      colIndex: payload.colIndex,
    } as CellSaveStartEvent)

    try {
      const response = await apiCall('/api/contractors/credit-limits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractorId,
          [payload.prop]: payload.newValue === '' ? null : payload.newValue,
        }),
      })

      if (!response.ok) {
        const errorMsg = (response.result as { error?: string })?.error ?? 'Update failed'
        throw new Error(errorMsg)
      }

      dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_SUCCESS, {
        rowIndex: payload.rowIndex,
        colIndex: payload.colIndex,
      } as CellSaveSuccessEvent)

      onUpdated?.()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Update failed'
      dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_ERROR, {
        rowIndex: payload.rowIndex,
        colIndex: payload.colIndex,
        error: errorMessage,
      } as CellSaveErrorEvent)
      flash(errorMessage, 'error')
    }
  }, [contractorId, onUpdated])

  // Handle new row save
  const handleNewRowSave = useCallback(async (payload: NewRowSaveEvent) => {
    dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_START, {
      rowIndex: payload.rowIndex,
    })

    try {
      const response = await apiCall('/api/contractors/credit-limits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractorId,
          creditLimit: payload.rowData.creditLimit || null,
          currencyCode: payload.rowData.currencyCode || null,
          paymentDays: payload.rowData.paymentDays || null,
          isUnlimited: payload.rowData.isUnlimited || false,
          notes: payload.rowData.notes || null,
        }),
      })

      if (!response.ok) {
        const errorMsg = (response.result as { error?: string })?.error ?? 'Failed to save'
        throw new Error(errorMsg)
      }

      dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_SUCCESS, {
        rowIndex: payload.rowIndex,
        savedRowData: response.result,
      } as NewRowSaveSuccessEvent)

      flash(t('contractors.credit.saved', 'Credit limit saved'), 'success')
      onUpdated?.()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_ERROR, {
        rowIndex: payload.rowIndex,
        error: errorMessage,
      } as NewRowSaveErrorEvent)
      flash(errorMessage, 'error')
    }
  }, [contractorId, onUpdated, t])

  // Event handlers for DynamicTable
  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: handleCellSave,
      [TableEvents.NEW_ROW_SAVE]: handleNewRowSave,
    },
    tableRef as React.RefObject<HTMLElement>
  )

  // Generate key to force re-render when data changes
  const tableKey = useMemo(() => {
    if (!creditLimit) return 'empty'
    return `credit-${creditLimit.id}-${creditLimit.creditLimit}-${creditLimit.currencyCode}-${creditLimit.isUnlimited}-${creditLimit.paymentDays}-${creditLimit.notes}`
  }, [creditLimit])

  // Hide Add Row button if credit limit already exists (only one per contractor)
  const hideAddRow = !!creditLimit

  // Calculate height - needs toolbar + header + data row
  const tableHeight = tableData.length === 0 ? 160 : 160

  return (
    <div style={{ height: tableHeight }}>
      <DynamicTable
        key={tableKey}
        tableRef={tableRef}
        data={tableData}
        columns={columns}
        tableName={t('contractors.credit.title', 'Credit Limit')}
        idColumnName="id"
        width="100%"
        height="100%"
        colHeaders={true}
        rowHeaders={false}
        stretchColumns={true}
        uiConfig={{
          hideToolbar: false,
          hideSearch: true,
          hideFilterButton: true,
          hideAddRowButton: hideAddRow,
          hideBottomBar: true,
          hideActionsColumn: false,
        }}
      />
    </div>
  )
}
