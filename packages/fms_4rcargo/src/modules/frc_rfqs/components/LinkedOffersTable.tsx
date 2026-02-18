'use client'

import * as React from 'react'
import { useRef, useMemo } from 'react'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { DynamicTable } from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'
import { useT } from '@open-mercato/shared/lib/i18n/context'

export type LinkedOffer = {
  id: string
  name: string
  status: string
}

export type LinkedOffersTableProps = {
  offers: LinkedOffer[]
  tableRef?: React.RefObject<HTMLDivElement | null>
  siblingTableRefs?: {
    prev?: React.RefObject<HTMLDivElement | null>
    next?: React.RefObject<HTMLDivElement | null>
  }
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700' },
  sent: { label: 'Sent', color: 'bg-blue-100 text-blue-700' },
  booked: { label: 'Booked', color: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700' },
  expired: { label: 'Expired', color: 'bg-amber-100 text-amber-700' },
}

export function LinkedOffersTable({
  offers,
  tableRef: externalTableRef,
  siblingTableRefs,
}: LinkedOffersTableProps) {
  const t = useT()
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'name',
      title: t('frc_rfqs.detail.offers.name', 'Offer Name'),
      width: 250,
      type: 'text',
      readOnly: true,
      renderer: (value: unknown, row: Record<string, unknown>) => {
        const id = row.id as string
        const name = value as string
        return (
          <Link
            href={`/backend/frc-offers/${id}`}
            className="text-primary hover:underline font-medium"
          >
            {name}
          </Link>
        )
      },
    },
    {
      data: 'status',
      title: t('frc_rfqs.detail.offers.status', 'Status'),
      width: 120,
      type: 'text',
      readOnly: true,
      renderer: (value: unknown) => {
        const status = value as string
        const config = STATUS_CONFIG[status] ?? { label: status, color: 'bg-gray-100 text-gray-700' }
        return (
          <span className={`text-xs px-2 py-0.5 rounded-full ${config.color}`}>
            {t(`frc_offers.status.${status}`, config.label)}
          </span>
        )
      },
    },
    {
      data: '_actions',
      title: '',
      width: 80,
      type: 'text',
      readOnly: true,
      renderer: (_value: unknown, row: Record<string, unknown>) => {
        const id = row.id as string
        return (
          <Link
            href={`/backend/frc-offers/${id}`}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {t('frc_rfqs.detail.offers.view', 'View')}
            <ExternalLink className="h-3 w-3" />
          </Link>
        )
      },
    },
  ], [t])

  const tableData = useMemo(() =>
    offers.map((offer) => ({
      id: offer.id,
      name: offer.name,
      status: offer.status,
      _actions: '',
    })),
  [offers])

  if (offers.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-md">
        {t('frc_rfqs.detail.offers.empty', 'No offers yet')}
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
