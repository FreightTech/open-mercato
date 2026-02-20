'use client'

import * as React from 'react'
import { useRef, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye } from 'lucide-react'
import { DynamicTable } from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'

export interface OfferData {
  id: string
  name: string
  status: string
  awbNumber: string | null
  departureDate: string | null
  connectionMethod: string | null
  connectionRateTotal: string | null
  airfreightRateTotal: string | null
  totalRate: string | null
  currencyCode: string
}

interface ProjectOfferTableProps {
  offer: OfferData
  tableRef?: React.RefObject<HTMLDivElement | null>
  siblingTableRefs?: {
    prev?: React.RefObject<HTMLDivElement | null>
    next?: React.RefObject<HTMLDivElement | null>
  }
}

const STATUS_CONFIG: Record<string, { label: string; bgColor: string; textColor: string }> = {
  draft: { label: 'Draft', bgColor: '#f3f4f6', textColor: '#374151' },
  sent: { label: 'Sent', bgColor: '#dbeafe', textColor: '#1e40af' },
  booked: { label: 'Booked', bgColor: '#dcfce7', textColor: '#166534' },
  rejected: { label: 'Rejected', bgColor: '#fee2e2', textColor: '#991b1b' },
  expired: { label: 'Expired', bgColor: '#fef3c7', textColor: '#92400e' },
  cancelled: { label: 'Cancelled', bgColor: '#fee2e2', textColor: '#991b1b' },
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

export function ProjectOfferTable({
  offer,
  tableRef: externalTableRef,
  siblingTableRefs,
}: ProjectOfferTableProps) {
  const t = useT()
  const router = useRouter()
  const internalTableRef = useRef<HTMLDivElement>(null)
  const tableRef = externalTableRef ?? internalTableRef

  const handleViewOffer = () => {
    router.push(`/backend/frc-offers/${offer.id}`)
  }

  const columns = useMemo(
    (): ColumnDef[] => [
      {
        data: 'name',
        title: t('frc_projects.detail.offer.name', 'Name'),
        width: 200,
        type: 'text',
        readOnly: true,
        renderer: (value: unknown, row: Record<string, unknown>) => {
          const id = row.id as string
          const name = value as string
          return (
            <Link href={`/backend/frc-offers/${id}`} className="text-primary hover:underline font-medium">
              {name}
            </Link>
          )
        },
      },
      {
        data: 'status',
        title: t('frc_projects.detail.offer.status', 'Status'),
        width: 100,
        type: 'text',
        readOnly: true,
        renderer: (value: unknown) => {
          const status = value as string
          const config = STATUS_CONFIG[status] ?? { label: status, bgColor: '#f3f4f6', textColor: '#374151' }
          return (
            <span
              className="px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full"
              style={{
                backgroundColor: config.bgColor,
                color: config.textColor,
              }}
            >
              {t(`frc_offers.status.${status}`, config.label)}
            </span>
          )
        },
      },
      {
        data: 'awbNumber',
        title: t('frc_projects.detail.offer.awb', 'AWB'),
        width: 120,
        type: 'text',
        readOnly: true,
        renderer: (value: unknown) => {
          const awb = value as string | null
          return awb ? <span className="font-mono text-sm">{awb}</span> : <span className="text-muted-foreground">-</span>
        },
      },
      {
        data: 'departureDate',
        title: t('frc_projects.detail.offer.departure', 'Departure'),
        width: 100,
        type: 'text',
        readOnly: true,
        renderer: (value: unknown) => formatDate(value as string | null),
      },
      {
        data: 'totalRate',
        title: t('frc_projects.detail.offer.totalRate', 'Total Rate'),
        width: 120,
        type: 'text',
        readOnly: true,
        renderer: (value: unknown, row: Record<string, unknown>) => {
          const rate = value as string | null
          const currency = row.currencyCode as string
          if (!rate) return <span className="text-muted-foreground">-</span>
          return (
            <span className="font-mono">
              {formatNumber(rate)} {currency}
            </span>
          )
        },
      },
      {
        data: '_actions',
        title: '',
        width: 60,
        type: 'text',
        readOnly: true,
        renderer: () => (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              handleViewOffer()
            }}
            className="h-7 w-7 p-0"
          >
            <Eye className="h-4 w-4" />
          </Button>
        ),
      },
    ],
    [t, handleViewOffer]
  )

  const tableData = useMemo(
    () => [
      {
        id: offer.id,
        name: offer.name,
        status: offer.status,
        awbNumber: offer.awbNumber,
        departureDate: offer.departureDate,
        totalRate: offer.totalRate,
        currencyCode: offer.currencyCode,
        _actions: '',
      },
    ],
    [offer]
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
        onRowClick={handleViewOffer}
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
