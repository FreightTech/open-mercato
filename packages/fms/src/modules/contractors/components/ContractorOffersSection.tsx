'use client'

import * as React from 'react'
import { useRef, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { FileText, Send, CheckCircle, XCircle, AlertTriangle, Clock } from 'lucide-react'
import { DynamicTable } from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'

type Offer = {
  id: string
  offerNumber: string
  version: number
  status: string
  contractType: string
  carrierName?: string | null
  totalAmount: string
  currencyCode: string
  validUntil?: string | null
  sentAt?: string | null
  sentToEmail?: string | null
  createdAt: string
  quoteNumber?: string | null
  quoteId: string
}

type OffersResponse = {
  items?: Offer[]
  total?: number
  page?: number
  totalPages?: number
}

type ContractorOffersSectionProps = {
  contractorId: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700', icon: FileText },
  sent: { label: 'Sent', color: 'bg-blue-100 text-blue-700', icon: Send },
  accepted: { label: 'Accepted', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: XCircle },
  expired: { label: 'Expired', color: 'bg-orange-100 text-orange-700', icon: AlertTriangle },
  superseded: { label: 'Superseded', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
}

export function ContractorOffersSection({ contractorId }: ContractorOffersSectionProps) {
  const t = useT()
  const tableRef = useRef<HTMLDivElement>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['contractor-offers', contractorId],
    queryFn: async () => {
      const response = await apiCall<OffersResponse>(
        `/api/contractors/offers?contractorId=${contractorId}&pageSize=10`
      )
      if (!response.ok) throw new Error('Failed to load offers')
      return response.result
    },
    enabled: !!contractorId,
  })

  const offers = data?.items ?? []

  const formatDate = useCallback((dateStr: string | null | undefined) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }, [])

  const formatCurrency = useCallback((amount: string, currency: string) => {
    const numAmount = parseFloat(amount)
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(numAmount)
  }, [])

  const isExpired = useCallback((validUntil: string | null | undefined) => {
    if (!validUntil) return false
    return new Date(validUntil) < new Date()
  }, [])

  // Table columns definition
  const columns = useMemo((): ColumnDef[] => [
    {
      data: 'offerNumber',
      title: t('contractors.offers.number', 'Offer #'),
      width: 120,
      type: 'text',
      readOnly: true,
      renderer: (value: unknown, row: Record<string, unknown>) => (
        <Link
          href={`/backend/fms-offers/${row.id}`}
          className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
        >
          {String(value)}
          {(row.version as number) > 1 && (
            <span className="text-xs text-muted-foreground ml-1">v{String(row.version)}</span>
          )}
        </Link>
      ),
    },
    {
      data: 'quoteNumber',
      title: t('contractors.offers.quote', 'Quote'),
      width: 100,
      type: 'text',
      readOnly: true,
      renderer: (value: unknown, row: Record<string, unknown>) => (
        value ? (
          <Link
            href={`/backend/fms-quotes/${row.quoteId}`}
            className="text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            {String(value)}
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">-</span>
        )
      ),
    },
    {
      data: 'status',
      title: t('contractors.offers.status', 'Status'),
      width: 110,
      type: 'text',
      readOnly: true,
      renderer: (value: unknown, row: Record<string, unknown>) => {
        let effectiveStatus = String(value)
        if (value !== 'accepted' && value !== 'rejected' && isExpired(row.validUntil as string | null | undefined)) {
          effectiveStatus = 'expired'
        }
        const statusConfig = STATUS_CONFIG[effectiveStatus] ?? STATUS_CONFIG.draft
        const StatusIcon = statusConfig.icon
        return (
          <Badge variant="secondary" className={cn('text-xs', statusConfig.color)}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {statusConfig.label}
          </Badge>
        )
      },
    },
    {
      data: 'carrierName',
      title: t('contractors.offers.carrier', 'Carrier'),
      width: 120,
      type: 'text',
      readOnly: true,
      renderer: (value: unknown) => (
        <span className="text-sm text-muted-foreground">
          {value ? String(value) : '-'}
        </span>
      ),
    },
    {
      data: 'totalAmount',
      title: t('contractors.offers.amount', 'Amount'),
      width: 100,
      type: 'text',
      readOnly: true,
      renderer: (value: unknown, row: Record<string, unknown>) => (
        <span className="text-sm font-medium">
          {formatCurrency(String(value), row.currencyCode as string)}
        </span>
      ),
    },
    {
      data: 'validUntil',
      title: t('contractors.offers.validUntil', 'Valid Until'),
      width: 90,
      type: 'text',
      readOnly: true,
      renderer: (value: unknown) => (
        <span className={cn(
          'text-sm',
          isExpired(value as string | null | undefined) ? 'text-red-600' : 'text-muted-foreground'
        )}>
          {formatDate(value as string | null | undefined)}
        </span>
      ),
    },
    {
      data: 'sentAt',
      title: t('contractors.offers.sent', 'Sent'),
      width: 80,
      type: 'text',
      readOnly: true,
      renderer: (value: unknown) => (
        <span className="text-sm text-muted-foreground">
          {value ? formatDate(value as string) : '-'}
        </span>
      ),
    },
  ], [t, formatDate, formatCurrency, isExpired])

  // Table data
  const tableData = useMemo(() => {
    return offers.map(offer => ({
      id: offer.id,
      offerNumber: offer.offerNumber,
      version: offer.version,
      quoteNumber: offer.quoteNumber,
      quoteId: offer.quoteId,
      status: offer.status,
      carrierName: offer.carrierName,
      totalAmount: offer.totalAmount,
      currencyCode: offer.currencyCode,
      validUntil: offer.validUntil,
      sentAt: offer.sentAt,
    }))
  }, [offers])

  // Generate key to force re-render when data changes
  const tableKey = useMemo(() => {
    if (offers.length === 0) return 'empty'
    return `offers-${offers.map(o => o.id).join('-')}`
  }, [offers])

  // Calculate dynamic height based on number of rows
  const tableHeight = useMemo(() => {
    const rowHeight = 40
    const headerHeight = 40
    const toolbarHeight = 40
    const minHeight = 160
    const maxHeight = 400
    const contentHeight = toolbarHeight + headerHeight + (tableData.length * rowHeight) + 20
    return Math.min(Math.max(contentHeight, minHeight), maxHeight)
  }, [tableData.length])

  if (isLoading) {
    return (
      <div style={{ height: 160 }}>
        <DynamicTable
          tableRef={tableRef}
          data={[]}
          columns={columns}
          tableName={t('contractors.offers.title', 'Offers')}
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
            hideAddRowButton: true,
            hideBottomBar: true,
            hideActionsColumn: true,
          }}
        />
      </div>
    )
  }

  return (
    <div style={{ height: tableHeight }}>
      <DynamicTable
        key={tableKey}
        tableRef={tableRef}
        data={tableData}
        columns={columns}
        tableName={t('contractors.offers.title', 'Offers')}
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
          hideAddRowButton: true,
          hideBottomBar: true,
          hideActionsColumn: true,
        }}
      />
    </div>
  )
}
