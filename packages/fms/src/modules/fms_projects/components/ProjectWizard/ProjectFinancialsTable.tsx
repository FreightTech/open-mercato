'use client'

import * as React from 'react'
import { useRef, useMemo } from 'react'
import {
  DynamicTable,
} from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'

// Define ProjectLine type locally
interface ProjectLine {
  id: string
  soldAmount: string
  actualCost?: string | null
}

type ProjectFinancialsTableProps = {
  projectLines: ProjectLine[]
  currencyCode: string
  tableRef?: React.RefObject<HTMLDivElement | null>
  siblingTableRefs?: { prev?: React.RefObject<HTMLDivElement | null>; next?: React.RefObject<HTMLDivElement | null> }
  autoSelectOnFocus?: boolean
}

// Calculate financial totals from project lines
function calculateFinancials(projectLines: ProjectLine[]): { revenue: number; costs: number; margin: number; marginPercent: number } {
  if (!projectLines || projectLines.length === 0) {
    return { revenue: 0, costs: 0, margin: 0, marginPercent: 0 }
  }

  const revenue = projectLines.reduce((sum, line) => {
    return sum + (parseFloat(line.soldAmount) || 0)
  }, 0)

  const costs = projectLines.reduce((sum, line) => {
    return sum + (parseFloat(line.actualCost || '0') || 0)
  }, 0)

  const margin = revenue - costs
  const marginPercent = revenue > 0 ? (margin / revenue) * 100 : 0

  return { revenue, costs, margin, marginPercent }
}

// Format currency value
function formatCurrency(value: number, currencyCode: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function ProjectFinancialsTable({
  projectLines,
  currencyCode,
  tableRef: externalTableRef,
  siblingTableRefs,
  autoSelectOnFocus,
}: ProjectFinancialsTableProps) {
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef

  // Calculate financials
  const financials = useMemo(() => calculateFinancials(projectLines), [projectLines])

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'revenue',
      title: 'Revenue',
      width: 120,
      readOnly: true,
      renderer: (val: unknown) => {
        const numVal = typeof val === 'number' ? val : parseFloat(String(val) || '0')
        return (
          <div className="bg-green-100 -m-1 p-1 h-full w-full flex items-center">
            <span className="font-medium text-green-800">{formatCurrency(numVal, currencyCode)}</span>
          </div>
        )
      },
    },
    {
      data: 'costs',
      title: 'Costs',
      width: 120,
      readOnly: true,
      renderer: (val: unknown) => {
        const numVal = typeof val === 'number' ? val : parseFloat(String(val) || '0')
        return (
          <div className="bg-red-100 -m-1 p-1 h-full w-full flex items-center">
            <span className="font-medium text-red-800">{formatCurrency(numVal, currencyCode)}</span>
          </div>
        )
      },
    },
    {
      data: 'margin',
      title: 'Margin',
      width: 120,
      readOnly: true,
      renderer: (val: unknown) => {
        const numVal = typeof val === 'number' ? val : parseFloat(String(val) || '0')
        const bgColor = numVal >= 0 ? 'bg-green-100' : 'bg-red-100'
        const textColor = numVal >= 0 ? 'text-green-800' : 'text-red-800'
        return (
          <div className={`${bgColor} -m-1 p-1 h-full w-full flex items-center`}>
            <span className={`font-medium ${textColor}`}>{formatCurrency(numVal, currencyCode)}</span>
          </div>
        )
      },
    },
    {
      data: 'marginPercent',
      title: 'Margin %',
      width: 100,
      readOnly: true,
      renderer: (val: unknown) => {
        const numVal = typeof val === 'number' ? val : parseFloat(String(val) || '0')
        const bgColor = numVal >= 0 ? 'bg-green-100' : 'bg-red-100'
        const textColor = numVal >= 0 ? 'text-green-800' : 'text-red-800'
        return (
          <div className={`${bgColor} -m-1 p-1 h-full w-full flex items-center`}>
            <span className={`font-medium ${textColor}`}>{numVal.toFixed(1)}%</span>
          </div>
        )
      },
    },
  ], [currencyCode])

  const tableData = useMemo(() => [{
    id: 'financials',
    revenue: financials.revenue,
    costs: financials.costs,
    margin: financials.margin,
    marginPercent: financials.marginPercent,
  }], [financials])

  return (
    <div className="border rounded-lg">
      <div className="px-4 py-2 border-b">
        <h3 className="text-sm font-medium">Financials</h3>
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
        autoSelectOnFocus={autoSelectOnFocus}
        siblingTableRefs={siblingTableRefs}
        uiConfig={{
          hideSearch: true,
          hideAddRowButton: true,
          hideActionsColumn: true,
          toolbarPosition: 'bottom',
          hideFilterPopover: true,
          hideSortButton: true,
        }}
      />
    </div>
  )
}
