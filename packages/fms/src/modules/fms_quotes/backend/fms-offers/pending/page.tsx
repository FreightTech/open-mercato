'use client'

import * as React from 'react'
import { useState, useMemo, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, ChevronRight, Clock } from 'lucide-react'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import {
  DynamicTable,
  TableSkeleton,
} from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { OfferDetailDrawer } from '../../../components/OfferDetailDrawer'
import type { FmsOfferStatus } from '../../../data/types'

interface PendingOfferRow {
  id: string
  offerNumber: string
  version: number
  status: FmsOfferStatus
  quoteId?: string
  quoteNumber?: string | null
  clientName?: string | null
  originPortCode?: string | null
  destinationPortCode?: string | null
  validUntil?: string | null
  currencyCode: string
  totalAmount: string
  sentAt?: string | null
  daysSinceSent: number
  createdAt: string
  assignedTo?: { id: string; name: string; email: string } | null
  quote?: {
    id: string
    quoteNumber?: string | null
    clientName?: string | null
    originPortCode?: string | null
    destinationPortCode?: string | null
  }
}

const getAgingColor = (days: number): string => {
  if (days > 7) return 'bg-red-100 text-red-800'
  if (days > 3) return 'bg-yellow-100 text-yellow-800'
  return 'bg-green-100 text-green-800'
}

const getAgingRowClass = (days: number): string => {
  if (days > 7) return 'bg-red-50'
  if (days > 3) return 'bg-yellow-50'
  return ''
}

const RouteRenderer = ({ value, rowData }: { value: string; rowData: PendingOfferRow }) => {
  const origin = rowData.quote?.originPortCode || '-'
  const dest = rowData.quote?.destinationPortCode || '-'
  if (origin === '-' && dest === '-') return <span>-</span>
  return (
    <span className="flex items-center gap-1 text-sm">
      <span>{origin}</span>
      <ChevronRight className="h-3 w-3 text-muted-foreground" />
      <span>{dest}</span>
    </span>
  )
}

const AmountRenderer = ({ value, rowData }: { value: string; rowData: PendingOfferRow }) => {
  const amount = parseFloat(value) || 0
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: rowData.currencyCode || 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
  return <span className="font-medium">{formatted}</span>
}

const DateRenderer = ({ value }: { value: string }) => {
  if (!value) return <span>-</span>
  const date = new Date(value)
  const now = new Date()
  const isExpired = date < now
  const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return (
    <span className={isExpired ? 'text-red-600' : ''}>{formatted}</span>
  )
}

const SentAtRenderer = ({ value }: { value: string }) => {
  if (!value) return <span>-</span>
  const date = new Date(value)
  const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  return <span>{formatted}</span>
}

const DaysPendingRenderer = ({ value }: { value: number }) => {
  const colorClass = getAgingColor(value)
  return (
    <span className={`px-2 py-0.5 inline-flex items-center gap-1 text-xs leading-4 font-semibold rounded-full ${colorClass}`}>
      <Clock className="h-3 w-3" />
      {value} {value === 1 ? 'day' : 'days'}
    </span>
  )
}

const AssignedToRenderer = ({ value }: { value: { id: string; name: string; email?: string } | null | undefined }) => {
  if (!value) return <span className="text-muted-foreground">-</span>
  return <span className="text-xs">{value.name}</span>
}

const VersionRenderer = ({ value }: { value: number }) => {
  return <span className="text-xs text-muted-foreground">v{value}</span>
}

export default function PendingOffersPage() {
  const tableRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)

  const queryParams = useMemo(() => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', String(limit))
    return params.toString()
  }, [page, limit])

  const { data, isLoading } = useQuery({
    queryKey: ['fms_offers_pending', queryParams],
    queryFn: async () => {
      const call = await apiCall<{ items: PendingOfferRow[]; total: number; totalPages?: number }>(
        `/api/fms_quotes/offers/pending?${queryParams}`
      )
      if (!call.ok) throw new Error('Failed to load pending offers')
      return call.result ?? { items: [], total: 0, totalPages: 1 }
    },
  })

  const tableData = useMemo(() => {
    return (data?.items ?? []).map((offer) => ({
      id: offer.id,
      offerNumber: offer.offerNumber,
      version: offer.version,
      status: offer.status,
      quoteNumber: offer.quote?.quoteNumber || `#${offer.quote?.id?.slice(0, 8) || '...'}`,
      clientName: offer.quote?.clientName || '-',
      route: '', // Computed in renderer
      totalAmount: offer.totalAmount,
      currencyCode: offer.currencyCode,
      validUntil: offer.validUntil,
      sentAt: offer.sentAt,
      daysSinceSent: offer.daysSinceSent,
      createdAt: offer.createdAt,
      quote: offer.quote,
      assignedTo: offer.assignedTo || null,
    }))
  }, [data?.items])

  const handleOfferClick = useCallback((offerId: string) => {
    setSelectedOfferId(offerId)
  }, [])

  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'offerNumber',
      title: 'Offer',
      width: 100,
      type: 'text',
      readOnly: true,
      renderer: (value: string, rowData: PendingOfferRow) => (
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleOfferClick(rowData.id)
          }}
          className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
        >
          {value}
        </button>
      ),
    },
    {
      data: 'version',
      title: 'Ver',
      width: 45,
      type: 'numeric',
      readOnly: true,
      renderer: (value) => <VersionRenderer value={value} />,
    },
    {
      data: 'quoteNumber',
      title: 'Quote',
      width: 90,
      type: 'text',
      readOnly: true,
    },
    {
      data: 'clientName',
      title: 'Client',
      width: 150,
      type: 'text',
      readOnly: true,
    },
    {
      data: 'route',
      title: 'Route',
      width: 120,
      type: 'text',
      readOnly: true,
      renderer: (value, rowData) => <RouteRenderer value={value} rowData={rowData} />,
    },
    {
      data: 'totalAmount',
      title: 'Total',
      width: 100,
      type: 'numeric',
      readOnly: true,
      renderer: (value, rowData) => <AmountRenderer value={value} rowData={rowData} />,
    },
    {
      data: 'sentAt',
      title: 'Sent At',
      width: 130,
      type: 'text',
      readOnly: true,
      renderer: (value) => <SentAtRenderer value={value} />,
    },
    {
      data: 'daysSinceSent',
      title: 'Days Pending',
      width: 110,
      type: 'numeric',
      readOnly: true,
      renderer: (value) => <DaysPendingRenderer value={value} />,
      cellClassName: (value: number) => getAgingColor(value),
    },
    {
      data: 'validUntil',
      title: 'Valid Until',
      width: 100,
      type: 'date',
      readOnly: true,
      renderer: (value) => <DateRenderer value={value} />,
    },
    {
      data: 'assignedTo',
      title: 'Assigned To',
      width: 100,
      type: 'text',
      readOnly: true,
      renderer: (value) => <AssignedToRenderer value={value} />,
    },
  ], [handleOfferClick])

  const actionsRenderer = useCallback((rowData: PendingOfferRow, _rowIndex: number) => {
    if (!rowData.id) return null
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation()
            setSelectedOfferId(rowData.id)
          }}
          className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
          title="View"
        >
          <Eye className="h-4 w-4" />
        </button>
      </div>
    )
  }, [])

  // Row class callback for aging-based row highlighting
  const rowClassName = useCallback((rowData: PendingOfferRow) => {
    return getAgingRowClass(rowData.daysSinceSent)
  }, [])

  if (isLoading) {
    return (
      <Page>
        <PageBody>
          <TableSkeleton rows={10} columns={10} />
        </PageBody>
      </Page>
    )
  }

  return (
    <Page>
      <PageBody>
        {/* Summary stats */}
        <div className="flex items-center gap-4 mb-4">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{data?.total || 0}</span> pending offers awaiting response
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-green-100 border border-green-300" />
              0-3 days
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-yellow-100 border border-yellow-300" />
              3-7 days
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-red-100 border border-red-300" />
              7+ days
            </span>
          </div>
        </div>

        <DynamicTable
          tableRef={tableRef}
          data={tableData}
          columns={columns}
          tableName="Pending Offers"
          idColumnName="id"
          height="calc(100vh - 160px)"
          colHeaders={true}
          rowHeaders={true}
          stretchColumns={true}
          actionsRenderer={actionsRenderer}
          rowClassName={rowClassName}
          uiConfig={{
            hideAddRowButton: true,
            enableFullscreen: true,
          }}
          pagination={{
            currentPage: page,
            totalPages: Math.ceil((data?.total || 0) / limit),
            limit,
            limitOptions: [25, 50, 100],
            onPageChange: setPage,
            onLimitChange: (l) => {
              setLimit(l)
              setPage(1)
            },
          }}
        />

        {/* Offer detail drawer */}
        <OfferDetailDrawer
          offerId={selectedOfferId}
          open={!!selectedOfferId}
          onClose={() => setSelectedOfferId(null)}
          onDelete={() => {
            queryClient.invalidateQueries({ queryKey: ['fms_offers_pending'] })
          }}
          onCreateNewVersion={(newOfferId) => {
            queryClient.invalidateQueries({ queryKey: ['fms_offers_pending'] })
            setSelectedOfferId(newOfferId)
          }}
        />
      </PageBody>
    </Page>
  )
}
