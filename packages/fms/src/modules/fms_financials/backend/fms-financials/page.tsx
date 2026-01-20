/**
 * FMS Financials Module - Dashboard View
 * Financial overview with margin analysis using DynamicTable
 */

'use client'

import * as React from 'react'
import { useMemo, useRef } from 'react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { DynamicTable } from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'

interface FinancialRow {
  id: string
  projectNumber: string
  clientName: string
  tradeLane: string
  status: string
  quotedRevenue: number
  quotedCost: number
  actualCost: number
  quotedMargin: number
  actualMargin: number
  marginVariance: number
  teu: number
  matchStatus: string
}

// Mocked financial data
const MOCKED_DATA: FinancialRow[] = [
  {
    id: '1',
    projectNumber: 'FMS-2026-001',
    clientName: 'Acme Corp',
    tradeLane: 'Shanghai - Rotterdam',
    status: 'completed',
    quotedRevenue: 45000,
    quotedCost: 38000,
    actualCost: 36500,
    quotedMargin: 7000,
    actualMargin: 8500,
    marginVariance: 1500,
    teu: 4,
    matchStatus: 'matched',
  },
  {
    id: '2',
    projectNumber: 'FMS-2026-002',
    clientName: 'Global Logistics Ltd',
    tradeLane: 'Los Angeles - Tokyo',
    status: 'confirmed',
    quotedRevenue: 32000,
    quotedCost: 28000,
    actualCost: 29500,
    quotedMargin: 4000,
    actualMargin: 2500,
    marginVariance: -1500,
    teu: 2,
    matchStatus: 'partial',
  },
  {
    id: '3',
    projectNumber: 'FMS-2026-003',
    clientName: 'TechParts Inc',
    tradeLane: 'Hamburg - New York',
    status: 'completed',
    quotedRevenue: 28500,
    quotedCost: 24000,
    actualCost: 23000,
    quotedMargin: 4500,
    actualMargin: 5500,
    marginVariance: 1000,
    teu: 3,
    matchStatus: 'matched',
  },
  {
    id: '4',
    projectNumber: 'FMS-2026-004',
    clientName: 'MegaStore Retail',
    tradeLane: 'Shenzhen - Long Beach',
    status: 'draft',
    quotedRevenue: 52000,
    quotedCost: 46000,
    actualCost: 0,
    quotedMargin: 6000,
    actualMargin: 0,
    marginVariance: 0,
    teu: 6,
    matchStatus: 'unmatched',
  },
  {
    id: '5',
    projectNumber: 'FMS-2026-005',
    clientName: 'AutoParts Global',
    tradeLane: 'Busan - Vancouver',
    status: 'confirmed',
    quotedRevenue: 18500,
    quotedCost: 15000,
    actualCost: 17200,
    quotedMargin: 3500,
    actualMargin: 1300,
    marginVariance: -2200,
    teu: 2,
    matchStatus: 'partial',
  },
  {
    id: '6',
    projectNumber: 'FMS-2026-006',
    clientName: 'FreshFoods Co',
    tradeLane: 'Antwerp - Santos',
    status: 'completed',
    quotedRevenue: 41000,
    quotedCost: 35500,
    actualCost: 38900,
    quotedMargin: 5500,
    actualMargin: 2100,
    marginVariance: -3400,
    teu: 5,
    matchStatus: 'matched',
  },
  {
    id: '7',
    projectNumber: 'FMS-2026-007',
    clientName: 'PharmaChem Industries',
    tradeLane: 'Singapore - Rotterdam',
    status: 'completed',
    quotedRevenue: 67000,
    quotedCost: 54000,
    actualCost: 52000,
    quotedMargin: 13000,
    actualMargin: 15000,
    marginVariance: 2000,
    teu: 8,
    matchStatus: 'matched',
  },
  {
    id: '8',
    projectNumber: 'FMS-2026-008',
    clientName: 'ElectroGoods Ltd',
    tradeLane: 'Hong Kong - Felixstowe',
    status: 'confirmed',
    quotedRevenue: 23000,
    quotedCost: 19500,
    actualCost: 21800,
    quotedMargin: 3500,
    actualMargin: 1200,
    marginVariance: -2300,
    teu: 3,
    matchStatus: 'unmatched',
  },
  {
    id: '9',
    projectNumber: 'FMS-2026-009',
    clientName: 'BuildMaterials Corp',
    tradeLane: 'Chennai - Melbourne',
    status: 'draft',
    quotedRevenue: 38000,
    quotedCost: 32000,
    actualCost: 0,
    quotedMargin: 6000,
    actualMargin: 0,
    marginVariance: 0,
    teu: 4,
    matchStatus: 'unmatched',
  },
  {
    id: '10',
    projectNumber: 'FMS-2026-010',
    clientName: 'TextileTrade Inc',
    tradeLane: 'Ningbo - Durban',
    status: 'completed',
    quotedRevenue: 29000,
    quotedCost: 25000,
    actualCost: 24100,
    quotedMargin: 4000,
    actualMargin: 4900,
    marginVariance: 900,
    teu: 3,
    matchStatus: 'matched',
  },
]

// Status badge renderer
const StatusRenderer = ({ value }: { value: string }) => {
  const statusMap: Record<string, { label: string; color: string }> = {
    draft: { label: 'Draft', color: 'bg-gray-100 text-gray-800' },
    confirmed: { label: 'Confirmed', color: 'bg-purple-100 text-purple-800' },
    completed: { label: 'Completed', color: 'bg-green-100 text-green-800' },
  }

  const status = statusMap[value] || { label: value, color: 'bg-gray-100 text-gray-800' }
  return (
    <span className={`inline-flex px-2 py-1 text-xs rounded-full ${status.color}`}>
      {status.label}
    </span>
  )
}

// Match status renderer
const MatchStatusRenderer = ({ value }: { value: string }) => {
  const statusMap: Record<string, { label: string; color: string }> = {
    matched: { label: 'Matched', color: 'bg-green-100 text-green-800' },
    partial: { label: 'Partial', color: 'bg-yellow-100 text-yellow-800' },
    unmatched: { label: 'Unmatched', color: 'bg-red-100 text-red-800' },
  }

  const status = statusMap[value] || { label: value, color: 'bg-gray-100 text-gray-800' }
  return (
    <span className={`inline-flex px-2 py-1 text-xs rounded-full ${status.color}`}>
      {status.label}
    </span>
  )
}

// Currency formatter
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

// Project number link renderer
const ProjectNumberRenderer = ({ value }: { value: string }) => {
  return (
    <a
      href={`/backend/fms-projects?q=${value}`}
      className="text-blue-600 hover:text-blue-800 hover:underline font-medium font-mono"
    >
      {value}
    </a>
  )
}

const RENDERERS: Record<string, (value: any, rowData: any) => React.ReactNode> = {
  StatusRenderer: (value) => <StatusRenderer value={value} />,
  MatchStatusRenderer: (value) => <MatchStatusRenderer value={value} />,
  ProjectNumberRenderer: (value) => <ProjectNumberRenderer value={value} />,
  CurrencyRenderer: (value) => formatCurrency(value || 0),
}

export default function FinancialsDashboardPage() {
  const tableRef = useRef<HTMLDivElement>(null)

  const columns = useMemo((): ColumnDef[] => {
    return [
      {
        data: 'projectNumber',
        title: 'Project #',
        width: 140,
        readOnly: true,
        renderer: RENDERERS.ProjectNumberRenderer,
      },
      {
        data: 'clientName',
        title: 'Client',
        width: 160,
        readOnly: true,
      },
      {
        data: 'tradeLane',
        title: 'Trade Lane',
        width: 180,
        readOnly: true,
      },
      {
        data: 'status',
        title: 'Status',
        width: 110,
        readOnly: true,
        renderer: RENDERERS.StatusRenderer,
      },
      {
        data: 'quotedRevenue',
        title: 'Quoted Revenue',
        width: 130,
        type: 'numeric',
        readOnly: true,
        renderer: RENDERERS.CurrencyRenderer,
      },
      {
        data: 'quotedCost',
        title: 'Quoted Cost',
        width: 120,
        type: 'numeric',
        readOnly: true,
        renderer: RENDERERS.CurrencyRenderer,
      },
      {
        data: 'actualCost',
        title: 'Actual Cost',
        width: 120,
        type: 'numeric',
        readOnly: true,
        renderer: RENDERERS.CurrencyRenderer,
      },
      {
        data: 'quotedMargin',
        title: 'Quoted Margin',
        width: 130,
        type: 'numeric',
        readOnly: true,
        renderer: RENDERERS.CurrencyRenderer,
        cellClassName: (value: number) => {
          if (value > 0) return 'cell-green'
          if (value < 0) return 'cell-red'
          return ''
        },
      },
      {
        data: 'actualMargin',
        title: 'Actual Margin',
        width: 130,
        type: 'numeric',
        readOnly: true,
        renderer: RENDERERS.CurrencyRenderer,
        cellClassName: (value: number) => {
          if (value > 0) return 'cell-green'
          if (value < 0) return 'cell-red'
          return ''
        },
      },
      {
        data: 'marginVariance',
        title: 'Variance',
        width: 120,
        type: 'numeric',
        readOnly: true,
        renderer: RENDERERS.CurrencyRenderer,
        cellClassName: (value: number) => {
          if (value > 0) return 'cell-green'
          if (value < 0) return 'cell-red'
          return ''
        },
      },
      {
        data: 'teu',
        title: 'TEU',
        width: 70,
        type: 'numeric',
        readOnly: true,
      },
      {
        data: 'matchStatus',
        title: 'Match Status',
        width: 120,
        readOnly: true,
        renderer: RENDERERS.MatchStatusRenderer,
      },
    ] as ColumnDef[]
  }, [])

  return (
    <Page>
      <PageBody>
        <DynamicTable
          tableRef={tableRef}
          data={MOCKED_DATA}
          columns={columns}
          tableName="FMS Financials"
          idColumnName="id"
          height="calc(100vh - 110px)"
          colHeaders={true}
          rowHeaders={true}
          uiConfig={{
            hideAddRowButton: true,
            hideActionsColumn: true,
            enableFullscreen: true,
          }}
          debug={process.env.NODE_ENV === 'development'}
        />
      </PageBody>
    </Page>
  )
}
