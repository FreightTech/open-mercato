'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@open-mercato/ui/primitives/button'
import { Plus } from 'lucide-react'
import {
  DynamicTable,
  useDynamicTablePage,
} from '@open-mercato/ui/backend/dynamic-table'
import type { ColumnDef } from '@open-mercato/ui/backend/dynamic-table'
import { InvoiceDetailDrawer } from '../../components/InvoiceDetailDrawer'

interface InvoiceRow {
  id: string
  invoiceNumber?: string | null
  invoiceDate?: string | null
  sellerName?: string | null
  buyerName?: string | null
  grossAmount?: string | null
  currencyCode?: string | null
  status?: string | null
  ksefStatus?: string | null
  direction?: string | null
  createdAt: string
  updatedAt: string
}

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800',
    extracted: 'bg-purple-100 text-purple-800',
    pending_review: 'bg-yellow-100 text-yellow-800',
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    submitted: 'bg-blue-100 text-blue-800',
    accepted: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    sent: 'bg-blue-100 text-blue-800',
    paid: 'bg-emerald-100 text-emerald-800',
    cancelled: 'bg-gray-100 text-gray-600',
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}

const getKsefStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    sent: 'bg-blue-50 text-blue-700 border-blue-200',
    accepted: 'bg-green-50 text-green-700 border-green-200',
    rejected: 'bg-red-50 text-red-700 border-red-200',
    not_applicable: 'bg-gray-50 text-gray-600 border-gray-200',
  }
  return colors[status] || 'bg-gray-50 text-gray-600 border-gray-200'
}

const StatusBadgeRenderer = ({ value }: { value: string | null }) => {
  if (!value) return <span className="text-muted-foreground text-xs">-</span>
  const displayValue = value.replace(/_/g, ' ')
  return (
    <span
      className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full capitalize max-w-full overflow-hidden ${getStatusColor(value)}`}
    >
      <span className="truncate">{displayValue}</span>
    </span>
  )
}

const KsefStatusBadgeRenderer = ({ value }: { value: string | null }) => {
  if (!value) return <span className="text-muted-foreground text-xs">-</span>
  const displayValue = value.replace(/_/g, ' ')
  return (
    <span
      className={`px-1.5 py-0.5 text-[10px] font-medium rounded border capitalize truncate ${getKsefStatusColor(value)}`}
    >
      {displayValue}
    </span>
  )
}

const DirectionBadgeRenderer = ({ value }: { value: string | null }) => {
  if (!value) return <span className="text-muted-foreground text-xs">-</span>
  const colorClass =
    value === 'outgoing'
      ? 'bg-blue-50 text-blue-700 border-blue-200'
      : 'bg-orange-50 text-orange-700 border-orange-200'
  return (
    <span
      className={`px-1.5 py-0.5 text-[10px] font-medium rounded border capitalize truncate ${colorClass}`}
    >
      {value}
    </span>
  )
}

const columns: ColumnDef[] = [
  { data: 'invoiceNumber', title: 'Invoice Number' },
  { data: 'invoiceDate', title: 'Date' },
  { data: 'sellerName', title: 'Seller' },
  { data: 'buyerName', title: 'Buyer' },
  { data: 'grossAmount', title: 'Amount' },
  { data: 'currencyCode', title: 'Currency' },
  {
    data: 'status',
    title: 'Status',
    renderer: (value: unknown) => <StatusBadgeRenderer value={(value as string) ?? null} />,
  },
  {
    data: 'ksefStatus',
    title: 'KSeF Status',
    renderer: (value: unknown) => <KsefStatusBadgeRenderer value={(value as string) ?? null} />,
  },
  {
    data: 'direction',
    title: 'Direction',
    renderer: (value: unknown) => <DirectionBadgeRenderer value={(value as string) ?? null} />,
  },
]

export default function InvoicingPage() {
  const router = useRouter()
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)

  const handleRowClick = useCallback((_rowIndex: number, rowData: InvoiceRow) => {
    if (rowData?.id) {
      setSelectedInvoiceId(rowData.id)
    }
  }, [])

  const table = useDynamicTablePage<InvoiceRow>({
    source: '/api/invoicing/invoices',
    columns,
    tableName: 'Invoices',
    defaultSort: { field: 'createdAt', direction: 'desc' },
    queryKey: 'invoicing',
    tableProps: {
      height: 'fill',
      uiConfig: {
        enableFullscreen: true,
        borderless: true,
      },
      onRowClick: handleRowClick,
    },
  })

  return (
    <div className="-mx-4 lg:-mx-6 -mb-4 lg:-mb-6 -mt-7 lg:-mt-9">
      <div className="flex justify-end px-4 lg:px-6 pt-2 pb-1">
        <Button size="sm" onClick={() => router.push('/backend/invoicing/create')}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          New Invoice
        </Button>
      </div>
      <DynamicTable {...table.props} />
      {table.deleteDialog}

      <InvoiceDetailDrawer
        invoiceId={selectedInvoiceId}
        open={!!selectedInvoiceId}
        onOpenChange={(open) => { if (!open) setSelectedInvoiceId(null) }}
      />
    </div>
  )
}
