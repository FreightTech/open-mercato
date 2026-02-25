'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye } from 'lucide-react'
import { DynamicTable } from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'

export interface OpportunityData {
  id: string
  name: string
  salesStage: string
  originAirport: { id: string; code: string; city: string | null } | null
  destinationAirport: { id: string; code: string; city: string | null } | null
  shipmentReadyDate: string | null
  requiredAtDestinationDate: string | null
  product: string | null
  commodity: string | null
  totalPieces: number
  totalVolume: string
  totalActualWeight: string
  totalChargeableWeight: string
}

interface ProjectOpportunityTableProps {
  opportunity: OpportunityData
  tableRef?: React.RefObject<HTMLDivElement | null>
  siblingTableRefs?: {
    prev?: React.RefObject<HTMLDivElement | null>
    next?: React.RefObject<HTMLDivElement | null>
  }
}

const STAGE_CONFIG: Record<string, { label: string; bgColor: string; textColor: string }> = {
  lead: { label: 'Lead', bgColor: '#f3f4f6', textColor: '#374151' },
  qualified: { label: 'Qualified', bgColor: '#dbeafe', textColor: '#1e40af' },
  proposal: { label: 'Proposal', bgColor: '#fef3c7', textColor: '#92400e' },
  won: { label: 'Won', bgColor: '#dcfce7', textColor: '#166534' },
  lost: { label: 'Lost', bgColor: '#fee2e2', textColor: '#991b1b' },
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString()
  } catch {
    return dateStr
  }
}

function formatNumber(value: string | number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined) return '-'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return String(value)
  return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function ProjectOpportunityTable({
  opportunity,
  tableRef: externalTableRef,
  siblingTableRefs,
}: ProjectOpportunityTableProps) {
  const t = useT()
  const router = useRouter()
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef

  const handleViewOpportunity = () => {
    router.push(`/backend/frc-rfqs/${opportunity.id}`)
  }

  // Actions renderer for the built-in actions column
  const actionsRenderer = useCallback(
    () => (
      <div className="flex items-center justify-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            handleViewOpportunity()
          }}
          className="h-7 w-7 p-0"
          title={t('common.view', 'View')}
        >
          <Eye className="h-4 w-4" />
        </Button>
      </div>
    ),
    [handleViewOpportunity, t]
  )

  const columns = useMemo(
    (): ColumnDef[] => [
      {
        data: 'name',
        title: t('frc_projects.detail.opportunity.name', 'Name'),
        width: 200,
        type: 'text',
        readOnly: true,
        renderer: (value: unknown, row: Record<string, unknown>) => {
          const id = row.id as string
          const name = value as string
          return (
            <Link href={`/backend/frc-rfqs/${id}`} className="text-primary hover:underline font-medium">
              {name}
            </Link>
          )
        },
      },
      {
        data: 'salesStage',
        title: t('frc_projects.detail.opportunity.stage', 'Stage'),
        width: 100,
        type: 'text',
        readOnly: true,
        renderer: (value: unknown) => {
          const stage = value as string
          const config = STAGE_CONFIG[stage] ?? { label: stage, bgColor: '#f3f4f6', textColor: '#374151' }
          return (
            <span
              className="px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full"
              style={{
                backgroundColor: config.bgColor,
                color: config.textColor,
              }}
            >
              {t(`frc_rfqs.salesStage.${stage}`, config.label)}
            </span>
          )
        },
      },
      {
        data: 'route',
        title: t('frc_projects.detail.opportunity.route', 'Route'),
        width: 120,
        type: 'text',
        readOnly: true,
        renderer: (value: unknown) => {
          return <span className="font-mono text-sm">{value as string}</span>
        },
      },
      {
        data: 'shipmentReadyDate',
        title: t('frc_projects.detail.opportunity.readyDate', 'Ready Date'),
        width: 100,
        type: 'text',
        readOnly: true,
        renderer: (value: unknown) => formatDate(value as string | null),
      },
      {
        data: 'totalPieces',
        title: t('frc_projects.detail.opportunity.pieces', 'Pieces'),
        width: 80,
        type: 'text',
        readOnly: true,
        renderer: (value: unknown) => {
          const pieces = value as number
          return <span className="font-mono">{pieces}</span>
        },
      },
      {
        data: 'totalActualWeight',
        title: t('frc_projects.detail.opportunity.weight', 'Weight'),
        width: 100,
        type: 'text',
        readOnly: true,
        renderer: (value: unknown) => {
          const weight = value as string | null
          if (!weight) return <span className="text-muted-foreground">-</span>
          return (
            <span className="font-mono">
              {formatNumber(weight)} kg
            </span>
          )
        },
      },

    ],
    [t, handleViewOpportunity]
  )

  const tableData = useMemo(
    () => [
      {
        id: opportunity.id,
        name: opportunity.name,
        salesStage: opportunity.salesStage,
        route: `${opportunity.originAirport?.code ?? '?'} → ${opportunity.destinationAirport?.code ?? '?'}`,
        shipmentReadyDate: opportunity.shipmentReadyDate,
        totalPieces: opportunity.totalPieces,
        totalActualWeight: opportunity.totalActualWeight,
      },
    ],
    [opportunity]
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
        actionsRenderer={actionsRenderer}
        onRowClick={handleViewOpportunity}
        uiConfig={{
          hideToolbar: true,
          hideSearch: true,
          hideAddRowButton: true,
          hideBottomBar: true,
          hideFilterButton: true,
        }}
      />
    </div>
  )
}
