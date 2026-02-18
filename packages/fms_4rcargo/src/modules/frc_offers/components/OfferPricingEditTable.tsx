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

const CURRENCY_OPTIONS = ['EUR', 'USD', 'GBP', 'CHF', 'PLN']

export type OfferPricingData = {
  connectionRatePerKg: string | null
  connectionRateTotal: string | null
  airfreightRatePerKg: string | null
  airfreightRateTotal: string | null
  totalRatePerKg: string | null
  totalRate: string | null
  currencyCode: string
  chargeableWeight: string | null // For auto-calculation
}

interface OfferPricingEditTableProps {
  offerId: string
  data: OfferPricingData
  onFieldSave: (field: string, value: unknown) => Promise<void>
  tableRef?: React.RefObject<HTMLDivElement | null>
  siblingTableRefs?: {
    prev?: React.RefObject<HTMLDivElement | null>
    next?: React.RefObject<HTMLDivElement | null>
  }
}

type PricingRow = {
  id: string
  rateType: string
  perKg: string
  total: string
  currencyCode: string
  isTotal: boolean
  fieldPrefix: string
}

export function OfferPricingEditTable({
  offerId,
  data,
  onFieldSave,
  tableRef: externalTableRef,
  siblingTableRefs,
}: OfferPricingEditTableProps) {
  const t = useT()
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'rateType',
      title: t('frc_offers.detail.pricing.rateType', 'Rate Type'),
      width: 150,
      type: 'text',
      readOnly: true,
      renderer: (value: unknown, row: Record<string, unknown>) => {
        const isTotal = row.isTotal as boolean
        return (
          <span className={isTotal ? 'font-semibold text-primary' : ''}>
            {value as string}
          </span>
        )
      },
    },
    {
      data: 'perKg',
      title: t('frc_offers.detail.pricing.perKg', 'Per KG'),
      width: 120,
      type: 'numeric',
      renderer: (value: unknown, row: Record<string, unknown>) => {
        const isTotal = row.isTotal as boolean
        const val = value as string
        if (!val) return <span className="text-muted-foreground">-</span>
        return (
          <span className={isTotal ? 'font-semibold' : ''}>
            {val}
          </span>
        )
      },
    },
    {
      data: 'total',
      title: t('frc_offers.detail.pricing.total', 'Total'),
      width: 140,
      type: 'numeric',
      renderer: (value: unknown, row: Record<string, unknown>) => {
        const isTotal = row.isTotal as boolean
        const currency = row.currencyCode as string
        const val = value as string
        if (!val) return <span className="text-muted-foreground">-</span>
        return (
          <span className={isTotal ? 'font-bold text-primary text-lg' : 'font-medium'}>
            {val} {currency}
          </span>
        )
      },
    },
    {
      data: 'currencyCode',
      title: t('frc_offers.detail.pricing.currency', 'Currency'),
      width: 100,
      type: 'dropdown',
      source: CURRENCY_OPTIONS,
    },
  ], [t])

  const tableData = useMemo((): PricingRow[] => [
    {
      id: 'connection',
      rateType: t('frc_offers.detail.pricing.connection', 'Connection Rate'),
      perKg: data.connectionRatePerKg ?? '',
      total: data.connectionRateTotal ?? '',
      currencyCode: data.currencyCode,
      isTotal: false,
      fieldPrefix: 'connectionRate',
    },
    {
      id: 'airfreight',
      rateType: t('frc_offers.detail.pricing.airfreight', 'Airfreight Rate'),
      perKg: data.airfreightRatePerKg ?? '',
      total: data.airfreightRateTotal ?? '',
      currencyCode: data.currencyCode,
      isTotal: false,
      fieldPrefix: 'airfreightRate',
    },
    {
      id: 'total',
      rateType: t('frc_offers.detail.pricing.totalRate', 'Total'),
      perKg: data.totalRatePerKg ?? '',
      total: data.totalRate ?? '',
      currencyCode: data.currencyCode,
      isTotal: true,
      fieldPrefix: 'totalRate',
    },
  ], [data, t])

  const handleCellSave = useCallback(async (
    rowId: string,
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
      const row = tableData.find((r) => r.id === rowId)
      if (!row) throw new Error('Row not found')

      // Map field to actual API field name
      let apiField: string
      let processedValue: unknown = value

      if (field === 'perKg') {
        apiField = `${row.fieldPrefix}PerKg`
        processedValue = value ? String(value) : null

        // Auto-calculate total if chargeable weight is available
        if (value && data.chargeableWeight) {
          const perKgValue = parseFloat(String(value)) || 0
          const chargeableWeight = parseFloat(data.chargeableWeight) || 0
          const totalValue = (perKgValue * chargeableWeight).toFixed(4)
          
          // Save both perKg and total
          await onFieldSave(apiField, processedValue)
          await onFieldSave(`${row.fieldPrefix}Total`, totalValue)
          
          // Also recalculate total rate if this is connection or airfreight
          if (row.id !== 'total') {
            await recalculateTotalRate()
          }
        } else {
          await onFieldSave(apiField, processedValue)
        }
      } else if (field === 'total') {
        apiField = `${row.fieldPrefix}Total`
        processedValue = value ? String(value) : null
        await onFieldSave(apiField, processedValue)
        
        // Recalculate total rate if this is connection or airfreight
        if (row.id !== 'total') {
          await recalculateTotalRate()
        }
      } else if (field === 'currencyCode') {
        apiField = 'currencyCode'
        processedValue = String(value)
        await onFieldSave(apiField, processedValue)
      } else {
        throw new Error(`Unknown field: ${field}`)
      }

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
  }, [onFieldSave, tableRef, tableData, data.chargeableWeight])

  const recalculateTotalRate = useCallback(async () => {
    // Get current values from data (they should be updated by now from previous saves)
    const connectionTotal = parseFloat(data.connectionRateTotal ?? '0') || 0
    const airfreightTotal = parseFloat(data.airfreightRateTotal ?? '0') || 0
    const newTotalRate = (connectionTotal + airfreightTotal).toFixed(4)
    
    // Calculate perKg if chargeable weight exists
    if (data.chargeableWeight) {
      const chargeableWeight = parseFloat(data.chargeableWeight) || 0
      if (chargeableWeight > 0) {
        const newTotalPerKg = (parseFloat(newTotalRate) / chargeableWeight).toFixed(4)
        await onFieldSave('totalRatePerKg', newTotalPerKg)
      }
    }
    
    await onFieldSave('totalRate', newTotalRate)
  }, [data, onFieldSave])

  useEventHandlers(
    {
      [TableEvents.CELL_EDIT_SAVE]: (payload: CellEditSaveEvent) => {
        const rowId = payload.id as string
        handleCellSave(rowId, payload.prop, payload.newValue, payload.rowIndex, payload.colIndex)
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
