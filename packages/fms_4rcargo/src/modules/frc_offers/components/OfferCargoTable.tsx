'use client'

import * as React from 'react'
import { useRef, useMemo } from 'react'
import { DynamicTable } from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'
import { useT } from '@open-mercato/shared/lib/i18n/context'

export type OfferLineData = {
  id: string
  name: string
  numberOfPieces: number
  lengthCm: string | null
  widthCm: string | null
  heightCm: string | null
  volumeM3: string
  actualWeightKg: string
  chargeableWeightKg: string
  stackableType: string
}

interface OfferCargoTableProps {
  offerLines: OfferLineData[]
  tableRef?: React.RefObject<HTMLDivElement | null>
  siblingTableRefs?: {
    prev?: React.RefObject<HTMLDivElement | null>
    next?: React.RefObject<HTMLDivElement | null>
  }
}

function formatNumber(value: string | number | null, decimals = 2): string {
  if (value === null || value === undefined || value === '') return '-'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '-'
  return num.toFixed(decimals)
}

const stackableRenderer = (value: unknown) => {
  const stackable = value as string
  const isStackable = stackable === 'fully_stackable'
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        isStackable ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
      }`}
    >
      {isStackable ? 'Stackable' : 'Non-stackable'}
    </span>
  )
}

export function OfferCargoTable({
  offerLines,
  tableRef: externalTableRef,
  siblingTableRefs,
}: OfferCargoTableProps) {
  const t = useT()
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'name',
      title: t('frc_offers.detail.cargo.name', 'Name'),
      width: 150,
      type: 'text',
      readOnly: true,
    },
    {
      data: 'numberOfPieces',
      title: t('frc_offers.detail.cargo.pieces', 'Pieces'),
      width: 70,
      type: 'numeric',
      readOnly: true,
    },
    {
      data: 'lengthCm',
      title: t('frc_offers.detail.cargo.length', 'L (cm)'),
      width: 80,
      type: 'numeric',
      readOnly: true,
    },
    {
      data: 'widthCm',
      title: t('frc_offers.detail.cargo.width', 'W (cm)'),
      width: 80,
      type: 'numeric',
      readOnly: true,
    },
    {
      data: 'heightCm',
      title: t('frc_offers.detail.cargo.height', 'H (cm)'),
      width: 80,
      type: 'numeric',
      readOnly: true,
    },
    {
      data: 'volumeM3',
      title: t('frc_offers.detail.cargo.volume', 'Vol (m³)'),
      width: 90,
      type: 'numeric',
      readOnly: true,
    },
    {
      data: 'actualWeightKg',
      title: t('frc_offers.detail.cargo.weight', 'Wt (kg)'),
      width: 90,
      type: 'numeric',
      readOnly: true,
    },
    {
      data: 'chargeableWeightKg',
      title: t('frc_offers.detail.cargo.chargeableWeight', 'Chg (kg)'),
      width: 90,
      type: 'numeric',
      readOnly: true,
    },
    {
      data: 'stackableType',
      title: t('frc_offers.detail.cargo.stackable', 'Stackable'),
      width: 110,
      type: 'text',
      readOnly: true,
      renderer: stackableRenderer,
    },
  ], [t])

  const tableData = useMemo(() =>
    offerLines.map((line) => ({
      id: line.id,
      name: line.name,
      numberOfPieces: line.numberOfPieces,
      lengthCm: formatNumber(line.lengthCm),
      widthCm: formatNumber(line.widthCm),
      heightCm: formatNumber(line.heightCm),
      volumeM3: formatNumber(line.volumeM3, 4),
      actualWeightKg: formatNumber(line.actualWeightKg),
      chargeableWeightKg: formatNumber(line.chargeableWeightKg),
      stackableType: line.stackableType,
    })),
  [offerLines])

  if (offerLines.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-md">
        {t('frc_offers.detail.cargo.empty', 'No cargo items. Create an offer from an opportunity to auto-populate cargo.')}
      </div>
    )
  }

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
