'use client'

import * as React from 'react'
import { useRef, useMemo } from 'react'
import { DynamicTable } from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'
import { useT } from '@open-mercato/shared/lib/i18n/context'

export type ProjectCargoData = {
  id: string
  name: string
  numberOfPieces: number
  lengthCm: string | null
  widthCm: string | null
  heightCm: string | null
  volumeM3: string
  actualWeightKg: string
  chargeableWeightKg: string
}

interface ProjectCargoTableProps {
  cargoItems: ProjectCargoData[]
  onViewRfq?: () => void
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

function formatDimensions(
  lengthCm: string | null,
  widthCm: string | null,
  heightCm: string | null
): string {
  if (!lengthCm && !widthCm && !heightCm) return '-'
  const l = lengthCm ?? '?'
  const w = widthCm ?? '?'
  const h = heightCm ?? '?'
  return `${l}x${w}x${h}`
}

export function ProjectCargoTable({
  cargoItems,
  onViewRfq,
  tableRef: externalTableRef,
  siblingTableRefs,
}: ProjectCargoTableProps) {
  const t = useT()
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'name',
      title: t('frc_projects.detail.cargo.name', 'Name'),
      width: 150,
      type: 'text',
      readOnly: true,
    },
    {
      data: 'numberOfPieces',
      title: t('frc_projects.detail.cargo.pieces', 'Pieces'),
      width: 70,
      type: 'numeric',
      readOnly: true,
    },
    {
      data: 'dimensions',
      title: t('frc_projects.detail.cargo.dimensions', 'Dimensions (cm)'),
      width: 130,
      type: 'text',
      readOnly: true,
    },
    {
      data: 'volumeM3',
      title: t('frc_projects.detail.cargo.volume', 'Vol (m³)'),
      width: 90,
      type: 'numeric',
      readOnly: true,
    },
    {
      data: 'actualWeightKg',
      title: t('frc_projects.detail.cargo.actualWeight', 'Act (kg)'),
      width: 90,
      type: 'numeric',
      readOnly: true,
    },
    {
      data: 'chargeableWeightKg',
      title: t('frc_projects.detail.cargo.chargeableWeight', 'Chg (kg)'),
      width: 90,
      type: 'numeric',
      readOnly: true,
    },
  ], [t])

  const tableData = useMemo(() =>
    cargoItems.map((cargo) => ({
      id: cargo.id,
      name: cargo.name,
      numberOfPieces: cargo.numberOfPieces,
      dimensions: formatDimensions(cargo.lengthCm, cargo.widthCm, cargo.heightCm),
      volumeM3: formatNumber(cargo.volumeM3, 4),
      actualWeightKg: formatNumber(cargo.actualWeightKg),
      chargeableWeightKg: formatNumber(cargo.chargeableWeightKg),
    })),
  [cargoItems])

  if (cargoItems.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-md">
        {t('frc_projects.detail.cargo.empty', 'No cargo items linked to this project.')}
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
        onRowClick={onViewRfq ? () => onViewRfq() : undefined}
      />
    </div>
  )
}
