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

type BankAccount = {
  id: string
  bankName?: string | null
  iban?: string | null
  swiftBic?: string | null
  currencyCode: string
  isPrimary?: boolean
}

type ContractorBankAccountTableProps = {
  contractorId: string
  bankAccounts?: BankAccount[]
  onUpdated?: () => void
}

export function ContractorBankAccountTable({
  contractorId,
  bankAccounts = [],
  onUpdated,
}: ContractorBankAccountTableProps) {
  const t = useT()
  const tableRef = useRef<HTMLDivElement>(null)

  // Table columns definition
  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'bankName',
      title: t('contractors.bankAccounts.bankName', 'Bank Name'),
      width: 200,
      type: 'text',
    },
    {
      data: 'iban',
      title: t('contractors.bankAccounts.iban', 'IBAN'),
      width: 250,
      type: 'text',
    },
    {
      data: 'swiftBic',
      title: t('contractors.bankAccounts.swift', 'SWIFT/BIC'),
      width: 150,
      type: 'text',
    },
    {
      data: 'currencyCode',
      title: t('contractors.bankAccounts.currency', 'Currency'),
      width: 100,
      type: 'dropdown',
      source: [...CURRENCIES],
    },
    {
      data: 'isPrimary',
      title: t('contractors.bankAccounts.primary', 'Primary'),
      width: 80,
      type: 'boolean',
    },
  ], [t])

  // Table data - no default values
  const tableData = useMemo(() => {
    return bankAccounts.map(account => ({
      id: account.id,
      bankName: account.bankName ?? '',
      iban: account.iban ?? '',
      swiftBic: account.swiftBic ?? '',
      currencyCode: account.currencyCode,
      isPrimary: account.isPrimary ?? false,
    }))
  }, [bankAccounts])

  // Handle cell edit save
  const handleCellSave = useCallback(async (payload: CellEditSaveEvent) => {
    dispatch(tableRef.current as HTMLElement, TableEvents.CELL_SAVE_START, {
      rowIndex: payload.rowIndex,
      colIndex: payload.colIndex,
    } as CellSaveStartEvent)

    try {
      const response = await apiCall('/api/contractors/bank-accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: payload.id,
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
  }, [onUpdated])

  // Handle new row save
  const handleNewRowSave = useCallback(async (payload: NewRowSaveEvent) => {
    dispatch(tableRef.current as HTMLElement, TableEvents.NEW_ROW_SAVE_START, {
      rowIndex: payload.rowIndex,
    })

    try {
      const response = await apiCall('/api/contractors/bank-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractorId,
          accounts: [{
            bankName: payload.rowData.bankName || null,
            iban: payload.rowData.iban || null,
            swiftBic: payload.rowData.swiftBic || null,
            currencyCode: payload.rowData.currencyCode || null,
            isPrimary: payload.rowData.isPrimary || false,
          }],
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

      flash(t('contractors.bankAccounts.saved', 'Bank account saved'), 'success')
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
    if (bankAccounts.length === 0) return 'empty'
    return `bank-accounts-${bankAccounts.map(a => `${a.id}-${a.bankName}-${a.iban}`).join('-')}`
  }, [bankAccounts])

  // Calculate dynamic height based on number of rows
  const tableHeight = useMemo(() => {
    const rowHeight = 40
    const headerHeight = 40
    const minHeight = 120
    const maxHeight = 300
    const contentHeight = headerHeight + (tableData.length * rowHeight) + 50
    return Math.min(Math.max(contentHeight, minHeight), maxHeight)
  }, [tableData.length])

  return (
    <div style={{ height: tableHeight }}>
      <DynamicTable
        key={tableKey}
        tableRef={tableRef}
        data={tableData}
        columns={columns}
        tableName={t('contractors.bankAccounts.title', 'Bank Accounts')}
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
          hideAddRowButton: false,
          hideBottomBar: true,
          hideActionsColumn: false,
        }}
      />
    </div>
  )
}
